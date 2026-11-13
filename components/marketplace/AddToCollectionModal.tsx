"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, DefaultModal, IconPlaceholder, ThreeDotsLoader, ListItem } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import { useSupabase } from "@/providers/supabase-provider"
import { getUserCollections, addItemToCollection, getItemCollectionIds, removeItemFromCollection } from "@/app/actions/marketplace/collections"
import { CollectionsIcon, TrashIcon } from "@/lib/icons"

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
    const [itemCollectionIds, setItemCollectionIds] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [actionId, setActionId] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen || !user?.id) return
        setIsLoading(true)
        Promise.all([
            getUserCollections(user.id),
            getItemCollectionIds(user.id, itemType, itemId),
        ])
            .then(([colRes, ids]) => {
                setCollections(colRes.items as Collection[])
                setItemCollectionIds(ids)
            })
            .catch(() => { })
            .finally(() => setIsLoading(false))
    }, [isOpen, user?.id, itemType, itemId])

    const handleAdd = async (collectionId: string) => {
        setActionId(collectionId)
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
            setActionId(null)
        }
    }

    const handleRemove = async (collectionId: string) => {
        setActionId(collectionId)
        try {
            const result = await removeItemFromCollection(collectionId, itemId)
            if (result.success) {
                toast({ title: "Removido da coleção!" })
                onClose()
                router.refresh()
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
        } catch (err: any) {
            toast({ title: "Erro", description: err.message || "Erro ao remover da coleção", variant: "destructive" })
        } finally {
            setActionId(null)
        }
    }

    const isInCollection = (collectionId: string) => itemCollectionIds.includes(collectionId)

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
                        <ThreeDotsLoader />
                    </div>
                ) : collections.length === 0 ? (
                    <div className="text-center py-8 text-brand-inactive-text dark:text-dark-body">
                        <IconPlaceholder
                            icon={CollectionsIcon}
                            title="Nenhuma coleção encontrada"
                            subtitle="Você ainda não tem nenhuma coleção. Crie uma para organizar seus produtos e serviços."
                            itemButton={{
                                text: "Criar coleção",
                                action: "/colecoes"
                            }}
                        />
                    </div>
                ) : (
                    collections.map((collection) => {
                        const alreadyIn = isInCollection(collection.id)
                        const isLoading = actionId === collection.id
                        return (
                            <ListItem
                                key={collection.id}
                                title={collection.name}
                                description={`${collection.items_count} itens`}
                                onClick={!isLoading ? () => alreadyIn ? handleRemove(collection.id) : handleAdd(collection.id) : undefined}
                                disabled={isLoading}
                                right={
                                    isLoading ? (
                                        <div className="w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                                    ) : alreadyIn ? (
                                        <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleRemove(collection.id); }}>
                                            <TrashIcon className="w-3.5 h-3.5 mr-1" />
                                            Remover
                                        </Button>
                                    ) : (
                                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleAdd(collection.id); }}>Adicionar</Button>
                                    )
                                }
                            />
                        )
                    })
                )}
            </div>
        </DefaultModal>
    )
}