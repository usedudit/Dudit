/**
 * Input sanitization utilities for security
 */

import { sanitizeInput as baseSanitizeInput } from "@/lib/input-validator"

/**
 * Sanitize string input with length validation
 */
export function sanitizeString(input: unknown, maxLength: number = 500): string {
  if (typeof input !== "string") {
    return ""
  }
  return baseSanitizeInput(input, maxLength)
}

/**
 * Sanitize number input
 */
export function sanitizeNumber(input: unknown, min?: number, max?: number): number | null {
  if (typeof input === "number") {
    if (min !== undefined && input < min) return null
    if (max !== undefined && input > max) return null
    return input
  }
  if (typeof input === "string") {
    const parsed = Number.parseFloat(input)
    if (Number.isNaN(parsed)) return null
    if (min !== undefined && parsed < min) return null
    if (max !== undefined && parsed > max) return null
    return parsed
  }
  return null
}

/**
 * Sanitize integer input
 */
export function sanitizeInteger(input: unknown, min?: number, max?: number): number | null {
  const num = sanitizeNumber(input, min, max)
  if (num === null) return null
  return Math.floor(num)
}

/**
 * Sanitize UUID input
 */
export function sanitizeUUID(input: unknown): string | null {
  if (typeof input !== "string") return null
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(input)) return null
  return input
}

/**
 * Sanitize email input
 */
export function sanitizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const trimmed = input.trim().toLowerCase()
  if (!emailRegex.test(trimmed)) return null
  if (trimmed.length > 255) return null
  return trimmed
}

/**
 * Sanitize URL input
 */
export function sanitizeURL(input: unknown): string | null {
  if (typeof input !== "string") return null
  try {
    const url = new URL(input)
    // Only allow http and https protocols
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Sanitize array input
 */
export function sanitizeArray<T>(
  input: unknown,
  sanitizer: (item: unknown) => T | null,
  maxLength: number = 100,
): T[] {
  if (!Array.isArray(input)) return []
  if (input.length > maxLength) return []
  return input.map(sanitizer).filter((item): item is T => item !== null)
}

/**
 * Sanitize object input
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  input: unknown,
  schema: Record<keyof T, (value: unknown) => T[keyof T] | null>,
): Partial<T> {
  if (typeof input !== "object" || input === null) return {}
  
  const result: Partial<T> = {}
  for (const [key, sanitizer] of Object.entries(schema)) {
    if (key in input) {
      const sanitized = sanitizer((input as Record<string, unknown>)[key])
      if (sanitized !== null) {
        result[key as keyof T] = sanitized
      }
    }
  }
  return result
}

/**
 * Validate and sanitize ID parameter (UUID or string)
 */
export function sanitizeId(input: unknown): string | null {
  if (typeof input !== "string") return null
  // Allow UUIDs or alphanumeric strings up to 50 chars
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) {
    return input
  }
  if (/^[a-zA-Z0-9_-]{1,50}$/.test(input)) {
    return input
  }
  return null
}
