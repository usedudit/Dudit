"use client"

import React from "react"
import { motion } from "framer-motion"
import { ThreeDotsLoader } from "@/components/reusable"
import { cn } from "@/lib/utils"

interface ERPDetailLoadingProps {
    className?: string
    loaderClassName?: string
}

export function ERPDetailLoading({ className, loaderClassName }: ERPDetailLoadingProps) {
    return (
        <motion.div
            key="erp-detail-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
                "flex items-center justify-center h-[calc(100vh-65px)] min-h-[400px] w-full bg-white dark:bg-dark-background transition-colors duration-300",
                className
            )}
        >
            <ThreeDotsLoader className={loaderClassName} />
        </motion.div>
    )
}

export default ERPDetailLoading
