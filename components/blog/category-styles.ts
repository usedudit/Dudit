import type { BlogCategory } from "@/lib/blog/categories"

interface AccentClasses {
    badge: "green" | "blue" | "purple" | "orange" | "red" | "cyan" | "gray"
    text: string
    softBg: string
    border: string
    gradient: string
}

export const BLOG_ACCENT_CLASSES: Record<BlogCategory["accent"], AccentClasses> = {
    green: {
        badge: "green",
        text: "text-brand-green",
        softBg: "bg-brand-green/10",
        border: "border-brand-green/20",
        gradient: "from-emerald-500/20 via-brand-green/10 to-transparent",
    },
    blue: {
        badge: "blue",
        text: "text-blue-600 dark:text-blue-400",
        softBg: "bg-blue-500/10",
        border: "border-blue-500/20",
        gradient: "from-blue-500/20 via-sky-400/10 to-transparent",
    },
    purple: {
        badge: "purple",
        text: "text-purple-600 dark:text-purple-400",
        softBg: "bg-purple-500/10",
        border: "border-purple-500/20",
        gradient: "from-purple-500/20 via-fuchsia-400/10 to-transparent",
    },
    orange: {
        badge: "orange",
        text: "text-brand-orange",
        softBg: "bg-brand-orange/10",
        border: "border-brand-orange/20",
        gradient: "from-orange-500/20 via-amber-400/10 to-transparent",
    },
    red: {
        badge: "red",
        text: "text-brand-red",
        softBg: "bg-brand-red/10",
        border: "border-brand-red/20",
        gradient: "from-red-500/20 via-rose-400/10 to-transparent",
    },
    cyan: {
        badge: "cyan",
        text: "text-brand-cyan",
        softBg: "bg-brand-cyan/10",
        border: "border-brand-cyan/20",
        gradient: "from-cyan-500/20 via-teal-400/10 to-transparent",
    },
    gray: {
        badge: "gray",
        text: "text-brand-inactive-text dark:text-dark-body",
        softBg: "bg-brand-gray dark:bg-dark-border/30",
        border: "border-brand-border dark:border-dark-border",
        gradient: "from-slate-500/20 via-slate-400/10 to-transparent",
    },
}
