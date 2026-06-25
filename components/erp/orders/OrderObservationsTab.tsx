"use client"

import React from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { FormSection, FormTextarea } from "@/components/reusable"

interface OrderObservationsTabProps {
    notes: string
    setNotes: (val: string) => void
    disabled?: boolean
}

export const OrderObservationsTab: React.FC<OrderObservationsTabProps> = ({ notes, setNotes, disabled = false }) => {
    return (
        <FadeIn>
            <FormSection title="" hasSeparator={false} className="mt-0">
                <p className="text-sm text-brand-inactive-text">Estas informações são apenas para uso interno e não aparecerão para o cliente.</p>
                <FormTextarea
                    name="notes"
                    label=""
                    placeholder="Escreve aqui observações internas sobre este pedido..."
                    value={notes}
                    onChange={(e: any) => setNotes(e.target.value)}
                    className="min-h-[250px]"
                    disabled={disabled}
                />
            </FormSection>
        </FadeIn>
    )
}
