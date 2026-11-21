"use client"

import { useEffect, useState } from "react"
import { Button, DefaultModal, Input } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { saveOrderRecipientNameAction } from "@/app/actions/shipping/superfrete"

interface RecipientNameModalProps {
    isOpen: boolean
    onClose: () => void
    partnerId: string
    orderId: string
    initialName?: string
    role?: "destinatário" | "remetente"
    onSaved: () => void | Promise<void>
}

function normalizeName(value: string): string {
    return value.replace(/\s+/g, " ").trim()
}

function hasAtLeastTwoWords(value: string): boolean {
    return normalizeName(value).split(" ").filter(Boolean).length >= 2
}

export function RecipientNameModal({
    isOpen,
    onClose,
    partnerId,
    orderId,
    initialName,
    role = "destinatário",
    onSaved,
}: RecipientNameModalProps) {
    const [value, setValue] = useState("")
    const [localError, setLocalError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setValue(initialName ? normalizeName(initialName) : "")
            setLocalError(null)
        }
    }, [isOpen, initialName])

    const handleSave = async () => {
        const normalized = normalizeName(value)
        if (!hasAtLeastTwoWords(normalized)) {
            setLocalError("Informe nome e sobrenome (ao menos duas palavras).")
            return
        }

        setSaving(true)
        try {
            const res = await saveOrderRecipientNameAction({
                partnerId,
                orderId,
                name: normalized,
            })
            if (res.success) {
                toast.success(`Nome do ${role} atualizado.`)
                setLocalError(null)
                await onSaved()
                onClose()
            } else {
                setLocalError(res.error)
            }
        } catch {
            setLocalError("Erro ao salvar o nome. Tente novamente.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={saving ? () => {} : onClose}
            title={`Nome completo do ${role}`}
            description={`A transportadora exige nome e sobrenome do ${role} para gerar a etiqueta. O nome será atualizado no pedido e no cadastro do cliente.`}
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
                <Input
                    label="Nome completo (ou razão social)"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value)
                        if (localError) setLocalError(null)
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !saving && value.trim()) {
                            e.preventDefault()
                            handleSave()
                        }
                    }}
                    placeholder="Ex: João Silva ou Empresa Ltda"
                    maxLength={150}
                    autoFocus
                    required
                />
                {localError && <p className="text-sm text-red-500">{localError}</p>}
            </div>
        </DefaultModal>
    )
}

export default RecipientNameModal
