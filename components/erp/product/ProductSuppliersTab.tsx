"use client"

import React, { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Checkbox, Button, IconPlaceholder, Input, Spinner, Badge } from "@/components/reusable"
import { PlusIcon, TrashIcon, TagIcon, EditIcon, CheckIcon, XIcon, Package, FileTextIcon } from "@/lib/icons"
import { getProductSuppliersAction, linkProductSupplierAction, unlinkProductSupplierAction, updateProductSupplierAction, getProductPurchaseHistoryAction, getProductCostHistoryAction } from "@/app/actions/erp/products"
import { SupplierSelectorSheet } from "./SupplierSelectorSheet"
import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency } from "@/lib/utils"
import Pagination from "@/components/reusable/Pagination"
import type { ProductSupplierWithDetails } from "@/lib/types/product"

interface ProductSuppliersTabProps {
    productData: any
    isEditing: boolean
    partnerId?: string
}

export const ProductSuppliersTab: React.FC<ProductSuppliersTabProps> = ({
    productData,
    isEditing,
    partnerId: propPartnerId,
}) => {
    const { error: notifyError, success: notifySuccess } = useNotification()
    const isTablet = useMediaQuery("(max-width: 1279px)")
    const productId = productData?.id
    const partnerId = propPartnerId || productData?.partner_id || ""
    const [suppliers, setSuppliers] = useState<ProductSupplierWithDetails[]>([])
    const [loading, setLoading] = useState(true)
    const [showSelector, setShowSelector] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editSku, setEditSku] = useState("")
    const [editCost, setEditCost] = useState("")
    const [editLead, setEditLead] = useState("")
    const [savingId, setSavingId] = useState<string | null>(null)
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)

    // Purchase history state
    const [purchases, setPurchases] = useState<any[]>([])
    const [purchasesTotal, setPurchasesTotal] = useState(0)
    const [purchasesPage, setPurchasesPage] = useState(1)
    const [purchasesLoading, setPurchasesLoading] = useState(false)
    const [costHistory, setCostHistory] = useState<any[]>([])
    const [costHistoryLoading, setCostHistoryLoading] = useState(false)
    const PURCHASES_PER_PAGE = 5

    const loadSuppliers = useCallback(async () => {
        if (!productId) { setLoading(false); return }
        setLoading(true)
        const res = await getProductSuppliersAction(productId)
        if (!res.error) {
            const list = res.suppliers || []
            setSuppliers(list)
            if (list.length > 0 && !selectedSupplierId) setSelectedSupplierId(list[0].supplier_id)
        }
        setLoading(false)
    }, [productId, selectedSupplierId])

    useEffect(() => { loadSuppliers() }, [loadSuppliers])

    const loadPurchaseHistory = useCallback(async (supplierId: string | null, page: number) => {
        if (!productId) return
        setPurchasesLoading(true)
        const offset = (page - 1) * PURCHASES_PER_PAGE
        const res = await getProductPurchaseHistoryAction(productId, {
            limit: PURCHASES_PER_PAGE, offset, supplierId: supplierId || undefined,
        })
        if (!res.error) {
            setPurchases(res.items || [])
            setPurchasesTotal(res.total || 0)
        }
        setPurchasesLoading(false)
    }, [productId])

    const loadCostHistory = useCallback(async (supplierId: string | null) => {
        if (!productId) return
        setCostHistoryLoading(true)
        const res = await getProductCostHistoryAction(productId, 5)
        if (!res.error) {
            const items = res.items || []
            setCostHistory(supplierId ? items.filter((h: any) => h.supplier_id === supplierId) : items)
        }
        setCostHistoryLoading(false)
    }, [productId])

    useEffect(() => {
        if (!productId) return
        loadPurchaseHistory(selectedSupplierId, purchasesPage)
    }, [productId, selectedSupplierId, purchasesPage, loadPurchaseHistory])

    useEffect(() => {
        if (!productId) return
        loadCostHistory(selectedSupplierId)
    }, [productId, selectedSupplierId, loadCostHistory])

    // Reset page when supplier changes
    useEffect(() => { setPurchasesPage(1) }, [selectedSupplierId])

    const handleAddSupplier = async (supplier: any) => {
        if (!productId) return
        setSavingId(supplier.id)
        const res = await linkProductSupplierAction(productId, supplier.id)
        if (res.error) { notifyError("Erro", res.error) }
        else { notifySuccess("Fornecedor vinculado"); loadSuppliers() }
        setSavingId(null)
    }

    const handleRemoveSupplier = async (supplierId: string) => {
        if (!productId) return
        setSavingId(supplierId)
        const res = await unlinkProductSupplierAction(productId, supplierId)
        if (res.error) { notifyError("Erro", res.error) }
        else {
            notifySuccess("Fornecedor removido")
            if (selectedSupplierId === supplierId) setSelectedSupplierId(null)
            loadSuppliers()
        }
        setSavingId(null)
    }

    const startEdit = (s: ProductSupplierWithDetails) => {
        setEditingId(s.supplier_id)
        setEditSku(s.supplier_sku || "")
        setEditCost(s.cost_price != null ? String(s.cost_price) : "")
        setEditLead(s.lead_time_days != null ? String(s.lead_time_days) : "")
    }

    const cancelEdit = () => { setEditingId(null); setEditSku(""); setEditCost(""); setEditLead("") }

    const saveEdit = async (s: ProductSupplierWithDetails) => {
        if (!productId) return
        setSavingId(s.supplier_id)
        const res = await updateProductSupplierAction(productId, s.supplier_id, {
            supplierSku: editSku || null,
            costPrice: editCost ? Number(editCost) : null,
            leadTimeDays: editLead ? Number(editLead) : null,
        })
        if (res.error) { notifyError("Erro", res.error) }
        else { notifySuccess("Atualizado"); loadSuppliers() }
        setSavingId(null)
        cancelEdit()
    }

    const activeSuppliers = suppliers.filter(s => s.supplier_name)
    const selectedSupplier = activeSuppliers.find(s => s.supplier_id === selectedSupplierId)
    const purchasesTotalPages = Math.ceil(purchasesTotal / PURCHASES_PER_PAGE)

    if (!productId) {
        return (
            <div className="flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-dark-surface">
                <IconPlaceholder icon={TagIcon} title="Produto não salvo" subtitle="Salve o produto primeiro para gerenciar fornecedores." />
            </div>
        )
    }

    const renderSupplierTable = () => (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                    Fornecedores Vinculados
                    <span className="ml-2 text-sm font-medium text-brand-inactive-text">({activeSuppliers.length})</span>
                </h3>
                {isEditing && (
                    <Button variant="ghost" onClick={() => setShowSelector(true)} leftIcon={<PlusIcon size={18} />}>
                        Adicionar
                    </Button>
                )}
            </div>

            {activeSuppliers.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border">
                    <IconPlaceholder
                        icon={TagIcon}
                        title="Nenhum fornecedor vinculado"
                        subtitle="Vincule fornecedores a este produto para gerenciar custos e reposições."
                        itemButton={{
                            text: "Adicionar fornecedor",
                            action: () => setShowSelector(true),
                            variant: "outline",
                            className: !isEditing ? "opacity-50 pointer-events-none" : ""
                        }}
                    />
                </div>
            ) : (
                <div className="w-full overflow-hidden bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-separate border-spacing-0 min-w-[800px]">
                            <thead>
                                <tr className="bg-brand-slate dark:bg-dark-surface">
                                    <th className="py-2.5 px-4 pl-6 rounded-tl-xl border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                        Fornecedor
                                    </th>
                                    <th className="py-2.5 px-4 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                        SKU
                                    </th>
                                    <th className="py-2.5 px-4 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                        Custo
                                    </th>
                                    <th className="py-2.5 px-4 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                        Lead Time
                                    </th>
                                    <th className="py-2.5 px-4 border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                        Última Compra
                                    </th>
                                    <th className="py-2.5 px-4 pr-6 rounded-tr-xl border-b border-brand-border dark:border-dark-border text-[13px] font-medium text-brand-inactive-text dark:text-dark-body text-center w-20">
                                        Ações
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence initial={false}>
                                    {activeSuppliers.map((s) => {
                                        const isSelected = selectedSupplierId === s.supplier_id
                                        const isEditingThis = editingId === s.supplier_id
                                        const isSavingThis = savingId === s.supplier_id
                                        return (
                                            <motion.tr
                                                key={s.supplier_id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className={`group transition-colors cursor-pointer ${
                                                    isSelected ? "bg-brand-green/5 dark:bg-brand-green/10" : "hover:bg-brand-gray dark:hover:bg-gray-900/50"
                                                }`}
                                                onClick={() => setSelectedSupplierId(s.supplier_id)}
                                            >
                                                <td className="p-4 pl-6 border-b border-brand-border dark:border-dark-border">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center text-xs font-bold text-brand-dark dark:text-dark-heading shrink-0">
                                                            {s.supplier_name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading block">{s.supplier_name}</span>
                                                            {s.supplier_document && <span className="text-[11px] text-brand-inactive-text">{s.supplier_document}</span>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                    {isEditingThis ? (
                                                        <Input value={editSku} onChange={(e) => setEditSku(e.target.value)} className="w-28 h-8 text-xs" placeholder="SKU" />
                                                    ) : (
                                                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{s.supplier_sku || "-"}</span>
                                                    )}
                                                </td>
                                                <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                    {isEditingThis ? (
                                                        <Input value={editCost} onChange={(e) => setEditCost(e.target.value)} className="w-24 h-8 text-xs" placeholder="0,00" inputMode="decimal" />
                                                    ) : (
                                                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{s.cost_price != null ? formatCurrency(s.cost_price) : "-"}</span>
                                                    )}
                                                </td>
                                                <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                    {isEditingThis ? (
                                                        <Input value={editLead} onChange={(e) => setEditLead(e.target.value)} className="w-16 h-8 text-xs" placeholder="dias" inputMode="numeric" />
                                                    ) : (
                                                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{s.lead_time_days != null ? `${s.lead_time_days} dias` : "-"}</span>
                                                    )}
                                                </td>
                                                <td className="p-4 border-b border-brand-border dark:border-dark-border">
                                                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                        {s.last_purchase_date ? new Date(s.last_purchase_date).toLocaleDateString("pt-BR") : "-"}
                                                    </span>
                                                    {s.last_purchase_price != null && (
                                                        <span className="text-[11px] text-brand-inactive-text block">{formatCurrency(s.last_purchase_price)}</span>
                                                    )}
                                                </td>
                                                <td className="p-4 text-center border-b border-brand-border dark:border-dark-border">
                                                    {isSavingThis ? (
                                                        <Spinner size={16} />
                                                    ) : isEditingThis ? (
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button onClick={() => saveEdit(s)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-brand-green/10 text-brand-green"><CheckIcon size={14} /></button>
                                                            <button onClick={cancelEdit} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-50 text-brand-red"><XIcon size={14} /></button>
                                                        </div>
                                                    ) : isEditing ? (
                                                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={(e) => { e.stopPropagation(); startEdit(s) }} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"><EditIcon size={14} /></button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleRemoveSupplier(s.supplier_id) }} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 text-brand-inactive-text hover:text-brand-red"><TrashIcon size={14} /></button>
                                                        </div>
                                                    ) : null}
                                                </td>
                                            </motion.tr>
                                        )
                                    })}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )

    const renderPurchaseHistorySidebar = () => {
        if (activeSuppliers.length === 0) return null

        return (
            <div className="space-y-6">
                {/* Última Compra Card */}
                {selectedSupplier && (
                    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                        <div className="px-5 pt-5 pb-3">
                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wide">Última Compra</h3>
                        </div>
                        <div className="px-5 pb-5 space-y-3">
                            <div className="flex items-center gap-3 pb-3 border-b border-brand-border dark:border-dark-border">
                                <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center">
                                    <Package size={18} className="text-brand-green" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{selectedSupplier.supplier_name}</p>
                                    <p className="text-xs text-brand-inactive-text">
                                        {selectedSupplier.last_purchase_date
                                            ? new Date(selectedSupplier.last_purchase_date).toLocaleDateString("pt-BR")
                                            : "Nenhuma compra registrada"}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs text-brand-inactive-text font-medium">Último Custo</p>
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                        {selectedSupplier.last_purchase_price != null
                                            ? formatCurrency(selectedSupplier.last_purchase_price)
                                            : selectedSupplier.cost_price != null
                                                ? formatCurrency(selectedSupplier.cost_price)
                                                : "-"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-brand-inactive-text font-medium">Custo Atual</p>
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                        {selectedSupplier.cost_price != null ? formatCurrency(selectedSupplier.cost_price) : "-"}
                                    </p>
                                </div>
                            </div>

                            {selectedSupplier.lead_time_days != null && (
                                <div className="flex justify-between items-center pt-1">
                                    <span className="text-xs text-brand-inactive-text font-medium">Lead Time</span>
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{selectedSupplier.lead_time_days} dias</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Histórico de Custos */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                    <div className="px-5 pt-5 pb-3">
                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wide">Histórico de Custos</h3>
                    </div>
                    <div className="px-5 pb-5">
                        {costHistoryLoading ? (
                            <div className="flex justify-center py-4"><Spinner size={20} /></div>
                        ) : costHistory.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text text-center py-4">Nenhum histórico disponível</p>
                        ) : (
                            <div className="space-y-2">
                                {costHistory.map((h: any) => (
                                    <div key={h.id} className="flex items-center justify-between py-1.5 border-b border-brand-border/50 dark:border-dark-border/50 last:border-0">
                                        <div>
                                            <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(h.new_cost)}
                                            </p>
                                            <p className="text-xs text-brand-inactive-text">{h.supplier_name}</p>
                                        </div>
                                        <span className="text-xs text-brand-inactive-text">{new Date(h.changed_at).toLocaleDateString("pt-BR")}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Compras Recentes */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                    <div className="px-5 pt-5 pb-3">
                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wide">Compras Recentes</h3>
                    </div>
                    <div className="px-5 pb-3">
                        {purchasesLoading ? (
                            <div className="flex justify-center py-4"><Spinner size={20} /></div>
                        ) : purchases.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text text-center py-4">Nenhuma compra encontrada</p>
                        ) : (
                            <div className="space-y-2">
                                {purchases.map((p: any) => (
                                    <div key={p.id} className="flex items-center justify-between py-2 border-b border-brand-border/50 dark:border-dark-border/50 last:border-0">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                                                {p.supplier_name}
                                            </p>
                                            <p className="text-xs text-brand-inactive-text">
                                                {Number(p.quantity).toFixed(2)} {productData.unit || "un"} x {formatCurrency(p.unit_cost)}
                                            </p>
                                        </div>
                                        <div className="text-right ml-3 shrink-0">
                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(p.total_cost)}</p>
                                            <p className="text-xs text-brand-inactive-text">{new Date(p.date).toLocaleDateString("pt-BR")}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {purchasesTotalPages > 1 && (
                        <div className="px-5 pb-4">
                            <Pagination currentPage={purchasesPage} totalPages={purchasesTotalPages} onPageChange={setPurchasesPage} />
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
            {/* Main Column */}
            <div className={`col-span-12 ${isTablet ? "" : "xl:col-span-8 pr-0 xl:pr-12"}`}>
                {renderSupplierTable()}
            </div>

            {/* Sidebar */}
            {!isTablet && (
                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                    {renderPurchaseHistorySidebar()}
                </div>
            )}

            <SupplierSelectorSheet
                isOpen={showSelector}
                onClose={() => setShowSelector(false)}
                onSelect={handleAddSupplier}
                partnerId={partnerId}
                selectedSupplierIds={suppliers.map(s => s.supplier_id)}
            />
        </div>
    )
}
