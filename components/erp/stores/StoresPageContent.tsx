"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { listStoresAction, deleteStoreAction } from "@/app/actions/erp/stores"
import { useStore } from "@/lib/store-context"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { useMediaQuery } from "@/components/erp/hooks"
import { StoreModal } from "./StoreModal"
import StoreGridCard, { type StoreRow } from "./StoreGridCard"
import StoreListRow from "./StoreListRow"

import {
  Button,
  Input,
  IconPlaceholder,
  AlertModal,
  Pagination,
  Tabs,
  TabsList,
  TabsTrigger,
  TabCountBadge,
  Checkbox,
  SelectionBanner,
} from "@/components/reusable"

import {
  PlusIcon,
  SearchIcon,
  ListIcon,
  GridIcon,
  StarIcon,
  TrashIcon,
  ArrowUpDownIcon,
} from "@/lib/icons"

import { FadeIn } from "@/components/animations/FadeIn"

interface StoresPageContentProps {
  partnerId: string
  planGate?: {
    requiredPlanSlug: "escalar"
    message: string
  }
}

type SortKey = "name" | "address" | "contact" | "status"
type SortDirection = "asc" | "desc"

interface ColumnDef {
  id: string
  label: string
  align: "left" | "center" | "right"
  width: string
}

// --- CONFIGURAÇÃO DE COLUNAS (Exact ERP List Pattern) ---
const COLUMNS: ColumnDef[] = [
  { id: "name", label: "Loja", align: "left", width: "280px" },
  { id: "address", label: "Endereço", align: "left", width: "280px" },
  { id: "contact", label: "Contato", align: "left", width: "160px" },
  { id: "status", label: "Status", align: "center", width: "110px" },
  { id: "actions", label: "Ações", align: "center", width: "150px" },
]

export function StoresPageContent({ partnerId, planGate }: StoresPageContentProps) {
  const isMobileOrTablet = useMediaQuery("(max-width: 1023px)")
  const { planSlug } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()
  const { selectStore, selectedStore, refreshStores } = useStore()

  const isEscalar = hasMinimumPlan(planSlug, "escalar")

  const [stores, setStores] = useState<StoreRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "active" | "inactive">("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">(isMobileOrTablet ? "grid" : "list")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)

  // Scroll shadow state (Exact ERP List Pattern)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState({ left: false, right: false })

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

  const handleScroll = useCallback(() => {
    checkScroll()
  }, [checkScroll])

  useEffect(() => {
    checkScroll()
    window.addEventListener("resize", checkScroll)
    return () => {
      window.removeEventListener("resize", checkScroll)
    }
  }, [checkScroll, viewMode])

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<StoreRow | null>(null)
  const [deletingStore, setDeletingStore] = useState<StoreRow | null>(null)
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const itemsPerPage = 8

  const loadStores = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await listStoresAction(partnerId)
      setStores((data || []) as StoreRow[])
    } catch (err) {
      console.error("Error loading stores:", err)
    } finally {
      setIsLoading(false)
    }
  }, [partnerId])

  useEffect(() => {
    if (isEscalar) {
      loadStores()
    } else {
      setIsLoading(false)
    }
  }, [loadStores, isEscalar])

  const handleOpenCreate = () => {
    if (!isEscalar) {
      openPlanUpgrade("escalar")
      return
    }
    setEditingStore(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (store: StoreRow) => {
    if (!isEscalar) {
      openPlanUpgrade("escalar")
      return
    }
    setEditingStore(store)
    setIsModalOpen(true)
  }

  const handleOpenDelete = (store: StoreRow) => {
    if (!isEscalar) {
      openPlanUpgrade("escalar")
      return
    }
    setDeletingStore(store)
    setIsDeleteAlertOpen(true)
  }

  const confirmDelete = async () => {
    if (!deletingStore) return
    setIsDeleting(true)
    try {
      const res = await deleteStoreAction(deletingStore.id, partnerId)
      if (res.success) {
        setIsDeleteAlertOpen(false)
        setDeletingStore(null)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(deletingStore.id)
          return next
        })
        await loadStores()
        await refreshStores()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsDeleting(false)
    }
  }

  // Filter & Search
  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      const term = search.toLowerCase().trim()
      const matchesSearch =
        !term ||
        s.name.toLowerCase().includes(term) ||
        (s.city && s.city.toLowerCase().includes(term)) ||
        (s.state && s.state.toLowerCase().includes(term)) ||
        (s.street && s.street.toLowerCase().includes(term)) ||
        (s.phone && s.phone.includes(term))

      const matchesStatus =
        activeTab === "all" ||
        (activeTab === "active" && s.is_active) ||
        (activeTab === "inactive" && !s.is_active)

      return matchesSearch && matchesStatus
    })
  }, [stores, search, activeTab])

  const sortedStores = useMemo(() => {
    if (!sortConfig) return filteredStores

    const { key, direction } = sortConfig

    return [...filteredStores].sort((a, b) => {
      let aVal: any
      let bVal: any

      switch (key) {
        case "name":
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case "address":
          aVal = `${a.street || ""} ${a.city || ""} ${a.state || ""}`.toLowerCase()
          bVal = `${b.street || ""} ${b.city || ""} ${b.state || ""}`.toLowerCase()
          break
        case "contact":
          aVal = (a.phone || a.whatsapp_phone || "").toLowerCase()
          bVal = (b.phone || b.whatsapp_phone || "").toLowerCase()
          break
        case "status":
          aVal = a.is_active ? 1 : 0
          bVal = b.is_active ? 1 : 0
          break
      }

      if (aVal === bVal) return 0
      const comparison = aVal < bVal ? -1 : 1
      return direction === "asc" ? comparison : -comparison
    })
  }, [filteredStores, sortConfig])

  const totalPages = Math.ceil(sortedStores.length / itemsPerPage)
  const paginatedStores = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return sortedStores.slice(start, start + itemsPerPage)
  }, [sortedStores, currentPage, itemsPerPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, activeTab])

  const tabCounts = useMemo(() => {
    const all = stores.length
    const active = stores.filter((s) => s.is_active).length
    const inactive = stores.filter((s) => !s.is_active).length
    return { all, active, inactive }
  }, [stores])

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(sortedStores.map((s) => s.id)))
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  // --- PLAN GATE BANNER (IF NOT ESCALAR) ---
  if (!isEscalar || planGate) {
    return (
      <FadeIn className="flex flex-col items-center justify-center min-h-[500px] text-center p-8 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border shadow-sm my-4">
        <div className="w-20 h-20 rounded-full bg-brand-primary/10 flex items-center justify-center mb-6">
          <StarIcon className="w-10 h-10 text-brand-primary animate-bounce" />
        </div>
        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-3">
          Recurso Exclusivo do Plano Escalar
        </h2>
        <p className="text-base text-brand-inactive-text max-w-md mb-6 leading-relaxed">
          {planGate?.message || "O gerenciamento de múltiplas lojas e filiais permite expandir sua operação com relatórios e controle centralizado. Faça o upgrade para o plano Escalar para liberar este recurso."}
        </p>
        <Button
          onClick={() => openPlanUpgrade("escalar")}
          className="bg-brand-primary text-white text-base px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-brand-primary/20 hover:scale-105 transition-transform"
        >
          Conhecer o Plano Escalar
        </Button>
      </FadeIn>
    )
  }

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
        .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        {/* HEADER TITLE, SUBTITLE & ACTION BUTTON (Exact ERP Page Pattern) */}
        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center gap-3">
              <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                Lojas e Filiais
              </h1>
            </div>
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
              Gerencie suas lojas, filiais e unidades operacionais.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleOpenCreate}
              leftIcon={<PlusIcon size={18} />}
            >
              Nova Loja
            </Button>
          </div>
        </div>

        {/* TABS (Exact ERP Page Controls Pattern) */}
        <div className="mb-6 px-4 md:px-8">
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "all" | "active" | "inactive")}>
            <TabsList className="px-0">
              <TabsTrigger value="all" badge={<TabCountBadge count={tabCounts.all} variant="gray" />}>
                Todas
              </TabsTrigger>
              <TabsTrigger value="active" badge={<TabCountBadge count={tabCounts.active} variant="green" />}>
                Ativas
              </TabsTrigger>
              <TabsTrigger value="inactive" badge={<TabCountBadge count={tabCounts.inactive} variant="red" />}>
                Inativas
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* CONTROLS BAR (Search & View Mode) */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
          {/* Mobile Controls */}
          <div className="md:hidden flex items-center gap-2 w-full">
            <div className="flex-1 min-w-0">
              <Input
                name="search"
                placeholder="Buscar por nome, cidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[42px] w-full"
                variant="full-rounded"
                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                label=""
              />
            </div>
            <Button onClick={handleOpenCreate} className="w-[42px] h-[42px] p-0 flex items-center justify-center" leftIcon={<PlusIcon size={18} />} />
          </div>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center w-full gap-4 justify-between">
            <div className="w-80">
              <Input
                name="search"
                placeholder="Buscar por nome, cidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[42px]"
                variant="full-rounded"
                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                label=""
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
              <button
                onClick={() => setViewMode("list")}
                className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
              >
                <ListIcon className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
              >
                <GridIcon className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        </div>

        {/* SELECTION BANNER */}
        {selectedIds.size > 0 && (
          <div className="px-4 md:px-8 mb-4">
            <SelectionBanner
              selectedCount={selectedIds.size}
              totalCount={sortedStores.length}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
            />
          </div>
        )}

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-6 px-4 md:px-8">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-brand-gray/30 dark:bg-dark-border animate-pulse" />
              ))}
            </div>
          ) : filteredStores.length === 0 ? (
            <IconPlaceholder
              placeholderType="image"
              imageSrc={search ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/Estoque.png"}
              imageAlt="Sem lojas"
              title={search ? "Nenhuma loja encontrada" : "Você ainda não possui filiais cadastradas"}
              subtitle={search ? "Tente ajustar seus termos de busca." : "Cadastre novas filiais para expandir seu negócio no ERP Dudit."}
              itemButton={
                !search
                  ? {
                    text: "Criar Nova Loja",
                    action: handleOpenCreate,
                  }
                  : {
                    text: "Limpar busca",
                    action: () => setSearch(""),
                    variant: "outline",
                  }
              }
            />
          ) : viewMode === "grid" || isMobileOrTablet ? (
            /* GRID VIEW CARDS (Exact Product/Customer Grid Pattern) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedStores.map((store) => (
                <StoreGridCard
                  key={store.id}
                  store={store}
                  selected={selectedIds.has(store.id)}
                  isCurrentStore={selectedStore?.id === store.id}
                  onSelect={() => handleToggleSelect(store.id)}
                  onSwitchStore={() => selectStore(store.id)}
                  onEdit={() => handleOpenEdit(store)}
                  onDelete={() => handleOpenDelete(store)}
                />
              ))}
            </div>
          ) : (
            /* LIST VIEW TABLE (Exact Product/Customer List Row Pattern) */
            <div className="w-full overflow-hidden rounded-xl relative">
              <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
              <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

              <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={handleScroll}>
                <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                  <thead>
                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                      <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                        <div className="flex items-center">
                          <Checkbox
                            checked={selectedIds.size === paginatedStores.length && paginatedStores.length > 0}
                            onChange={(checked) => {
                              if (checked) {
                                setSelectedIds(new Set([...selectedIds, ...paginatedStores.map((x) => x.id)]))
                              } else {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev)
                                  paginatedStores.forEach((x) => next.delete(x.id))
                                  return next
                                })
                              }
                            }}
                            className="bg-white dark:bg-dark-background"
                          />
                        </div>
                      </th>
                      {COLUMNS.map((col, idx) => {
                        const isSortable = col.id !== "actions"
                        const isSorted = sortConfig?.key === col.id
                        const isLast = idx === COLUMNS.length - 1
                        return (
                          <th
                            key={col.id}
                            className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""} ${isLast ? "rounded-r-lg" : ""}`}
                            style={{ width: col.width }}
                            onClick={() => {
                              if (!isSortable) return
                              setSortConfig((prev) => ({
                                key: col.id as SortKey,
                                direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc",
                              }))
                            }}
                          >
                            <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                              <span>{col.label}</span>
                              {isSortable && (
                                <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                  <ArrowUpDownIcon
                                    size={14}
                                    className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && sortConfig.direction === "desc" ? "rotate-180" : ""}`}
                                  />
                                </div>
                              )}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedStores.map((store) => (
                      <StoreListRow
                        key={store.id}
                        store={store}
                        columns={COLUMNS}
                        selected={selectedIds.has(store.id)}
                        isCurrentStore={selectedStore?.id === store.id}
                        onSelect={handleToggleSelect}
                        onSwitchStore={() => selectStore(store.id)}
                        onEdit={() => handleOpenEdit(store)}
                        onDelete={() => handleOpenDelete(store)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PAGINATION (Exact ERP List Pattern) */}
          {sortedStores.length > 0 && (
            <div className="mt-6 flex justify-center">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>

        {/* STORE CREATE / EDIT MODAL */}
        <StoreModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          partnerId={partnerId}
          store={editingStore}
          onSaved={async () => {
            await loadStores()
            await refreshStores()
          }}
        />

        {/* DELETE CONFIRMATION ALERT MODAL */}
        <AlertModal
          isOpen={isDeleteAlertOpen}
          onClose={() => setIsDeleteAlertOpen(false)}
          onConfirm={confirmDelete}
          title="Excluir Loja"
          message={`Tem certeza que deseja excluir a loja "${deletingStore?.name}"? Esta ação manterá os registros históricos vinculados.`}
          confirmText={isDeleting ? "Excluindo..." : "Sim, Excluir"}
          cancelText="Cancelar"
          variant="danger"
        />
      </div>
    </FadeIn>
  )
}
