"use client"

import React, { type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Portal from "@/components/Portal"
import { XIcon } from "@/lib/icons"
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

const renderMobileFooter = (node: ReactNode): ReactNode => {
    return React.Children.map(node, (child) => {
        if (!React.isValidElement(child)) {
            return child
        }

        if (child.type === React.Fragment) {
            return (
                <React.Fragment key={child.key}>
                    {renderMobileFooter((child.props as { children?: ReactNode }).children)}
                </React.Fragment>
            )
        }

        const childProps = child.props as { className?: string; children?: ReactNode }

        if (childProps.children && typeof child.type === "string" && child.type !== "button" && child.type !== "a") {
            return React.cloneElement(child, {
                className: cn("w-full", childProps.className),
                children: renderMobileFooter(childProps.children),
            } as any)
        }

        return React.cloneElement(child, {
            className: cn(childProps.className, "h-12 w-full"),
        } as any)
    })
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
                        className="fixed inset-0 z-[110] flex items-end lg:items-center justify-center p-0 lg:p-4"
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
                            className={cn(
                                "relative bg-white dark:bg-dark-surface shadow-xl w-full flex flex-col overflow-hidden",
                                "rounded-t-3xl max-h-[85vh] lg:max-h-[90vh] lg:rounded-2xl",
                                maxWidthClasses[maxWidth],
                                className
                            )}
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 50 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                        >
                            {/* Mobile drag handle */}
                            <div className="lg:hidden shrink-0 flex justify-center pt-3 pb-1">
                                <div className="w-10 h-1.5 bg-gray-300 dark:bg-dark-border rounded-full" />
                            </div>

                            {!hideHeader && (
                                <div className="flex items-center justify-between px-6 pt-2 pb-2 lg:p-6 lg:pb-2">
                                    <div className="flex items-center gap-3">
                                        {leftAction}
                                        <h3 className="text-lg lg:text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
                                    </div>
                                    <Button variant="filled" onClick={handleClose} className="w-[36px] h-[36px] lg:w-[40px] lg:h-[40px] p-0 flex items-center justify-center shrink-0">
                                        <XIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                    </Button>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">{children}</div>

                            {footer && (
                                <div className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface flex gap-3 -mx-0 lg:-mx-0 -mb-0 lg:mb-0">
                                    <div className="flex items-center justify-end gap-3 w-full lg:px-0">
                                        {footer}
                                    </div>
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
