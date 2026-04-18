"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { Package, SubcategoryIcon, TagIcon, MapsIcon } from "@/lib/icons"

interface MetadataCardProps {
    item: any
    type: "categories" | "subcategories" | "brands" | "locations"
    categories?: any[]
    onEdit: () => void
    onDelete: () => void
}

const MetadataCard = React.memo(({ item, type, categories, onEdit, onDelete }: MetadataCardProps) => {
    const parentCategory = type === "subcategories" && categories
        ? categories.find(c => c.id === item.parent_id)?.name
        : null

    const IconComponent = type === "subcategories" ? SubcategoryIcon
        : type === "brands" ? TagIcon
            : type === "locations" ? MapsIcon
                : Package

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
            onClick={onEdit}
        >
            <div className="flex gap-4 mb-2">
                {/* Icon Placeholder - matching ProductGridCard image size/shape */}
                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                    <IconComponent className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    {/* Title + Status */}
                    <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                            <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading leading-tight truncate pr-1 flex items-center gap-1.5">
                                {item.name}
                            </h3>
                            <Badge
                                variant={item.is_active ? "green" : "red"}
                                className="whitespace-nowrap scale-90 shrink-0"
                            >
                                {item.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                        </div>
                    </div>

                    {/* Subtitle / Details */}
                    <div className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate">
                        {type === "categories" && "Categoria Principal"}
                        {type === "subcategories" && (
                            <span className="flex items-center gap-1">
                                Subcategoria de <span className="font-bold text-brand-green">{parentCategory || "Carregando..."}</span>
                            </span>
                        )}
                        {type === "brands" && "Marca do produto"}
                        {type === "locations" && "Localização de estoque"}
                    </div>
                </div>
            </div>

            {/* Footer Area - matching ProductGridCard border and action position */}
            <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex gap-3 items-end justify-between">
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Criado em</span>
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                        {new Date(item.created_at).toLocaleDateString()}
                    </span>
                </div>

                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <ActionsDropdown
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                </div>
            </div>
        </motion.div>
    )
})

MetadataCard.displayName = "MetadataCard"

export default MetadataCard
