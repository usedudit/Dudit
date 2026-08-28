"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { motion } from "framer-motion"
import { Button, Input, FormDropdown, ThreeDotsLoader, FormTextarea, Badge } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { useMediaQuery } from "@/components/erp/hooks"
import { XIcon, ChevronDownIcon, ChevronUpIcon, ArrowUpDownIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatQuantityWithUnit } from "@/lib/utils/formatters"
import { createBatchStockMovementAction } from "@/app/actions/erp/stock-movements"
import { useNotification } from "@/hooks/use-notification"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

type Props = {
    isOpen: boolean
    product: {
        id: string
        name: string
        sku: string
        image?: string | null
        stock: number
        unit?: string | null
    }
    variant?: {
        id: string
        name: string
        sku: string
        image?: string | null
        stock: number
        unit?: string | null
    } | null
    onClose: () => void
    onSaveSuccess: (newStock: number) => void
}

export default function QuickStockMovementSheet({ isOpen, product, variant, onClose, onSaveSuccess }: Props) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { success: notifySuccess, error: notifyError } = useNotification()

    const currentStock = variant ? Number(variant.stock || 0) : Number(product.stock || 0)
    const displayName = product.name + (variant ? ` - ${variant.name}` : '')
    const displaySku = variant ? variant.sku : product.sku
    const displayImage = variant?.image || product.image || null

    // Form States
    const [type, setType] = useState<'in' | 'out' | 'adjustment'>('in')
    const [quantity, setQuantity] = useState<number>(1)
    const [reason, setReason] = useState<string>("Selecione um motivo...")
    const [customReason, setCustomReason] = useState<string>("")
    const [notes, setNotes] = useState<string>("")
    const [isSaving, setIsSaving] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    // Reset form states when opened
    useEffect(() => {
        if (isOpen) {
            setType('in')
            setQuantity(1)
            setReason("Selecione um motivo...")
            setCustomReason("")
            setNotes("")
            setErrors({})
        }
    }, [isOpen])

    const handleReasonChange = useCallback((value: string) => {
        setReason(value)
        if (value !== 'Outro') setCustomReason('')
        setErrors(prev => {
            const next = { ...prev }
            delete next.reason
            delete next.customReason
            return next
        })
    }, [])

    const handleSave = async () => {
        const newErrors: Record<string, string> = {}

        if (type !== 'adjustment' && quantity <= 0) {
            newErrors.quantity = "A quantidade deve ser maior que zero."
        }
        if (type === 'adjustment' && quantity < 0) {
            newErrors.quantity = "O estoque ajustado não pode ser negativo."
        }
        if (reason === "Selecione um motivo...") {
            newErrors.reason = "Selecione um motivo."
        }
        if (reason === "Outro" && !customReason.trim()) {
            newErrors.customReason = "Informe o motivo."
        }
        if (type === 'out' && quantity > currentStock) {
            newErrors.quantity = "A quantidade excede o estoque disponível."
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        setIsSaving(true)
        try {
            const finalReason = reason === 'Outro' ? customReason : reason
            const res = await createBatchStockMovementAction({
                type,
                reason: finalReason,
                notes,
                items: [{
                    productId: product.id,
                    variantId: variant?.id || null,
                    quantity,
                }],
            })

            if (res && res.success) {
                const finalStock = type === 'in'
                    ? currentStock + quantity
                    : type === 'out'
                        ? Math.max(0, currentStock - quantity)
                        : quantity
                notifySuccess("Movimentação de estoque registrada!")
                onSaveSuccess(finalStock)
                onClose()
            } else {
                notifyError(res?.error || "Erro ao salvar movimentação de estoque.")
            }
        } catch (err) {
            notifyError("Erro interno. Tente novamente.")
        } finally {
            setIsSaving(false)
        }
    }

    const projectedStock = type === 'in'
        ? currentStock + (Number(quantity) || 0)
        : type === 'out'
            ? Math.max(0, currentStock - (Number(quantity) || 0))
            : (Number(quantity) || 0)

    const delta = projectedStock - currentStock

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Ajustar estoque</h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex w-[40px] h-[40px]">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* Product details */}
            <div className="border-b border-brand-border px-6 py-5 dark:border-dark-border">
                <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border/40">
                        <img
                            src={getR2ImageUrl(displayImage, "thumbnail") || PLACEHOLDER_IMAGE}
                            alt={displayName}
                            className="h-full w-full object-cover"
                        />
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <h3 className="truncate text-base font-bold text-brand-dark dark:text-dark-heading">{displayName}</h3>
                        <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">SKU: {displaySku || "-"}</p>
                        <p className="mt-1 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                            Estoque atual: <span className="font-bold text-brand-primary">{formatQuantityWithUnit(currentStock, variant?.unit || product?.unit, "full")}</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Tipo de Movimentação */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Tipo de Operação</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                        <button
                            type="button"
                            onClick={() => {
                                setType('in')
                                setQuantity(1)
                                handleReasonChange('Selecione um motivo...')
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all border ${type === 'in'
                                ? 'bg-green-50/50 dark:bg-green-900/10 border-brand-green'
                                : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                }`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-1 ${type === 'in' ? 'bg-brand-green text-white' : 'bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text'
                                }`}>
                                <ChevronDownIcon size={16} strokeWidth={2.5} />
                            </div>
                            <span className={`font-bold text-xs ${type === 'in' ? 'text-brand-green' : 'text-brand-dark dark:text-dark-heading'}`}>Entrada</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setType('out')
                                setQuantity(1)
                                handleReasonChange('Selecione um motivo...')
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all border ${type === 'out'
                                ? 'bg-red-50/50 dark:bg-red-900/10 border-brand-red'
                                : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                }`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-1 ${type === 'out' ? 'bg-brand-red text-white' : 'bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text'
                                }`}>
                                <ChevronUpIcon size={16} strokeWidth={2.5} />
                            </div>
                            <span className={`font-bold text-xs ${type === 'out' ? 'text-brand-red' : 'text-brand-dark dark:text-dark-heading'}`}>Saída</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setType('adjustment')
                                setQuantity(currentStock)
                                handleReasonChange('Selecione um motivo...')
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all border ${type === 'adjustment'
                                ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-600 dark:border-blue-500'
                                : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                }`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-1 ${type === 'adjustment' ? 'bg-blue-600 text-white' : 'bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text'
                                }`}>
                                <ArrowUpDownIcon size={16} strokeWidth={2.5} />
                            </div>
                            <span className={`font-bold text-xs ${type === 'adjustment' ? 'text-blue-600 dark:text-blue-400' : 'text-brand-dark dark:text-dark-heading'}`}>Ajuste</span>
                        </button>
                    </div>
                </div>

                {/* Quantidade ou Novo Estoque */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                            {type === 'adjustment' ? 'Novo Estoque (Real)' : 'Quantidade'}
                        </label>
                        {type === 'adjustment' && (
                            <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-brand-inactive-text">Diferença:</span>
                                {delta > 0 ? (
                                    <Badge variant="green" icon={null} className="py-0.5 px-2">+{delta}</Badge>
                                ) : delta < 0 ? (
                                    <Badge variant="red" icon={null} className="py-0.5 px-2">{delta}</Badge>
                                ) : (
                                    <Badge variant="gray" icon={null} className="py-0.5 px-2">0</Badge>
                                )}
                            </div>
                        )}
                    </div>
                    <Input
                        name="quantity"
                        type="number"
                        min={type === 'adjustment' ? 0 : 1}
                        value={quantity !== undefined ? quantity : ""}
                        onChange={(e) => {
                            const val = e.target.value === "" ? 0 : Number(e.target.value)
                            setQuantity(type === 'adjustment' ? Math.max(0, val) : Math.max(1, val))
                            setErrors(prev => {
                                const next = { ...prev }
                                delete next.quantity
                                return next
                            })
                        }}
                        error={!!errors.quantity}
                        errorMessage={errors.quantity}
                    />
                    {type !== 'adjustment' && (
                        <p className="text-xs text-brand-inactive-text">
                            Estoque resultante: <strong className="text-brand-dark dark:text-dark-heading">{projectedStock}</strong>
                        </p>
                    )}
                </div>

                {/* Motivo */}
                <div className="space-y-4">
                    <FormDropdown
                        label="Motivo"
                        value={reason}
                        setValue={handleReasonChange}
                        error={!!errors.reason}
                        errorMessage={errors.reason}
                        options={type === 'in' ? [
                            { value: 'Compra de Fornecedor', label: 'Compra de Fornecedor' },
                            { value: 'Devolução de Cliente', label: 'Devolução de Cliente' },
                            { value: 'Bonificação / Brinde', label: 'Bonificação / Brinde' },
                            { value: 'Ajuste de Estoque', label: 'Ajuste de Estoque' },
                            { value: 'Transferência entre Lojas', label: 'Transferência entre Lojas' },
                            { value: 'Outro', label: 'Outro' }
                        ] : type === 'out' ? [
                            { value: 'Avaria / Perda', label: 'Avaria / Perda' },
                            { value: 'Ajuste de Estoque', label: 'Ajuste de Estoque' },
                            { value: 'Uso Interno', label: 'Uso Interno' },
                            { value: 'Descarte / Vencimento', label: 'Descarte / Vencimento' },
                            { value: 'Brinde / Doação', label: 'Brinde / Doação' },
                            { value: 'Transferência entre Lojas', label: 'Transferência entre Lojas' },
                            { value: 'Outro', label: 'Outro' }
                        ] : [
                            { value: 'Balanço / Inventário', label: 'Balanço / Inventário' },
                            { value: 'Correção de Contagem', label: 'Correção de Contagem' },
                            { value: 'Ajuste Operacional', label: 'Ajuste Operacional' },
                            { value: 'Sobra de Estoque', label: 'Sobra de Estoque' },
                            { value: 'Perda / Extravio não identificado', label: 'Perda / Extravio não identificado' },
                            { value: 'Produto Vencido / Avariado', label: 'Produto Vencido / Avariado' },
                            { value: 'Outro', label: 'Outro' }
                        ]}
                    />

                    {reason === 'Outro' && (
                        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}>
                            <Input
                                label="Descreva o motivo"
                                placeholder="Digite o motivo aqui..."
                                value={customReason}
                                onChange={(e) => {
                                    setCustomReason(e.target.value)
                                    if (e.target.value.trim()) {
                                        setErrors(prev => {
                                            const next = { ...prev }
                                            delete next.customReason
                                            return next
                                        })
                                    }
                                }}
                                error={!!errors.customReason}
                                errorMessage={errors.customReason}
                                maxLength={120}
                            />
                        </motion.div>
                    )}
                </div>

                <FormTextarea
                    label="Observações Internas (Opcional)"
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Adicione informações detalhadas sobre este ajuste de estoque..."
                    maxLength={500}
                    showCharacterCount
                />
            </div>

            {/* Footer */}
            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={onClose} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button
                        className="h-12 flex-1"
                        disabled={isSaving}
                        onClick={handleSave}
                    >
                        {isSaving ? <ThreeDotsLoader /> : "Salvar"}
                    </Button>
                </div>
            </footer>
        </div>
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

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
                    {content}
                </div>
            </div>
        </Portal>
    )
}
