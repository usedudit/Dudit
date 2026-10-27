import "server-only"
import { hkdfSync, createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto"

// ─── Constants ───────────────────────────────────────────────────────────────
const ALGORITHM = "aes-256-gcm" as const
const IV_LENGTH = 12 // NIST SP 800-38D recommended for GCM
const AUTH_TAG_LENGTH = 16 // 128-bit authentication tag
const KEY_LENGTH = 32 // AES-256 = 32 bytes
const MIN_MASTER_KEY_LENGTH = 32 // Minimum key material length

// Application-specific HKDF salt (deterministic, never changes).
// Derived from a fixed domain string to provide cryptographic domain separation.
const HKDF_SALT = createHash("sha256")
  .update("dudit-crypto-service-hkdf-salt-v1")
  .digest()

// ─── Key Versioning ──────────────────────────────────────────────────────────
//
// HOW KEY ROTATION WORKS:
//
// Keep old versions supported during and after a rotation. Only remove an old
// version after the rotation script verifies there are no payloads using it
// and backups/rollback no longer need that key.

type KeyVersion = "v1" | "v2" | "v3"

/**
 * The version used by encrypt() for all NEW encryptions.
 * V3 is active for new writes. Keep V1/V2 available for existing records until
 * their migration and the required backup-retention window are complete.
 */
const ACTIVE_KEY_VERSION: KeyVersion = "v3"

/** All supported versions for decryption. */
const SUPPORTED_VERSIONS: readonly KeyVersion[] = ["v1", "v2", "v3"] as const

// Context-to-info mapping for HKDF derivation.
// Each context produces a completely independent derived key.
const CONTEXT_INFO = {
  cpf: "cpf-encryption",
  mercadopago: "mercadopago-token-encryption",
  whatsapp: "whatsapp-token-encryption",
  superfrete: "superfrete-token-encryption",
  nfe_xml: "nfe-xml-encryption",
} as const

type CryptoContext = keyof typeof CONTEXT_INFO

// ─── In-Memory Key Cache ─────────────────────────────────────────────────────
//
// Caches derived keys by "version:context" to avoid redundant HKDF calls.
// Keys are derived once per (version, context) pair for the process lifetime.
// HKDF is deterministic, so the cached result is always identical.

const derivedKeyCache = new Map<string, Buffer>()

// ─── Key Management (Internal) ──────────────────────────────────────────────

/**
 * Reads the MASTER_KEY for a given version from environment.
 * Throws immediately if the key is missing or too short - no fallback.
 */
function getMasterKey(version: KeyVersion): Buffer {
  const envVarName = `MASTER_KEY_${version.toUpperCase()}`
  const masterKeyBase64 = process.env[envVarName]

  if (!masterKeyBase64) {
    throw new Error(`${envVarName} is not set`)
  }

  const masterKey = Buffer.from(masterKeyBase64, "base64")

  if (masterKey.length < 32) {
    throw new Error(`${envVarName} must decode to at least 32 bytes`)
  }

  return masterKey
}

/**
 * Derives a 32-byte AES-256 key from the versioned MASTER_KEY using HKDF-SHA256.
 *
 * - version:  "v1" or "v2" - selects which MASTER_KEY to use
 * - context:  "cpf" or "mercadopago" - provides domain separation via HKDF info
 *
 * Results are cached in memory so HKDF runs at most once per (version, context).
 */
function deriveKey(version: KeyVersion, context: CryptoContext): Buffer {
  const cacheKey = `${version}:${context}`

  const cached = derivedKeyCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const masterKey = getMasterKey(version)
  const info = CONTEXT_INFO[context]

  // hkdfSync(digest, ikm, salt, info, keylen)
  const derived = Buffer.from(
    hkdfSync("sha256", masterKey, HKDF_SALT, info, KEY_LENGTH)
  )

  derivedKeyCache.set(cacheKey, derived)
  return derived
}

/**
 * Parses a versioned payload string into its version and base64 body.
 *
 * Expected format: "v1:AbCdEf..." or "v2:AbCdEf..."
 * Throws on missing or unsupported version prefix.
 */
function parseVersionedPayload(data: string): { version: KeyVersion; body: string } {
  const colonIndex = data.indexOf(":")
  if (colonIndex === -1) {
    throw new Error(
      "Invalid encrypted payload: missing version prefix. " +
      "Expected format 'v1:BASE64...' or 'v2:BASE64...'"
    )
  }

  const version = data.substring(0, colonIndex) as KeyVersion
  const body = data.substring(colonIndex + 1)

  if (!SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(
      `Unsupported key version '${version}'. ` +
      `Supported versions: ${SUPPORTED_VERSIONS.join(", ")}`
    )
  }

  if (!body) {
    throw new Error("Invalid encrypted payload: empty body after version prefix.")
  }

  return { version, body }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Encrypts a string using AES-256-GCM with a versioned, context-derived key.
 *
 * Output format: `${ACTIVE_KEY_VERSION}:base64(iv[12] + authTag[16] + ciphertext)`
 *
 * - Always uses ACTIVE_KEY_VERSION for new encryptions.
 * - IV: 12-byte cryptographically random (unique per call, never reused).
 * - AuthTag: 16-byte (128-bit) authentication tag protects integrity.
 *
 * @param data    - The plaintext string to encrypt (must be non-empty)
 * @param context - "cpf" or "mercadopago" - determines the derived key
 * @returns       - Versioned, base64-encoded encrypted string
 */
export function encrypt(data: string, context: CryptoContext): string {
  if (!data) {
    throw new Error("Cannot encrypt empty data")
  }

  const key = deriveKey(ACTIVE_KEY_VERSION, context)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  const ciphertext = Buffer.concat([
    cipher.update(data, "utf8"),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  // Pack: iv (12 bytes) + authTag (16 bytes) + ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, ciphertext])

  return `${ACTIVE_KEY_VERSION}:${packed.toString("base64")}`
}

/**
 * Decrypts a versioned, base64-encoded string produced by `encrypt()`.
 *
 * - Reads the version prefix to select the correct MASTER_KEY.
 * - Throws explicitly if the version is unsupported or the key is unavailable.
 * - No silent fallback to another version.
 *
 * @param data    - The versioned encrypted string (e.g., "v1:AbCdEf...")
 * @param context - "cpf" or "mercadopago" - must match the context used to encrypt
 * @returns       - The original plaintext string
 * @throws        - If version is unsupported, data is corrupted, or wrong context
 */
export function decrypt(data: string, context: CryptoContext): string {
  if (!data) {
    throw new Error("Cannot decrypt empty data")
  }

  const { version, body } = parseVersionedPayload(data)

  const key = deriveKey(version, context)
  const packed = Buffer.from(body, "base64")

  // Minimum length: IV (12) + AuthTag (16) + at least 1 byte of ciphertext
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted data: payload too short")
  }

  const iv = packed.subarray(0, IV_LENGTH)
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}

/**
 * Re-encrypts a payload under the ACTIVE_KEY_VERSION.
 *
 * Use this in migration scripts to rotate data from an old key version
 * to the current active version. If the data is already encrypted with
 * ACTIVE_KEY_VERSION, it still re-encrypts (generating a fresh IV).
 *
 * Example migration usage:
 * ```ts
 * // For each integration row in the database:
 * const newToken = reEncryptWithActiveVersion(integration.access_token_encrypted, "mercadopago")
 * await supabase.from("partner_integrations").update({ access_token_encrypted: newToken }).eq("id", integration.id)
 * ```
 *
 * @param data    - The versioned encrypted string to re-encrypt
 * @param context - "cpf", "mercadopago", "whatsapp" or "superfrete"
 * @returns       - Newly encrypted string under ACTIVE_KEY_VERSION with fresh IV
 */
export function reEncryptWithActiveVersion(data: string, context: CryptoContext): string {
  const plaintext = decrypt(data, context)
  return encrypt(plaintext, context)
}
