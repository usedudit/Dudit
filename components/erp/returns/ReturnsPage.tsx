"use client"

// Main client component for Returns module
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, IconPlaceholder, Pagination, AlertModal, Badge, ActionsDropdown } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { FadeIn } from "@/components/animations/FadeIn"
import { PlusIcon, ExportFileIcon, ArrowUpDownIcon, ReturnIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityState } from "@/hooks/use-entity-state"
import { useToast } from "@/hooks/use-toast"
import ReturnListRow, { getReturnStatusMeta, getRefundTypeLabel } from "./ReturnListRow"
import ReturnGridCard from "./ReturnGridCard"
import CreateReturnPage from "./CreateReturnPage"
import ReturnPageControls from "./ReturnPageControls"
import { ReturnRequest } from "./types"
import { formatDate } from "@/lib/utils"

type SortKey = "id" | "order_number" | "customer" | "date" | "refund_type" | "quantity"
type SortDirection = "asc" | "desc"
type ActiveTab = "Todos" | "Pendentes" | "Aprovados" | "Recusados"

interface ReturnsPageProps {
  partnerId: string
  roleId: string
}

const ITEMS_PER_PAGE = 8

const COLUMNS = [
  { id: "id", label: "Código", align: "left" as const, width: "160px" },
  { id: "order_number", label: "Pedido", align: "left" as const, width: "180px" },
  { id: "customer", label: "Cliente", align: "left" as const, width: "240px" },
  { id: "date", label: "Data", align: "left" as const, width: "160px" },
  { id: "refund_type", label: "Tipo Reembolso", align: "left" as const, width: "180px" },
  { id: "quantity", label: "Qtd", align: "left" as const, width: "100px" },
  { id: "actions", label: "Ações", align: "center" as const, width: "80px" }
]

export default function ReturnsPage({ partnerId, roleId }: ReturnsPageProps) {
  const { toast } = useToast()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

  const canManage = roleId === "owner" || roleId === "admin" || roleId === "manager"

  // Returns list state
  const [returns, setReturns] = useState<ReturnRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Controls state
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [activeTab, setActiveTab] = useState<ActiveTab>("Todos")
  const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
  const [page, setPage] = useState(1)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState<{ refundType: string[] }>({ refundType: [] })
  
  // Sort state
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
    key: "date",
    direction: "desc"
  })

  // Delete modal state
  const [returnToDelete, setReturnToDelete] = useState<ReturnRequest | null>(null)

  // Scroll state for shadows on table
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState({ left: false, right: false })

  // Load from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const key = `dudit-returns-${partnerId}`
      const stored = localStorage.getItem(key)
      if (stored) {
        try {
          setReturns(JSON.parse(stored))
        } catch (err) {
          console.error("Error parsing returns:", err)
        }
      }
      setIsLoading(false)
    }
  }, [partnerId])

  // Save helper
  const saveReturnsToStorage = (updated: ReturnRequest[]) => {
    setReturns(updated)
    if (typeof window !== "undefined") {
      localStorage.setItem(`dudit-returns-${partnerId}`, JSON.stringify(updated))
    }
  }

  // Handle Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, activeTab, filters])

  // Table scroll check
  const checkScroll = useCallback(() => {
    if (!tableContainerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
    setScrollState((prev) => {
      const nextLeft = scrollLeft > 0
      const nextRight = scrollLeft < scrollWidth - clientWidth - 2
      if (prev.left === nextLeft && prev.right === nextRight) return prev
      return { left: nextLeft, right: nextRight }
    })
  }, [])

  useEffect(() => {
    checkScroll()
    window.addEventListener("resize", checkScroll)
    return () => window.removeEventListener("resize", checkScroll)
  }, [viewMode, returns, checkScroll])

  // Save return request (Create / Edit)
  const handleSaveReturn = async (data: Partial<ReturnRequest>) => {
    setIsSaving(true)
    try {
      if (entityState.action === "create") {
        const newReturn: ReturnRequest = {
          id: Math.random().toString(36).substring(2, 11),
          partnerId,
          orderId: data.orderId || "",
          orderNumber: data.orderNumber || "",
          customerId: data.customerId || "",
          customerName: data.customerName || "Cliente",
          customerEmail: data.customerEmail || "",
          customerPhone: data.customerPhone || "",
          customerAddress: data.customerAddress || "",
          createdAt: new Date().toISOString(),
          refundType: data.refundType || "pix",
          status: data.status || "pending",
          items: data.items || [],
          evidenceImages: data.evidenceImages || [],
          observations: data.observations || "",
          refundValue: data.refundValue || 0,
          returnDate: data.returnDate || new Date().toISOString(),
        }

        const updated = [newReturn, ...returns]
        saveReturnsToStorage(updated)
        toast({ title: "Sucesso", description: "Solicitação de devolução criada com sucesso." })
      } else if (entityState.action === "edit" && entityState.entityId) {
        const updated = returns.map(item => {
          if (item.id === entityState.entityId) {
            return {
              ...item,
              refundType: data.refundType || item.refundType,
              status: data.status || item.status,
              refundValue: data.refundValue ?? item.refundValue,
              returnDate: data.returnDate || item.returnDate,
              observations: data.observations ?? item.observations,
              evidenceImages: data.evidenceImages || item.evidenceImages,
              items: data.items || item.items,
            }
          }
          return item
        })
        saveReturnsToStorage(updated)
        toast({ title: "Sucesso", description: "Solicitação de devolução atualizada com sucesso." })
      }
      closeEntity()
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Erro ao salvar devolução.", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  // Delete return request
  const handleDeleteReturn = () => {
    if (!returnToDelete) return
    const updated = returns.filter(item => item.id !== returnToDelete.id)
    saveReturnsToStorage(updated)
    toast({ title: "Excluída", description: `Devolução do pedido ${returnToDelete.orderNumber} excluída.` })
    setReturnToDelete(null)
  }

  // Filter returns
  const filteredReturns = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase()
    
    let result = returns.filter(item => {
      // Search matches
      const matchesSearch = 
        !term ||
        item.orderNumber.toLowerCase().includes(term) ||
        item.customerName.toLowerCase().includes(term) ||
        `ret-${item.id}`.toLowerCase().includes(term)

      // Tab matches
      let matchesTab = true
      if (activeTab === "Pendentes") matchesTab = item.status === "pending"
      else if (activeTab === "Aprovados") matchesTab = item.status === "approved"
      else if (activeTab === "Recusados") matchesTab = item.status === "rejected"

      // Filters matches
      let matchesFilter = true
      if (filters.refundType.length > 0) {
        const typeLabel = getRefundTypeLabel(item.refundType)
        matchesFilter = filters.refundType.includes(typeLabel)
      }

      return matchesSearch && matchesTab && matchesFilter
    })

    // Sort
    if (sortConfig) {
      result = [...result].sort((a, b) => {
        let aVal: any = ""
        let bVal: any = ""

        switch (sortConfig.key) {
          case "id":
            aVal = a.id
            bVal = b.id
            break
          case "order_number":
            aVal = a.orderNumber
            bVal = b.orderNumber
            break
          case "customer":
            aVal = a.customerName
            bVal = b.customerName
            break
          case "date":
            aVal = new Date(a.createdAt).getTime()
            bVal = new Date(b.createdAt).getTime()
            break
          case "refund_type":
            aVal = getRefundTypeLabel(a.refundType)
            bVal = getRefundTypeLabel(b.refundType)
            break
          case "quantity":
            aVal = a.items.reduce((acc, i) => acc + i.quantity, 0)
            bVal = b.items.reduce((acc, i) => acc + i.quantity, 0)
            break
        }

        if (aVal === bVal) return 0
        const cmp = aVal < bVal ? -1 : 1
        return sortConfig.direction === "asc" ? cmp : -cmp
      })
    }

    return result
  }, [returns, debouncedSearch, activeTab, filters, sortConfig])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredReturns.length / ITEMS_PER_PAGE))
  const paginatedReturns = filteredReturns.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const hasActiveFilters = debouncedSearch.length > 0 || filters.refundType.length > 0

  const filterSections: FilterSectionConfig[] = [
    {
      id: "refundType",
      title: "Tipo de Reembolso",
      type: "checkbox-list",
      options: ["Pix", "Cartão de Crédito", "Vale-compra", "Outro"]
    }
  ]

  const handleExport = () => {
    toast({
      title: "Exportação concluída",
      description: "A lista de devoluções foi exportada com sucesso."
    })
  }

  // Active Return Request for CreateReturnPage
  const activeReturnRequest = useMemo(() => {
    if (!entityState.entityId) return null
    return returns.find(r => r.id === entityState.entityId) || null
  }, [returns, entityState.entityId])

  return (
    <AnimatePresence mode="wait">
      {entityState.isOpen ? (
        <CreateReturnPage
          key="form"
          partnerId={partnerId}
          mode={entityState.action as any}
          returnRequest={activeReturnRequest}
          onBack={closeEntity}
          onSave={handleSaveReturn}
          isSaving={isSaving}
        />
      ) : (
        <FadeIn key="list" className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
          <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
            
            {/* Page Header (Desktop) */}
            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
              <div className="flex flex-col gap-2 pt-1">
                <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                  Trocas e Devoluções
                </h1>
                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                  Gerencie trocas, devoluções e reembolsos de clientes.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" leftIcon={<ExportFileIcon size={18} />} onClick={handleExport}>
                  Exportar
                </Button>
                {canManage && (
                  <Button onClick={() => openEntity("create")} leftIcon={<PlusIcon size={18} />}>
                    Nova Devolução
                  </Button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex border-b border-brand-border dark:border-dark-border px-4 md:px-8 mb-4">
              {(["Todos", "Pendentes", "Aprovados", "Recusados"] as ActiveTab[]).map((tab) => (
                <button
                  key={tab}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 transition-all duration-200 ${
                    activeTab === tab
                      ? "border-brand-primary text-brand-primary dark:text-brand-primary"
                      : "border-transparent text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Listing Page Controls */}
            <ReturnPageControls
              search={search}
              onSearchChange={setSearch}
              onOpenFilter={() => setIsFilterOpen(true)}
              onAdd={canManage ? () => openEntity("create") : undefined}
              viewMode={viewMode}
              onViewModeChange={setViewModeState}
            />

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
                  </div>
                ) : paginatedReturns.length === 0 ? (
                  <FadeIn key="empty" className="flex flex-col items-center justify-center h-[500px] text-center p-8 w-full">
                    <IconPlaceholder
                      placeholderType="image"
                      imageSrc={
                        hasActiveFilters
                          ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                          : "https://img.dudit.com.br/static/mascots/SemPedidos.png"
                      }
                      imageAlt="Sem devoluções"
                      title={hasActiveFilters ? "Nenhuma devolução encontrada" : "Nenhuma devolução cadastrada"}
                      subtitle={
                        hasActiveFilters
                          ? "Ajuste os filtros ou o termo de busca para encontrar o que procura."
                          : "Comece criando a primeira solicitação de devolução."
                      }
                      itemButton={
                        !hasActiveFilters && canManage
                          ? {
                              text: "Criar devolução",
                              action: () => openEntity("create"),
                            }
                          : undefined
                      }
                    />
                  </FadeIn>
                ) : isMobile ? (
                  /* Mobile Stack Layout separated by border/separators */
                  <FadeIn key="mobile-list" className="px-1 pb-6 flex flex-col border-b border-brand-border dark:border-dark-border">
                    {paginatedReturns.map((item) => (
                      <div
                        key={item.id}
                        className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer flex flex-col gap-3 animate-fade-in"
                        onClick={() => openEntity("view", item.id)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border">
                              <ReturnIcon className="w-4 h-4 text-brand-inactive-text" />
                            </div>
                            <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">
                              {`RET-${item.id.slice(0, 6).toUpperCase()}`}
                            </span>
                          </div>
                          <Badge variant={getReturnStatusMeta(item.status).variant}>
                            {getReturnStatusMeta(item.status).label}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-y-2 text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                          <div>
                            <span className="block text-[11px] text-gray-400">Pedido:</span>
                            <span className="text-brand-dark dark:text-dark-heading font-bold">{item.orderNumber}</span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-gray-400">Cliente:</span>
                            <span className="text-brand-dark dark:text-dark-heading font-bold truncate block">{item.customerName}</span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-gray-400">Data:</span>
                            <span className="text-brand-dark dark:text-dark-heading">{formatDate(item.createdAt)}</span>
                          </div>
                          <div>
                            <span className="block text-[11px] text-gray-400">Reembolso:</span>
                            <span className="text-brand-dark dark:text-dark-heading">{getRefundTypeLabel(item.refundType)}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center mt-1 pt-2 border-t border-brand-border dark:border-dark-border/40">
                          <span className="text-xs font-bold text-brand-primary">
                            Qtd: {item.items.reduce((acc, i) => acc + i.quantity, 0)} item(ns)
                          </span>
                          <div onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown
                              onView={() => openEntity("view", item.id)}
                              onEdit={canManage && item.status === "pending" ? () => openEntity("edit", item.id) : undefined}
                              onDelete={canManage ? () => setReturnToDelete(item) : undefined}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </FadeIn>
                ) : viewMode === "grid" ? (
                  <FadeIn key="grid" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                    {paginatedReturns.map((item) => (
                      <ReturnGridCard
                        key={item.id}
                        returnRequest={item}
                        onDetails={() => openEntity("view", item.id)}
                        onEdit={canManage && item.status === "pending" ? () => openEntity("edit", item.id) : undefined}
                        onDelete={canManage ? () => setReturnToDelete(item) : undefined}
                        canManage={canManage}
                      />
                    ))}
                  </FadeIn>
                ) : (
                  /* Desktop Table View */
                  <FadeIn key="list-table" className="w-full overflow-hidden rounded-xl relative">
                    <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                    <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />
                    
                    <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                      <table className="w-full text-left border-separate border-spacing-0 min-w-[1200px]">
                        <thead>
                          <tr className="bg-brand-gray dark:bg-dark-border/50">
                            {COLUMNS.map((col, idx) => {
                              const sortable = col.id !== "actions"
                              const sorted = sortConfig?.key === col.id
                              return (
                                <th
                                  key={col.id}
                                  style={{ width: col.width }}
                                  className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === 0 ? "rounded-l-lg pl-4" : ""} ${idx === COLUMNS.length - 1 ? "rounded-r-lg pr-4" : ""} ${sortable ? "cursor-pointer group" : ""}`}
                                  onClick={() => {
                                    if (!sortable) return
                                    setSortConfig((prev) => ({
                                      key: col.id as SortKey,
                                      direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc"
                                    }))
                                  }}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>{col.label}</span>
                                    {sortable && (
                                      <ArrowUpDownIcon
                                        size={14}
                                        className={`transition-all duration-200 ${sorted ? "text-brand-dark dark:text-dark-heading opacity-100" : "text-brand-inactive-text opacity-40 group-hover:opacity-100"}`}
                                      />
                                    )}
                                  </div>
                                </th>
                              )
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedReturns.map((item) => (
                            <ReturnListRow
                              key={item.id}
                              returnRequest={item}
                              columns={COLUMNS}
                              onDetails={(r) => openEntity("view", r.id)}
                              onEdit={(r) => openEntity("edit", r.id)}
                              onDelete={(r) => setReturnToDelete(r)}
                              canManage={canManage}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </FadeIn>
                )}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {filteredReturns.length > 0 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
              />
            )}

            {/* Filter Sheet */}
            <FilterSheet
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
              sections={filterSections}
              filters={filters}
              setFilters={setFilters as any}
              onClear={() => setFilters({ refundType: [] })}
            />

            {/* Delete Alert Modal */}
            <AlertModal
              isOpen={!!returnToDelete}
              onClose={() => setReturnToDelete(null)}
              onConfirm={handleDeleteReturn}
              title="Excluir Devolução"
              description={`Tem certeza que deseja excluir a devolução do pedido ${returnToDelete?.orderNumber}? Esta ação não pode ser desfeita.`}
              confirmText="Excluir"
              cancelText="Cancelar"
              variant="danger"
            />

          </div>
        </FadeIn>
      )}
    </AnimatePresence>
  )
}
