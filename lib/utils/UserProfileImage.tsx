"use client"

/**
 * Generate user initials from full name
 * @param fullName - User's full name
 * @returns Two letters representing the user's initials
 */
export function getUserInitials(fullName: string): string {
  const names = fullName.trim().split(" ").filter(n => n.length > 0)
  if (names.length === 0) return "?"
  if (names.length === 1) {
    return names[0][0].toUpperCase()
  }
  return (names[0][0] + names[names.length - 1][0]).toUpperCase()
}

/**
 * Generate a consistent background color based on user name
 * Uses hash function to ensure same name always gets same color
 * @param name - User's name
 * @returns Tailwind background color class
 */
export function getAvatarColor(name: string): string {
  const colors = [
    "bg-red-400",
    "bg-orange-400",
    "bg-yellow-400",
    "bg-green-400",
    "bg-blue-400",
    "bg-indigo-400",
    "bg-purple-400",
    "bg-pink-400",
  ]
  
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  return colors[Math.abs(hash) % colors.length]
}

/**
 * Avatar component using user initials and dynamic color
 * @param fullName - User's full name
 * @param className - Additional CSS classes
 * @returns React component
 */
export function UserProfileImage({
  fullName,
  className = "",
  imageUrl,
}: {
  fullName: string
  className?: string
  imageUrl?: string | null
}) {
  const initials = getUserInitials(fullName)
  const backgroundColor = getAvatarColor(fullName)
  const normalizedImageUrl = typeof imageUrl === "string" ? imageUrl.trim() : ""
  const hasImage = normalizedImageUrl.length > 0

  if (hasImage) {
    return (
      <div className={`overflow-hidden rounded-full ${className}`} title={fullName}>
        <img src={normalizedImageUrl} alt={fullName} className="h-full w-full object-cover" />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full font-semibold text-white ${backgroundColor} ${className}`}
      title={fullName}
    >
      {initials}
    </div>
  )
}
