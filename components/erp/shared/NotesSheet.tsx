"use client"

import React from "react"
import { XIcon } from "@/lib/icons"
import { Button, FormTextarea } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { useMediaQuery } from "@/components/erp/hooks"

function DesktopSheet({
    isOpen,
    onClose,
    title,
    children,
}: {
    isOpen: boolean
    onClose: () => void
    title: string
    children: React.ReactNode
}) {
    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
                        <header className="flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h2>
                            <Button variant="filled" onClick={onClose} size="icon">
                                <XIcon className="h-5 w-5" />
                            </Button>
                        </header>
                        <div className="flex-1 overflow-y-auto">{children}</div>
                    </div>
                </div>
            </div>
        </Portal>
    )
}

interface NotesSheetProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    confirmText?: string
}

export default function NotesSheet({
    isOpen,
    onClose,
    onConfirm,
    title = "Adicionar Observação",
    value,
    onChange,
    placeholder = "Digite alguma observação que sairá no pedido...",
    confirmText = "Confirmar",
}: NotesSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1024px)")

    const content = (
        <div className="space-y-4 pt-2 md:flex md:h-full md:flex-col md:p-6">
            <FormTextarea
                label=""
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                name="notes"
                rows={5}
                maxLength={500}
                showCharacterCount
            />
            <div className="flex items-center gap-3 md:mt-4 md:border-t md:border-brand-border md:pt-4 dark:md:border-dark-border">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                    Cancelar
                </Button>
                <Button className="flex-1" onClick={onConfirm}>
                    {confirmText}
                </Button>
            </div>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <DesktopSheet isOpen={isOpen} onClose={onClose} title={title}>
            {content}
        </DesktopSheet>
    )
}
