import React from "react"
import { cn } from "@/lib/utils"

interface SkeletonLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string
    width?: string | number
    height?: string | number
    circle?: boolean
}

export function SkeletonLoader({
    className,
    width,
    height,
    circle = false,
    ...props
}: SkeletonLoaderProps) {
    return (
        <div
            className={cn(
                "relative overflow-hidden bg-brand-border/40 dark:bg-dark-border/40",
                "before:absolute before:inset-0",
                "before:animate-shimmer",
                "before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent",
                circle ? "rounded-full" : "rounded-xl",
                className
            )}
            style={{
                width: width ?? "100%",
                height: height ?? (circle ? width : "100%"),
            }}
            {...props}
        />
    )
}
