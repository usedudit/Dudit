"use client"

import React, { type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Portal from "@/components/Portal"
import { XIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { Button } from "@/components/reusable"
import { cn } from "@/lib/utils"

interface DefaultModalProps {
    isOpen: boolean
    onClose: () => void
    title?: string
    children: ReactNode
    footer?: ReactNode
    maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl"
    description?: string
    icon?: React.ReactElement<{ className?: string }>
    hideHeader?: boolean
    className?: string
    leftAction?: ReactNode
}

const DefaultModal: React.FC<DefaultModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    maxWidth = "xl",
    hideHeader = false,
    className = "",
    leftAction,
}) => {
    const isMobile = useMediaQuery("(max-width: 1023px)")

    const handleClose = () => {
        onClose()
    }

    const maxWidthClasses = {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
        xl: "max-w-xl",
        "2xl": "max-w-2xl",
        "3xl": "max-w-3xl",
        "4xl": "max-w-4xl",
        "5xl": "max-w-5xl",
    }

    return (
        <Portal>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className={cn(
                            "fixed inset-0 z-[110] flex p-0 lg:p-4",
                            isMobile ? "items-end" : "items-center justify-center"
                        )}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <motion.div
                            className="fixed inset-0 bg-black/60"
                            onClick={handleClose}
                        />

                        {isMobile ? (
                            <motion.div
                                className={cn(
                                    "relative bg-white dark:bg-dark-surface shadow-xl w-full flex flex-col overflow-hidden rounded-t-3xl max-h-[85vh]",
                                    className
                                )}
                                initial={{ y: "100%" }}
                                animate={{ y: 0 }}
                                exit={{ y: "100%" }}
                                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                            >
                                <div className="shrink-0 flex justify-center pt-3 pb-1">
                                    <div className="w-10 h-1.5 bg-gray-300 dark:bg-dark-border rounded-full" />
                                </div>

                                {!hideHeader && (
                                    <div className="flex items-center justify-between px-6 pt-2 pb-2">
                                        <div className="flex items-center gap-2">
                                            {leftAction}
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
                                        </div>
                                    </div>
                                )}

                                <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">{children}</div>

                                {footer && (
                                    <div className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface -mx-0 -mb-0">
                                        {footer}
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                className={cn(
                                    "relative bg-white dark:bg-dark-surface rounded-2xl shadow-xl w-full flex flex-col overflow-hidden max-h-[90vh]",
                                    maxWidthClasses[maxWidth],
                                    className
                                )}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                                {!hideHeader && (
                                    <div className="flex items-center justify-between p-6 pb-2">
                                        <div className="flex items-center gap-3">
                                            {leftAction}
                                            <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
                                        </div>
                                        <Button variant="filled" onClick={handleClose} className="w-[40px] h-[40px] p-0 flex items-center justify-center shrink-0">
                                            <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                    </div>
                                )}

                                <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">{children}</div>

                                {footer && (
                                    <div className="flex items-center justify-end gap-3 p-6 pt-2">
                                        {footer}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </Portal>
    )
}

export default DefaultModal
