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
                "bg-gray-200 dark:bg-dark-border animate-pulse",
                circle ? "rounded-full" : "rounded-md",
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
