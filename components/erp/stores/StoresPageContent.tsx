"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
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
} from "@/lib/icons"

import { FadeIn } from "@/components/animations/FadeIn"

interface StoresPageContentProps {
  partnerId: string
  planGate?: {
    requiredPlanSlug: "escalar"
    message: string
  }
}

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
        (s.state && s.state.toLowerCase().includes(term))

      const matchesStatus =
        activeTab === "all" ||
        (activeTab === "active" && s.is_active) ||
        (activeTab === "inactive" && !s.is_active)

      return matchesSearch && matchesStatus
    })
  }, [stores, search, activeTab])

  const totalPages = Math.ceil(filteredStores.length / itemsPerPage)
  const paginatedStores = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredStores.slice(start, start + itemsPerPage)
  }, [filteredStores, currentPage, itemsPerPage])

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
    setSelectedIds(new Set(filteredStores.map((s) => s.id)))
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

  // Source Store reference for inheritance
  const sourceStore = stores.find((s) => s.is_headquarters) || stores[0] || null
  const isAllSelected = filteredStores.length > 0 && selectedIds.size === filteredStores.length

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
              totalCount={filteredStores.length}
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
            <div className="overflow-x-auto rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface text-xs font-bold text-brand-inactive-text uppercase">
                    <th className="py-3.5 pl-6 pr-0 w-14">
                      <Checkbox
                        checked={isAllSelected}
                        onChange={isAllSelected ? handleClearSelection : handleSelectAll}
                      />
                    </th>
                    <th className="py-3.5 px-2">Loja</th>
                    <th className="py-3.5 px-2">Endereço</th>
                    <th className="py-3.5 px-2">Contato</th>
                    <th className="py-3.5 px-2 text-center">Status</th>
                    <th className="py-3.5 px-2 text-right pr-6">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border dark:divide-dark-border text-sm">
                  {paginatedStores.map((store) => (
                    <StoreListRow
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
                </tbody>
              </table>
            </div>
          )}

          {/* PAGINATION */}
          {totalPages > 1 && (
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
          sourceStore={sourceStore}
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
