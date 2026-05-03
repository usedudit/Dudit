"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertModal, Badge, Button, Checkbox, IconPlaceholder, SavingStatusModal, Separator } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import { PaymentMethodEditPage } from "./PaymentMethodEditPage"
import { useMediaQuery } from "@/components/erp/hooks"
import { useNotification } from "@/hooks/use-notification"
import { deletePaymentMethodAction, getPaymentMethodsAction, updatePaymentMethodAction } from "@/app/actions/erp/payment-methods"
import { BlockedIcon, CheckCircleIcon, ChevronLeftIcon, TrashIcon } from "@/lib/icons"
import PaymentMethodPageControls from "./PaymentMethodPageControls"
import PaymentMethodListRow, { getPaymentTypeLabel, PaymentMethodListItem, getPaymentIcon, getBrandsLabel } from "./PaymentMethodListRow"
import PaymentMethodGridCard from "./PaymentMethodGridCard"
import React from "react"

const PAYMENT_METHODS_VERSION_PREFIX = "payment-methods-version:"
const PAYMENT_METHODS_UPDATED_EVENT = "payment-methods-updated"

interface PaymentMethodsSubPageProps {
    partner: any
    paymentMethods: any[]
    onBack: () => void
}

type PaymentFilters = {
    type: string[]
    status: string[]
}

const INITIAL_FILTERS: PaymentFilters = {
    type: [],
    status: [],
}

const LIST_COLUMNS = [
    { id: "name", label: "Método", align: "left" as const },
    { id: "type", label: "Tipo", align: "left" as const },
    { id: "discount", label: "Desconto", align: "left" as const },
    { id: "fees", label: "Taxas", align: "left" as const },
    { id: "status", label: "Status", align: "center" as const },
    { id: "actions", label: "Ações", align: "center" as const },
]

export function PaymentMethodsSubPage({ partner, paymentMethods, onBack }: PaymentMethodsSubPageProps) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const isMobile = useMediaQuery("(max-width: 1024px)")

    const [methods, setMethods] = useState<PaymentMethodListItem[]>(paymentMethods || [])
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [filters, setFilters] = useState<PaymentFilters>(INITIAL_FILTERS)
    const [page, setPage] = useState(1)
    const [selection, setSelection] = useState<{ ids: Set<string> }>({ ids: new Set() })

    const [currentView, setCurrentView] = useState<"list" | "edit">("list")
    const [editingPayment, setEditingPayment] = useState<PaymentMethodListItem | null>(null)
    const [methodToDelete, setMethodToDelete] = useState<PaymentMethodListItem | null>(null)
    const [bulkActionMode, setBulkActionMode] = useState<"activate" | "deactivate" | "delete" | null>(null)
    const [modals, setModals] = useState({ filter: false })
    const [processingModal, setProcessingModal] = useState<{ open: boolean; text: string }>({ open: false, text: "" })
    const [isTogglingStatus, setIsTogglingStatus] = useState<Set<string>>(new Set())
    const [isDeletingMethod, setIsDeletingMethod] = useState<Set<string>>(new Set())
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const notifyPaymentMethodsChanged = useCallback((nextMethods: PaymentMethodListItem[]) => {
        if (typeof window === "undefined") return

        const signature = JSON.stringify(
            (nextMethods || []).map((method) => ({
                id: method.id,
                name: method.name,
                type: method.type,
                is_active: method.is_active,
            })),
        )

        window.localStorage.setItem(`${PAYMENT_METHODS_VERSION_PREFIX}${partner.id}`, signature)
        window.dispatchEvent(new CustomEvent(PAYMENT_METHODS_UPDATED_EVENT))
    }, [partner.id])

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 350)
        return () => clearTimeout(handler)
    }, [search])

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, filters])

    useEffect(() => {
        setMethods(paymentMethods || [])
    }, [paymentMethods])

    useEffect(() => {
        setSelection((prev) => ({
            ids: new Set(Array.from(prev.ids).filter((id) => methods.some((method) => method.id === id))),
        }))
    }, [methods])

    const hasActiveFilters = filters.type.length > 0 || filters.status.length > 0

    const filterSections = useMemo<FilterSectionConfig[]>(() => {
        const typeOptions = Array.from(new Set(methods.map((method) => getPaymentTypeLabel(method)).filter(Boolean)))

        return [
            {
                id: "type",
                title: "Tipo",
                type: "checkbox-list",
                options: typeOptions,
            },
            {
                id: "status",
                title: "Status",
                type: "checkbox-list",
                options: ["Ativo", "Inativo"],
            },
        ]
    }, [methods])

    const filteredMethods = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase()

        return methods.filter((method) => {
            const typeLabel = getPaymentTypeLabel(method)
            const brands = String(method.card_brand || "").toLowerCase().replaceAll("_", " ")
            const statusLabel = method.is_active ? "Ativo" : "Inativo"

            const searchMatch =
                !term ||
                String(method.name || "").toLowerCase().includes(term) ||
                String(method.payment_type || "").toLowerCase().includes(term) ||
                String(method.type || "").toLowerCase().includes(term) ||
                brands.includes(term)

            const typeMatch = filters.type.length === 0 || filters.type.includes(typeLabel)
            const statusMatch = filters.status.length === 0 || filters.status.includes(statusLabel)

            return searchMatch && typeMatch && statusMatch
        })
    }, [debouncedSearch, filters.status, filters.type, methods])

    const itemsPerPage = isMobile ? 6 : 8
    const totalPages = Math.max(1, Math.ceil(filteredMethods.length / itemsPerPage))

    useEffect(() => {
        setPage((current) => Math.min(current, totalPages))
    }, [totalPages])

    const paginatedMethods = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return filteredMethods.slice(start, start + itemsPerPage)
    }, [filteredMethods, itemsPerPage, page])

    const selectedMethods = useMemo(
        () => methods.filter((method) => selection.ids.has(method.id)),
        [methods, selection.ids],
    )

    const allVisibleSelected = paginatedMethods.length > 0 && paginatedMethods.every((method) => selection.ids.has(method.id))

    const handleSelectRow = useCallback((id: string) => {
        setSelection((prev) => {
            const nextIds = new Set(prev.ids)
            if (nextIds.has(id)) nextIds.delete(id)
            else nextIds.add(id)
            return { ids: nextIds }
        })
    }, [])

    const handleSelectAllVisible = useCallback(() => {
        setSelection((prev) => {
            const nextIds = new Set(prev.ids)

            if (allVisibleSelected) {
                paginatedMethods.forEach((method) => nextIds.delete(method.id))
            } else {
                paginatedMethods.forEach((method) => nextIds.add(method.id))
            }

            return { ids: nextIds }
        })
    }, [allVisibleSelected, paginatedMethods])

    const clearSelection = useCallback(() => {
        setSelection({ ids: new Set() })
    }, [])

    const togglePaymentStatus = async (method: PaymentMethodListItem, checked: boolean) => {
        const originalStatus = method.is_active
        const optimisticMethods = methods.map((current) => current.id === method.id ? { ...current, is_active: checked } : current)

        setMethods(optimisticMethods)
        setIsTogglingStatus((prev) => new Set(prev).add(method.id))

        try {
            const res = await updatePaymentMethodAction(method.id, { isActive: checked })

            if (!res.success) {
                setMethods((prev) => prev.map((current) => current.id === method.id ? { ...current, is_active: originalStatus } : current))
                notifyError("Erro ao alterar status", res.error || "Não foi possível atualizar o método.")
            } else {
                notifyPaymentMethodsChanged(optimisticMethods)
                notifySuccess(`Método ${checked ? "ativado" : "desativado"} com sucesso`)
            }
        } catch {
            setMethods((prev) => prev.map((current) => current.id === method.id ? { ...current, is_active: originalStatus } : current))
            notifyError("Erro inesperado", "Não foi possível alterar o status do método.")
        } finally {
            setIsTogglingStatus((prev) => {
                const next = new Set(prev)
                next.delete(method.id)
                return next
            })
        }
    }

    const runDelete = useCallback(async (ids: string[]) => {
        setProcessingModal({
            open: true,
            text: ids.length > 1 ? "Excluindo métodos de pagamento..." : "Excluindo método de pagamento...",
        })

        setIsDeletingMethod((prev) => {
            const next = new Set(prev)
            ids.forEach((id) => next.add(id))
            return next
        })

        try {
            const results = await Promise.all(ids.map(async (id) => ({ id, result: await deletePaymentMethodAction(id) })))
            const successIds = results.filter((entry) => entry.result.success).map((entry) => entry.id)
            const failed = results.filter((entry) => !entry.result.success)

            if (successIds.length > 0) {
                const nextMethods = methods.filter((method) => !successIds.includes(method.id))
                setMethods(nextMethods)
                notifyPaymentMethodsChanged(nextMethods)
                setSelection((prev) => ({
                    ids: new Set(Array.from(prev.ids).filter((id) => !successIds.includes(id))),
                }))
            }

            if (failed.length > 0) {
                notifyError(
                    "Alguns métodos não foram excluídos",
                    failed[0]?.result.error || "Confira e tente novamente.",
                )
            } else {
                notifySuccess(ids.length > 1 ? "Métodos excluídos com sucesso" : "Método excluído com sucesso")
            }
        } catch {
            notifyError("Erro inesperado", "Não foi possível excluir os métodos selecionados.")
        } finally {
            setProcessingModal({ open: false, text: "" })
            setIsDeletingMethod((prev) => {
                const next = new Set(prev)
                ids.forEach((id) => next.delete(id))
                return next
            })
        }
    }, [methods, notifyError, notifyPaymentMethodsChanged, notifySuccess])

    const runBulkStatus = useCallback(async (ids: string[], nextValue: boolean) => {
        if (ids.length === 0) return

        setProcessingModal({
            open: true,
            text: nextValue ? "Ativando métodos de pagamento..." : "Desativando métodos de pagamento...",
        })

        setIsTogglingStatus((prev) => {
            const next = new Set(prev)
            ids.forEach((id) => next.add(id))
            return next
        })

        const snapshot = methods

        setMethods((prev) => prev.map((method) => ids.includes(method.id) ? { ...method, is_active: nextValue } : method))

        try {
            const results = await Promise.all(ids.map(async (id) => ({ id, result: await updatePaymentMethodAction(id, { isActive: nextValue }) })))
            const failedIds = results.filter((entry) => !entry.result.success).map((entry) => entry.id)
            const successIds = results.filter((entry) => entry.result.success).map((entry) => entry.id)

            if (failedIds.length > 0) {
                setMethods((prev) => prev.map((method) => {
                    const original = snapshot.find((item) => item.id === method.id)
                    if (!original) return method
                    return failedIds.includes(method.id) ? { ...method, is_active: original.is_active } : method
                }))

                notifyError(
                    "Nem todos os métodos foram atualizados",
                    results.find((entry) => !entry.result.success)?.result.error || "Confira e tente novamente.",
                )
            }

            if (successIds.length > 0) {
                const nextMethods = snapshot.map((method) =>
                    successIds.includes(method.id) ? { ...method, is_active: nextValue } : method,
                )

                setMethods((prev) => prev.map((method) => {
                    const updated = nextMethods.find((item) => item.id === method.id)
                    return updated || method
                }))

                notifyPaymentMethodsChanged(nextMethods)
                notifySuccess(nextValue ? "Métodos ativados com sucesso" : "Métodos desativados com sucesso")
            }
        } catch {
            setMethods(snapshot)
            notifyError("Erro inesperado", "Não foi possível atualizar os métodos selecionados.")
        } finally {
            clearSelection()
            setProcessingModal({ open: false, text: "" })
            setIsTogglingStatus((prev) => {
                const next = new Set(prev)
                ids.forEach((id) => next.delete(id))
                return next
            })
        }
    }, [clearSelection, methods, notifyError, notifyPaymentMethodsChanged, notifySuccess])

    const handleConfirmDelete = useCallback(async () => {
        if (!methodToDelete) return

        const targetId = methodToDelete.id
        setMethodToDelete(null)
        await runDelete([targetId])
    }, [methodToDelete, runDelete])

    const handleConfirmBulkAction = useCallback(async () => {
        const ids = Array.from(selection.ids)
        const action = bulkActionMode

        setBulkActionMode(null)

        if (ids.length === 0 || !action) return

        if (action === "delete") {
            await runDelete(ids)
            clearSelection()
            return
        }

        await runBulkStatus(ids, action === "activate")
    }, [bulkActionMode, clearSelection, runBulkStatus, runDelete, selection.ids])

    const handleReloadMethods = useCallback(async () => {
        const result = await getPaymentMethodsAction(partner.id)
        if (result.methods) {
            setMethods(result.methods)
            notifyPaymentMethodsChanged(result.methods)
        }
    }, [notifyPaymentMethodsChanged, partner.id])

    const emptyStateType: "no-data" | "no-results" = methods.length === 0 ? "no-data" : "no-results"

    const emptyStateContent = emptyStateType === "no-data"
        ? {
            title: "Você ainda não cadastrou formas de pagamento",
            subtitle: "Adicione Pix, dinheiro ou cartões para configurar como sua loja recebe.",
            imageSrc: "https://img.dudit.com.br/static/mascots/Aguarde.png",
            buttonText: "Adicionar primeiro método",
            onClick: () => {
                setEditingPayment(null)
                setCurrentView("edit")
            },
        }
        : {
            title: "Nenhum método encontrado",
            subtitle: "Tente ajustar os filtros ou buscar por outro termo.",
            imageSrc: "https://img.dudit.com.br/static/mascots/NaoEncontrado.png",
            buttonText: "Limpar filtros",
            onClick: () => {
                setSearch("")
                setDebouncedSearch("")
                setFilters(INITIAL_FILTERS)
            },
        }

    const shouldActivateSelected = selectedMethods.length > 0 && selectedMethods.every((method) => !method.is_active)
    const normalizedEditingMethod = editingPayment ? {
        id: editingPayment.id,
        name: editingPayment.name || "",
        type: editingPayment.type || undefined,
        payment_type: editingPayment.payment_type || undefined,
        is_active: Boolean(editingPayment.is_active),
        is_online_default: Boolean(editingPayment.is_online_default),
        fee_percent: editingPayment.fee_percent ?? undefined,
        fee_fixed: editingPayment.fee_fixed ?? undefined,
        discount_percent: editingPayment.discount_percent ?? undefined,
        card_brand: editingPayment.card_brand || undefined,
        max_installments: editingPayment.max_installments ?? undefined,
    } : null

    const renderEmptyState = () => (
        <FadeIn className="flex flex-col items-center justify-center min-h-[420px] px-4">
            <IconPlaceholder
                placeholderType="image"
                imageSrc={emptyStateContent.imageSrc}
                imageAlt={emptyStateContent.title}
                title={emptyStateContent.title}
                subtitle={emptyStateContent.subtitle}
                itemButton={{
                    text: emptyStateContent.buttonText,
                    action: emptyStateContent.onClick,
                    variant: emptyStateType === "no-data" ? "default" : "outline",
                }}
            />
        </FadeIn>
    )

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState((prev) => {
            const next = {
                left: scrollLeft > 0,
                right: scrollLeft < scrollWidth - clientWidth - 2,
            }
            if (prev.left === next.left && prev.right === next.right) return prev
            return next
        })
    }, [])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, viewMode, methods])

    const renderListContent = () => {
        if (paginatedMethods.length === 0) return renderEmptyState()

        if (isMobile) {
            return (
                <div className="flex flex-col">
                    {paginatedMethods.map((method, idx) => (
                        <motion.div
                            key={method.id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05, duration: 0.3 }}
                        >
                            <div
                                className="py-6 flex items-center gap-5 cursor-pointer active:scale-[0.98] transition-transform"
                                onClick={() => {
                                    setEditingPayment(method)
                                    setCurrentView("edit")
                                }}
                            >
                                <div className="w-14 h-14 rounded-2xl bg-brand-gray/50 dark:bg-dark-border/30 shrink-0 flex items-center justify-center border border-brand-border/50 dark:border-dark-border/20 shadow-sm">
                                    {getPaymentIcon(method)}
                                </div>

                                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col min-w-0 pr-1">
                                            <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                                {method.name || "Sem nome"}
                                            </h3>
                                            <span className="text-[13px] text-brand-inactive-text dark:text-dark-body font-medium truncate mt-0.5">
                                                {getBrandsLabel(method) || getPaymentTypeLabel(method)}
                                            </span>
                                        </div>
                                        <Badge variant={method.is_active ? "green" : "red"} icon={null} className="shrink-0 text-[10px] h-5 px-2">
                                            {method.is_active ? "Ativo" : "Inativo"}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="gray" icon={null} className="text-[10px] h-5 px-2 uppercase tracking-wider">
                                                {getPaymentTypeLabel(method)}
                                            </Badge>
                                            {method.discount_percent ? (
                                                <Badge variant="blue" icon={null} className="text-[10px] h-5 px-2">
                                                    -{method.discount_percent}%
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox checked={selection.ids.has(method.id)} onChange={() => handleSelectRow(method.id)} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {idx < paginatedMethods.length - 1 && <Separator className="opacity-30" />}
                        </motion.div>
                    ))}
                </div>
            )
        }

        if (viewMode === "grid") {
            return (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                    {paginatedMethods.map((method) => (
                        <PaymentMethodGridCard
                            key={method.id}
                            method={method}
                            selected={selection.ids.has(method.id)}
                            onSelect={() => handleSelectRow(method.id)}
                            onEdit={(current) => {
                                setEditingPayment(current)
                                setCurrentView("edit")
                            }}
                            onDelete={(current) => setMethodToDelete(current)}
                        />
                    ))}
                </div>
            )
        }

        return (
            <div className="relative">
                <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                <div className="overflow-x-auto pb-4 no-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                    <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                        <thead>
                            <tr className="bg-brand-gray/50 dark:bg-dark-border/10">
                                <th className="py-3 px-2 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body bg-brand-gray/50 dark:bg-dark-border/10 rounded-l-lg pl-6 w-12">
                                    <Checkbox checked={allVisibleSelected} onChange={handleSelectAllVisible} />
                                </th>
                                {LIST_COLUMNS.map((column, index) => {
                                    const isLast = index === LIST_COLUMNS.length - 1
                                    return (
                                        <th
                                            key={column.id}
                                            className={`py-3 px-2 text-[13px] font-medium text-brand-inactive-text dark:text-dark-body bg-brand-gray/50 dark:bg-dark-border/10 ${column.align === "center" ? "text-center" : "text-left"} ${isLast ? "rounded-r-lg pr-6" : ""}`}
                                        >
                                            {column.label}
                                        </th>
                                    )
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            {paginatedMethods.map((method) => (
                                <PaymentMethodListRow
                                    key={method.id}
                                    method={method}
                                    columns={LIST_COLUMNS}
                                    selected={selection.ids.has(method.id)}
                                    onSelect={handleSelectRow}
                                    onEdit={(current) => {
                                        setEditingPayment(current)
                                        setCurrentView("edit")
                                    }}
                                    onDelete={(current) => setMethodToDelete(current)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    return (
        <>
            {currentView === "list" && (
                <FadeIn>
                    <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
                        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                            <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                                    {/* Back button - desktop only */}
                                    <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                        <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                    </div>

                                    {/* Title row */}
                                    <div className="hidden md:flex items-start justify-between">
                                        <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                            <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                                <span className="truncate">Formas de Pagamento</span>
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Gerencie os métodos de pagamento aceitos em seu negócio.
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            <Button
                                                onClick={() => {
                                                    setEditingPayment(null)
                                                    setCurrentView("edit")
                                                }}
                                            >
                                                Novo método
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-3 md:px-0 py-2 max-w-[1300px] mx-auto mt-8 w-full">
                                    <PaymentMethodPageControls
                                        search={search}
                                        onSearchChange={setSearch}
                                        onOpenFilter={() => setModals({ filter: true })}
                                        onAddMethod={() => {
                                            setEditingPayment(null)
                                            setCurrentView("edit")
                                        }}
                                        filters={filters}
                                        setFilters={setFilters}
                                        viewMode={viewMode}
                                        onViewModeChange={setViewMode}
                                        hasActiveFilters={hasActiveFilters}
                                    />

                                    <div className="mt-4">
                                        <AnimatePresence mode="wait">
                                            <FadeIn
                                                key={`${viewMode}-${debouncedSearch}-${filters.type.join(",")}-${filters.status.join(",")}-${page}`}
                                                className="w-full"
                                            >
                                                {renderListContent()}

                                                {totalPages > 1 ? (
                                                    <div className="mt-6">
                                                        <Pagination
                                                            currentPage={page}
                                                            totalPages={totalPages}
                                                            onPageChange={setPage}
                                                        />
                                                    </div>
                                                ) : null}
                                            </FadeIn>
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </FadeIn>
            )}

            {currentView === "edit" && (
                <PaymentMethodEditPage
                    partnerId={partner.id}
                    editingMethod={normalizedEditingMethod}
                    onBack={async (shouldReload) => {
                        setCurrentView("list")
                        if (shouldReload) {
                            await handleReloadMethods()
                        }
                    }}
                />
            )}

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals({ filter: false })}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />

            <AlertModal
                isOpen={!!methodToDelete}
                onClose={() => setMethodToDelete(null)}
                title="Excluir método?"
                description={`Tem certeza que deseja excluir "${methodToDelete?.name || "este método"}"? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                cancelText="Cancelar"
                onConfirm={handleConfirmDelete}
                variant="danger"
            />

            <AlertModal
                isOpen={bulkActionMode === "delete"}
                onClose={() => setBulkActionMode(null)}
                title="Excluir métodos"
                description={`Tem certeza que deseja excluir ${selection.ids.size} método(s)? Esta ação não pode ser desfeita.`}
                confirmText="Excluir"
                cancelText="Cancelar"
                onConfirm={handleConfirmBulkAction}
                variant="danger"
            />

            <AlertModal
                isOpen={bulkActionMode === "activate" || bulkActionMode === "deactivate"}
                onClose={() => setBulkActionMode(null)}
                title={bulkActionMode === "activate" ? "Ativar métodos" : "Desativar métodos"}
                description={
                    bulkActionMode === "activate"
                        ? `Deseja ativar ${selection.ids.size} método(s) selecionado(s)?`
                        : `Deseja desativar ${selection.ids.size} método(s) selecionado(s)?`
                }
                confirmText={bulkActionMode === "activate" ? "Ativar" : "Desativar"}
                cancelText="Cancelar"
                onConfirm={handleConfirmBulkAction}
                variant={bulkActionMode === "activate" ? "success" : "warning"}
            />

            <SavingStatusModal isOpen={processingModal.open} text={processingModal.text} />

            <FloatingActionBar selectedCount={selection.ids.size} onClearSelection={clearSelection}>
                <Button
                    variant="ghost"
                    onClick={() => setBulkActionMode(shouldActivateSelected ? "activate" : "deactivate")}
                    leftIcon={shouldActivateSelected ? <CheckCircleIcon className="w-4 h-4" /> : <BlockedIcon className="w-4 h-4" />}
                    className="h-10 px-3"
                >
                    {shouldActivateSelected ? "Ativar" : "Desativar"}
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => setBulkActionMode("delete")}
                    leftIcon={<TrashIcon className="w-4 h-4" />}
                    className="h-10 px-3 text-brand-red hover:text-brand-red/90 dark:text-brand-red dark:hover:text-brand-red/90"
                >
                    Excluir
                </Button>
            </FloatingActionBar>
        </>
    )
}
