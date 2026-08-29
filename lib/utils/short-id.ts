import { randomBytes } from "crypto"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Checks if a string is a standard 36-character UUID.
 */
export function isUuid(value: unknown): value is string {
    if (typeof value !== "string") return false
    return UUID_REGEX.test(value.trim())
}

/**
 * Generates a cryptographically secure URL-safe public token with 128+ bits of entropy.
 * Default size produces 22 URL-safe characters using crypto.randomBytes(16).
 */
export function generateShortId(_size?: number): string {
    return randomBytes(16).toString("base64url")
}

/**
 * Generates a cryptographically secure URL-safe public token with specified byte entropy (default 16 bytes = 128 bits).
 */
export function generateSecurePublicToken(byteLength = 16): string {
    return randomBytes(byteLength).toString("base64url")
}
