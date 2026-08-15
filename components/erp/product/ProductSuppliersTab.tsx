"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Checkbox, Button, IconPlaceholder, Input, Spinner } from "@/components/reusable"
import { PlusIcon, TrashIcon, TagIcon, EditIcon, CheckIcon, XIcon, Package, ClockIcon } from "@/lib/icons"
import {
    getProductSuppliersAction,
    getProductSuppliersOverviewAction,
    linkProductSupplierAction,
    unlinkProductSupplierAction,
    updateProductSupplierAction,
    getProductPurchaseHistoryAction,
    getProductCostHistoryAction
} from "@/app/actions/erp/products"
import SelectSupplierSheet from "../fornecedores/SelectSupplierSheet"
import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency, formatUnit } from "@/lib/utils"
import Pagination from "@/components/reusable/Pagination"
import type { ProductSupplierWithDetails } from "@/lib/types/product"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface ProductSuppliersTabProps {
    productData: any
    isEditing: boolean
    partnerId?: string
    onSavePendingSuppliers?: (suppliers: any[]) => void
}

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
}

const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
    <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
        {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
        {children}
    </div>
)

const getJustifyClass = (align?: string) => {
    if (align === "center") return "justify-center"
    if (align === "right") return "justify-end"
    return "justify-start"
}

const getAlignClass = (align?: string) => {
    if (align === "center") return "text-center"
    if (align === "right") return "text-right"
    return "text-left"
}

const COLUMNS: ColumnDef[] = [
    { id: "supplier", align: "left" },
    { id: "sku", align: "left" },
    { id: "cost", align: "right" },
    { id: "lead", align: "center" },
    { id: "last_purchase", align: "left" },
    { id: "actions", align: "center" },
]

const HEADERS = [
    { id: "supplier", label: "Fornecedor", align: "left" as const, width: "auto" },
    { id: "sku", label: "SKU", align: "left" as const, width: "auto" },
    { id: "cost", label: "Custo", align: "right" as const, width: "auto" },
    { id: "lead", label: "Lead Time", align: "center" as const, width: "auto" },
    { id: "last_purchase", label: "Última Compra", align: "left" as const, width: "auto" },
    { id: "actions", label: "Ações", align: "center" as const, width: "80px" },
]

const TimelineItem = React.memo(({ icon: Icon, time, title, subtitle }: { icon: any; time: string; title: string; subtitle?: string }) => (
    <div className="flex relative z-10 w-full">
        <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex-shrink-0 flex items-center justify-center mr-4 border-[3px] border-white dark:border-dark-surface shadow-[0_0_0_2px_#ffffff] dark:shadow-[0_0_0_2px_rgba(28,28,30,0.5)]">
            <Icon size={14} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <div className="flex flex-col justify-start -mt-0.5 min-w-0 flex-1">
            <div className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">{time}</div>
            <div className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading leading-snug">{title}</div>
            {subtitle && <div className="text-[12px] text-brand-inactive-text mt-0.5">{subtitle}</div>}
        </div>
    </div>
))
TimelineItem.displayName = "TimelineItem"

const SupplierRow = React.memo(({ supplier, columns, isSelected, isEditingThis, isSavingThis, editing, editSku, editCost, editLead, onSelect, onStartEdit, onCancelEdit, onSaveEdit, onRemove, onEditSkuChange, onEditCostChange, onEditLeadChange }: {
    supplier: ProductSupplierWithDetails
    columns: ColumnDef[]
    isSelected: boolean
    isEditingThis: boolean
    isSavingThis: boolean
    editing: boolean
    editSku: string
    editCost: string
    editLead: string
    onSelect: () => void
    onStartEdit: () => void
    onCancelEdit: () => void
    onSaveEdit: () => void
    onRemove: () => void
    onEditSkuChange: (v: string) => void
    onEditCostChange: (v: string) => void
    onEditLeadChange: (v: string) => void
}) => {
    const renderCell = (colId: string) => {
        switch (colId) {
            case "supplier":
                return (
                    <div className="flex items-center gap-3">
                        <UserProfileImage
                            fullName={supplier.supplier_name || "Fornecedor"}
                            imageUrl={supplier.supplier_image_url}
                            className="w-10 h-10 text-[14px] shrink-0"
                        />
                        <div className="flex flex-col">
                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px]">{supplier.supplier_name || "-"}</span>
                            {supplier.supplier_document && <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">{supplier.supplier_document}</span>}
                        </div>
                    </div>
                )
            case "sku":
                return isEditingThis ? (
                    <Input value={editSku} onChange={(e) => onEditSkuChange(e.target.value)} className="w-28 h-8 text-xs" placeholder="SKU" />
                ) : (
                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{supplier.supplier_sku || "-"}</span>
                )
            case "cost":
                return isEditingThis ? (
                    <Input value={editCost} onChange={(e) => onEditCostChange(e.target.value)} className="w-24 h-8 text-xs" placeholder="0,00" inputMode="decimal" />
                ) : (
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{supplier.cost_price != null ? formatCurrency(supplier.cost_price) : "-"}</span>
                )
            case "lead":
                return isEditingThis ? (
                    <Input value={editLead} onChange={(e) => onEditLeadChange(e.target.value)} className="w-16 h-8 text-xs" placeholder="dias" inputMode="numeric" />
                ) : (
                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{supplier.lead_time_days != null ? `${supplier.lead_time_days} dias` : "-"}</span>
                )
            case "last_purchase":
                return (
                    <div className="flex flex-col">
                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                            {supplier.last_purchase_date ? new Date(supplier.last_purchase_date).toLocaleDateString("pt-BR") : "-"}
                        </span>
                        {supplier.last_purchase_price != null && (
                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">{formatCurrency(supplier.last_purchase_price)}</span>
                        )}
                    </div>
                )
            case "actions":
                return (
                    <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
                        {isSavingThis ? (
                            <Spinner size={16} />
                        ) : isEditingThis ? (
                            <div className="flex items-center gap-1">
                                <button onClick={onSaveEdit} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-brand-green/10 text-brand-green"><CheckIcon size={14} /></button>
                                <button onClick={onCancelEdit} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-50 text-brand-red"><XIcon size={14} /></button>
                            </div>
                        ) : editing ? (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={onStartEdit} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"><EditIcon size={14} /></button>
                                <button onClick={onRemove} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 text-brand-inactive-text hover:text-brand-red"><TrashIcon size={14} /></button>
                            </div>
                        ) : null}
                    </div>
                )
            default:
                return null
        }
    }

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`group transition-colors cursor-pointer ${isSelected ? "bg-brand-green/5 dark:bg-brand-green/10" : "hover:bg-brand-gray dark:hover:bg-gray-900/50"
                }`}
            onClick={onSelect}
        >
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={isSelected} onChange={onSelect} />
            </td>
            {columns.map((col) => (
                <td key={col.id} className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}>
                    <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
                        {renderCell(col.id)}
                    </div>
                </td>
            ))}
        </motion.tr>
    )
})
SupplierRow.displayName = "SupplierRow"

const SupplierTableSection = React.memo(({ suppliers, totalCount, columns, headers, selectedSupplierId, editingId, savingId, isEditing, editSku, editCost, editLead, onSelectSupplier, onStartEdit, onCancelEdit, onSaveEdit, onRemoveSupplier, onEditSkuChange, onEditCostChange, onEditLeadChange, onAddClick, adding, suppliersPage, suppliersTotalPages, onSuppliersPageChange }: {
    suppliers: ProductSupplierWithDetails[]
    totalCount: number
    columns: ColumnDef[]
    headers: typeof HEADERS
    selectedSupplierId: string | null
    editingId: string | null
    savingId: string | null
    isEditing: boolean
    editSku: string
    editCost: string
    editLead: string
    onSelectSupplier: (id: string) => void
    onStartEdit: (s: ProductSupplierWithDetails) => void
    onCancelEdit: () => void
    onSaveEdit: (s: ProductSupplierWithDetails) => void
    onRemoveSupplier: (id: string) => void
    onEditSkuChange: (v: string) => void
    onEditCostChange: (v: string) => void
    onEditLeadChange: (v: string) => void
    onAddClick: () => void
    adding: boolean
    suppliersPage: number
    suppliersTotalPages: number
    onSuppliersPageChange: (page: number) => void
}) => (
    <div>
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                Fornecedores Vinculados
                <span className="ml-2 text-sm font-medium text-brand-inactive-text">({totalCount})</span>
            </h3>
            {isEditing && (
                <Button variant="link" className="flex items-center hidden md:flex" onClick={onAddClick}>
                    + Adicionar
                </Button>
            )}
        </div>

        {suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border">
                <IconPlaceholder
                    icon={TagIcon}
                    title="Nenhum fornecedor vinculado"
                    subtitle="Vincule fornecedores a este produto para gerenciar custos e reposições."
                    itemButton={{
                        text: "Adicionar fornecedor",
                        action: onAddClick,
                        variant: "outline",
                        className: !isEditing ? "opacity-50 pointer-events-none" : ""
                    }}
                />
            </div>
        ) : (
            <div className="w-full overflow-hidden rounded-xl relative">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-separate border-spacing-0 min-w-[800px]">
                        <thead>
                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors"></th>
                                {headers.map((h) => (
                                    <th key={h.id} className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${h.align === "center" ? "text-center" : h.align === "right" ? "text-right" : "text-left"}`}>
                                        {h.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence initial={false}>
                                {suppliers.map((s) => (
                                    <SupplierRow
                                        key={s.supplier_id}
                                        supplier={s}
                                        columns={columns}
                                        isSelected={selectedSupplierId === s.supplier_id}
                                        isEditingThis={editingId === s.supplier_id}
                                        isSavingThis={savingId === s.supplier_id}
                                        editing={isEditing}
                                        editSku={editSku}
                                        editCost={editCost}
                                        editLead={editLead}
                                        onSelect={() => onSelectSupplier(s.supplier_id)}
                                        onStartEdit={() => onStartEdit(s)}
                                        onCancelEdit={onCancelEdit}
                                        onSaveEdit={() => onSaveEdit(s)}
                                        onRemove={() => onRemoveSupplier(s.supplier_id)}
                                        onEditSkuChange={onEditSkuChange}
                                        onEditCostChange={onEditCostChange}
                                        onEditLeadChange={onEditLeadChange}
                                    />
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
                {suppliersTotalPages > 1 && (
                    <div className="px-6 py-3 border-t border-brand-border dark:border-dark-border">
                        <Pagination currentPage={suppliersPage} totalPages={suppliersTotalPages} onPageChange={onSuppliersPageChange} />
                    </div>
                )}
            </div>
        )}
    </div >
))
SupplierTableSection.displayName = "SupplierTableSection"

export const ProductSuppliersTab: React.FC<ProductSuppliersTabProps> = ({
    productData,
    isEditing,
    partnerId: propPartnerId,
    onSavePendingSuppliers,
}) => {
    const { error: notifyError, success: notifySuccess } = useNotification()
    const isTablet = useMediaQuery("(max-width: 1279px)")
    const productId = productData?.id
    const partnerId = propPartnerId || productData?.partner_id || ""

    const [suppliers, setSuppliers] = useState<ProductSupplierWithDetails[]>(() => {
        if (productData?.pending_suppliers && Array.isArray(productData.pending_suppliers)) {
            return productData.pending_suppliers
        }
        if (productData?.suppliers && Array.isArray(productData.suppliers)) {
            return productData.suppliers
        }
        if (productData?.product_suppliers && Array.isArray(productData.product_suppliers)) {
            return productData.product_suppliers
        }
        return []
    })

    const [showSelector, setShowSelector] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editSku, setEditSku] = useState("")
    const [editCost, setEditCost] = useState("")
    const [editLead, setEditLead] = useState("")
    const [savingId, setSavingId] = useState<string | null>(null)
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
    const [suppliersPage, setSuppliersPage] = useState(1)

    const [purchases, setPurchases] = useState<any[]>([])
    const [purchasesTotal, setPurchasesTotal] = useState(0)
    const [purchasesPage, setPurchasesPage] = useState(1)
    const [purchasesLoading, setPurchasesLoading] = useState(false)
    const [costHistory, setCostHistory] = useState<any[]>([])
    const [costHistoryLoading, setCostHistoryLoading] = useState(false)
    const SUPPLIERS_PER_PAGE = 10
    const PURCHASES_PER_PAGE = 5
    const mountedRef = useRef(true)

    useEffect(() => {
        return () => { mountedRef.current = false }
    }, [])

    // CARREGAMENTO CONSOLIDADO E ULTRA-RÁPIDO (1 única Server Action)
    const loadOverview = useCallback(async (selectedId?: string | null, page = purchasesPage) => {
        if (!productId) return
        setPurchasesLoading(true)
        setCostHistoryLoading(true)

        const res = await getProductSuppliersOverviewAction(productId, {
            selectedSupplierId: selectedId !== undefined ? selectedId : selectedSupplierId,
            purchasesPage: page,
            purchasesLimit: PURCHASES_PER_PAGE
        })

        if (!mountedRef.current) return
        setPurchasesLoading(false)
        setCostHistoryLoading(false)

        if (!res.error) {
            const list = res.suppliers || []
            setSuppliers(list)
            setPurchases(res.purchases || [])
            setPurchasesTotal(res.purchasesTotal || 0)
            setCostHistory(res.costHistory || [])

            if (list.length > 0 && !selectedSupplierId && !selectedId) {
                setSelectedSupplierId(list[0].supplier_id)
            }
        }
    }, [productId, purchasesPage, selectedSupplierId])

    useEffect(() => {
        if (!productId) return
        loadOverview()
    }, [productId])

    const handleSelectSupplier = useCallback((id: string) => {
        setSelectedSupplierId(id)
        if (productId) {
            loadOverview(id, 1)
        }
    }, [productId, loadOverview])

    const handleAddSupplier = useCallback(async (supplier: any) => {
        if (suppliers.some(s => s.supplier_id === supplier.id)) return

        if (!productId) {
            const newSupplier: ProductSupplierWithDetails = {
                id: `pending-${supplier.id}`,
                product_id: "",
                supplier_id: supplier.id,
                supplier_name: supplier.name || "",
                supplier_email: supplier.email || null,
                supplier_phone: supplier.phone || null,
                supplier_document: supplier.cnpj || supplier.cpf || null,
                supplier_image_url: supplier.image_url || null,
                cost_price: null,
                supplier_sku: null,
                lead_time_days: null,
                last_purchase_price: null,
                last_purchase_date: null,
                last_invoice_key: null,
            }
            const updated = [...suppliers, newSupplier]
            setSuppliers(updated)
            setSelectedSupplierId(supplier.id)
            onSavePendingSuppliers?.(updated)
            notifySuccess("Fornecedor adicionado")
            return
        }

        setSavingId(supplier.id)
        const res = await linkProductSupplierAction(productId, supplier.id)
        if (!mountedRef.current) return
        setSavingId(null)
        if (res.error) { notifyError("Erro", res.error); return }
        notifySuccess("Fornecedor vinculado")
        loadOverview(supplier.id)
    }, [productId, suppliers, onSavePendingSuppliers, notifySuccess, notifyError, loadOverview])

    const handleRemoveSupplier = useCallback(async (supplierId: string) => {
        if (!productId) {
            const updated = suppliers.filter(s => s.supplier_id !== supplierId)
            setSuppliers(updated)
            if (selectedSupplierId === supplierId) {
                setSelectedSupplierId(updated.length > 0 ? updated[0].supplier_id : null)
            }
            onSavePendingSuppliers?.(updated)
            notifySuccess("Fornecedor removido")
            return
        }

        setSavingId(supplierId)
        const res = await unlinkProductSupplierAction(productId, supplierId)
        if (!mountedRef.current) return
        setSavingId(null)
        if (res.error) { notifyError("Erro", res.error); return }
        notifySuccess("Fornecedor removido")
        if (selectedSupplierId === supplierId) setSelectedSupplierId(null)
        loadOverview()
    }, [productId, suppliers, selectedSupplierId, onSavePendingSuppliers, notifySuccess, notifyError, loadOverview])

    const handleStartEdit = useCallback((s: ProductSupplierWithDetails) => {
        setEditingId(s.supplier_id)
        setEditSku(s.supplier_sku || "")
        setEditCost(s.cost_price != null ? String(s.cost_price) : "")
        setEditLead(s.lead_time_days != null ? String(s.lead_time_days) : "")
    }, [])

    const handleCancelEdit = useCallback(() => {
        setEditingId(null)
        setEditSku("")
        setEditCost("")
        setEditLead("")
    }, [])

    const handleSaveEdit = useCallback(async (s: ProductSupplierWithDetails) => {
        if (!productId) {
            const updated = suppliers.map(item => item.supplier_id === s.supplier_id ? {
                ...item,
                supplier_sku: editSku || null,
                cost_price: editCost ? Number(editCost) : null,
                lead_time_days: editLead ? Number(editLead) : null,
            } : item)
            setSuppliers(updated)
            onSavePendingSuppliers?.(updated)
            notifySuccess("Atualizado")
            handleCancelEdit()
            return
        }

        setSavingId(s.supplier_id)
        const res = await updateProductSupplierAction(productId, s.supplier_id, {
            supplierSku: editSku || null,
            costPrice: editCost ? Number(editCost) : null,
            leadTimeDays: editLead ? Number(editLead) : null,
        })
        if (!mountedRef.current) return
        setSavingId(null)
        if (res.error) { notifyError("Erro", res.error); return }
        notifySuccess("Atualizado")
        loadOverview()
        handleCancelEdit()
    }, [productId, suppliers, editSku, editCost, editLead, onSavePendingSuppliers, notifySuccess, notifyError, loadOverview, handleCancelEdit])

    const handleOpenSelector = useCallback(() => {
        setShowSelector(true)
    }, [])

    const handleCloseSelector = useCallback(() => {
        setShowSelector(false)
    }, [])

    const activeSuppliers = useMemo(() => suppliers.filter(s => s.supplier_name), [suppliers])
    const selectedSupplier = useMemo(
        () => activeSuppliers.find(s => s.supplier_id === selectedSupplierId),
        [activeSuppliers, selectedSupplierId]
    )
    const purchasesTotalPages = useMemo(
        () => Math.ceil(purchasesTotal / PURCHASES_PER_PAGE),
        [purchasesTotal]
    )
    const suppliersTotalPages = useMemo(
        () => Math.ceil(activeSuppliers.length / SUPPLIERS_PER_PAGE),
        [activeSuppliers.length]
    )
    const paginatedSuppliers = useMemo(
        () => activeSuppliers.slice((suppliersPage - 1) * SUPPLIERS_PER_PAGE, suppliersPage * SUPPLIERS_PER_PAGE),
        [activeSuppliers, suppliersPage, SUPPLIERS_PER_PAGE]
    )

    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
            <div className={`col-span-12 ${isTablet ? "" : "xl:col-span-8 pr-0 xl:pr-12"}`}>
                <SupplierTableSection
                    suppliers={paginatedSuppliers}
                    totalCount={activeSuppliers.length}
                    columns={COLUMNS}
                    headers={HEADERS}
                    selectedSupplierId={selectedSupplierId}
                    editingId={editingId}
                    savingId={savingId}
                    isEditing={isEditing}
                    editSku={editSku}
                    editCost={editCost}
                    editLead={editLead}
                    onSelectSupplier={handleSelectSupplier}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onSaveEdit={handleSaveEdit}
                    onRemoveSupplier={handleRemoveSupplier}
                    onEditSkuChange={setEditSku}
                    onEditCostChange={setEditCost}
                    onEditLeadChange={setEditLead}
                    onAddClick={handleOpenSelector}
                    adding={savingId !== null}
                    suppliersPage={suppliersPage}
                    suppliersTotalPages={suppliersTotalPages}
                    onSuppliersPageChange={setSuppliersPage}
                />
            </div>

            {!isTablet && selectedSupplier && (
                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                    {/* Última Compra */}
                    <SidebarCard>
                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wide mb-4">Última Compra</h3>
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
                        <div className="grid grid-cols-2 gap-3 mt-3">
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
                            <div className="flex justify-between items-center pt-3">
                                <span className="text-xs text-brand-inactive-text font-medium">Lead Time</span>
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{selectedSupplier.lead_time_days} dias</span>
                            </div>
                        )}
                    </SidebarCard>

                    {/* Histórico de Custos */}
                    <SidebarCard>
                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wide mb-4">Histórico de Custos</h3>
                        {costHistoryLoading ? (
                            <div className="flex justify-center py-4"><Spinner size={20} /></div>
                        ) : costHistory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-8">
                                <IconPlaceholder
                                    icon={ClockIcon}
                                    title="Nenhum histórico encontrado"
                                    subtitle="Não foram encontrados eventos para este produto."
                                />
                            </div>
                        ) : (
                            <div className="space-y-6 relative">
                                {costHistory.length > 1 && (
                                    <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
                                )}
                                {costHistory.map((h: any, idx: number) => (
                                    <TimelineItem
                                        key={h.id}
                                        icon={TagIcon}
                                        time={new Date(h.changed_at).toLocaleDateString("pt-BR")}
                                        title={formatCurrency(h.new_cost)}
                                        subtitle={h.supplier_name}
                                    />
                                ))}
                            </div>
                        )}
                    </SidebarCard>

                    {/* Compras Recentes */}
                    <SidebarCard>
                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wide mb-4">Compras Recentes</h3>
                        {purchasesLoading ? (
                            <div className="flex justify-center py-4"><Spinner size={20} /></div>
                        ) : purchases.length === 0 ? (
                            <p className="text-sm text-brand-inactive-text text-center py-4">Nenhuma compra encontrada</p>
                        ) : (
                            <div className="space-y-6 relative">
                                {purchases.length > 1 && (
                                    <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
                                )}
                                {purchases.map((p: any, idx: number) => (
                                    <TimelineItem
                                        key={p.id}
                                        icon={Package}
                                        time={new Date(p.date).toLocaleDateString("pt-BR")}
                                        title={p.supplier_name}
                                        subtitle={`${Number(p.quantity).toFixed(2)} ${formatUnit(productData.unit)} x ${formatCurrency(p.unit_cost)} · ${formatCurrency(p.total_cost)}`}
                                    />
                                ))}
                            </div>
                        )}
                        {purchasesTotalPages > 1 && (
                            <div className="mt-4">
                                <Pagination currentPage={purchasesPage} totalPages={purchasesTotalPages} onPageChange={setPurchasesPage} />
                            </div>
                        )}
                    </SidebarCard>
                </div>
            )}

            <SelectSupplierSheet
                isOpen={showSelector}
                onClose={handleCloseSelector}
                onSelect={handleAddSupplier}
                partnerId={partnerId}
                selectedSupplierIds={suppliers.map(s => s.supplier_id)}
            />
        </div>
    )
}
