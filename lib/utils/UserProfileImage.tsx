"use client"

import { getAvatarColor, getUserInitials } from "@/lib/utils/avatar"

export { AVATAR_COLORS, getAvatarColor, getBannerUrlByColor, getUserInitials } from "@/lib/utils/avatar"

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
