/**
 * Generate user initials from full name.
 */
export function getUserInitials(fullName: string): string {
  const names = fullName.trim().split(" ").filter(n => n.length > 0)
  if (names.length === 0) return "?"
  if (names.length === 1) return names[0][0].toUpperCase()
  return (names[0][0] + names[names.length - 1][0]).toUpperCase()
}

export const AVATAR_COLORS = [
  "bg-red-700",
  "bg-orange-700",
  "bg-yellow-700",
  "bg-green-700",
  "bg-blue-700",
  "bg-indigo-700",
  "bg-purple-700",
  "bg-pink-700",
]

/**
 * Generate a consistent background color based on user name.
 */
export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/**
 * Anonymize a full name by showing only the first letter of each word followed by "***".
 * Example: "João Silva" → "J*** S***"
 */
export function anonymizeName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(n => n.length > 0)
  if (words.length === 0) return "***"
  if (words.length === 1) return words[0][0].toUpperCase() + "***"
  return words[0][0].toUpperCase() + "*** " + words[words.length - 1][0].toUpperCase() + "***"
}

/**
 * Maps an avatar background color to a corresponding default banner URL.
 */
export function getBannerUrlByColor(colorClass: string): string {
  if (colorClass.includes("red")) return "https://img.dudit.com.br/static/banners/default/Red.png"
  if (colorClass.includes("orange")) return "https://img.dudit.com.br/static/banners/default/Orange.png"
  if (colorClass.includes("yellow")) return "https://img.dudit.com.br/static/banners/default/Yellow.png"
  if (colorClass.includes("green")) return "https://img.dudit.com.br/static/banners/default/Green.png"
  if (colorClass.includes("blue")) return "https://img.dudit.com.br/static/banners/default/Blue.png"
  if (colorClass.includes("indigo") || colorClass.includes("purple")) return "https://img.dudit.com.br/static/banners/default/Purple.png"
  if (colorClass.includes("pink")) return "https://img.dudit.com.br/static/banners/default/Pink.png"
  return "https://img.dudit.com.br/static/banners/default/Blue.png"
}
