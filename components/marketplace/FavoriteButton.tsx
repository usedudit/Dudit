"use client"

import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { HeartIcon } from "@/lib/icons"
import { useSupabase } from "@/providers/supabase-provider"
import { useFavorites } from "@/providers/favorites-provider"
import { useRouter } from "next/navigation"
import type { FavoriteItemType } from "@/app/actions/marketplace/favorites"

interface FavoriteButtonProps {
    itemId: string
    itemType: FavoriteItemType
    /** Size variant */
    size?: "sm" | "md" | "lg"
    /** Visual variant */
    variant?: "overlay" | "inline" | "icon-only" | "outline"
    /** Additional class names */
    className?: string
}

const sizeMap = {
    sm: { button: "w-8 h-8", icon: 16 },
    md: { button: "w-9 h-9", icon: 18 },
    lg: { button: "w-10 h-10", icon: 20 },
}

export function FavoriteButton({
    itemId,
    itemType,
    size = "md",
    variant = "overlay",
    className = "",
}: FavoriteButtonProps) {
    const { user } = useSupabase()
    const { isFavorited, toggleFavorite } = useFavorites()
    const router = useRouter()
    const [isAnimating, setIsAnimating] = useState(false)

    const favorited = isFavorited(itemId, itemType)
    const { button: buttonSize, icon: iconSize } = sizeMap[size]

    const handleClick = useCallback(
        async (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()

            if (!user) {
                router.push("/auth/login?next=" + encodeURIComponent(window.location.pathname))
                return
            }

            setIsAnimating(true)
            await toggleFavorite(itemId, itemType)
            setTimeout(() => setIsAnimating(false), 400)
        },
        [user, router, toggleFavorite, itemId, itemType]
    )

    const baseClasses = (() => {
        switch (variant) {
            case "overlay":
                return `${buttonSize} rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer select-none
                    ${favorited
                        ? "bg-white shadow-md hover:shadow-lg"
                        : "bg-white/90 hover:bg-white shadow-sm hover:shadow-md"
                    }`
            case "inline":
                return `${buttonSize} rounded-full flex items-center justify-center border transition-all duration-200 cursor-pointer select-none
                    ${favorited
                        ? "bg-green-50 border-green-200 hover:bg-green-100"
                        : "bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-border/30"
                    }`
            case "outline":
                return `${buttonSize} rounded-full flex items-center justify-center border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-brand-gray dark:hover:bg-dark-border transition-all duration-200 cursor-pointer select-none`
            case "icon-only":
                return `flex items-center justify-center transition-all duration-200 cursor-pointer select-none p-1.5`
            default:
                return ""
        }
    })()

    return (
        <button
            onClick={handleClick}
            className={`${baseClasses} ${className}`}
            aria-label={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            title={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
            <AnimatePresence mode="wait">
                <motion.div
                    key={favorited ? "filled" : "outline"}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: isAnimating ? 1.3 : 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 15, duration: 0.2 }}
                >
                    <HeartIcon
                        size={iconSize}
                        className={`transition-colors duration-200 ${favorited
                            ? "text-brand-green fill-brand-green"
                            : "text-brand-green hover:text-brand-green/80 fill-transparent"
                            }`}
                    />
                </motion.div>
            </AnimatePresence>

            {/* Burst particles effect on favorite */}
            {isAnimating && favorited && (
                <div className="absolute inset-0 pointer-events-none">
                    {[...Array(6)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute w-1 h-1 rounded-full bg-brand-green/80"
                            style={{
                                left: "50%",
                                top: "50%",
                            }}
                            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                            animate={{
                                scale: [0, 1, 0],
                                x: Math.cos((i * 60 * Math.PI) / 180) * 16,
                                y: Math.sin((i * 60 * Math.PI) / 180) * 16,
                                opacity: [1, 1, 0],
                            }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                    ))}
                </div>
            )}
        </button>
    )
}
