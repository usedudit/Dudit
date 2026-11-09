"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { CollectionCard } from "@/components/marketplace/CollectionCard"
import { createCollection } from "@/app/actions/marketplace/collections"
import { Button, DefaultModal, Input, FormTextarea, IconPlaceholder } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { PlusIcon } from "@/lib/icons"
import { getCollectionUrl } from "@/lib/utils/url-generator"

const COLLECTIONS_PER_PAGE = 20

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
    userProfile?: any
    cartCount?: number
}

export function UserCollectionsPage({
    collections: initialCollections,
    userProfile,
    cartCount,
}: UserCollectionsPageProps) {
    const router = useRouter()
    const [collections] = useState(initialCollections)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [currentPage, setCurrentPage] = useState(1)

    // Client-side pagination
    const totalPages = Math.max(1, Math.ceil(collections.length / COLLECTIONS_PER_PAGE))
    const paginatedCollections = useMemo(() => {
        const start = (currentPage - 1) * COLLECTIONS_PER_PAGE
        return collections.slice(start, start + COLLECTIONS_PER_PAGE)
    }, [collections, currentPage])

    const handlePageChange = (page: number) => {
        setCurrentPage(page)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

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
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
            <MarketplaceHeader simpleTitle="Minhas coleções" userProfile={userProfile} cartCount={cartCount} />

            <div className="flex-1 flex flex-col container mx-auto px-4 max-w-[1400px] w-full md:pt-10 pb-24 lg:pb-20 mt-[78px] lg:mt-[108px] relative">
                {/* Header (desktop) */}
                <div className="hidden lg:block mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                Minhas Coleções
                                {collections.length > 0 && (
                                    <span className="text-brand-inactive-text dark:text-dark-body font-bold text-base lg:text-lg ml-2">
                                        ({collections.length})
                                    </span>
                                )}
                            </h1>
                            <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">
                                Organize seus produtos e serviços favoritos em coleções personalizadas
                            </p>
                        </div>
                        {collections.length > 0 && (
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                leftIcon={<PlusIcon size={18} />}
                                variant="default"
                            >
                                Nova Coleção
                            </Button>
                        )}
                    </div>
                </div>

                {/* Content */}
                {collections.length === 0 ? (
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
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5" style={{ gridAutoRows: "min-content" }}>
                            {paginatedCollections.map((collection) => (
                                <CollectionCard key={collection.id} collection={collection} className="w-full" />
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="mt-8">
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={handlePageChange}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Tablet/Mobile Bottom Menu */}
            <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] flex items-center justify-center shadow-lg">
                <Button
                    onClick={() => setIsCreateModalOpen(true)}
                    leftIcon={<PlusIcon size={18} />}
                    variant="default"
                    className="w-full sm:max-w-md flex items-center justify-center gap-2 font-semibold text-sm h-11"
                >
                    Nova Coleção
                </Button>
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