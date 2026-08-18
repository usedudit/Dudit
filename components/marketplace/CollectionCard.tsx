"use client"

import React from "react"
import Link from "next/link"
import { UserProfileImage, getAvatarColor } from "@/lib/utils/UserProfileImage"

interface CollectionCardProps {
  collection: {
    id: string
    name: string
    description?: string | null
    cover_url?: string | null
    banner_color?: string | null
    items_count: number
    views_count: number
    author?: { id: string; full_name?: string | null; avatar_url?: string | null } | null
    created_at: string
  }
  className?: string
}

export function CollectionCard({ collection, className = "w-[270px] sm:w-[320px]" }: CollectionCardProps) {
  const authorName = collection.author?.full_name || "Usuário"
  // Use saved banner_color for avatar background, fallback to computed color from name
  const avatarBgColor = collection.banner_color || getAvatarColor(collection.name)

  return (
    <Link
      href={`/colecoes/${collection.id}`}
      prefetch={false}
      className={`flex flex-col group cursor-pointer transition-all duration-300 ${className}`}
    >
      <div className="relative w-full aspect-[16/10] rounded-[16px] overflow-hidden bg-brand-gray dark:bg-dark-border/30 mb-3 shrink-0">
        {collection.cover_url ? (
          <img
            src={collection.cover_url}
            alt={collection.name}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-green/10 to-brand-dark/10">
            <svg className="w-12 h-12 text-brand-green/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 px-1">
        <UserProfileImage
          fullName={collection.name}
          imageUrl={null}
          className={`w-10 h-10 border border-brand-border shrink-0 ${avatarBgColor}`}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-brand-dark dark:text-dark-heading text-sm truncate">
            {collection.name}
          </h3>
          <p className="text-[12px] text-brand-inactive-text dark:text-dark-body truncate">
            {collection.items_count} {collection.items_count === 1 ? "item" : "itens"}
          </p>
        </div>
      </div>
    </Link>
  )
}
