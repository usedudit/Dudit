"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button, DefaultModal, Input, FormTextarea, FormSection } from "@/components/reusable"
import { ChevronLeftIcon, EditIcon, TrashIcon } from "@/lib/icons"
import { ItemCard } from "@/components/marketplace/shared-components"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { useSupabase } from "@/providers/supabase-provider"
import { useToast } from "@/hooks/use-toast"

interface CollectionDetailProps {
  collection: any
}

export function CollectionDetailPage({ collection }: CollectionDetailProps) {
  const router = useRouter()
  const { user } = useSupabase()
  const { toast } = useToast()
  const [items, setItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editName, setEditName] = useState(collection.name || "")
  const [editDescription, setEditDescription] = useState(collection.description || "")
  const [editError, setEditError] = useState<string | null>(null)
  const [isEditPending, startEditTransition] = useTransition()

  // Delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeletePending, startDeleteTransition] = useTransition()

  const authorName = collection.author?.full_name || "Usuário"
  const isOwner = !!(user && collection.author_id === user.id)

  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const { getCollectionItems } = await import("@/app/actions/marketplace/collections")
        const result = await getCollectionItems(collection.id)
        setItems(result.items || [])
      } catch (err: any) {
        setError(err.message || "Erro ao carregar itens")
      } finally {
        setIsLoading(false)
      }
    }
    loadItems()
  }, [collection.id])

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push("/colecoes")
    }
  }

  const handleEdit = () => {
    setEditError(null)
    if (!editName.trim() || editName.trim().length < 2) {
      setEditError("O nome da coleção deve ter pelo menos 2 caracteres.")
      return
    }

    startEditTransition(async () => {
      try {
        const { updateCollection } = await import("@/app/actions/marketplace/collections")
        const result = await updateCollection(collection.id, editName.trim(), editDescription.trim() || undefined)
        if (result.success) {
          toast({ title: "Coleção atualizada!" })
          setIsEditModalOpen(false)
          router.refresh()
        } else if (!result.success) {
          setEditError(result.error)
        }
      } catch (err: any) {
        setEditError(err.message || "Erro ao atualizar coleção.")
      }
    })
  }

  const handleDelete = () => {
    startDeleteTransition(async () => {
      try {
        const { deleteCollection } = await import("@/app/actions/marketplace/collections")
        const result = await deleteCollection(collection.id)
        if (result.success) {
          toast({ title: "Coleção excluída!" })
          router.push("/colecoes")
        } else if (!result.success) {
          toast({ title: "Erro", description: result.error, variant: "destructive" })
        }
      } catch (err: any) {
        toast({ title: "Erro", description: err.message || "Erro ao excluir coleção", variant: "destructive" })
      }
    })
  }

  return (
    <>
      <MarketplaceHeader simpleTitle={collection.name} />
      <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col">
        <div className="container mx-auto px-4 max-w-[1400px] w-full mt-12 lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
          
          {/* Back button + Actions */}
          <div className="flex mb-6 items-center justify-between animate-fade-in">
            <Button
              variant="filled"
              onClick={handleBack}
              className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
            >
              <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
            </Button>

            {isOwner && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditName(collection.name || "")
                    setEditDescription(collection.description || "")
                    setEditError(null)
                    setIsEditModalOpen(true)
                  }}
                  className="flex items-center gap-1.5"
                >
                  <EditIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Editar</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="flex items-center gap-1.5 text-red-500 border-red-200 hover:bg-red-50"
                >
                  <TrashIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Excluir</span>
                </Button>
              </div>
            )}
          </div>

          {/* Collection Header */}
          <div className="mb-8 animate-fade-in">
            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
              {collection.name}
            </h1>

            <div className="flex items-center gap-2 mt-3 text-sm text-brand-inactive-text">
              <UserProfileImage
                fullName={authorName}
                imageUrl={collection.author?.avatar_url || null}
                className="w-6 h-6 border border-brand-border shrink-0 bg-gray-50"
              />
              <span className="font-medium text-brand-dark dark:text-dark-heading">{authorName}</span>
            </div>

            <div className="flex items-center gap-3 mt-2 text-sm text-brand-inactive-text">
              <span>{collection.items_count} {collection.items_count === 1 ? "item" : "itens"}</span>
              <span>&bull;</span>
              <span>{collection.views_count} {collection.views_count === 1 ? "visualização" : "visualizações"}</span>
            </div>
          </div>

          {/* Description Section */}
          {collection.description && (
            <div className="mb-8 animate-fade-in">
              <FormSection title="Descrição">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap leading-relaxed">
                  {collection.description}
                </p>
              </FormSection>
            </div>
          )}

          {/* Items Section */}
          <FormSection title={`Itens (${isLoading ? "..." : items.length})`}>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <Card className="p-12 text-center">
                <p className="text-red-500">{error}</p>
              </Card>
            ) : items.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-brand-inactive-text">Esta coleção está vazia</p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {items.map((item: any) => (
                  <ItemCard key={`${item.itemType}-${item.id}`} product={item} className="w-full" />
                ))}
              </div>
            )}
          </FormSection>
        </div>
      </div>
      <MarketplaceFooter />

      {/* Edit Modal */}
      <DefaultModal
        isOpen={isEditModalOpen}
        onClose={() => {
          if (!isEditPending) {
            setIsEditModalOpen(false)
            setEditError(null)
          }
        }}
        title="Editar Coleção"
        maxWidth="md"
      >
        <div className="flex flex-col gap-4 p-4">
          <Input
            label="Nome da Coleção"
            name="edit-name"
            placeholder="Ex: Minha lista de desejos"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={isEditPending}
            required
            maxLength={50}
          />
          <FormTextarea
            label="Descrição (Opcional)"
            name="edit-description"
            placeholder="Ex: Produtos que pretendo comprar no próximo mês"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            disabled={isEditPending}
            maxLength={500}
          />
          {editError && <p className="text-sm text-red-500 font-medium">{editError}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false)
                setEditError(null)
              }}
              disabled={isEditPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleEdit} isLoading={isEditPending}>
              Salvar
            </Button>
          </div>
        </div>
      </DefaultModal>

      {/* Delete Confirmation Modal */}
      <DefaultModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeletePending) setIsDeleteModalOpen(false)
        }}
        title="Excluir Coleção"
        maxWidth="sm"
      >
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-brand-inactive-text">
            Tem certeza que deseja excluir a coleção <strong className="text-brand-dark">{collection.name}</strong>? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeletePending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              isLoading={isDeletePending}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Excluir
            </Button>
          </div>
        </div>
      </DefaultModal>
    </>
  )
}
