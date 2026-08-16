import "dotenv/config"

import { createDecipheriv, createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"

const [, , inputPath, outputPath] = process.argv

if (!inputPath || !outputPath) {
  console.error("Uso: node scripts/decrypt-database-backup.mjs <arquivo.enc> <arquivo.dump>")
  process.exit(1)
}

const raw = readFileSync(inputPath)
const firstLineEnd = raw.indexOf(0x0a)
const secondLineEnd = raw.indexOf(0x0a, firstLineEnd + 1)

if (firstLineEnd < 0 || secondLineEnd < 0) {
  throw new Error("Cabeçalho do backup inválido")
}

const magic = raw.subarray(0, firstLineEnd).toString("utf8")
if (magic !== "DUDIT_BACKUP_V1") {
  throw new Error(`Formato de backup desconhecido: ${magic}`)
}

const header = JSON.parse(raw.subarray(firstLineEnd + 1, secondLineEnd).toString("utf8"))
if (header.algorithm !== "aes-256-gcm" || header.compression !== "gzip") {
  throw new Error("Algoritmo ou compressão do backup não suportado")
}

const keyBase64 = process.env.BACKUP_ENCRYPTION_KEY_BASE64?.trim()
if (!keyBase64) {
  throw new Error("BACKUP_ENCRYPTION_KEY_BASE64 não está configurada")
}

const key = Buffer.from(keyBase64, "base64")
if (key.length !== 32) {
  throw new Error("BACKUP_ENCRYPTION_KEY_BASE64 deve decodificar para 32 bytes")
}

const iv = Buffer.from(header.iv, "base64")
const authTagBytes = 16
const encryptedPayloadStart = secondLineEnd + 1
const authTag = raw.subarray(raw.length - authTagBytes)
const ciphertext = raw.subarray(encryptedPayloadStart, raw.length - authTagBytes)

const decipher = createDecipheriv("aes-256-gcm", key, iv)
decipher.setAuthTag(authTag)
const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()])
const dump = gunzipSync(compressed)

if (dump.subarray(0, 5).toString("ascii") !== "PGDMP") {
  throw new Error("O conteúdo descriptografado não é um dump custom válido do PostgreSQL")
}

writeFileSync(outputPath, dump, { mode: 0o600 })

console.log(JSON.stringify({
  createdAt: header.createdAt,
  algorithm: header.algorithm,
  compression: header.compression,
  encryptedBytes: raw.length,
  dumpBytes: dump.length,
  sha256: createHash("sha256").update(dump).digest("hex"),
  outputPath,
}, null, 2))
