"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, DefaultModal, Input, FormTextarea, FormSection, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import { ChevronLeftIcon, EditIcon, TrashIcon, ChevronDownIcon, CollectionsIcon } from "@/lib/icons"
import { ItemCard } from "@/components/marketplace/shared-components"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { useSupabase } from "@/providers/supabase-provider"
import { useToast } from "@/hooks/use-toast"
import { registerCollectionDetailMenu } from "@/lib/collection-detail-menu"

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
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

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

    useEffect(() => {
        registerCollectionDetailMenu({
            isOwner,
            onEdit: () => {
                setEditName(collection.name || "")
                setEditDescription(collection.description || "")
                setEditError(null)
                setIsEditModalOpen(true)
            },
            onDelete: () => setIsDeleteModalOpen(true),
        })
        return () => registerCollectionDetailMenu(null)
    }, [isOwner, collection.name, collection.description])

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
            <div className="min-h-screen bg-white dark:bg-dark-background pt-[40px] lg:pt-[110px] font-sans flex flex-col">
                <div className="container mx-auto px-4 max-w-[1400px] w-full mt-12 lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">

                    {/* Page Header */}
                    <div className="mb-6 animate-fade-in">
                        {/* Desktop: back button + title + subtitle + actions */}
                        <div className="hidden lg:flex items-center gap-4">
                            <Button
                                variant="filled"
                                onClick={handleBack}
                                className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
                            >
                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </Button>

                            <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading truncate">
                                        {collection.name}
                                    </h1>
                                    <div className="flex items-center gap-2 mt-1 text-sm text-brand-inactive-text dark:text-dark-body">
                                        <UserProfileImage
                                            fullName={authorName}
                                            imageUrl={collection.author?.avatar_url || null}
                                            className="w-6 h-6 border border-brand-border shrink-0 bg-gray-50 dark:bg-dark-border/30"
                                        />
                                        <span className="font-medium text-brand-dark dark:text-dark-heading whitespace-nowrap">{authorName}</span>
                                        <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                        <span className="whitespace-nowrap">{collection.items_count} {collection.items_count === 1 ? "item" : "itens"}</span>
                                        <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                        <span className="whitespace-nowrap">{collection.views_count} {collection.views_count === 1 ? "visualização" : "visualizações"}</span>
                                    </div>
                                </div>

                                {isOwner && (
                                    <div className="flex items-center gap-2 shrink-0">
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
                                            <span>Editar</span>
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => setIsDeleteModalOpen(true)}
                                            className="flex items-center gap-1.5 text-red-500 border-red-200 hover:bg-red-50"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                            <span>Excluir</span>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Mobile/tablet: creator info line (top bar already shows back + title) */}
                        <div className="lg:hidden flex items-center gap-2 text-sm text-brand-inactive-text dark:text-dark-body">
                            <UserProfileImage
                                fullName={authorName}
                                imageUrl={collection.author?.avatar_url || null}
                                className="w-6 h-6 border border-brand-border shrink-0 bg-gray-50 dark:bg-dark-border/30"
                            />
                            <span className="font-medium text-brand-dark dark:text-dark-heading truncate">{authorName}</span>
                            <span className="text-brand-inactive-text dark:text-dark-body">|</span>
                            <span className="whitespace-nowrap">{collection.items_count} {collection.items_count === 1 ? "item" : "itens"}</span>
                            <span className="text-brand-inactive-text dark:text-dark-body">|</span>
                            <span className="whitespace-nowrap">{collection.views_count} {collection.views_count === 1 ? "visualização" : "visualizações"}</span>
                        </div>
                    </div>

                    {/* Description Section */}
                    {collection.description && (
                        <div className="mb-8 animate-fade-in">
                            <FormSection title="Descrição">
                                <div className={`relative ${!isDescriptionExpanded ? "max-h-[150px] overflow-hidden" : ""}`}>
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap leading-relaxed">
                                        {collection.description}
                                    </p>
                                    {!isDescriptionExpanded && collection.description.length > 200 && (
                                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-gray-900 dark:to-transparent" />
                                    )}
                                </div>
                                {collection.description.length > 200 && (
                                    <button onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                        className="flex items-center gap-1 text-brand-green font-bold text-sm mt-3 hover:underline">
                                        {isDescriptionExpanded ? "Ver menos" : "Ver mais"}
                                        <ChevronDownIcon size={16} className={`transition-transform ${isDescriptionExpanded ? "rotate-180" : ""}`} />
                                    </button>
                                )}
                            </FormSection>
                        </div>
                    )}

                    {/* Items Section */}
                    <FormSection title={`Itens (${isLoading ? "..." : items.length})`}>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <ThreeDotsLoader />
                            </div>
                        ) : error ? (
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                                imageAlt="Erro"
                                title="Ops! Algo deu errado"
                                subtitle="Não foi possível carregar a coleção. Tente novamente mais tarde."
                            />
                        ) : items.length === 0 ? (
                            <IconPlaceholder
                                icon={CollectionsIcon}
                                title="Coleção vazia"
                                subtitle="Esta coleção está vazia. Tente adicionar itens a ela"
                            />
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
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Tem certeza que deseja excluir a coleção <strong className="text-brand-dark dark:text-dark-heading">{collection.name}</strong>? Esta ação não pode ser desfeita.
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
