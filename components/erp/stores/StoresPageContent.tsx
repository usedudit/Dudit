"use client"

import { useState, useEffect, useCallback } from "react"
import { listStoresAction, createStoreWithInheritanceAction, updateStoreAction, deleteStoreAction } from "@/app/actions/erp/stores"
import { useStore } from "@/lib/store-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { InfoCard } from "@/components/reusable"
import { PlusIcon, EditIcon, TrashIcon, StoreIcon } from "@/lib/icons"

interface StoreRow {
  id: string
  name: string
  slug: string | null
  city: string | null
  state: string | null
  is_headquarters: boolean
  is_active: boolean
  phone: string | null
  created_at: string
}

export function StoresPageContent({ partnerId }: { partnerId: string }) {
  const [stores, setStores] = useState<StoreRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<StoreRow | null>(null)
  const [deletingStore, setDeletingStore] = useState<StoreRow | null>(null)
  const [storeName, setStoreName] = useState("")
  const [storeSlug, setStoreSlug] = useState("")
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [showInheritance, setShowInheritance] = useState(false)
  const [inheritOptions, setInheritOptions] = useState({
    inheritProducts: false,
    inheritServices: false,
    inheritCategories: false,
    inheritPaymentMethods: false,
    inheritFinancialSettings: false,
    inheritLogistics: false,
    inheritOpeningHours: false,
    inheritShowcase: false,
  })
  const { selectStore, stores: contextStores } = useStore()

  const loadStores = useCallback(async () => {
    try {
      const data = await listStoresAction(partnerId)
      setStores(data as StoreRow[])
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [partnerId])

  useEffect(() => {
    loadStores()
  }, [loadStores])

  const sourceStore = contextStores?.find((s: any) => s.is_headquarters) || contextStores?.[0]

  const handleCreate = async () => {
    if (!storeName.trim()) return
    setIsSaving(true)
    setError("")

    if (showInheritance && sourceStore) {
      const result = await createStoreWithInheritanceAction({
        partnerId,
        name: storeName.trim(),
        sourceStoreId: sourceStore.id,
        ...inheritOptions,
      })

      if (result.success) {
        setIsCreateOpen(false)
        setStoreName("")
        setShowInheritance(false)
        setInheritOptions({
          inheritProducts: true,
          inheritServices: true,
          inheritCategories: true,
          inheritPaymentMethods: true,
          inheritFinancialSettings: true,
          inheritLogistics: true,
          inheritOpeningHours: true,
          inheritShowcase: true,
        })
        await loadStores()
      } else {
        setError(result.error)
      }
    } else {
      const { createStoreAction } = await import("@/app/actions/erp/stores")
      const result = await createStoreAction({
        partnerId,
        name: storeName.trim(),
      })

      if (result.success) {
        setIsCreateOpen(false)
        setStoreName("")
        await loadStores()
      } else {
        setError(result.error)
      }
    }
    setIsSaving(false)
  }

  const handleEdit = async () => {
    if (!editingStore || !storeName.trim()) return
    setIsSaving(true)
    setError("")

    const result = await updateStoreAction({
      storeId: editingStore.id,
      partnerId,
      name: storeName,
      slug: storeSlug || undefined,
    })

    if (result.success) {
      setIsEditOpen(false)
      setEditingStore(null)
      await loadStores()
    } else {
      setError(result.error)
    }
    setIsSaving(false)
  }

  const handleDelete = async () => {
    if (!deletingStore) return
    setIsSaving(true)
    setError("")

    const result = await deleteStoreAction(deletingStore.id, partnerId)

    if (result.success) {
      setIsDeleteOpen(false)
      setDeletingStore(null)
      await loadStores()
    } else {
      setError(result.error)
    }
    setIsSaving(false)
  }

  if (isLoading) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="h-20 animate-pulse rounded-lg bg-brand-gray/40" />
    ))}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-inactive-text">
          {stores.length} {stores.length === 1 ? "loja cadastrada" : "lojas cadastradas"}
        </p>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-brand-primary">
          <PlusIcon className="w-4 h-4 mr-2" />
          Nova Loja
        </Button>
      </div>

      <div className="grid gap-4">
        {stores.map((store) => (
          <div
            key={store.id}
            className="rounded-lg border border-brand-border bg-white p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                <StoreIcon className="w-5 h-5 text-brand-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{store.name}</span>
                  {store.is_headquarters && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Matriz
                    </span>
                  )}
                  {!store.is_active && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      Inativa
                    </span>
                  )}
                </div>
                <p className="text-sm text-brand-inactive-text">
                  {store.city && store.state ? `${store.city}, ${store.state}` : "Sem endereço"}
                  {store.slug && ` • /${store.slug}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectStore(store.id)}
              >
                Acessar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingStore(store)
                  setStoreName(store.name)
                  setStoreSlug(store.slug || "")
                  setIsEditOpen(true)
                }}
              >
                <EditIcon className="w-4 h-4" />
              </Button>
              {!store.is_headquarters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDeletingStore(store)
                    setIsDeleteOpen(true)
                  }}
                >
                  <TrashIcon className="w-4 h-4 text-red-500" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Loja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome da Loja</label>
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex: Filial Centro"
              />
              {storeName.trim() && (
                <p className="text-xs text-brand-inactive-text mt-1">
                  Slug: /{storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}
                </p>
              )}
            </div>

            {sourceStore && (
              <div className="pt-2 border-t border-brand-border">
                <label className="flex items-center gap-2 text-sm font-medium mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInheritance}
                    onChange={(e) => setShowInheritance(e.target.checked)}
                    className="rounded border-brand-border"
                  />
                  Copiar configurações da loja atual
                </label>

                {showInheritance && (
                  <div className="space-y-2 ml-1">
                    <p className="text-xs text-brand-inactive-text mb-2">
                      Origem: <strong>{sourceStore.name}</strong>
                    </p>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setInheritOptions({
                          inheritProducts: true, inheritServices: true, inheritCategories: true,
                          inheritPaymentMethods: true, inheritFinancialSettings: true,
                          inheritLogistics: true, inheritOpeningHours: true, inheritShowcase: true,
                        })}
                        className="text-xs text-brand-primary hover:underline"
                      >
                        Selecionar todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setInheritOptions({
                          inheritProducts: false, inheritServices: false, inheritCategories: false,
                          inheritPaymentMethods: false, inheritFinancialSettings: false,
                          inheritLogistics: false, inheritOpeningHours: false, inheritShowcase: false,
                        })}
                        className="text-xs text-brand-inactive-text hover:underline"
                      >
                        Limpar todos
                      </button>
                    </div>
                    {[
                      { key: "inheritProducts", label: "Produtos" },
                      { key: "inheritServices", label: "Serviços" },
                      { key: "inheritCategories", label: "Categorias" },
                      { key: "inheritPaymentMethods", label: "Formas de pagamento" },
                      { key: "inheritFinancialSettings", label: "Configurações financeiras" },
                      { key: "inheritLogistics", label: "Configurações de logística" },
                      { key: "inheritOpeningHours", label: "Horários" },
                      { key: "inheritShowcase", label: "Vitrine" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(inheritOptions as any)[key]}
                          onChange={() => setInheritOptions((prev) => ({ ...prev, [key]: !(prev as any)[key] }))}
                          className="rounded border-brand-border"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <InfoCard message={error} color="red" />}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsCreateOpen(false)} variant="outline">Cancelar</Button>
            <Button onClick={handleCreate} disabled={isSaving || !storeName.trim()} className="bg-brand-primary">
              {isSaving ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Loja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome da Loja</label>
              <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Slug</label>
              <Input value={storeSlug} onChange={(e) => setStoreSlug(e.target.value)} />
            </div>
            {error && <InfoCard message={error} color="red" />}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsEditOpen(false)} variant="outline">Cancelar</Button>
            <Button onClick={handleEdit} disabled={isSaving || !storeName.trim()} className="bg-brand-primary">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Loja</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-brand-inactive-text">
            Tem certeza que deseja excluir <strong>{deletingStore?.name}</strong>?
            Os registros vinculados serão mantidos (store_id será null).
          </p>
          {error && <InfoCard message={error} color="red" />}
          <DialogFooter>
            <Button onClick={() => setIsDeleteOpen(false)} variant="outline">Cancelar</Button>
            <Button onClick={handleDelete} disabled={isSaving} variant="destructive">
              {isSaving ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
