"use client"

import React from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { FormTextarea } from "@/components/reusable"
import { FileIcon } from "@/lib/icons"

interface OrderObservationsTabProps {
    notes: string
    setNotes: (val: string) => void
}

export const OrderObservationsTab: React.FC<OrderObservationsTabProps> = ({ notes, setNotes }) => {
    return (
        <FadeIn>
            <div className="max-w-[800px] flex flex-col gap-4">
                <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                    <FileIcon size={20} className="text-brand-green" />
                    Observações do Pedido
                </h2>
                <p className="text-sm text-brand-inactive-text">Estas informações são apenas para uso interno e não aparecerão para o cliente.</p>
                <FormTextarea
                    name="notes"
                    label=""
                    placeholder="Escreve aqui observações internas sobre este pedido..."
                    value={notes}
                    onChange={(e: any) => setNotes(e.target.value)}
                    className="min-h-[250px]"
                />
            </div>
        </FadeIn>
    )
}
