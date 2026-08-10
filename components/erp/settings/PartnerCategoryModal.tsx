"use client"

import React, { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import DefaultModal from "@/components/reusable/DefaultModal"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/reusable"
import { Spinner } from "@/components/reusable/Spinner"
import { ChevronRight, ChevronLeft, Search, Tag } from "lucide-react"
import { SearchIcon } from "@/lib/icons"

interface Category {
    id: string
    name: string
    slug: string
    parent_id: string | null
    icon_url?: string | null
}

interface PartnerCategoryModalProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (category: { categoryId: string; subcategoryId: string | null; name: string; path: string }) => void
}

export default function PartnerCategoryModal({
    isOpen,
    onClose,
    onSelect,
}: PartnerCategoryModalProps) {
    const [allCategories, setAllCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(false)
    const [currentParentId, setCurrentParentId] = useState<string | null>(null)
    const [search, setSearch] = useState("")

    useEffect(() => {
        if (isOpen) {
            setSearch("")
            setCurrentParentId(null)
            loadAllCategories()
        }
    }, [isOpen])

    const loadAllCategories = async () => {
        setLoading(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from("marketplace_partner_categories")
                .select("id, name, slug, icon_url, parent_id")
                .order("name")
            if (error) throw error
            setAllCategories(data || [])
        } catch (error) {
            console.error("Erro ao carregar categorias", error)
        } finally {
            setLoading(false)
        }
    }

    const displayCategories = useMemo(() => {
        if (search.trim().length > 0) {
            const q = search.toLowerCase()
            return allCategories.filter(c => c.name.toLowerCase().includes(q))
        } else {
            return allCategories.filter(c => c.parent_id === currentParentId)
        }
    }, [allCategories, currentParentId, search])

    const currentParent = useMemo(() => {
        if (!currentParentId) return null
        return allCategories.find(c => c.id === currentParentId) || null
    }, [allCategories, currentParentId])

    const handleCategoryClick = (category: Category) => {
        // Check if this category has subcategories
        const subcategories = allCategories.filter(c => c.parent_id === category.id)

        if (subcategories.length > 0) {
            // It has subcategories, drill down
            setCurrentParentId(category.id)
            setSearch("")
        } else {
            // No subcategories, select it
            if (category.parent_id) {
                // It is a subcategory
                const parent = allCategories.find(p => p.id === category.parent_id)
                const fullPath = parent ? `${parent.name} > ${category.name}` : category.name
                onSelect({
                    categoryId: category.parent_id,
                    subcategoryId: category.id,
                    name: category.name,
                    path: fullPath
                })
            } else {
                // It is a top-level category without subcategories
                onSelect({
                    categoryId: category.id,
                    subcategoryId: null,
                    name: category.name,
                    path: category.name
                })
            }
            onClose()
        }
    }

    const handleBack = () => {
        if (search) {
            setSearch("")
        } else {
            setCurrentParentId(null)
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Categoria do Negócio"
            description="Selecione a categoria principal e subcategoria do seu negócio."
        >
            <div className="h-[480px] flex flex-col text-gray-700">
                {/* Header: Breadcrumbs */}
                <div className="flex items-center gap-3 p-1 mb-4 border-b border-gray-100 pb-4">
                    {(currentParentId || search) ? (
                        <button
                            onClick={handleBack}
                            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                    ) : (
                        <div className="w-9 h-9 flex items-center justify-center bg-green-50 rounded-full text-brand-green">
                            <Tag className="w-5 h-5" />
                        </div>
                    )}

                    <div className="flex-1 overflow-hidden flex items-center text-sm">
                        {search ? (
                            <span className="text-gray-500 font-medium">Resultados da busca</span>
                        ) : !currentParent ? (
                            <span className="text-gray-500 font-medium">Todas as Categorias</span>
                        ) : (
                            <>
                                <span className="text-gray-500 truncate max-w-[150px]">Todas as Categorias</span>
                                <ChevronRight className="w-4 h-4 text-gray-300 mx-1 shrink-0" />
                                <span className="font-bold text-gray-800 truncate">{currentParent.name}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Search */}
                <div className="mb-4">
                    <Input
                        placeholder="Buscar categoria ou subcategoria (ex: oficina, lanchonete...)"
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

                {/* List */}
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <Spinner size={18} />
                        </div>
                    ) : displayCategories.length > 0 ? (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentParentId + "_" + (search ? "search" : "list")}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="space-y-2"
                            >
                                {currentParent && !search && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelect({
                                                categoryId: currentParent.id,
                                                subcategoryId: null,
                                                name: currentParent.name,
                                                path: currentParent.name
                                            })
                                            onClose()
                                        }}
                                        className="w-full flex items-center justify-between p-3 bg-brand-green/5 hover:bg-brand-green/10 rounded-lg border border-brand-green/20 transition-all text-left font-medium text-brand-green mb-2"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-lg bg-brand-green/10 flex items-center justify-center shrink-0">
                                                <Tag className="w-5 h-5 text-brand-green" />
                                            </div>
                                            <span className="text-sm font-semibold truncate">
                                                Selecionar toda a categoria "{currentParent.name}"
                                            </span>
                                        </div>
                                    </button>
                                )}
                                {displayCategories.map((cat) => {
                                    const hasSubs = allCategories.some(c => c.parent_id === cat.id)
                                    const parentCat = cat.parent_id ? allCategories.find(p => p.id === cat.parent_id) : null

                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => handleCategoryClick(cat)}
                                            className="w-full flex items-center justify-between p-3 hover:bg-brand-gray rounded-lg border border-transparent hover:border-gray-200 transition-all group text-left"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-100 group-hover:border-gray-300 transition-colors shrink-0">
                                                    <Tag className="w-5 h-5 text-gray-400" />
                                                </div>

                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-brand-dark truncate">
                                                        {cat.name}
                                                    </span>
                                                    {parentCat && (
                                                        <span className="text-xs text-gray-400 truncate">
                                                            em {parentCat.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {hasSubs ? (
                                                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand-green transition-colors shrink-0" />
                                            ) : (
                                                <span className="text-[11px] bg-brand-green/10 text-brand-green px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Selecionar
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </motion.div>
                        </AnimatePresence>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <Tag className="w-10 h-10 mb-2 opacity-20" />
                            <p className="text-sm">Nenhuma categoria encontrada.</p>
                        </div>
                    )}
                </div>
            </div>
        </DefaultModal>
    )
}
