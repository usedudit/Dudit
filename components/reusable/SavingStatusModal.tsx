"use client"

import DefaultModal from "./DefaultModal"

interface SavingStatusModalProps {
    isOpen: boolean
    text: string
}

export default function SavingStatusModal({ isOpen, text }: SavingStatusModalProps) {
    return (
        <DefaultModal isOpen={isOpen} onClose={() => {}} title="" maxWidth="sm" hideHeader>
            <div className="flex flex-col items-center justify-center p-6 gap-6 h-full mt-4">
                <img src="https://img.dudit.com.br/static/mascots/Aguarde.png" alt="Aguarde" className="w-36 h-36 object-contain" />
                <p className="text-lg font-semibold text-brand-dark dark:text-dark-heading text-center leading-tight">
                    {text}
                </p>
            </div>
        </DefaultModal>
    )
}
