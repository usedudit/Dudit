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
            <FormSection title="Observações" className="mt-0">
                <FormTextarea
                    name="notes"
                    label="Observações"
                    placeholder="Escreva aqui observações sobre este pedido..."
                    value={notes}
                    onChange={(e: any) => setNotes(e.target.value)}
                    className="min-h-[250px]"
                    disabled={disabled}
                    maxLength={500}
                    showCharacterCount
                />
            </FormSection>
        </FadeIn>
    )
}
