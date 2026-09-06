"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import DefaultModal from "@/components/reusable/DefaultModal"
import { getMarketplaceCategoriesClient, getMarketplaceServiceCategoriesClient } from "@/lib/data/marketplace-categories-client"
import { Button, IconPlaceholder, Input, ListItem } from "@/components/reusable"
import { Spinner } from "@/components/reusable/Spinner"
import { ChevronRight, ChevronLeft, Search, Package } from "lucide-react"
import { ChevronLeftIcon, SearchIcon } from "@/lib/icons"

interface Category {
    id: string
    name: string
    parent_id: string | null
    icon_url?: string | null
}

interface MarketplaceCategoryModalProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (category: { id: string; name: string; path: string }) => void
    type?: "product" | "service"
}

export default function MarketplaceCategoryModal({
    isOpen,
    onClose,
    onSelect,
    type = "product",
}: MarketplaceCategoryModalProps) {
    const [history, setHistory] = useState<Category[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState("")

    const isService = type === "service"
    const fetchCategories = isService ? getMarketplaceServiceCategoriesClient : getMarketplaceCategoriesClient

    const title = isService ? "Categorizar Serviço" : "Categorizar Produto"
    const description = isService ? "Selecione onde seu serviço se encaixa." : "Selecione onde seu produto se encaixa."

    useEffect(() => {
        if (isOpen) {
            setHistory([])
            setSearch("")
            loadCategories(null)
        }
    }, [isOpen])

    const loadCategories = async (parentId: string | null) => {
        setLoading(true)
        try {
            const data = await fetchCategories(parentId)
            if (data && data.length > 0) {
                setCategories(data)
            } else if (parentId) {
                setCategories([])
            }
        } catch (error) {
            console.error("Erro ao carregar categorias", error)
        } finally {
            setLoading(false)
        }
    }

    const handleCategoryClick = async (category: Category) => {
        setLoading(true)
        const children = await fetchCategories(category.id)
        setLoading(false)

        if (children && children.length > 0) {
            setHistory((prev) => [...prev, category])
            setCategories(children)
            setSearch("")
        } else {
            const breadcrumbs = [...history, category]
            const fullPath = breadcrumbs.map(c => c.name).join(" > ")

            onSelect({
                id: category.id,
                name: category.name,
                path: fullPath
            })
            onClose()
        }
    }

    const handleBack = () => {
        if (history.length === 0) return
        const newHistory = [...history]
        newHistory.pop()
        setHistory(newHistory)
        const parentId = newHistory.length > 0 ? newHistory[newHistory.length - 1].id : null
        loadCategories(parentId)
    }

    const filteredCategories = categories.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            description={description}
        >
            <div className="h-[500px] flex flex-col">
                {/* Header: Breadcrumbs */}
                <div className="flex items-center gap-3 p-1 mb-4 border-b border-brand-border dark:border-dark-border pb-4">
                    {history.length > 0 && (
                        <Button
                            onClick={handleBack}
                            variant="filled"
                        >
                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </Button>
                    )}

                    <div className="flex-1 overflow-hidden flex items-center text-sm">
                        {history.length === 0 ? (
                            <span className="text-brand-inactive-text dark:text-dark-heading font-medium">Todas as Categorias</span>
                        ) : (
                            history.map((cat, idx) => (
                                <React.Fragment key={cat.id}>
                                    <span className="text-brand-inactive-text dark:text-dark-heading truncate max-w-[100px]">{cat.name}</span>
                                    <ChevronRight className="w-4 h-4 text-brand-inactive-text dark:text-dark-body mx-1 shrink-0" />
                                </React.Fragment>
                            ))
                        )}
                        {history.length > 0 && <span className="font-bold text-brand-text dark:text-dark-heading ml-1">Selecione...</span>}
                    </div>
                </div>

                {/* Search */}
                <div className="mb-4">
                    <Input
                        placeholder="Buscar..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        variant="full-rounded"
                        prefix={
                            <SearchIcon
                                size={18}
                                className="text-brand-inactive-text shrink-0"
                            />
                        }
                    />
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <Spinner size={18} />
                        </div>
                    ) : filteredCategories.length > 0 ? (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={history.length}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.15 }}
                                className="space-y-4"
                            >
                                {filteredCategories.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => handleCategoryClick(cat)}
                                        className="w-full flex items-center"
                                    >
                                        <ListItem
                                            icon={cat.icon_url || "https://img.dudit.com.br/static/Placeholder.png"}
                                            title={cat.name}
                                            className="px-4 py-3"
                                            left={<ChevronRight className="w-5 h-5 text-brand-inactive-text dark:text-dark-body group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors" />}
                                        />
                                    </button>
                                ))}
                            </motion.div>
                        </AnimatePresence>
                    ) : (
                        <IconPlaceholder
                            icon={Package}
                            title="Nenhuma categoria com esse nome foi encontrada"
                            subtitle="Tente pesquisar com outros termos"
                        />
                    )}
                </div>
            </div>
        </DefaultModal>
    )
}