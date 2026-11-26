"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { motion } from "framer-motion"
import { Button, Input, FormDropdown, ThreeDotsLoader, FormTextarea, Badge } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { XIcon, ChevronDownIcon, ChevronUpIcon, ArrowUpDownIcon, UnlockIcon, LockIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatQuantityWithUnit } from "@/lib/utils/formatters"
import { createBatchStockMovementAction, releaseReservedStockAction, getProductStockStatusAction } from "@/app/actions/erp/stock-movements"
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
        reservedStock?: number | null
        availableStock?: number | null
        unit?: string | null
    }
    variant?: {
        id: string
        name: string
        sku: string
        image?: string | null
        stock: number
        reservedStock?: number | null
        availableStock?: number | null
        unit?: string | null
    } | null
    onClose: () => void
    onSaveSuccess: (newStock: number, newReservedStock?: number) => void
}

export default function QuickStockMovementSheet({ isOpen, product, variant, onClose, onSaveSuccess }: Props) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { success: notifySuccess, error: notifyError } = useNotification()

    // z-index dinâmico: esta sheet abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)

    const currentStock = variant ? Number(variant.stock || 0) : Number(product.stock || 0)
    const initialReserved = Math.max(0, Number(variant ? (variant.reservedStock ?? 0) : (product.reservedStock ?? 0)))
    const [liveReservedStock, setLiveReservedStock] = useState<number>(initialReserved)
    const [isLoadingStockStatus, setIsLoadingStockStatus] = useState<boolean>(false)

    const displayName = product.name + (variant ? ` - ${variant.name}` : '')
    const displaySku = variant ? variant.sku : product.sku
    const displayImage = variant?.image || product.image || null
    const displayUnit = variant?.unit || product?.unit || "UN"

    // Form States
    const [type, setType] = useState<'in' | 'out' | 'adjustment' | 'release'>('in')
    const [quantity, setQuantity] = useState<number>(1)
    const [reason, setReason] = useState<string>("Selecione um motivo...")
    const [customReason, setCustomReason] = useState<string>("")
    const [notes, setNotes] = useState<string>("")
    const [isSaving, setIsSaving] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    // Reset form states when opened and sync real stock reserved
    useEffect(() => {
        if (isOpen) {
            const initialRes = Math.max(0, Number(variant ? (variant.reservedStock ?? 0) : (product.reservedStock ?? 0)))
            setLiveReservedStock(initialRes)
            setType('in')
            setQuantity(1)
            setReason("Selecione um motivo...")
            setCustomReason("")
            setNotes("")
            setErrors({})

            let cancelled = false
            setIsLoadingStockStatus(true)
            getProductStockStatusAction(product.id, variant?.id || null)
                .then((res) => {
                    if (!cancelled && res?.success && res.data) {
                        setLiveReservedStock(Math.max(0, Number(res.data.stock_reserved) || 0))
                    }
                })
                .catch(() => { })
                .finally(() => {
                    if (!cancelled) setIsLoadingStockStatus(false)
                })

            return () => {
                cancelled = true
            }
        }
    }, [isOpen, product.id, product.reservedStock, variant?.id, variant?.reservedStock])

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

        if (type === 'release') {
            if (quantity <= 0) {
                newErrors.quantity = "A quantidade a liberar deve ser maior que zero."
            } else if (quantity > liveReservedStock) {
                newErrors.quantity = `A quantidade não pode ser maior que o estoque reservado (${liveReservedStock}).`
            }
        } else if (type === 'adjustment') {
            if (quantity < 0) {
                newErrors.quantity = "O estoque ajustado não pode ser negativo."
            }
        } else {
            if (quantity <= 0) {
                newErrors.quantity = "A quantidade deve ser maior que zero."
            }
            if (type === 'out' && quantity > currentStock) {
                newErrors.quantity = "A quantidade excede o estoque disponível."
            }
        }

        if (reason === "Selecione um motivo...") {
            newErrors.reason = "Selecione um motivo."
        }
        if (reason === "Outro" && !customReason.trim()) {
            newErrors.customReason = "Informe o motivo."
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }

        setIsSaving(true)
        try {
            const finalReason = reason === 'Outro' ? customReason : reason

            if (type === 'release') {
                const res = await releaseReservedStockAction({
                    productId: product.id,
                    variantId: variant?.id || null,
                    quantity,
                    reason: finalReason,
                    notes,
                })

                if (res && res.success) {
                    const releasedQty = res.data?.releasedQuantity ?? quantity
                    const newReserved = res.data?.stock_reserved ?? Math.max(0, liveReservedStock - releasedQty)
                    setLiveReservedStock(newReserved)
                    notifySuccess(`${releasedQty} ${releasedQty === 1 ? 'unidade reservada liberada' : 'unidades reservadas liberadas'}!`)
                    onSaveSuccess(currentStock, newReserved)
                    onClose()
                } else {
                    notifyError(res?.error || "Erro ao liberar estoque reservado.")
                }
                return
            }

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
                onSaveSuccess(finalStock, liveReservedStock)
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
            : type === 'adjustment'
                ? (Number(quantity) || 0)
                : currentStock

    const delta = projectedStock - currentStock
    const availableStock = Math.max(0, currentStock - liveReservedStock)

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div>
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Ajustar estoque</h2>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                        Gerencie entradas, saídas, correções e liberação de reservas
                    </p>
                </div>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex w-[40px] h-[40px]" data-unsaved-changes-ignore="true">
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
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                            <span className="text-brand-dark dark:text-dark-heading">
                                Total: <span className="font-bold text-brand-primary">{formatQuantityWithUnit(currentStock, displayUnit, "full")}</span>
                            </span>
                            {liveReservedStock > 0 && (
                                <>
                                    <span className="text-brand-inactive-text opacity-60">·</span>
                                    <span className="text-brand-inactive-text dark:text-dark-body text-xs font-medium">
                                        Disp.: <strong className="text-brand-green font-bold">{availableStock}</strong>
                                    </span>
                                    <span className="text-brand-inactive-text opacity-60">·</span>
                                    <span className="text-brand-inactive-text dark:text-dark-body text-xs font-medium">
                                        Reservado: <strong className="text-brand-orange font-bold">{liveReservedStock}</strong>
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Tipo de Movimentação */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Tipo de Operação</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
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

                        <button
                            type="button"
                            disabled={liveReservedStock <= 0}
                            onClick={() => {
                                if (liveReservedStock <= 0) return
                                setType('release')
                                setQuantity(liveReservedStock)
                                handleReasonChange('Selecione um motivo...')
                            }}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all border relative ${type === 'release'
                                ? 'bg-amber-50/70 dark:bg-amber-900/20 border-brand-orange'
                                : liveReservedStock <= 0
                                    ? 'opacity-40 cursor-not-allowed bg-white dark:bg-dark-surface border-brand-border dark:border-dark-border'
                                    : 'bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border border-brand-border dark:border-dark-border'
                                }`}
                            title={liveReservedStock <= 0 ? "Não há estoque reservado para liberar" : "Liberar estoque reservado para venda"}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mb-1 relative ${type === 'release' ? 'bg-brand-orange text-white' : 'bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text'
                                }`}>
                                <UnlockIcon size={16} strokeWidth={2.5} />
                                {liveReservedStock > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-orange text-white text-[10px] font-bold flex items-center justify-center">
                                        {liveReservedStock}
                                    </span>
                                )}
                            </div>
                            <span className={`font-bold text-xs ${type === 'release' ? 'text-brand-orange' : 'text-brand-dark dark:text-dark-heading'}`}>
                                Liberar Reserva
                            </span>
                        </button>
                    </div>
                </div>

                {/* Quantidade ou Novo Estoque */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                            {type === 'adjustment'
                                ? 'Novo Estoque (Real)'
                                : type === 'release'
                                    ? 'Quantidade a Liberar'
                                    : 'Quantidade'}
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

                        {type === 'release' && liveReservedStock > 0 && quantity !== liveReservedStock && (
                            <button
                                type="button"
                                onClick={() => {
                                    setQuantity(liveReservedStock)
                                    setErrors(prev => {
                                        const next = { ...prev }
                                        delete next.quantity
                                        return next
                                    })
                                }}
                                className="text-xs font-semibold text-brand-primary hover:underline"
                            >
                                Liberar tudo ({liveReservedStock})
                            </button>
                        )}
                    </div>

                    <Input
                        name="quantity"
                        type="number"
                        min={type === 'adjustment' ? 0 : 1}
                        max={type === 'release' ? liveReservedStock : undefined}
                        value={quantity !== undefined ? quantity : ""}
                        onChange={(e) => {
                            const val = e.target.value === "" ? 0 : Number(e.target.value)
                            if (type === 'adjustment') {
                                setQuantity(Math.max(0, val))
                            } else if (type === 'release') {
                                setQuantity(Math.min(liveReservedStock, Math.max(1, val)))
                            } else {
                                setQuantity(Math.max(1, val))
                            }
                            setErrors(prev => {
                                const next = { ...prev }
                                delete next.quantity
                                return next
                            })
                        }}
                        error={!!errors.quantity}
                        errorMessage={errors.quantity}
                    />

                    {type === 'release' ? (
                        <div className="text-xs">
                            <p className="text-brand-inactive-text dark:text-dark-body">
                                Reserva restante: <strong className="text-brand-orange">{Math.max(0, liveReservedStock - (Number(quantity) || 0))}</strong>
                            </p>
                            <p className="text-brand-inactive-text dark:text-dark-body">
                                Estoque disponível resultante: <strong className="text-brand-green font-bold">{Math.max(0, currentStock - Math.max(0, liveReservedStock - (Number(quantity) || 0)))}</strong> (físico: {currentStock})
                            </p>
                        </div>
                    ) : type !== 'adjustment' && (
                        <p className="text-brand-inactive-text dark:text-dark-body">
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
                        ] : type === 'release' ? [
                            { value: 'Pedido cancelado / expirado', label: 'Pedido cancelado / expirado' },
                            { value: 'Reserva manual cancelada', label: 'Reserva manual cancelada' },
                            { value: 'Correção de inventário', label: 'Correção de inventário' },
                            { value: 'Desistência do cliente', label: 'Desistência do cliente' },
                            { value: 'Ajuste operacional', label: 'Ajuste operacional' },
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
                    placeholder="Adicione informações detalhadas sobre esta movimentação ou liberação de estoque..."
                    maxLength={500}
                    showCharacterCount
                />
            </div>

            {/* Footer */}
            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex items-center gap-4">
                    <Button variant="outline" className="h-12 flex-1" onClick={onClose} disabled={isSaving} data-unsaved-changes-ignore="true">
                        Cancelar
                    </Button>
                    <Button
                        className="h-12 flex-1"
                        disabled={isSaving}
                        onClick={handleSave}
                    >
                        {isSaving ? <ThreeDotsLoader /> : type === 'release' ? "Liberar Estoque" : "Salvar"}
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
                style={{ zIndex }}
                onClick={onClose}
                data-unsaved-changes-ignore="true"
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
