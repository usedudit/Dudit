"use client"

import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Input, Checkbox, IconPlaceholder, RadioButton, MoneyInput, PercentageInput, ListItem, InfoCard, FormDropdown, DatePicker } from "@/components/reusable"
import ImageCropperModal from "@/components/ImageCropperModal"
import {
    MoneyIcon, Package, EyeIcon, TrashIcon, RemoveImageIcon, AlertTriangleIcon,
    UploadIcon, CheckIcon, EditIcon, ChevronLeftIcon,
    WrenchIcon, ClockIcon,
    EyeOffIcon
} from "@/lib/icons"

import { DELIVERY_STATUS_OPTIONS, PICKUP_STATUS_OPTIONS, MIXED_STATUS_OPTIONS } from "@/lib/orders/status"
import { STANDARD_PAYMENT_METHODS } from "@/lib/finance-utils"
import DefaultModal from "./DefaultModal"
import { isGifFile } from "@/lib/security/file-validator"
import { useToast } from "@/hooks/use-toast"

// --- Tipagens ---
export type BulkActionType =
    | 'price'
    | 'stock'
    | 'visibility'
    | 'image'
    | 'remove_image'
    | 'delete'
    | 'status'
    | 'order_payment'
    | 'order_delivery'
    | 'service_order_status'
    | 'financial_cancel'
    | 'financial_settle'
    | 'financial_reschedule'
    | 'financial_category'

export interface BulkActionPayload {
    type: BulkActionType
    priceMode?: 'percent_inc' | 'percent_dec' | 'fixed'
    priceValue?: number
    priceOnlyPublished?: boolean
    stockMode?: 'add' | 'sub' | 'fixed' | 'zero'
    stockValue?: number
    stockIgnoreNegative?: boolean
    stockReason?: string
    visibilityMode?: 'publish' | 'hide'
    imageFile?: File | null
    status?: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'cancelled'
    orderStatus?: string
    serviceOrderStatus?: string
    cancelReason?: string
    settleAccountId?: string
    settlePaymentMethodId?: string
    settlePaymentDate?: string
    rescheduleMode?: 'add_days' | 'fixed_date'
    rescheduleDays?: number
    rescheduleDate?: string
    categoryId?: string
    categoryName?: string
}

interface BulkEditActionsModalProps {
    isOpen: boolean
    onClose: () => void
    selectedCount: number
    targetType: 'product' | 'variation' | 'service' | 'quote' | 'order' | 'service_order' | 'financial_transaction'
    orderSelectionGuards?: {
        paidCount: number
        deliveredCount: number
        cancelledCount: number
        totalCount: number
        deliveryTypes?: string[]
    }
    serviceOrderSelectionGuards?: {
        deliveredCount: number
        cancelledCount: number
        totalCount: number
    }
    financialSelectionGuards?: {
        totalCount: number
        pendingCount: number
        paidCount: number
        cancelledCount: number
        installmentCount: number
    }
    financialCategories?: Array<{ id: string; name: string }>
    financeAccounts?: Array<{ id: string; name: string }>
    onApply: (payload: BulkActionPayload) => Promise<void>
}

// --- Constantes de Animação ---
const transition: any = { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
const variantsAnim: any = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0, transition },
    exit: { opacity: 0, x: -20, transition }
}

// --- Sub-componentes Auxiliares ---
const BulkActionCard = ({ icon, label, onClick, danger }: { icon: any, label: string, onClick: () => void, danger?: boolean }) => (
    <div
        onClick={onClick}
        className={`flex flex-col items-center justify-center p-4 rounded-xl border cursor-pointer transition-all group ${danger
            ? 'border-brand-red/20 hover:bg-brand-red/5 hover:border-brand-red/50 dark:border-brand-red/20'
            : 'border-brand-border bg-white hover:bg-brand-gray dark:bg-dark-surface dark:border-dark-border dark:hover:bg-dark-border/50'
            }`}
    >
        <IconPlaceholder
            icon={icon}
            title={label}
            containerSize={
                danger
                    ? "w-12 h-12 bg-brand-red-light dark:bg-brand-red/20"
                    : "w-12 h-12"
            }
            iconSize={
                danger
                    ? "w-6 h-6 text-brand-red-dark dark:text-brand-red"
                    : "w-6 h-6"
            }
            titleClass={`text-sm font-semibold mb-0 ${danger
                ? "text-brand-red"
                : "text-brand-dark dark:text-dark-heading"
                }`}
            className="mb-0"
        />
    </div>
)

const ConfirmationView = ({ icon: Icon, title, desc, colorClass }: { icon: any, title: string, desc: string, colorClass: string }) => (
    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${colorClass}`}>
            <Icon className="w-8 h-8" />
        </div>
        <h3 className="text-brand-dark dark:text-dark-heading mt-3 text-xl font-bold mb-2">{title}</h3>
        <p className="text-brand-inactive-text dark:text-dark-body mt-1 max-w-sm text-md">{desc}</p>
    </div>
)

export const BulkEditActionsModal: React.FC<BulkEditActionsModalProps> = ({
    isOpen,
    onClose,
    selectedCount,
    targetType,
    orderSelectionGuards,
    serviceOrderSelectionGuards,
    financialSelectionGuards,
    financialCategories,
    financeAccounts,
    onApply
}) => {
    const { toast } = useToast()
    const [view, setView] = useState<BulkActionType | 'menu'>('menu')
    const [isApplying, setIsApplying] = useState(false)

    // Estados de Configuração
    const [priceConfig, setPriceConfig] = useState({ mode: 'percent_inc', value: 0, onlyPublished: false })
    const [stockConfig, setStockConfig] = useState({ mode: 'add', value: 0, ignoreNegative: false, reason: '' })
    const [visConfig, setVisConfig] = useState<'publish' | 'hide'>('publish')
    const [statusConfig, setStatusConfig] = useState<'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'cancelled'>('sent')
    const [orderStatusConfig, setOrderStatusConfig] = useState<string>('')
    const [serviceOrderStatusConfig, setServiceOrderStatusConfig] = useState<string>('')
    const [imageState, setImageState] = useState<{ file: File | null, preview: string | null }>({ file: null, preview: null })

    // Financial Bulk Action states
    const [cancelReason, setCancelReason] = useState("")
    const [settleAccountId, setSettleAccountId] = useState("")
    const [settlePaymentMethodId, setSettlePaymentMethodId] = useState("")
    const [settlePaymentDate, setSettlePaymentDate] = useState(new Date().toISOString().slice(0, 10))
    const [rescheduleMode, setRescheduleMode] = useState<"add_days" | "fixed_date">("add_days")
    const [rescheduleDays, setRescheduleDays] = useState<number>(30)
    const [rescheduleDate, setRescheduleDate] = useState(new Date().toISOString().slice(0, 10))
    const [financialCategoryId, setFinancialCategoryId] = useState("")

    // UI Helpers
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)
    const [hoveredImage, setHoveredImage] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Reset view when modal closes and pre-populate options when opening
    useEffect(() => {
        if (!isOpen) {
            setTimeout(() => setView('menu'), 300)
        } else {
            if (financeAccounts && financeAccounts.length > 0 && !settleAccountId) {
                setSettleAccountId(financeAccounts[0].id)
            }
            if (!settlePaymentMethodId) {
                setSettlePaymentMethodId(STANDARD_PAYMENT_METHODS[0].value)
            }
            if (financialCategories && financialCategories.length > 0 && !financialCategoryId) {
                setFinancialCategoryId(financialCategories[0].id)
            }
        }
    }, [isOpen, financeAccounts, financialCategories, settleAccountId, settlePaymentMethodId, financialCategoryId])

    const cancelledCount = orderSelectionGuards?.cancelledCount || 0
    const financialIgnoredCount = view === "financial_cancel"
        ? (financialSelectionGuards?.paidCount || 0) + (financialSelectionGuards?.cancelledCount || 0) + (financialSelectionGuards?.installmentCount || 0)
        : view === "financial_settle" || view === "financial_reschedule"
            ? (financialSelectionGuards?.paidCount || 0) + (financialSelectionGuards?.cancelledCount || 0)
            : view === "financial_category"
                ? (financialSelectionGuards?.cancelledCount || 0)
                : 0

    const ignoredByRuleCount = view === "order_payment"
        ? (orderSelectionGuards?.paidCount || 0) + cancelledCount
        : view === "order_delivery"
            ? (orderSelectionGuards?.deliveredCount || 0) + cancelledCount
            : view === "service_order_status"
                ? (serviceOrderSelectionGuards?.deliveredCount || 0) + (serviceOrderSelectionGuards?.cancelledCount || 0)
                : financialIgnoredCount

    const selectableCount = Math.max(0, (orderSelectionGuards?.totalCount || 0) - ignoredByRuleCount)
    const serviceOrderSelectableCount = Math.max(0, (serviceOrderSelectionGuards?.totalCount || 0) - ignoredByRuleCount)
    const financialSelectableCount = Math.max(0, (financialSelectionGuards?.totalCount || 0) - financialIgnoredCount)

    const isOrderPaymentFullyBlocked = targetType === "order"
        && (orderSelectionGuards?.totalCount || 0) > 0
        && selectableCount === 0
    const isOrderDeliveryFullyBlocked = targetType === "order"
        && (orderSelectionGuards?.totalCount || 0) > 0
        && selectableCount === 0
    const isServiceOrderStatusFullyBlocked = targetType === "service_order"
        && (serviceOrderSelectionGuards?.totalCount || 0) > 0
        && serviceOrderSelectableCount === 0
    const isFinancialViewFullyBlocked = targetType === "financial_transaction"
        && (financialSelectionGuards?.totalCount || 0) > 0
        && financialSelectableCount === 0

    const isCurrentViewBlocked =
        (view === "order_payment" && isOrderPaymentFullyBlocked)
        || (view === "order_delivery" && isOrderDeliveryFullyBlocked)
        || (view === "service_order_status" && isServiceOrderStatusFullyBlocked)
        || (targetType === "financial_transaction" && isFinancialViewFullyBlocked)

    const handleApply = async () => {
        if (isCurrentViewBlocked) return
        setIsApplying(true)
        try {
            const payload: BulkActionPayload = { type: view as BulkActionType }
            if (view === 'price') {
                payload.priceMode = priceConfig.mode as any
                payload.priceValue = priceConfig.value || 0
                payload.priceOnlyPublished = priceConfig.onlyPublished
            } else if (view === 'stock') {
                payload.stockMode = stockConfig.mode as any
                payload.stockValue = stockConfig.value || 0
                payload.stockIgnoreNegative = stockConfig.ignoreNegative
                payload.stockReason = stockConfig.reason
            } else if (view === 'visibility') {
                payload.visibilityMode = visConfig
            } else if (view === 'status') {
                payload.status = statusConfig
            } else if (view === 'order_payment' || view === 'order_delivery') {
                payload.orderStatus = orderStatusConfig
            } else if (view === 'service_order_status') {
                payload.serviceOrderStatus = serviceOrderStatusConfig
            } else if (view === 'image') {
                payload.imageFile = imageState.file
            } else if (view === 'financial_cancel') {
                payload.cancelReason = cancelReason.trim() || undefined
            } else if (view === 'financial_settle') {
                payload.settleAccountId = settleAccountId || undefined
                payload.settlePaymentMethodId = settlePaymentMethodId || undefined
                payload.settlePaymentDate = settlePaymentDate || undefined
            } else if (view === 'financial_reschedule') {
                payload.rescheduleMode = rescheduleMode
                payload.rescheduleDays = rescheduleDays
                payload.rescheduleDate = rescheduleDate
            } else if (view === 'financial_category') {
                payload.categoryId = financialCategoryId
                const found = financialCategories?.find(c => c.id === financialCategoryId)
                payload.categoryName = found?.name
            }

            await onApply(payload)
            onClose()
        } catch (error) {
            console.error(error)
        } finally {
            setIsApplying(false)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            if (isGifFile(file)) {
                toast({ description: "Arquivos GIF não são permitidos no sistema." })
                e.target.value = ""
                return
            }
            setSelectedImageForCrop(file)
            setShowImageCropper(true)
            e.target.value = ""
        }
    }

    const handleCropComplete = async (croppedImageUrl: string) => {
        try {
            const response = await fetch(croppedImageUrl)
            const blob = await response.blob()
            const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.split('/')[1] || "png"
            setImageState({
                file: new File([blob], `cropped-bulk-image.${extension}`, { type: blob.type }),
                preview: croppedImageUrl
            })
            setShowImageCropper(false)
        } catch (error) { console.error("Erro ao processar imagem", error) }
    }

    const targetLabel = targetType === 'product' ? 'produtos' : targetType === 'variation' ? 'variantes' : targetType === 'service' ? 'serviços' : targetType === 'order' ? 'pedidos' : targetType === 'service_order' ? 'ordens de serviço' : targetType === 'financial_transaction' ? 'transações' : 'orçamentos'
    const singularTargetLabel = targetType === 'product' ? 'produto' : targetType === 'variation' ? 'variante' : targetType === 'service' ? 'serviço' : targetType === 'order' ? 'pedido' : targetType === 'service_order' ? 'ordem de serviço' : targetType === 'financial_transaction' ? 'transação' : 'orçamento'

    const viewTitles: Record<string, string> = {
        menu: '', price: 'Alterar Preço', stock: 'Ajustar Estoque',
        visibility: 'Visibilidade', image: 'Aplicar Imagem', remove_image: 'Remover Imagem',
        status: 'Alterar Status', order_payment: 'Status de Pagamento', order_delivery: 'Status de Envio',
        service_order_status: 'Alterar Status',
        financial_cancel: 'Cancelar Transações',
        financial_settle: 'Dar Baixa / Quitar',
        financial_reschedule: 'Prorrogar Vencimento',
        financial_category: 'Alterar Categoria',
        delete: `Excluir ${targetLabel.charAt(0).toUpperCase() + targetLabel.slice(1)}`
    }

    const renderViewContent = () => {
        switch (view) {
            case 'menu':
                return (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        {(targetType === 'product' || targetType === 'variation' || targetType === 'service') && (
                            <>
                                <BulkActionCard icon={MoneyIcon} label="Alterar Preço" onClick={() => setView('price')} />
                                {targetType !== 'service' && (
                                    <BulkActionCard icon={Package} label="Ajustar Estoque" onClick={() => setView('stock')} />
                                )}
                                <BulkActionCard icon={EyeIcon} label="Publicar / Ocultar" onClick={() => setView('visibility')} />
                                <BulkActionCard icon={UploadIcon} label="Aplicar Imagem" onClick={() => setView('image')} />
                                <BulkActionCard icon={RemoveImageIcon} label="Remover Imagem" onClick={() => setView('remove_image')} />
                            </>
                        )}
                        {targetType === 'quote' && (
                            <BulkActionCard icon={CheckIcon} label="Alterar Status" onClick={() => setView('status')} />
                        )}
                        {targetType === 'order' && (
                            <>
                                <div className={isOrderPaymentFullyBlocked ? "opacity-50 pointer-events-none" : ""}>
                                    <BulkActionCard icon={MoneyIcon} label="Status de Pagamento" onClick={() => { setView('order_payment'); setOrderStatusConfig('paid') }} />
                                </div>
                                <div className={isOrderDeliveryFullyBlocked ? "opacity-50 pointer-events-none" : ""}>
                                    <BulkActionCard icon={Package} label="Status de Envio" onClick={() => { setView('order_delivery'); setOrderStatusConfig('preparing') }} />
                                </div>
                            </>
                        )}
                        {targetType === 'service_order' && (
                            <div className={isServiceOrderStatusFullyBlocked ? "opacity-50 pointer-events-none" : ""}>
                                <BulkActionCard icon={WrenchIcon} label="Alterar Status" onClick={() => { setView('service_order_status'); setServiceOrderStatusConfig('aprovada') }} />
                            </div>
                        )}
                        {targetType === 'financial_transaction' && (
                            <>
                                <BulkActionCard icon={TrashIcon} label="Cancelar" onClick={() => setView('financial_cancel')} danger />
                                <BulkActionCard icon={CheckIcon} label="Dar Baixa" onClick={() => {
                                    setView('financial_settle')
                                    if (financeAccounts?.[0] && !settleAccountId) setSettleAccountId(financeAccounts[0].id)
                                    if (!settlePaymentMethodId) setSettlePaymentMethodId(STANDARD_PAYMENT_METHODS[0].value)
                                }} />
                                <BulkActionCard icon={ClockIcon} label="Prorrogar Vencimento" onClick={() => setView('financial_reschedule')} />
                                <BulkActionCard icon={EditIcon} label="Alterar Categoria" onClick={() => {
                                    setView('financial_category')
                                    if (financialCategories?.[0] && !financialCategoryId) setFinancialCategoryId(financialCategories[0].id)
                                }} />
                            </>
                        )}
                        {targetType !== 'order' && targetType !== 'service_order' && targetType !== 'financial_transaction' && (
                            <BulkActionCard icon={TrashIcon} label="Excluir" onClick={() => setView('delete')} danger />
                        )}
                    </div>
                )
            case 'price':
                return (
                    <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                            <RadioButton
                                checked={priceConfig.mode === 'percent_inc'}
                                onChange={() => setPriceConfig(p => ({ ...p, mode: 'percent_inc' }))}
                                label="Aumentar %"
                                name="pM"
                                value="percent_inc"
                            />
                            <RadioButton
                                checked={priceConfig.mode === 'percent_dec'}
                                onChange={() => setPriceConfig(p => ({ ...p, mode: 'percent_dec' }))}
                                label="Diminuir %"
                                name="pM"
                                value="percent_dec"
                            />
                            <RadioButton
                                checked={priceConfig.mode === 'fixed'}
                                onChange={() => setPriceConfig(p => ({ ...p, mode: 'fixed' }))}
                                label="Definir valor fixo (R$)"
                                name="pM"
                                value="fixed"
                            />
                        </div>

                        <div className="pt-2">
                            {priceConfig.mode === 'fixed' ? (
                                <MoneyInput
                                    label="Valor"
                                    value={priceConfig.value}
                                    onChange={val => setPriceConfig(p => ({ ...p, value: val }))}
                                />
                            ) : (
                                <PercentageInput
                                    label="Porcentagem"
                                    value={priceConfig.value}
                                    onChange={val => setPriceConfig(p => ({ ...p, value: val }))}
                                />
                            )}
                        </div>

                        <Checkbox
                            checked={priceConfig.onlyPublished} onChange={c => setPriceConfig(p => ({ ...p, onlyPublished: c }))}
                            label={`Aplicar apenas ${targetType === 'service' ? 'aos serviços ativos' : targetType === 'product' ? 'aos produtos publicados' : 'às variações publicadas'}`}
                        />
                    </div>
                )
            case 'stock':
                return (
                    <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-2 gap-3">
                            <RadioButton
                                checked={stockConfig.mode === 'add'}
                                onChange={() => setStockConfig(p => ({ ...p, mode: 'add' }))}
                                label="Somar + X"
                                name="sM"
                                value="add"
                            />
                            <RadioButton
                                checked={stockConfig.mode === 'sub'}
                                onChange={() => setStockConfig(p => ({ ...p, mode: 'sub' }))}
                                label="Subtrair - X"
                                name="sM"
                                value="sub"
                            />
                            <RadioButton
                                checked={stockConfig.mode === 'fixed'}
                                onChange={() => setStockConfig(p => ({ ...p, mode: 'fixed' }))}
                                label="Definir"
                                name="sM"
                                value="fixed"
                            />
                            <RadioButton
                                checked={stockConfig.mode === 'zero'}
                                onChange={() => setStockConfig(p => ({ ...p, mode: 'zero', value: 0 }))}
                                label={`Zerar estoque`}
                                name="sM"
                                value="zero"
                            />
                        </div>

                        {stockConfig.mode !== 'zero' && (
                            <Input
                                label="Quantidade"
                                type="number"
                                placeholder="0"
                                value={stockConfig.value || ""}
                                onChange={e => setStockConfig(p => ({ ...p, value: parseFloat(e.target.value) || 0 }))}
                            />
                        )}

                        <div className="space-y-2">
                            <FormDropdown label="Motivo da movimentação"
                                options={stockConfig.mode === 'add' || stockConfig.mode === 'fixed' ? (
                                    [{ value: "Compra de Fornecedor", label: "Compra de Fornecedor" },
                                    { value: "Devolução de Cliente", label: "Devolução de Cliente" },
                                    { value: "Ajuste de Estoque", label: "Ajuste de Estoque" },
                                    { value: "Outro", label: "Outro" }]
                                ) : (
                                    [{ value: "Avaria / Perda", label: "Avaria / Perda" },
                                    { value: "Ajuste de Estoque", label: "Ajuste de Estoque" },
                                    { value: "Uso Interno", label: "Uso Interno" },
                                    { value: "Outro", label: "Outro" }]
                                )}
                                value={stockConfig.reason}
                                setValue={(val: string) => setStockConfig(p => ({ ...p, reason: val }))}
                                placeholder="Selecione um motivo"
                                width="w-full"
                            />
                        </div>

                        <Checkbox
                            checked={stockConfig.ignoreNegative} onChange={c => setStockConfig(p => ({ ...p, ignoreNegative: c }))}
                            label={`Ignorar ${targetLabel} com estoque negativo`}
                        />
                    </div>
                )
            case 'visibility':
                return (
                    <div className="space-y-2 pt-2">
                        <ListItem
                            title="Publicar Selecionados"
                            description={`Os ${targetLabel} ficarão visíveis na vitrine`}
                            icon={EyeIcon}
                            onClick={() => setVisConfig('publish')}
                            className="px-4 py-3 gap-4"
                            right={
                                <RadioButton
                                    checked={visConfig === 'publish'}
                                    onChange={() => setVisConfig('publish')}
                                    name="visM"
                                    value="publish"
                                />
                            }
                        />
                        <ListItem
                            title="Ocultar Selecionados"
                            description={`Os ${targetLabel} ficarão ocultos na vitrine`}
                            icon={EyeOffIcon}
                            onClick={() => setVisConfig('hide')}
                            className="px-4 py-3 gap-4"
                            right={
                                <RadioButton
                                    checked={visConfig === 'hide'}
                                    onChange={() => setVisConfig('hide')}
                                    name="visM"
                                    value="hide"
                                />
                            }
                        />
                    </div>
                )
            case 'status':
                const statuses: Array<{ value: BulkActionPayload['status'], label: string }> = [
                    { value: 'draft', label: 'Rascunho' },
                    { value: 'sent', label: 'Enviado' },
                    { value: 'approved', label: 'Aprovado' },
                    { value: 'rejected', label: 'Rejeitado' },
                    { value: 'expired', label: 'Expirado' },
                    { value: 'cancelled', label: 'Cancelado' },
                ]
                return (
                    <div className="space-y-1 pt-2">
                        {statuses.map((s) => (
                            <ListItem
                                key={s.value}
                                title={s.label}
                                onClick={() => setStatusConfig(s.value!)}
                                className="px-4 py-3 gap-4"
                                right={
                                    <RadioButton
                                        checked={statusConfig === s.value}
                                        onChange={() => setStatusConfig(s.value!)}
                                        name="statusM"
                                        value={s.value!}
                                    />
                                }
                            />
                        ))}
                    </div>
                )
            case 'order_payment':
            case 'order_delivery':
                const orderStatuses = view === 'order_payment' ? [
                    { value: 'pending', label: 'Pendente' },
                    { value: 'paid', label: 'Pago' },
                ] : (() => {
                    const types = orderSelectionGuards?.deliveryTypes || []
                    const hasDelivery = types.some(t => t === "delivery" || !t)
                    const hasPickup = types.some(t => t === "pickup")
                    if (hasDelivery && hasPickup) return MIXED_STATUS_OPTIONS
                    if (hasPickup) return PICKUP_STATUS_OPTIONS
                    return DELIVERY_STATUS_OPTIONS
                })()
                return (
                    <div className="space-y-3 pt-2">
                        {ignoredByRuleCount > 0 && (
                            <InfoCard
                                title="Atenção"
                                message={`${ignoredByRuleCount} de ${(orderSelectionGuards?.totalCount || 0)} pedido(s) serão ignorados por regra.`}
                                color="orange"
                                className="px-4"
                            />
                        )}
                        {isCurrentViewBlocked && (
                            <InfoCard
                                title="Atenção"
                                message={view === "order_payment"
                                    ? "Todos os pedidos selecionados já estão pagos. Não é possível alterar o status de pagamento."
                                    : "Todos os pedidos selecionados já estão entregues. Não é possível alterar o status de entrega."}
                                color="orange"
                                className="px-4"
                            />
                        )}
                        <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                            {orderStatuses.map((s) => (
                                <ListItem
                                    key={s.value}
                                    title={s.label}
                                    titleClassName="font-medium"
                                    onClick={() => !isCurrentViewBlocked && setOrderStatusConfig(s.value)}
                                    className={`px-4 py-3 gap-4 ${isCurrentViewBlocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                                    right={
                                        <RadioButton
                                            checked={orderStatusConfig === s.value}
                                            onChange={() => !isCurrentViewBlocked && setOrderStatusConfig(s.value)}
                                            name="orderStatusM"
                                            value={s.value}
                                        />
                                    }
                                />
                            ))}
                        </div>
                    </div>
                )
            case 'service_order_status':
                const serviceOrderStatuses = [
                    { value: 'aberta', label: 'Aberta' },
                    { value: 'aguardando_aprovacao', label: 'Aguardando Aprovação' },
                    { value: 'aprovada', label: 'Aprovada' },
                    { value: 'em_andamento', label: 'Em Andamento' },
                    { value: 'aguardando_peca', label: 'Aguardando Peça' },
                    { value: 'concluida', label: 'Concluída' },
                    { value: 'entregue', label: 'Entregue' },
                    { value: 'cancelada', label: 'Cancelada' },
                ]
                return (
                    <div className="space-y-3 pt-2">
                        {ignoredByRuleCount > 0 && (
                            <InfoCard
                                title="Atenção"
                                message={`${ignoredByRuleCount} de ${(serviceOrderSelectionGuards?.totalCount || 0)} ordem(ns) de serviço serão ignoradas por regra.`}
                                color="orange"
                                className="px-4"
                            />
                        )}
                        {isCurrentViewBlocked && (
                            <InfoCard
                                title="Atenção"
                                message="Todas as ordens de serviço selecionadas já estão em status final (entregue/cancelada). Não é possível alterar o status."
                                color="orange"
                                className="px-4"
                            />
                        )}
                        <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                            {serviceOrderStatuses.map((s) => (
                                <ListItem
                                    key={s.value}
                                    title={s.label}
                                    titleClassName="font-medium"
                                    onClick={() => !isCurrentViewBlocked && setServiceOrderStatusConfig(s.value)}
                                    className={`px-4 py-3 gap-4 ${isCurrentViewBlocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                                    right={
                                        <RadioButton
                                            checked={serviceOrderStatusConfig === s.value}
                                            onChange={() => !isCurrentViewBlocked && setServiceOrderStatusConfig(s.value)}
                                            name="serviceOrderStatusM"
                                            value={s.value}
                                        />
                                    }
                                />
                            ))}
                        </div>
                    </div>
                )
            case 'image':
                return (
                    <div className="flex flex-col items-center justify-center pt-2 h-full">
                        <input ref={fileInputRef} type="file" className="hidden" accept="image/png, image/jpeg, image/webp, image/avif" onChange={handleFileSelect} />
                        <div
                            className="relative w-64 h-64 rounded-xl border-2 border-dashed border-brand-border hover:border-brand-primary/50 bg-white dark:bg-dark-surface transition-all flex flex-col items-center justify-center overflow-hidden cursor-pointer"
                            onMouseEnter={() => setHoveredImage(true)} onMouseLeave={() => setHoveredImage(false)}
                            onClick={() => !imageState.preview && fileInputRef.current?.click()}
                        >
                            {imageState.preview ? (
                                <>
                                    <img src={imageState.preview} className="w-full h-full object-cover" alt="Preview" />
                                    {hoveredImage && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }} className="bg-white hover:bg-brand-green hover:text-white text-brand-dark rounded-full p-2 transition-colors"><EditIcon className="w-5 h-5" /></button>
                                            <button onClick={(e) => { e.stopPropagation(); setImageState({ file: null, preview: null }) }} className="bg-white hover:bg-brand-red-dark hover:text-white text-brand-dark rounded-full p-2 transition-colors"><TrashIcon className="w-5 h-5" /></button>
                                        </div>
                                    )}
                                </>
                            ) : <IconPlaceholder icon={UploadIcon} title="Upload de Imagem" subtitle="Clique para adicionar" />}
                        </div>
                    </div>
                )
            case 'financial_cancel':
                return (
                    <div className="space-y-4 pt-2">
                        {ignoredByRuleCount > 0 && (
                            <InfoCard
                                title="Atenção"
                                message={`${ignoredByRuleCount} de ${(financialSelectionGuards?.totalCount || 0)} transação(ões) serão ignoradas por regra (já quitadas, canceladas ou parcelas vinculadas).`}
                                color="orange"
                                className="px-4"
                            />
                        )}
                        {isCurrentViewBlocked && (
                            <InfoCard
                                title="Atenção"
                                message="Todas as transações selecionadas já estão quitadas, canceladas ou são parceladas. Nenhuma ação pode ser aplicada."
                                color="orange"
                                className="px-4"
                            />
                        )}
                        <div className="space-y-2">
                            <Input
                                label="Motivo do cancelamento (Opcional)"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Ex: Cobrança duplicada, despesa cancelada..."
                                disabled={isCurrentViewBlocked}
                            />
                        </div>
                    </div>
                )
            case 'financial_settle':
                return (
                    <div className="space-y-4 pt-2">
                        {ignoredByRuleCount > 0 && (
                            <InfoCard
                                title="Atenção"
                                message={`${ignoredByRuleCount} de ${(financialSelectionGuards?.totalCount || 0)} transação(ões) serão ignoradas por regra (já quitadas ou canceladas).`}
                                color="orange"
                                className="px-4"
                            />
                        )}
                        {isCurrentViewBlocked && (
                            <InfoCard
                                title="Atenção"
                                message="Todas as transações selecionadas já estão quitadas ou canceladas."
                                color="orange"
                                className="px-4"
                            />
                        )}
                        <div className="space-y-3">
                            <FormDropdown
                                label="Conta Bancária / Caixa de Destino"
                                value={settleAccountId}
                                setValue={setSettleAccountId}
                                options={(financeAccounts || []).map((a) => ({ value: a.id, label: a.name }))}
                                placeholder="Selecione a conta..."
                                disabled={isCurrentViewBlocked}
                            />
                            <FormDropdown
                                label="Método de Pagamento"
                                value={settlePaymentMethodId}
                                setValue={setSettlePaymentMethodId}
                                options={STANDARD_PAYMENT_METHODS}
                                placeholder="Selecione a forma de pagamento..."
                                disabled={isCurrentViewBlocked}
                            />
                            <div className="space-y-1">
                                <DatePicker
                                    label="Data da Baixa"
                                    value={settlePaymentDate}
                                    onChange={(e) => setSettlePaymentDate(e.target.value)}
                                    disabled={isCurrentViewBlocked}
                                />
                            </div>
                        </div>
                    </div>
                )
            case 'financial_reschedule':
                return (
                    <div className="space-y-4 pt-2">
                        {ignoredByRuleCount > 0 && (
                            <InfoCard
                                title="Atenção"
                                message={`${ignoredByRuleCount} de ${(financialSelectionGuards?.totalCount || 0)} transação(ões) serão ignoradas por regra (já quitadas ou canceladas).`}
                                color="orange"
                                className="px-4"
                            />
                        )}
                        {isCurrentViewBlocked && (
                            <InfoCard
                                title="Atenção"
                                message="Todas as transações selecionadas já estão quitadas ou canceladas."
                                color="orange"
                                className="px-4"
                            />
                        )}
                        <div className="space-y-3">
                            <div className={`space-y-2 ${isCurrentViewBlocked ? "pointer-events-none opacity-50" : ""}`}>
                                <RadioButton
                                    checked={rescheduleMode === "add_days"}
                                    onChange={() => setRescheduleMode("add_days")}
                                    label="Adicionar dias ao vencimento atual"
                                    name="rescheduleMode"
                                    value="add_days"
                                />
                                <RadioButton
                                    checked={rescheduleMode === "fixed_date"}
                                    onChange={() => setRescheduleMode("fixed_date")}
                                    label="Definir nova data de vencimento fixa"
                                    name="rescheduleMode"
                                    value="fixed_date"
                                />
                            </div>

                            {rescheduleMode === "add_days" ? (
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading block">
                                        Quantidade de dias adicionais
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {[15, 30, 45, 60].map((d) => (
                                            <Button
                                                key={d}
                                                type="button"
                                                variant={rescheduleDays === d ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setRescheduleDays(d)}
                                                disabled={isCurrentViewBlocked}
                                            >
                                                +{d} dias
                                            </Button>
                                        ))}
                                    </div>
                                    <div className="pt-2">
                                        <Input
                                            type="number"
                                            value={String(rescheduleDays)}
                                            onChange={(e) => setRescheduleDays(Math.max(1, Number(e.target.value) || 1))}
                                            placeholder="Ex: 30"
                                            disabled={isCurrentViewBlocked}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <Input
                                        type="date"
                                        value={rescheduleDate}
                                        onChange={(e) => setRescheduleDate(e.target.value)}
                                        disabled={isCurrentViewBlocked}
                                        label="Nova data de vencimento"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )
            case 'financial_category':
                return (
                    <div className="space-y-4 pt-2">
                        {ignoredByRuleCount > 0 && (
                            <InfoCard
                                title="Atenção"
                                message={`${ignoredByRuleCount} de ${(financialSelectionGuards?.totalCount || 0)} transação(ões) serão ignoradas por regra (canceladas).`}
                                color="orange"
                                className="px-4"
                            />
                        )}
                        {isCurrentViewBlocked && (
                            <InfoCard
                                title="Atenção"
                                message="Todas as transações selecionadas estão canceladas."
                                color="orange"
                                className="px-4"
                            />
                        )}
                        <div className="space-y-3">
                            <FormDropdown
                                label="Nova Categoria Financeira"
                                value={financialCategoryId}
                                setValue={setFinancialCategoryId}
                                options={(financialCategories || []).map((c) => ({ value: c.id, label: c.name }))}
                                placeholder="Selecione a categoria..."
                                disabled={isCurrentViewBlocked}
                            />
                        </div>
                    </div>
                )
            case 'remove_image':
                return <ConfirmationView icon={AlertTriangleIcon} title={`Remover imagem de ${selectedCount} ${selectedCount === 1 ? singularTargetLabel : targetLabel}?`} desc={`A imagem principal será removida.`} colorClass="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" />
            case 'delete':
                return <ConfirmationView icon={TrashIcon} title={`Excluir ${selectedCount} ${selectedCount === 1 ? singularTargetLabel : targetLabel}?`} desc="Esta ação é irreversível e pode afetar o histórico de vendas." colorClass="bg-brand-red-light dark:bg-brand-red/20 text-brand-red-dark dark:text-brand-red" />
            default: return null
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={view === 'menu' ? "Ações em Massa" : viewTitles[view]}
            leftAction={view !== 'menu' ? (
                <Button variant="filled" className="h-10 w-10 p-0 flex items-center justify-center shrink-0" onClick={() => setView('menu')}>
                    <ChevronLeftIcon className="w-6 h-6" />
                </Button>
            ) : undefined}
        >
            <div className="flex flex-col h-full">

                <div className="flex-1 min-h-[300px] relative">
                    <AnimatePresence mode="wait">
                        <motion.div key={view} variants={variantsAnim} initial="initial" animate="animate" exit="exit">
                            {renderViewContent()}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {view !== 'menu' && (
                    <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                        <div className="flex items-center gap-3">
                            <Button variant="outline" className="h-12 flex-1" onClick={onClose} disabled={isApplying}>Cancelar</Button>
                            <Button variant={view === 'delete' ? 'destructive' : 'default'} className="h-12 flex-1" onClick={handleApply} disabled={isApplying || isCurrentViewBlocked}>
                                {isApplying ? 'Aplicando...' : view === 'delete' ? 'Excluir Seleção' : `Aplicar em ${selectedCount}`}
                            </Button>
                        </div>
                    </footer>
                )}

                {showImageCropper && selectedImageForCrop && (
                    <ImageCropperModal isOpen={showImageCropper} onClose={() => setShowImageCropper(false)} imageFile={selectedImageForCrop} onCropComplete={handleCropComplete} />
                )}
            </div>
        </DefaultModal>
    )
}
