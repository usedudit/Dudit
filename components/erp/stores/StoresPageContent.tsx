"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { listStoresAction, deleteStoreAction } from "@/app/actions/erp/stores"
import { useStore } from "@/lib/store-context"
import { usePermissions } from "@/lib/permission-context"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { useMediaQuery } from "@/components/erp/hooks"
import { StoreModal } from "./StoreModal"

import {
  Button,
  Input,
  IconPlaceholder,
  AlertModal,
  Pagination,
  Badge,
  Dropdown,
  DropdownItem,
} from "@/components/reusable"

import {
  PlusIcon,
  SearchIcon,
  EditIcon,
  TrashIcon,
  StoreIcon,
  MapPinIcon,
  PhoneIcon,
  CheckCircleIcon,
  BlockedIcon,
  ArrowUpDownIcon,
  StarIcon,
} from "@/lib/icons"

import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { FadeIn } from "@/components/animations/FadeIn"

interface StoreRow {
  id: string
  partner_id: string
  name: string
  slug: string | null
  description: string | null
  phone: string | null
  whatsapp_phone: string | null
  image_url: string | null
  logo_url: string | null
  zip_code: string | null
  street: string | null
  number: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  complement: string | null
  opening_hours: Record<string, unknown> | null
  is_headquarters: boolean
  is_active: boolean
  created_at: string
}

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
  const { selectStore, selectedStore, refreshStores, stores: contextStores } = useStore()

  const isEscalar = hasMinimumPlan(planSlug, "escalar")

  const [stores, setStores] = useState<StoreRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">(isMobileOrTablet ? "grid" : "list")
  const [currentPage, setCurrentPage] = useState(1)

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
        statusFilter === "all" ||
        (statusFilter === "active" && s.is_active) ||
        (statusFilter === "inactive" && !s.is_active)

      return matchesSearch && matchesStatus
    })
  }, [stores, search, statusFilter])

  const totalPages = Math.ceil(filteredStores.length / itemsPerPage)
  const paginatedStores = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredStores.slice(start, start + itemsPerPage)
  }, [filteredStores, currentPage, itemsPerPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter])

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

  // Matrix / Source Store reference
  const sourceStore = stores.find((s) => s.is_headquarters) || stores[0] || null

  return (
    <div className="space-y-6 pb-8">
      {/* HEADER CONTROLS BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search & Status Filters */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
            <input
              type="text"
              placeholder="Buscar por nome da loja, cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-inactive-text hover:text-brand-dark"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center p-1 rounded-xl bg-brand-gray/30 dark:bg-dark-surface border border-brand-border dark:border-dark-border">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${statusFilter === "all" ? "bg-white dark:bg-dark-border text-brand-dark dark:text-dark-heading shadow-xs" : "text-brand-inactive-text hover:text-brand-dark"}`}
            >
              Todas ({stores.length})
            </button>
            <button
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${statusFilter === "active" ? "bg-white dark:bg-dark-border text-brand-dark dark:text-dark-heading shadow-xs" : "text-brand-inactive-text hover:text-brand-dark"}`}
            >
              Ativas ({stores.filter((s) => s.is_active).length})
            </button>
            <button
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${statusFilter === "inactive" ? "bg-white dark:bg-dark-border text-brand-dark dark:text-dark-heading shadow-xs" : "text-brand-inactive-text hover:text-brand-dark"}`}
            >
              Inativas ({stores.filter((s) => !s.is_active).length})
            </button>
          </div>
        </div>

        {/* View Mode Toggle & Add Button */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center p-1 rounded-xl bg-brand-gray/30 dark:bg-dark-surface border border-brand-border dark:border-dark-border">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${viewMode === "grid" ? "bg-white dark:bg-dark-border text-brand-dark dark:text-dark-heading shadow-xs" : "text-brand-inactive-text"}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${viewMode === "list" ? "bg-white dark:bg-dark-border text-brand-dark dark:text-dark-heading shadow-xs" : "text-brand-inactive-text"}`}
            >
              Lista
            </button>
          </div>

          <Button
            onClick={handleOpenCreate}
            className="bg-brand-primary text-white text-sm font-bold shadow-md hover:scale-105 transition-transform flex items-center gap-2"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Nova Loja</span>
          </Button>
        </div>
      </div>

      {/* CONTENT: LOADING / EMPTY / GRID / LIST */}
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
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedStores.map((store) => {
            const logo = getR2ImageUrl(store.image_url)
            const isSelected = selectedStore?.id === store.id

            return (
              <FadeIn key={store.id}>
                <div className={`p-5 rounded-2xl bg-white dark:bg-dark-surface border transition-all flex flex-col justify-between h-full shadow-xs ${isSelected ? "border-brand-primary ring-2 ring-brand-primary/20" : "border-brand-border dark:border-dark-border hover:border-brand-primary/40"}`}>
                  <div className="space-y-4">
                    {/* Header: Logo + Title + Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-brand-primary/10 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                          {logo ? (
                            <img src={logo} alt={store.name} className="w-full h-full object-cover" />
                          ) : (
                            <StoreIcon className="w-6 h-6 text-brand-primary" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-brand-dark dark:text-dark-heading line-clamp-1 text-base">
                            {store.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {store.is_headquarters && (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                                Matriz
                              </span>
                            )}
                            {store.is_active ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                                Ativa
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">
                                Inativa
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Address & Contact Info */}
                    <div className="space-y-1.5 text-xs text-brand-inactive-text border-t border-brand-border dark:border-dark-border pt-3">
                      <div className="flex items-center gap-2">
                        <MapPinIcon className="w-3.5 h-3.5 shrink-0 text-brand-inactive-text" />
                        <span className="truncate">
                          {store.city && store.state
                            ? `${store.city}, ${store.state}`
                            : store.street
                              ? `${store.street}, ${store.number || ""}`
                              : "Sem endereço cadastrado"}
                        </span>
                      </div>
                      {(store.phone || store.whatsapp_phone) && (
                        <div className="flex items-center gap-2">
                          <PhoneIcon className="w-3.5 h-3.5 shrink-0 text-brand-inactive-text" />
                          <span>{store.whatsapp_phone || store.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-brand-border dark:border-dark-border">
                    <Button
                      variant={isSelected ? "outline" : "filled"}
                      size="sm"
                      onClick={() => selectStore(store.id)}
                      className={isSelected ? "border-brand-primary text-brand-primary" : "bg-brand-primary text-white"}
                    >
                      {isSelected ? "Loja Atual" : "Acessar Loja"}
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(store)}
                        className="p-2 text-brand-dark dark:text-dark-heading hover:bg-brand-gray/30"
                      >
                        <EditIcon className="w-4 h-4" />
                      </Button>
                      {!store.is_headquarters && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDelete(store)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </FadeIn>
            )
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="overflow-x-auto rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface text-xs font-bold text-brand-inactive-text uppercase">
                <th className="py-3.5 px-4">Loja</th>
                <th className="py-3.5 px-4">Endereço</th>
                <th className="py-3.5 px-4">Telefone</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border dark:divide-dark-border text-sm">
              {paginatedStores.map((store) => {
                const logo = getR2ImageUrl(store.image_url)
                const isSelected = selectedStore?.id === store.id

                return (
                  <tr key={store.id} className="hover:bg-brand-gray/10 dark:hover:bg-dark-border/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-brand-primary/10 border border-brand-border shrink-0 flex items-center justify-center">
                          {logo ? (
                            <img src={logo} alt={store.name} className="w-full h-full object-cover" />
                          ) : (
                            <StoreIcon className="w-5 h-5 text-brand-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-brand-dark dark:text-dark-heading line-clamp-1">
                            {store.name}
                          </p>
                          {store.is_headquarters && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                              Matriz
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-brand-inactive-text text-xs">
                      {store.city && store.state
                        ? `${store.city}, ${store.state}`
                        : "Sem endereço"}
                    </td>
                    <td className="py-3 px-4 text-brand-inactive-text text-xs">
                      {store.whatsapp_phone || store.phone || "-"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {store.is_active ? (
                        <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                          Ativa
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                          Inativa
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant={isSelected ? "outline" : "filled"}
                          size="sm"
                          onClick={() => selectStore(store.id)}
                          className={isSelected ? "border-brand-primary text-brand-primary text-xs" : "bg-brand-primary text-white text-xs"}
                        >
                          {isSelected ? "Atual" : "Acessar"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(store)}
                          className="p-1.5 text-brand-dark"
                        >
                          <EditIcon className="w-4 h-4" />
                        </Button>
                        {!store.is_headquarters && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDelete(store)}
                            className="p-1.5 text-red-500"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* PAGINATION */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

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
  )
}
