"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Button, IconPlaceholder, AlertModal, Pagination, SkeletonLoader } from "@/components/reusable"
import { TagIcon, TrashIcon, ArrowUpDownIcon } from "@/lib/icons"
import {
    getProductSuppliersAction,
    unlinkProductSupplierAction,
    linkProductSuppliersBatchAction,
} from "@/app/actions/erp/products"
import SelectSupplierSheet from "../fornecedores/SelectSupplierSheet"
import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency } from "@/lib/utils"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import type { ProductSupplierWithDetails } from "@/lib/types/product"
import type { PartnerSupplierBucketItem } from "@/app/actions/erp/client-loaders"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { SupplierDetailSheet } from "./SupplierDetailSheet"

interface ProductSuppliersTabProps {
    productData: any
    isEditing: boolean
    partnerId?: string
    onSavePendingSuppliers?: (suppliers: any[]) => void
}

type SortKey = "supplier" | "contact" | "city" | "last_purchase"
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
    { id: "contact", label: "Contato", align: "left", width: "220px", sortable: false },
    { id: "city", label: "Cidade", align: "left", width: "180px", sortable: true },
    { id: "last_purchase", label: "Última Compra", align: "left", width: "170px", sortable: true },
    { id: "actions", label: "Ações", align: "center", width: "80px", sortable: false },
]

// Tablet / Mobile GridCard
const ProductSupplierGridCard = React.memo(({
    supplier,
    onSelect,
    onRequestRemove,
}: {
    supplier: ProductSupplierWithDetails
    onSelect: (supplierId: string) => void
    onRequestRemove: (supplier: ProductSupplierWithDetails) => void
}) => {
    return (
        <div
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 transition-colors duration-200 cursor-pointer group flex flex-col h-full relative hover:border-brand-dark/30 dark:hover:border-brand-gray/30"
            onClick={() => onSelect(supplier.supplier_id)}
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
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Cidade</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                            {supplier.supplier_city && supplier.supplier_state
                                ? `${supplier.supplier_city}, ${supplier.supplier_state}`
                                : supplier.supplier_city || supplier.supplier_state || "-"}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end min-w-0">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Contato</span>
                        <div className="flex flex-col items-end min-w-0">
                            {supplier.supplier_email && (
                                <span className="text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-full">
                                    {supplier.supplier_email}
                                </span>
                            )}
                            {supplier.supplier_phone && (
                                <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                    {formatBrazilPhone(supplier.supplier_phone)}
                                </span>
                            )}
                            {!supplier.supplier_email && !supplier.supplier_phone && (
                                <span className="text-[13px] text-brand-inactive-text">-</span>
                            )}
                        </div>
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
                    <div onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="outlinered"
                            size="icon"
                            className="h-8 w-8 rounded-full shrink-0"
                            onClick={() => onRequestRemove(supplier)}
                            title="Remover fornecedor"
                        >
                            <TrashIcon size={14} />
                        </Button>
                    </div>
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
    onSelect,
    onRequestRemove,
}: {
    supplier: ProductSupplierWithDetails
    columns: ColumnDef[]
    onSelect: (supplierId: string) => void
    onRequestRemove: (supplier: ProductSupplierWithDetails) => void
}) => {
    return (
        <tr
            className="group transition-colors cursor-pointer hover:bg-brand-gray/60 dark:hover:bg-gray-900/50"
            onClick={() => onSelect(supplier.supplier_id)}
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
                    case "contact":
                        cellContent = (
                            <div className="flex flex-col min-w-0">
                                {supplier.supplier_email && (
                                    <span className="text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[200px]">
                                        {supplier.supplier_email}
                                    </span>
                                )}
                                {supplier.supplier_phone && (
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        {formatBrazilPhone(supplier.supplier_phone)}
                                    </span>
                                )}
                                {!supplier.supplier_email && !supplier.supplier_phone && (
                                    <span className="text-[13px] text-brand-inactive-text">-</span>
                                )}
                            </div>
                        )
                        break
                    case "city":
                        cellContent = (
                            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                {supplier.supplier_city && supplier.supplier_state
                                    ? `${supplier.supplier_city}, ${supplier.supplier_state}`
                                    : supplier.supplier_city || supplier.supplier_state || "-"}
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
                        cellContent = (
                            <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                                <Button
                                    variant="outlinered"
                                    size="icon"
                                    className="h-8 w-8 rounded-full"
                                    onClick={() => onRequestRemove(supplier)}
                                    title="Remover fornecedor"
                                >
                                    <TrashIcon size={14} />
                                </Button>
                            </div>
                        )
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
    const [detailsSupplierId, setDetailsSupplierId] = useState<string | null>(null)
    const [supplierToDelete, setSupplierToDelete] = useState<ProductSupplierWithDetails | null>(null)
    const [isRemoving, setIsRemoving] = useState(false)
    const [isLoadingList, setIsLoadingList] = useState(() => Boolean(productData?.id))

    // Sorting & Pagination
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 8

    const mountedRef = useRef(true)

    useEffect(() => {
        return () => {
            mountedRef.current = false
        }
    }, [])

    // Lista leve (1 query) - os detalhes de compras/custos são carregados
    // sob demanda dentro da sheet, evitando um fetch pesado ao montar a aba.
    const loadSuppliers = useCallback(async () => {
        if (!productId) return

        setIsLoadingList(true)
        try {
            const res = await getProductSuppliersAction(productId)
            if (!mountedRef.current) return
            if (!res.error && res.suppliers) setSuppliers(res.suppliers)
        } catch (err) {
            console.error("Erro ao carregar fornecedores:", err)
        } finally {
            if (mountedRef.current) setIsLoadingList(false)
        }
    }, [productId])

    useEffect(() => {
        if (!productId) return
        loadSuppliers()
    }, [productId, loadSuppliers])

    const handleSelectSupplier = useCallback((supplierId: string) => {
        setDetailsSupplierId(supplierId)
    }, [])

    const handleCloseDetails = useCallback(() => setDetailsSupplierId(null), [])

    const handleRequestRemove = useCallback((supplier: ProductSupplierWithDetails) => {
        setSupplierToDelete(supplier)
    }, [])

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
            loadSuppliers()
        },
        [suppliers, productId, onSavePendingSuppliers, notifySuccess, notifyError, loadSuppliers]
    )

    // Confirm Removal
    const handleConfirmRemove = useCallback(async () => {
        if (!supplierToDelete) return
        const supplierId = supplierToDelete.supplier_id

        setIsRemoving(true)

        // Optimistic local update
        const snapshot = suppliers
        const updated = suppliers.filter((s) => s.supplier_id !== supplierId)
        setSuppliers(updated)
        setDetailsSupplierId((prev) => (prev === supplierId ? null : prev))
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
            setSuppliers(snapshot)
            return
        }

        notifySuccess("Fornecedor removido com sucesso")
        loadSuppliers()
    }, [supplierToDelete, suppliers, onSavePendingSuppliers, productId, notifySuccess, notifyError, loadSuppliers])

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
        () => activeSuppliers.find((s) => s.supplier_id === detailsSupplierId) || null,
        [activeSuppliers, detailsSupplierId]
    )

    // Mantém o último fornecedor selecionado para a sheet não sumir
    // durante a animação de fechamento
    const lastSelectedSupplierRef = useRef<ProductSupplierWithDetails | null>(null)
    useEffect(() => {
        if (selectedSupplier) {
            lastSelectedSupplierRef.current = selectedSupplier
        }
    }, [selectedSupplier])
    const displaySupplier = selectedSupplier || lastSelectedSupplierRef.current

    const sortedSuppliers = useMemo(() => {
        if (!sortConfig) return activeSuppliers
        const { key, direction } = sortConfig

        return [...activeSuppliers].sort((a, b) => {
            let valA: any = ""
            let valB: any = ""

            if (key === "supplier") {
                valA = (a.supplier_name || "").toLowerCase()
                valB = (b.supplier_name || "").toLowerCase()
            } else if (key === "contact") {
                valA = (a.supplier_email || a.supplier_phone || "").toLowerCase()
                valB = (b.supplier_email || b.supplier_phone || "").toLowerCase()
            } else if (key === "city") {
                valA = (a.supplier_city || "").toLowerCase()
                valB = (b.supplier_city || "").toLowerCase()
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
    }, [sortedSuppliers, currentPage])

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <h3 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading">
                    Fornecedores Vinculados
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

            {isLoadingList && activeSuppliers.length === 0 ? (
                /* Skeleton while the suppliers list loads */
                <div className="w-full overflow-hidden bg-white dark:bg-dark-surface">
                    {Array.from({ length: 4 }).map((_, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-3 p-4 border-b border-brand-border dark:border-dark-border last:border-b-0"
                        >
                            <SkeletonLoader className="shrink-0" circle width={40} />
                            <div className="flex-1 space-y-2 min-w-0">
                                <SkeletonLoader width="34%" height={14} />
                                <SkeletonLoader width="22%" height={12} />
                            </div>
                            <SkeletonLoader className="shrink-0" width={112} height={32} />
                        </div>
                    ))}
                </div>
            ) : activeSuppliers.length === 0 ? (
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
                                onSelect={handleSelectSupplier}
                                onRequestRemove={handleRequestRemove}
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
                <div className="w-full overflow-hidden bg-white dark:bg-dark-surface">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-separate border-spacing-0 min-w-[800px]">
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
                                                className={`py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${isFirst ? "rounded-l-lg pl-4" : ""
                                                    } ${isLast ? "rounded-r-lg pr-4" : ""} ${col.sortable
                                                        ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors"
                                                        : ""
                                                    }`}
                                                onClick={() => col.sortable && col.id !== "actions" && handleSort(col.id as SortKey)}
                                            >
                                                <div
                                                    className={`flex items-center gap-1.5 ${col.align === "right"
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
                                                            className={`transition-all duration-200 ${isSorted
                                                                ? "text-brand-dark dark:text-dark-heading opacity-100 block"
                                                                : "text-brand-inactive-text hidden group-hover:block opacity-40"
                                                                } ${isSorted && sortConfig?.direction === "desc"
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
                                        onSelect={handleSelectSupplier}
                                        onRequestRemove={handleRequestRemove}
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

            {/* Detalhes do fornecedor (sheet com accordions) */}
            <SupplierDetailSheet
                isOpen={Boolean(selectedSupplier)}
                onClose={handleCloseDetails}
                supplier={displaySupplier}
                productId={productId}
                productUnit={productData?.unit}
            />

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
                        ? `Tem certeza que deseja desvincular o fornecedor "${supplierToDelete.supplier_name || "este fornecedor"
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
