"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { CollectionCard } from "@/components/marketplace/CollectionCard"
import { createCollection } from "@/app/actions/marketplace/collections"
import { Button, DefaultModal, Input, FormTextarea, IconPlaceholder } from "@/components/reusable"
import { PlusIcon } from "@/lib/icons"
import { getCollectionUrl } from "@/lib/utils/url-generator"

interface Collection {
    id: string
    short_id?: string | null
    name: string
    description?: string | null
    cover_url?: string | null
    banner_color?: string | null
    items_count: number
    views_count: number
    author?: { id: string; full_name?: string | null; avatar_url?: string | null } | null
    created_at: string
    author_id: string
}

interface UserCollectionsPageProps {
    collections: Collection[]
}

export function UserCollectionsPage({ collections: initialCollections }: UserCollectionsPageProps) {
    const router = useRouter()
    const [collections, setCollections] = useState(initialCollections)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const handleCreate = () => {
        setError(null)
        if (name.trim().length < 2) {
            setError("O nome da coleção deve ter pelo menos 2 caracteres.")
            return
        }


        startTransition(async () => {
            try {
                const result = await createCollection(name.trim(), description.trim() || undefined)
                if (result.success && result.data) {
                    setIsCreateModalOpen(false)
                    setName("")
                    setDescription("")
                    router.push(getCollectionUrl(result.data))
                } else if (!result.success) {
                    setError(result.error)
                }
            } catch (err: any) {
                setError(err.message || "Ocorreu um erro ao criar a coleção.")
            }
        })
    }

    return (
        <div className="min-h-screen bg-white dark:bg-dark-background pt-[40px] lg:pt-[110px] font-sans flex flex-col">
            <MarketplaceHeader simpleTitle="Minhas coleções" />

            <div className="container mx-auto px-4 max-w-[1300px] mt-12 lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
                <div className="hidden lg:block items-center mb-8">
                    {/* Header */}

                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                Minhas Coleções
                                {initialCollections.length > 0 && (
                                    <span className="text-brand-inactive-text dark:text-dark-body font-bold text-base lg:text-lg ml-2">
                                        ({initialCollections.length})
                                    </span>
                                )}
                            </h1>
                            <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">
                                Organize seus produtos e serviços favoritos em coleções personalizadas
                            </p>
                        </div>
                        {initialCollections.length > 0 && (
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                leftIcon={<PlusIcon size={18} />}
                                variant="default"
                                className="hidden sm:flex"
                            >
                                Nova Coleção
                            </Button>
                        )}
                    </div>

                    {/* Content */}
                    {initialCollections.length === 0 ? (
                        <div className="flex justify-center py-12">
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc="https://img.dudit.com.br/static/mascots/Favoritos.png"
                                imageAlt="Suas coleções estão vazias"
                                title="Suas coleções estão vazias"
                                subtitle="Crie coleções para organizar seus produtos e serviços favoritos!"
                                itemButton={{
                                    text: "Criar Coleção",
                                    action: () => setIsCreateModalOpen(true),
                                    variant: "default",
                                }}
                            />
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
                                {initialCollections.map((collection) => (
                                    <CollectionCard key={collection.id} collection={collection} className="w-full" />
                                ))}
                            </div>

                            {/* Mobile Sticky Button */}
                            <div className="sm:hidden fixed bottom-20 right-4 z-40">
                                <Button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    variant="default"
                                    className="w-12 h-12 rounded-full flex items-center justify-center p-0 shadow-lg"
                                >
                                    <PlusIcon size={24} />
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <MarketplaceFooter />

            {/* Create Modal */}
            <DefaultModal
                isOpen={isCreateModalOpen}
                onClose={() => {
                    if (!isPending) {
                        setIsCreateModalOpen(false)
                        setError(null)
                        setName("")
                        setDescription("")
                    }
                }}
                title="Criar Nova Coleção"
                maxWidth="md"
            >
                <div className="flex flex-col gap-4 p-4">
                    <Input
                        label="Nome da Coleção"
                        name="name"
                        placeholder="Ex: Minha lista de desejos"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={isPending}
                        required
                        maxLength={50}
                    />
                    <FormTextarea
                        label="Descrição (Opcional)"
                        name="description"
                        placeholder="Ex: Produtos que pretendo comprar no próximo mês"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={isPending}
                        maxLength={500}
                    />
                    {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
                    <div className="flex justify-end gap-2 mt-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsCreateModalOpen(false)
                                setError(null)
                                setName("")
                                setDescription("")
                            }}
                            disabled={isPending}
                        >
                            Cancelar
                        </Button>
                        <Button onClick={handleCreate} isLoading={isPending}>
                            Criar
                        </Button>
                    </div>
                </div>
            </DefaultModal>
        </div>
    )
}