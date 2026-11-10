"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Badge, SidebarCard } from "@/components/reusable"
import { Package, CheckCircleIcon, EditIcon, PlusIcon } from "@/lib/icons"
import MarketplaceCategoryModal from "@/components/erp/product/MarketplaceCategoryModal"
import { getCategoryPathClient } from "@/lib/data/marketplace-categories-client"

interface OfficialCategoryCardProps {
    categoryId?: string | null
    onChange: (categoryId: string) => void
    type?: "product" | "service"
    isEditing: boolean
}

export const OfficialCategoryCard: React.FC<OfficialCategoryCardProps> = ({
    categoryId,
    onChange,
    type = "product",
    isEditing = false,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [categoryPath, setCategoryPath] = useState("")

    useEffect(() => {
        let alive = true
        if (!categoryId) {
            setCategoryPath("")
            return
        }
        getCategoryPathClient(categoryId, type).then((path) => {
            if (!alive) return
            setCategoryPath(path || "")
        })
        return () => { alive = false }
    }, [categoryId, type])

    const handleSelect = useCallback((category: { id: string; name: string; path: string }) => {
        onChange(category.id)
        setCategoryPath(category.path)
    }, [onChange])

    const itemLabel = type === "product" ? "produto" : "serviço"

    const categorizadoBadge = categoryPath && (
        <Badge variant="green">
            <span>Categorizado</span>
        </Badge>
    );

    const renderButton = () => (
        <div
            onClick={() => isEditing && setIsModalOpen(true)}
            className={`
                group relative w-full p-4 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer flex items-center justify-between
                ${categoryPath
                    ? "border-brand-green/30 bg-brand-green/5 hover:bg-brand-green/10"
                    : "border-gray-300 hover:border-brand-green hover:bg-brand-gray dark:border-gray-600 dark:hover:bg-dark-border"
                }
                ${!isEditing && "opacity-60 pointer-events-none"}
            `}
        >
            <div className="flex flex-col">
                <span className={`text-sm font-medium ${categoryPath ? "text-brand-dark dark:text-dark-heading" : "text-gray-400 group-hover:text-gray-600"}`}>
                    {categoryPath || "Selecionar categoria..."}
                </span>
                {categoryPath && (
                    <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 truncate">
                        Clique para alterar
                    </span>
                )}
            </div>

            <div className={`p-2 rounded-full ${categoryPath ? "bg-white text-brand-green" : "bg-gray-100 text-gray-400 group-hover:bg-white group-hover:text-brand-green group-hover:shadow-sm"} transition-all`}>
                {categoryPath ? <EditIcon className="w-4 h-4" /> : <PlusIcon className="w-5 h-5" />}
            </div>
        </div>
    )

    return (
        <>
            <SidebarCard
                title="Categoria Oficial"
                headerRight={categorizadoBadge}
                hasSeparator
                hasTopStrip
            >
                {isEditing ? (
                    <>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2 mb-4">
                            Selecione onde seu {itemLabel} será exibido na árvore de categorias.
                        </p>
                        {renderButton()}
                    </>
                ) : (
                    <p className="text-sm text-brand-dark dark:text-dark-heading font-medium mt-2">
                        {categoryPath || "Nenhuma categoria oficial selecionada."}
                    </p>
                )}
            </SidebarCard>

            <MarketplaceCategoryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSelect={handleSelect}
                type={type}
            />
        </>
    )
}
