"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Button, IconPlaceholder, Spinner, AlertModal, Pagination } from "@/components/reusable"
import { TagIcon, TrashIcon, ArrowUpDownIcon, Package, ClockIcon, XIcon } from "@/lib/icons"
import {
    getProductSuppliersOverviewAction,
    unlinkProductSupplierAction,
    linkProductSuppliersBatchAction,
} from "@/app/actions/erp/products"
import SelectSupplierSheet from "../fornecedores/SelectSupplierSheet"
import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency, formatUnit } from "@/lib/utils"
import type { ProductSupplierWithDetails } from "@/lib/types/product"
import type { PartnerSupplierBucketItem } from "@/app/actions/erp/client-loaders"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface ProductSuppliersTabProps {
    productData: any
    isEditing: boolean
    partnerId?: string
    onSavePendingSuppliers?: (suppliers: any[]) => void
}

type SortKey = "supplier" | "sku" | "cost" | "last_purchase"
type SortDirection = "asc" | "desc"

interface ColumnDef {
    id: SortKey | "actions"
    label: string
    align?: "left" | "center" | "right"
    width?: string
    sortable?: boolean
}

const COLUMNS: ColumnDef[] = [
    { id: "supplier", label: "Fornecedor", align: "left", width: "auto", sortable: true },
    { id: "sku", label: "SKU", align: "left", width: "160px", sortable: true },
    { id: "cost", label: "Custo", align: "right", width: "140px", sortable: true },
    { id: "last_purchase", label: "Última Compra", align: "left", width: "170px", sortable: true },
    { id: "actions", label: "Ações", align: "center", width: "80px", sortable: false },
]

const SidebarCard = ({
    title,
    children,
    className = "",
    hasTopStrip = false,
    headerRight,
}: {
    title?: React.ReactNode
    children: React.ReactNode
    className?: string
    hasTopStrip?: boolean
    headerRight?: React.ReactNode
}) => (
    <div
        className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}
    >
        {hasTopStrip && (
            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
        )}
        {(title || headerRight) && (
            <div className="flex items-center justify-between mb-4 mt-1">
                {title ? (
                    <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
                ) : <div />}
                {headerRight}
            </div>
        )}
        {children}
    </div>
)

const TimelineItem = React.memo(({
    icon: Icon,
    time,
    title,
    subtitle,
}: {
    icon: any
    time: string
    title: string
    subtitle?: string
}) => (
    <div className="flex relative z-10 w-full">
        <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex-shrink-0 flex items-center justify-center mr-4 border-[3px] border-white dark:border-dark-surface shadow-[0_0_0_2px_#ffffff] dark:shadow-[0_0_0_2px_rgba(28,28,30,0.5)]">
            <Icon size={14} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <div className="flex flex-col justify-start -mt-0.5 min-w-0 flex-1">
            <div className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">
                {time}
            </div>
            <div className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading leading-snug">
                {title}
            </div>
            {subtitle && (
                <div className="text-[12px] text-brand-inactive-text mt-0.5 truncate">{subtitle}</div>
            )}
        </div>
    </div>
))
TimelineItem.displayName = "TimelineItem"

// Tablet / Mobile GridCard
const ProductSupplierGridCard = React.memo(({
    supplier,
    isSelected,
    isEditing,
    onSelect,
    onRequestRemove,
}: {
    supplier: ProductSupplierWithDetails
    isSelected: boolean
    isEditing: boolean
    onSelect: () => void
    onRequestRemove: () => void
}) => {
    return (
        <div
            className={`bg-white dark:bg-dark-surface border rounded-2xl p-4 transition-all duration-200 cursor-pointer group flex flex-col h-full relative ${
                isSelected
                    ? "border-brand-green ring-1 ring-brand-green/30"
                    : "border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-brand-gray/30"
            }`}
            onClick={onSelect}
        >
            <div className="flex items-center gap-3 mb-3">
                <UserProfileImage
                    fullName={supplier.supplier_name || "Fornecedor"}
                    imageUrl={supplier.supplier_image_url}
                    className="w-11 h-11 text-base shrink-0"
                />
                <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">
                        {supplier.supplier_name || "-"}
                    </h4>
                    {supplier.supplier_document && (
                        <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate mt-0.5">
                            {supplier.supplier_document}
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body block">SKU</span>
                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate block">
                            {supplier.supplier_sku || "-"}
                        </span>
                    </div>
                    <div className="text-right">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body block">Custo</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading block">
                            {supplier.cost_price != null ? formatCurrency(supplier.cost_price) : "-"}
                        </span>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-brand-border/60 dark:border-dark-border/60">
                    <div className="min-w-0 flex-1 pr-2">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body block">Última Compra</span>
                        <span className="text-xs font-medium text-brand-dark dark:text-dark-heading truncate block">
                            {supplier.last_purchase_date
                                ? new Date(supplier.last_purchase_date).toLocaleDateString("pt-BR")
                                : "-"}
                            {supplier.last_purchase_price != null && ` (${formatCurrency(supplier.last_purchase_price)})`}
                        </span>
                    </div>
                    {isEditing && (
                        <div onClick={(e) => e.stopPropagation()}>
                            <Button
                                variant="outlinered"
                                size="icon"
                                className="h-8 w-8 rounded-full shrink-0"
                                onClick={onRequestRemove}
                                title="Remover fornecedor"
                            >
                                <TrashIcon size={14} />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
})
ProductSupplierGridCard.displayName = "ProductSupplierGridCard"

// Desktop Table Row
const SupplierRow = React.memo(({
    supplier,
    columns,
    isSelected,
    isEditing,
    onSelect,
    onRequestRemove,
}: {
    supplier: ProductSupplierWithDetails
    columns: ColumnDef[]
    isSelected: boolean
    isEditing: boolean
    onSelect: () => void
    onRequestRemove: () => void
}) => {
    return (
        <tr
            className={`group transition-colors cursor-pointer ${
                isSelected
                    ? "bg-brand-green/5 dark:bg-brand-green/10 font-medium"
                    : "hover:bg-brand-gray/60 dark:hover:bg-gray-900/50"
            }`}
            onClick={onSelect}
        >
            {columns.map((col) => {
                let cellContent: React.ReactNode = null
                switch (col.id) {
                    case "supplier":
                        cellContent = (
                            <div className="flex items-center gap-3 py-1 pl-2">
                                <UserProfileImage
                                    fullName={supplier.supplier_name || "Fornecedor"}
                                    imageUrl={supplier.supplier_image_url}
                                    className="w-10 h-10 text-[14px] shrink-0"
                                />
                                <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[240px]">
                                        {supplier.supplier_name || "-"}
                                    </span>
                                    {supplier.supplier_document && (
                                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                            {supplier.supplier_document}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                        break
                    case "sku":
                        cellContent = (
                            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                {supplier.supplier_sku || "-"}
                            </span>
                        )
                        break
                    case "cost":
                        cellContent = (
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                {supplier.cost_price != null ? formatCurrency(supplier.cost_price) : "-"}
                            </span>
                        )
                        break
                    case "last_purchase":
                        cellContent = (
                            <div className="flex flex-col">
                                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                    {supplier.last_purchase_date
                                        ? new Date(supplier.last_purchase_date).toLocaleDateString("pt-BR")
                                        : "-"}
                                </span>
                                {supplier.last_purchase_price != null && (
                                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                        {formatCurrency(supplier.last_purchase_price)}
                                    </span>
                                )}
                            </div>
                        )
                        break
                    case "actions":
                        cellContent = isEditing ? (
                            <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                                <Button
                                    variant="outlinered"
                                    size="icon"
                                    className="h-8 w-8 rounded-full"
                                    onClick={onRequestRemove}
                                    title="Remover fornecedor"
                                >
                                    <TrashIcon size={14} />
                                </Button>
                            </div>
                        ) : null
                        break
                    default:
                        cellContent = null
                }

                const alignClass =
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                const justifyClass =
                    col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"

                return (
                    <td
                        key={col.id}
                        className={`p-3 border-b border-brand-border dark:border-dark-border ${alignClass}`}
                    >
                        <div className={`flex items-center w-full min-w-0 ${justifyClass}`}>
                            {cellContent}
                        </div>
                    </td>
                )
            })}
        </tr>
    )
})
SupplierRow.displayName = "SupplierRow"

export const ProductSuppliersTab: React.FC<ProductSuppliersTabProps> = ({
    productData,
    isEditing,
    partnerId: propPartnerId,
    onSavePendingSuppliers,
}) => {
    const { error: notifyError, success: notifySuccess } = useNotification()
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const productId = productData?.id
    const partnerId = propPartnerId || productData?.partner_id || ""

    // Initial suppliers state
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
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
    const [supplierToDelete, setSupplierToDelete] = useState<ProductSupplierWithDetails | null>(null)
    const [isRemoving, setIsRemoving] = useState(false)

    // Sorting & Pagination
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 8

    // Side panel details
    const [purchases, setPurchases] = useState<any[]>([])
    const [purchasesTotal, setPurchasesTotal] = useState(0)
    const [purchasesPage, setPurchasesPage] = useState(1)
    const [purchasesLoading, setPurchasesLoading] = useState(false)
    const [costHistory, setCostHistory] = useState<any[]>([])
    const [costHistoryLoading, setCostHistoryLoading] = useState(false)
    const PURCHASES_PER_PAGE = 5

    const mountedRef = useRef(true)

    useEffect(() => {
        return () => {
            mountedRef.current = false
        }
    }, [])

    // Load initial suppliers on mount if productId is present
    const loadOverview = useCallback(
        async (targetSupplierId?: string | null, pPage = purchasesPage) => {
            if (!productId) return

            setPurchasesLoading(true)
            setCostHistoryLoading(true)

            try {
                const res = await getProductSuppliersOverviewAction(productId, {
                    selectedSupplierId: targetSupplierId !== undefined ? targetSupplierId : selectedSupplierId,
                    purchasesPage: pPage,
                    purchasesLimit: PURCHASES_PER_PAGE,
                })

                if (!mountedRef.current) return

                if (!res.error) {
                    if (res.suppliers) setSuppliers(res.suppliers)
                    setPurchases(res.purchases || [])
                    setPurchasesTotal(res.purchasesTotal || 0)
                    setCostHistory(res.costHistory || [])
                }
            } catch (err: any) {
                console.error("Erro ao carregar dados de fornecedores:", err)
            } finally {
                if (mountedRef.current) {
                    setPurchasesLoading(false)
                    setCostHistoryLoading(false)
                }
            }
        },
        [productId, purchasesPage, selectedSupplierId]
    )

    useEffect(() => {
        if (!productId) return
        loadOverview(selectedSupplierId)
    }, [productId])

    const handleSelectSupplier = useCallback(
        (id: string) => {
            if (selectedSupplierId === id) {
                // Toggle off if clicking the same supplier
                setSelectedSupplierId(null)
                return
            }
            setSelectedSupplierId(id)
            if (productId) {
                loadOverview(id, 1)
            }
        },
        [productId, selectedSupplierId, loadOverview]
    )

    // Batch Add Suppliers from Sheet
    const handleSaveSelectedSuppliers = useCallback(
        async (selectedList: PartnerSupplierBucketItem[]) => {
            if (!selectedList || selectedList.length === 0) return

            // Filter only new suppliers not already linked
            const existingIds = new Set(suppliers.map((s) => s.supplier_id))
            const newlySelected = selectedList.filter((s) => !existingIds.has(s.id))

            if (newlySelected.length === 0) {
                return
            }

            const formattedNewSuppliers: ProductSupplierWithDetails[] = newlySelected.map((s) => ({
                id: `pending-${s.id}`,
                product_id: productId || "",
                supplier_id: s.id,
                supplier_name: s.name || "",
                supplier_email: s.email || null,
                supplier_phone: s.phone || null,
                supplier_document: s.cnpj || null,
                supplier_image_url: (s as any).image_url || (s as any).avatar_url || null,
                cost_price: null,
                supplier_sku: null,
                lead_time_days: null,
                last_purchase_price: null,
                last_purchase_date: null,
                last_invoice_key: null,
            }))

            const updatedSuppliers = [...suppliers, ...formattedNewSuppliers]
            setSuppliers(updatedSuppliers)
            onSavePendingSuppliers?.(updatedSuppliers)

            if (!productId) {
                notifySuccess(
                    formattedNewSuppliers.length === 1
                        ? "Fornecedor adicionado"
                        : `${formattedNewSuppliers.length} fornecedores adicionados`
                )
                return
            }

            // If product exists, save to DB in 1 batch query
            const supplierIdsToLink = newlySelected.map((s) => s.id)
            const res = await linkProductSuppliersBatchAction(productId, supplierIdsToLink)

            if (!mountedRef.current) return

            if (res.error) {
                notifyError("Erro ao vincular fornecedores", res.error)
                return
            }

            notifySuccess(
                formattedNewSuppliers.length === 1
                    ? "Fornecedor vinculado"
                    : `${formattedNewSuppliers.length} fornecedores vinculados`
            )
            loadOverview(selectedSupplierId)
        },
        [suppliers, productId, onSavePendingSuppliers, notifySuccess, notifyError, loadOverview, selectedSupplierId]
    )

    // Confirm Removal
    const handleConfirmRemove = useCallback(async () => {
        if (!supplierToDelete) return
        const supplierId = supplierToDelete.supplier_id

        setIsRemoving(true)

        // Optimistic local update
        const updated = suppliers.filter((s) => s.supplier_id !== supplierId)
        setSuppliers(updated)
        if (selectedSupplierId === supplierId) {
            setSelectedSupplierId(null)
        }
        onSavePendingSuppliers?.(updated)

        if (!productId) {
            setIsRemoving(false)
            setSupplierToDelete(null)
            notifySuccess("Fornecedor removido com sucesso")
            return
        }

        const res = await unlinkProductSupplierAction(productId, supplierId)
        if (!mountedRef.current) return
        setIsRemoving(false)
        setSupplierToDelete(null)

        if (res.error) {
            notifyError("Erro ao desvincular fornecedor", res.error)
            // Rollback on error
            setSuppliers(suppliers)
            return
        }

        notifySuccess("Fornecedor removido com sucesso")
        loadOverview(null)
    }, [supplierToDelete, suppliers, selectedSupplierId, onSavePendingSuppliers, productId, notifySuccess, notifyError, loadOverview])

    const handleSort = useCallback((key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                if (prev.direction === "asc") {
                    return { key, direction: "desc" }
                }
                return null
            }
            return { key, direction: "asc" }
        })
    }, [])

    const activeSuppliers = useMemo(
        () => suppliers.filter((s) => s.supplier_name || s.supplier_id),
        [suppliers]
    )

    const selectedSupplier = useMemo(
        () => activeSuppliers.find((s) => s.supplier_id === selectedSupplierId),
        [activeSuppliers, selectedSupplierId]
    )

    const sortedSuppliers = useMemo(() => {
        if (!sortConfig) return activeSuppliers
        const { key, direction } = sortConfig

        return [...activeSuppliers].sort((a, b) => {
            let valA: any = ""
            let valB: any = ""

            if (key === "supplier") {
                valA = (a.supplier_name || "").toLowerCase()
                valB = (b.supplier_name || "").toLowerCase()
            } else if (key === "sku") {
                valA = (a.supplier_sku || "").toLowerCase()
                valB = (b.supplier_sku || "").toLowerCase()
            } else if (key === "cost") {
                valA = a.cost_price ?? -1
                valB = b.cost_price ?? -1
            } else if (key === "last_purchase") {
                valA = a.last_purchase_date ? new Date(a.last_purchase_date).getTime() : 0
                valB = b.last_purchase_date ? new Date(b.last_purchase_date).getTime() : 0
            }

            if (valA < valB) return direction === "asc" ? -1 : 1
            if (valA > valB) return direction === "asc" ? 1 : -1
            return 0
        })
    }, [activeSuppliers, sortConfig])

    const totalPages = Math.max(1, Math.ceil(sortedSuppliers.length / ITEMS_PER_PAGE))
    const paginatedSuppliers = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return sortedSuppliers.slice(start, start + ITEMS_PER_PAGE)
    }, [sortedSuppliers, currentPage, ITEMS_PER_PAGE])

    const purchasesTotalPages = useMemo(
        () => Math.ceil(purchasesTotal / PURCHASES_PER_PAGE),
        [purchasesTotal]
    )

    // Check if side panel should be shown: only when a supplier is selected and not in mobile/tablet mode
    const showSidePanel = !isTabletOrMobile && Boolean(selectedSupplier)

    return (
        <div className="w-full">
            <div className={showSidePanel ? "grid grid-cols-12 gap-y-8 md:gap-y-0" : "w-full"}>
                {/* Main List Section */}
                <div
                    className={
                        showSidePanel
                            ? "col-span-12 xl:col-span-8 pr-0 xl:pr-8"
                            : "w-full"
                    }
                >
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                            Fornecedores Vinculados
                            <span className="ml-2 text-sm font-medium text-brand-inactive-text">
                                ({activeSuppliers.length})
                            </span>
                        </h3>
                        {isEditing && (
                            <Button
                                variant="link"
                                className="flex items-center text-sm font-bold"
                                onClick={() => setShowSelector(true)}
                            >
                                + Adicionar
                            </Button>
                        )}
                    </div>

                    {activeSuppliers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center py-12 bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border">
                            <IconPlaceholder
                                icon={TagIcon}
                                title="Nenhum fornecedor vinculado"
                                subtitle="Vincule fornecedores a este produto para gerenciar custos e compras."
                                itemButton={{
                                    text: "Adicionar fornecedor",
                                    action: () => setShowSelector(true),
                                    variant: "outline",
                                    className: !isEditing ? "opacity-50 pointer-events-none" : "",
                                }}
                            />
                        </div>
                    ) : isTabletOrMobile ? (
                        /* Tablet / Mobile Grid View */
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2">
                                {paginatedSuppliers.map((s) => (
                                    <ProductSupplierGridCard
                                        key={s.supplier_id}
                                        supplier={s}
                                        isSelected={selectedSupplierId === s.supplier_id}
                                        isEditing={isEditing}
                                        onSelect={() => handleSelectSupplier(s.supplier_id)}
                                        onRequestRemove={() => setSupplierToDelete(s)}
                                    />
                                ))}
                            </div>
                            {totalPages > 1 && (
                                <div className="pt-2">
                                    <Pagination
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPageChange={setCurrentPage}
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Desktop Standard ERP Table */
                        <div className="w-full overflow-hidden rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-separate border-spacing-0 min-w-[700px]">
                                    <thead>
                                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                                            {COLUMNS.map((col, idx) => {
                                                const isFirst = idx === 0
                                                const isLast = idx === COLUMNS.length - 1
                                                const isSorted = sortConfig?.key === col.id

                                                return (
                                                    <th
                                                        key={col.id}
                                                        style={{ width: col.width }}
                                                        className={`py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${
                                                            isFirst ? "rounded-l-lg pl-4" : ""
                                                        } ${isLast ? "rounded-r-lg pr-4" : ""} ${
                                                            col.sortable
                                                                ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors"
                                                                : ""
                                                        }`}
                                                        onClick={() => col.sortable && col.id !== "actions" && handleSort(col.id as SortKey)}
                                                    >
                                                        <div
                                                            className={`flex items-center gap-1.5 ${
                                                                col.align === "right"
                                                                    ? "justify-end"
                                                                    : col.align === "center"
                                                                    ? "justify-center"
                                                                    : "justify-start"
                                                            }`}
                                                        >
                                                            <span>{col.label}</span>
                                                            {col.sortable && (
                                                                <ArrowUpDownIcon
                                                                    size={14}
                                                                    className={`transition-all duration-200 ${
                                                                        isSorted
                                                                            ? "text-brand-dark dark:text-dark-heading opacity-100 block"
                                                                            : "text-brand-inactive-text hidden group-hover:block opacity-40"
                                                                    } ${
                                                                        isSorted && sortConfig?.direction === "desc"
                                                                            ? "rotate-180"
                                                                            : ""
                                                                    }`}
                                                                />
                                                            )}
                                                        </div>
                                                    </th>
                                                )
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedSuppliers.map((s) => (
                                            <SupplierRow
                                                key={s.supplier_id}
                                                supplier={s}
                                                columns={COLUMNS}
                                                isSelected={selectedSupplierId === s.supplier_id}
                                                isEditing={isEditing}
                                                onSelect={() => handleSelectSupplier(s.supplier_id)}
                                                onRequestRemove={() => setSupplierToDelete(s)}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {totalPages > 1 && (
                                <div className="px-6 py-3 border-t border-brand-border dark:border-dark-border">
                                    <Pagination
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPageChange={setCurrentPage}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Side Panel (Visible ONLY when a supplier is selected on desktop) */}
                {showSidePanel && selectedSupplier && (
                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-8 border-0 xl:border-l border-brand-border dark:border-dark-border">
                        {/* Última Compra */}
                        <SidebarCard
                            title="Última Compra"
                            headerRight={
                                <button
                                    onClick={() => setSelectedSupplierId(null)}
                                    className="p-1 rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border text-brand-inactive-text transition-colors"
                                    title="Fechar detalhes"
                                    aria-label="Fechar detalhes"
                                >
                                    <XIcon size={16} />
                                </button>
                            }
                        >
                            <div className="flex items-center gap-3 pb-3 border-b border-brand-border dark:border-dark-border">
                                <div className="w-10 h-10 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                                    <Package size={18} className="text-brand-green" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                        {selectedSupplier.supplier_name}
                                    </p>
                                    <p className="text-xs text-brand-inactive-text truncate">
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
                                        {selectedSupplier.cost_price != null
                                            ? formatCurrency(selectedSupplier.cost_price)
                                            : "-"}
                                    </p>
                                </div>
                            </div>
                        </SidebarCard>

                        {/* Histórico de Custos */}
                        <SidebarCard title="Histórico de Custos">
                            {costHistoryLoading ? (
                                <div className="flex justify-center py-4">
                                    <Spinner size={20} />
                                </div>
                            ) : costHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-center py-8">
                                    <IconPlaceholder
                                        icon={ClockIcon}
                                        title="Nenhum histórico encontrado"
                                        subtitle="Não foram encontrados eventos para este fornecedor."
                                    />
                                </div>
                            ) : (
                                <div className="space-y-6 relative">
                                    {costHistory.length > 1 && (
                                        <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
                                    )}
                                    {costHistory.map((h: any) => (
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
                        <SidebarCard title="Compras Recentes">
                            {purchasesLoading ? (
                                <div className="flex justify-center py-4">
                                    <Spinner size={20} />
                                </div>
                            ) : purchases.length === 0 ? (
                                <p className="text-sm text-brand-inactive-text text-center py-4">
                                    Nenhuma compra encontrada
                                </p>
                            ) : (
                                <div className="space-y-6 relative">
                                    {purchases.length > 1 && (
                                        <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
                                    )}
                                    {purchases.map((p: any) => (
                                        <TimelineItem
                                            key={p.id}
                                            icon={Package}
                                            time={new Date(p.date).toLocaleDateString("pt-BR")}
                                            title={p.supplier_name}
                                            subtitle={`${Number(p.quantity).toFixed(2)} ${formatUnit(
                                                productData?.unit
                                            )} x ${formatCurrency(p.unit_cost)} · ${formatCurrency(p.total_cost)}`}
                                        />
                                    ))}
                                </div>
                            )}
                            {purchasesTotalPages > 1 && (
                                <div className="mt-4">
                                    <Pagination
                                        currentPage={purchasesPage}
                                        totalPages={purchasesTotalPages}
                                        onPageChange={(page) => {
                                            setPurchasesPage(page)
                                            loadOverview(selectedSupplierId, page)
                                        }}
                                    />
                                </div>
                            )}
                        </SidebarCard>
                    </div>
                )}
            </div>

            {/* Select Supplier Sheet */}
            <SelectSupplierSheet
                isOpen={showSelector}
                onClose={() => setShowSelector(false)}
                onSaveSelectedSuppliers={handleSaveSelectedSuppliers}
                partnerId={partnerId}
                selectedSupplierIds={suppliers.map((s) => s.supplier_id)}
            />

            {/* Confirmation Alert Modal for Removal */}
            <AlertModal
                isOpen={supplierToDelete !== null}
                onClose={() => setSupplierToDelete(null)}
                onConfirm={handleConfirmRemove}
                title="Remover Fornecedor"
                message={
                    supplierToDelete
                        ? `Tem certeza que deseja desvincular o fornecedor "${
                              supplierToDelete.supplier_name || "este fornecedor"
                          }" deste produto?`
                        : "Tem certeza que deseja desvincular este fornecedor?"
                }
                variant="danger"
                isDestructive
                confirmText="Remover"
                cancelText="Cancelar"
                isLoading={isRemoving}
            />
        </div>
    )
}
