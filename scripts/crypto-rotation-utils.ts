import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "crypto"
import fs from "fs"
import path from "path"

export type KeyVersion = `v${number}`
export type CryptoContext = "cpf" | "mercadopago" | "whatsapp" | "superfrete" | "nfe_xml"

const ALGORITHM = "aes-256-gcm" as const
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32
const MIN_MASTER_KEY_LENGTH = 32
const HKDF_SALT = createHash("sha256").update("dudit-crypto-service-hkdf-salt-v1").digest()
const CONTEXT_INFO: Record<CryptoContext, string> = {
  cpf: "cpf-encryption",
  mercadopago: "mercadopago-token-encryption",
  whatsapp: "whatsapp-token-encryption",
  superfrete: "superfrete-token-encryption",
  nfe_xml: "nfe-xml-encryption",
}

const derivedKeyCache = new Map<string, Buffer>()

export function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env")
  if (!fs.existsSync(envPath)) return

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx < 1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

export function readCryptoConfig(): { activeVersion: KeyVersion; supportedVersions: KeyVersion[] } {
  const servicePath = path.resolve(process.cwd(), "lib", "cryptoService.ts")
  const source = fs.readFileSync(servicePath, "utf8")
  const active = source.match(/ACTIVE_KEY_VERSION:\s*KeyVersion\s*=\s*"(v\d+)"/)
  const supported = source.match(/SUPPORTED_VERSIONS:\s*readonly KeyVersion\[\]\s*=\s*\[([^\]]*)\]/)
  if (!active || !supported) throw new Error("Não consegui ler as versões ativa/suportadas de lib/cryptoService.ts")

  const activeVersion = active[1] as KeyVersion
  const supportedVersions = Array.from(supported[1].matchAll(/"(v\d+)"/g), (match) => match[1] as KeyVersion)
  if (!supportedVersions.includes(activeVersion)) {
    throw new Error(`A versão ativa ${activeVersion} não aparece em SUPPORTED_VERSIONS`)
  }
  if (new Set(supportedVersions).size !== supportedVersions.length) {
    throw new Error("SUPPORTED_VERSIONS contém versões duplicadas")
  }
  return { activeVersion, supportedVersions }
}

export function getMasterKey(version: KeyVersion): Buffer {
  const envName = `MASTER_KEY_${version.toUpperCase()}`
  const encoded = process.env[envName]
  if (!encoded) throw new Error(`${envName} não está definida`)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error(`${envName} não parece ser Base64 válido`)
  const key = Buffer.from(encoded, "base64")
  if (key.length < MIN_MASTER_KEY_LENGTH) throw new Error(`${envName} precisa decodificar para pelo menos 32 bytes`)
  return key
}

function deriveKey(version: KeyVersion, context: CryptoContext): Buffer {
  const cacheKey = `${version}:${context}`
  const cached = derivedKeyCache.get(cacheKey)
  if (cached) return cached
  const masterKey = getMasterKey(version)
  const key = Buffer.from(hkdfSync("sha256", masterKey, HKDF_SALT, CONTEXT_INFO[context], KEY_LENGTH))
  derivedKeyCache.set(cacheKey, key)
  return key
}

export function getPayloadVersion(value: unknown): KeyVersion | null {
  if (typeof value !== "string") return null
  const match = value.match(/^(v\d+):/)
  return match ? (match[1] as KeyVersion) : null
}

export function encryptWithFreshIv(value: string, context: CryptoContext, version: KeyVersion): string {
  if (!value) throw new Error("Não é possível criptografar um valor vazio")
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, deriveKey(version, context), iv, { authTagLength: AUTH_TAG_LENGTH })
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
  return `${version}:${packed.toString("base64")}`
}

export function decryptWithSupportedVersion(value: string, context: CryptoContext, supported: readonly KeyVersion[]): string {
  const colon = value.indexOf(":")
  if (colon < 1) throw new Error("Payload sem prefixo de versão")
  const version = value.slice(0, colon) as KeyVersion
  if (!supported.includes(version)) throw new Error(`Versão de chave não suportada: ${version}`)
  const body = value.slice(colon + 1)
  if (!body) throw new Error("Payload criptografado sem conteúdo")
  const packed = Buffer.from(body, "base64")
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) throw new Error("Payload criptografado muito curto")

  const iv = packed.subarray(0, IV_LENGTH)
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, deriveKey(version, context), iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
