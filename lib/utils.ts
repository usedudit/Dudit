import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export * from "./utils/formatters"

/**
 * Generates a display name from email address
 * Extracts the first part before @ and capitalizes it
 * e.g., "john.doe@example.com" -> "John Doe"
 * e.g., "alice@example.com" -> "Alice"
 */
export function generateNameFromEmail(email: string): string {
  const namePart = email.split("@")[0]
  const words = namePart.split(/[._-]+/).filter(word => word.length > 0)
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Generates initials from a name or email
 * e.g., "John Doe" -> "JD"
 * e.g., "Alice" -> "A"
 * e.g., "john.doe@example.com" -> "JD"
 */
export function getInitials(nameOrEmail: string): string {
  const name = nameOrEmail.includes("@") ? generateNameFromEmail(nameOrEmail) : nameOrEmail
  const words = name.split(" ").filter(w => w.length > 0)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return (words[0]?.[0] || "?").toUpperCase()
}

/**
 * Generates a consistent color based on a string hash
 * Returns one of several predefined colors
 */
export function getAvatarColor(text: string): string {
  const colors = [
    "bg-red-500",
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-yellow-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-cyan-500",
  ]

  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }

  const index = Math.abs(hash) % colors.length
  return colors[index]
}

/**
 * Calculates a password strength score (0 to 4)
 * Returns 0 if empty
 * +1 for min length 8
 * +1 for including numbers
 * +1 for both lower and uppercase
 * +1 for special characters
 */
export function calculatePasswordScore(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (/[0-9]/.test(password)) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score
}
