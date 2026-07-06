"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, DefaultModal } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import { useSupabase } from "@/providers/supabase-provider"
import { getUserCollections, addItemToCollection } from "@/app/actions/marketplace/collections"
import { PlusIcon } from "@/lib/icons"

interface Collection {
  id: string
  name: string
  items_count: number
  created_at: string
}

interface AddToCollectionModalProps {
  isOpen: boolean
  onClose: () => void
  itemType: "product" | "service"
  itemId: string
}

export function AddToCollectionModal({ isOpen, onClose, itemType, itemId }: AddToCollectionModalProps) {
  const { toast } = useToast()
  const router = useRouter()
  const { user } = useSupabase()
  const [collections, setCollections] = useState<Collection[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !user?.id) return
    setIsLoading(true)
    getUserCollections(user.id)
      .then(({ items }) => setCollections(items as Collection[]))
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [isOpen, user?.id])

  const handleAdd = async (collectionId: string) => {
    setAddingId(collectionId)
    try {
      const result = await addItemToCollection(collectionId, itemType, itemId)
      if (result.success) {
        toast({ title: "Adicionado à coleção!" })
        onClose()
        router.refresh()
      } else {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Erro ao adicionar à coleção", variant: "destructive" })
    } finally {
      setAddingId(null)
    }
  }

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title="Adicionar à Coleção"
      maxWidth="md"
    >
      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-8 text-brand-inactive-text">
            <p>Você ainda não tem nenhuma coleção.</p>
            <Button
              variant="default"
              className="mt-4"
              leftIcon={<PlusIcon size={16} />}
              onClick={() => {
                onClose()
                router.push("/minhas-colecoes")
              }}
            >
              Criar coleção
            </Button>
          </div>
        ) : (
          collections.map((collection) => (
            <button
              key={collection.id}
              onClick={() => handleAdd(collection.id)}
              disabled={addingId === collection.id}
              className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-dark-border hover:border-brand-green hover:bg-brand-green/5 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-brand-dark dark:text-dark-heading">{collection.name}</p>
                  <p className="text-xs text-brand-inactive-text">{collection.items_count} itens</p>
                </div>
                {addingId === collection.id ? (
                  <div className="w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Button variant="outline" size="sm">Adicionar</Button>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </DefaultModal>
  )
}