"use client"

import { useEffect, useState } from "react"
import { Button, DefaultModal, Input } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { saveOrderRecipientDocumentAction } from "@/app/actions/shipping/superfrete"
import { validateCPF, validateCNPJ } from "@/lib/input-validator"

interface RecipientDocumentModalProps {
    isOpen: boolean
    onClose: () => void
    partnerId: string
    orderId: string
    recipientName?: string
    onSaved: () => void | Promise<void>
}

function formatDocument(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 14)
    if (digits.length > 11) {
        const p1 = digits.slice(0, 2)
        const p2 = digits.slice(2, 5)
        const p3 = digits.slice(5, 8)
        const p4 = digits.slice(8, 12)
        const p5 = digits.slice(12, 14)
        let out = p1
        if (p2) out += "." + p2
        if (p3) out += "." + p3
        if (p4) out += "/" + p4
        if (p5) out += "-" + p5
        return out
    }
    const p1 = digits.slice(0, 3)
    const p2 = digits.slice(3, 6)
    const p3 = digits.slice(6, 9)
    const p4 = digits.slice(9, 11)
    let out = p1
    if (p2) out += "." + p2
    if (p3) out += "." + p3
    if (p4) out += "-" + p4
    return out
}

export function RecipientDocumentModal({
    isOpen,
    onClose,
    partnerId,
    orderId,
    recipientName,
    onSaved,
}: RecipientDocumentModalProps) {
    const [value, setValue] = useState("")
    const [localError, setLocalError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setValue("")
            setLocalError(null)
        }
    }, [isOpen])

    const handleSave = async () => {
        const digits = value.replace(/\D/g, "")
        if (digits.length === 11) {
            if (!validateCPF(digits)) {
                setLocalError("CPF inválido.")
                return
            }
        } else if (digits.length === 14) {
            if (!validateCNPJ(digits)) {
                setLocalError("CNPJ inválido.")
                return
            }
        } else {
            setLocalError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).")
            return
        }

        setSaving(true)
        try {
            const res = await saveOrderRecipientDocumentAction({
                partnerId,
                orderId,
                document: digits,
            })
            if (res.success) {
                toast.success("Documento salvo no cliente.")
                setValue("")
                setLocalError(null)
                await onSaved()
                onClose()
            } else {
                setLocalError(res.error)
            }
        } catch {
            setLocalError("Erro ao salvar o documento. Tente novamente.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={saving ? () => {} : onClose}
            title="CPF/CNPJ do destinatário"
            description="A transportadora exige o documento do destinatário para gerar a etiqueta. O valor será salvo no cadastro do cliente."
            maxWidth="md"
            footer={
                <div className="flex items-center justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} isLoading={saving} disabled={!value.trim()}>
                        Salvar e continuar
                    </Button>
                </div>
            }
        >
            <div className="space-y-4 pt-2">
                {recipientName && (
                    <p className="text-sm text-brand-dark dark:text-dark-heading">
                        Cliente: <span className="font-medium">{recipientName}</span>
                    </p>
                )}
                <Input
                    label="CPF ou CNPJ"
                    value={value}
                    onChange={(e) => {
                        setValue(formatDocument(e.target.value))
                        if (localError) setLocalError(null)
                    }}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    autoFocus
                    required
                />
                {localError && <p className="text-sm text-red-500">{localError}</p>}
            </div>
        </DefaultModal>
    )
}

export default RecipientDocumentModal
