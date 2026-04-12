"use client"

import React, { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Input, Checkbox, IconPlaceholder, RadioButton, MoneyInput, PercentageInput, ListItem } from "@/components/reusable"
import ImageCropperModal from "@/components/ImageCropperModal"
import {
    MoneyIcon, Package, EyeIcon, TrashIcon, RemoveImageIcon, AlertTriangleIcon,
    UploadIcon, CheckIcon, EditIcon, ChevronLeftIcon
} from "@/lib/icons"

import DefaultModal from "./DefaultModal"

// --- Tipagens ---
export type BulkActionType = 'price' | 'stock' | 'visibility' | 'image' | 'remove_image' | 'delete' | 'status' | 'order_payment' | 'order_delivery'

export interface BulkActionPayload {
    type: BulkActionType
    priceMode?: 'percent_inc' | 'percent_dec' | 'fixed'
    priceValue?: number
    priceOnlyPublished?: boolean
    stockMode?: 'add' | 'sub' | 'fixed' | 'zero'
    stockValue?: number
    stockIgnoreNegative?: boolean
    visibilityMode?: 'publish' | 'hide'
    imageFile?: File | null
    status?: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'cancelled'
    orderStatus?: string
}

interface BulkEditActionsModalProps {
    isOpen: boolean
    onClose: () => void
    selectedCount: number
    targetType: 'product' | 'variation' | 'quote' | 'order'
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
    onApply
}) => {
    const [view, setView] = useState<BulkActionType | 'menu'>('menu')
    const [isApplying, setIsApplying] = useState(false)

    // Estados de Configuração
    const [priceConfig, setPriceConfig] = useState({ mode: 'percent_inc', value: 0, onlyPublished: false })
    const [stockConfig, setStockConfig] = useState({ mode: 'add', value: 0, ignoreNegative: false })
    const [visConfig, setVisConfig] = useState<'publish' | 'hide'>('publish')
    const [statusConfig, setStatusConfig] = useState<'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'cancelled'>('sent')
    const [orderStatusConfig, setOrderStatusConfig] = useState<string>('')
    const [imageState, setImageState] = useState<{ file: File | null, preview: string | null }>({ file: null, preview: null })

    // UI Helpers
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)
    const [hoveredImage, setHoveredImage] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Reset view when modal closes
    useEffect(() => {
        if (!isOpen) {
            setTimeout(() => setView('menu'), 300)
        }
    }, [isOpen])

    const handleApply = async () => {
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
            } else if (view === 'visibility') {
                payload.visibilityMode = visConfig
            } else if (view === 'status') {
                payload.status = statusConfig
            } else if (view === 'order_payment' || view === 'order_delivery') {
                payload.orderStatus = orderStatusConfig
            } else if (view === 'image') {
                payload.imageFile = imageState.file
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

    const targetLabel = targetType === 'product' ? 'produtos' : targetType === 'variation' ? 'variantes' : targetType === 'order' ? 'pedidos' : 'orçamentos'
    const singularTargetLabel = targetType === 'product' ? 'produto' : targetType === 'variation' ? 'variante' : targetType === 'order' ? 'pedido' : 'orçamento'

    const viewTitles: Record<string, string> = {
        menu: '', price: 'Alterar Preço', stock: 'Ajustar Estoque',
        visibility: 'Visibilidade', image: 'Aplicar Imagem', remove_image: 'Remover Imagem',
        status: 'Alterar Status', order_payment: 'Status de Pagamento', order_delivery: 'Status de Envio',
        delete: `Excluir ${targetLabel.charAt(0).toUpperCase() + targetLabel.slice(1)}`
    }

    const renderViewContent = () => {
        switch (view) {
            case 'menu':
                return (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        {targetType !== 'quote' && targetType !== 'order' && (
                            <>
                                <BulkActionCard icon={MoneyIcon} label="Alterar Preço" onClick={() => setView('price')} />
                                <BulkActionCard icon={Package} label="Ajustar Estoque" onClick={() => setView('stock')} />
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
                                <BulkActionCard icon={MoneyIcon} label="Status de Pagamento" onClick={() => { setView('order_payment'); setOrderStatusConfig('paid') }} />
                                <BulkActionCard icon={Package} label="Status de Envio" onClick={() => { setView('order_delivery'); setOrderStatusConfig('preparing') }} />
                            </>
                        )}
                        <BulkActionCard icon={TrashIcon} label="Excluir" onClick={() => setView('delete')} danger />
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

                        <label className="flex items-center gap-3 p-2 cursor-pointer mt-2">
                            <Checkbox checked={priceConfig.onlyPublished} onChange={c => setPriceConfig(p => ({ ...p, onlyPublished: c }))} />
                            <span className="text-sm text-brand-dark dark:text-dark-heading font-medium">
                                Aplicar apenas {targetType === 'product' ? 'aos produtos publicados' : 'às variantes publicadas'}
                            </span>
                        </label>
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

                        <label className="flex items-center gap-3 p-2 cursor-pointer">
                            <Checkbox checked={stockConfig.ignoreNegative} onChange={c => setStockConfig(p => ({ ...p, ignoreNegative: c }))} />
                            <span className="text-sm text-brand-dark dark:text-dark-heading font-medium">
                                Ignorar {targetLabel} com estoque negativo
                            </span>
                        </label>
                    </div>
                )
            case 'visibility':
                return (
                    <div className="space-y-2 pt-2">
                        <ListItem
                            title="Publicar Selecionados"
                            description={`Os ${targetLabel} ficarão visíveis na loja`}
                            icon={EyeIcon}
                            onClick={() => setVisConfig('publish')}
                            className="cursor-pointer px-4"
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
                            description={`Os ${targetLabel} ficarão ocultos na loja`}
                            icon={EyeIcon}
                            onClick={() => setVisConfig('hide')}
                            className="cursor-pointer px-4"
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
                                className="cursor-pointer px-4"
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
                    { value: 'partially_paid', label: 'Parcialmente Pago' }
                ] : [
                    { value: 'not_sent', label: 'Não enviado' },
                    { value: 'preparing', label: 'Preparando' },
                    { value: 'sent', label: 'Enviado' },
                    { value: 'delivered', label: 'Entregue' },
                    { value: 'pickup_available', label: 'Pronto para retirada' },
                    { value: 'delivery_failed', label: 'Falha na entrega' }
                ]
                return (
                    <div className="space-y-1 pt-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                        {orderStatuses.map((s) => (
                            <ListItem
                                key={s.value}
                                title={s.label}
                                titleClassName="font-medium"
                                onClick={() => setOrderStatusConfig(s.value)}
                                className="cursor-pointer py-1 pl-4"
                                right={
                                    <RadioButton
                                        checked={orderStatusConfig === s.value}
                                        onChange={() => setOrderStatusConfig(s.value)}
                                        name="orderStatusM"
                                        value={s.value}
                                    />
                                }
                            />
                        ))}
                    </div>
                )
            case 'image':
                return (
                    <div className="flex flex-col items-center justify-center pt-2 h-full">
                        <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
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
            case 'remove_image':
                return <ConfirmationView icon={AlertTriangleIcon} title={`Remover imagem de ${selectedCount} ${selectedCount === 1 ? singularTargetLabel : targetLabel}?`} desc={`A imagem principal será removida.`} colorClass="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" />
            case 'delete':
                return <ConfirmationView icon={TrashIcon} title={`Excluir ${selectedCount} ${selectedCount === 1 ? singularTargetLabel : targetLabel}?`} desc="Esta ação é irreversível e pode afetar o histórico de vendas." colorClass="bg-red-100 text-brand-red" />
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
                    <div className="flex gap-3 w-full mt-6">
                        <Button variant="outline" className="flex-1" onClick={onClose} disabled={isApplying}>Cancelar</Button>
                        <Button variant={view === 'delete' ? 'destructive' : 'default'} className="flex-1" onClick={handleApply} disabled={isApplying}>
                            {isApplying ? 'Aplicando...' : view === 'delete' ? 'Excluir Seleção' : `Aplicar em ${selectedCount}`}
                        </Button>
                    </div>
                )}

                {showImageCropper && selectedImageForCrop && (
                    <ImageCropperModal isOpen={showImageCropper} onClose={() => setShowImageCropper(false)} imageFile={selectedImageForCrop} onCropComplete={handleCropComplete} />
                )}
            </div>
        </DefaultModal>
    )
}
