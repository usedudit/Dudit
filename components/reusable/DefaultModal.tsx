"use client"

import React, { type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Portal from "@/components/Portal"
import { XIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import BottomSheet from "@/components/BottomSheet"
import { Button } from "@/components/reusable"

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

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={handleClose}>
                <div className="flex flex-col gap-4 pt-2 pb-4">
                    {!hideHeader && (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {leftAction}
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col gap-4">{children}</div>
                    {footer && <div className="flex flex-col gap-3 pt-2">{footer}</div>}
                </div>
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="fixed inset-0 z-[110] flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <motion.div
                            className="fixed inset-0 bg-black/60"
                            onClick={handleClose}
                        />

                        <motion.div
                            className={`relative bg-white dark:bg-dark-surface rounded-2xl shadow-xl w-full ${maxWidthClasses[maxWidth]} flex flex-col overflow-hidden max-h-[90vh] ${className}`}
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
                    </motion.div>
                )}
            </AnimatePresence>
        </Portal>
    )
}

export default DefaultModal
