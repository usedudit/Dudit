import "server-only"
import { createHash, timingSafeEqual } from "crypto"

/**
 * Compares two strings in constant time to prevent timing side-channel attacks
 * (CWE-208: Observable Timing Discrepancy).
 *
 * Both values are hashed with SHA-256 before comparison so that the buffers
 * compared by `timingSafeEqual` are always exactly 32 bytes, eliminating
 * character-by-character timing leaks, length leakage, and buffer length mismatch exceptions.
 *
 * @param a - First string
 * @param b - Second string
 * @returns boolean - true if both strings match in constant time
 */
export function timingSafeStringEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) {
    return false
  }

  const hashA = createHash("sha256").update(a, "utf8").digest()
  const hashB = createHash("sha256").update(b, "utf8").digest()

  return timingSafeEqual(hashA, hashB)
}

/**
 * Validates a Bearer token authorization header in constant time to prevent
 * timing side-channel attacks (CWE-208: Observable Timing Discrepancy).
 *
 * Both values are hashed with SHA-256 before comparison so that the buffers
 * compared by `timingSafeEqual` are always exactly 32 bytes, eliminating
 * both character-by-character timing leaks and buffer length mismatch exceptions.
 *
 * @param authHeader - The raw Authorization header value (e.g. "Bearer <token>")
 * @param expectedToken - The secret token to compare against
 * @returns boolean - true if the token matches exactly in constant time
 */
export function isValidBearerToken(
  authHeader: string | null | undefined,
  expectedToken: string | null | undefined,
): boolean {
  if (!authHeader || !expectedToken) return false
  return timingSafeStringEqual(authHeader, `Bearer ${expectedToken}`)
}

