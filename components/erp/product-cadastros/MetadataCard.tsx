"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { Package } from "@/lib/icons"

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

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-dark/90 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
            onClick={onEdit}
        >
            <div className="flex gap-4 mb-2">
                {/* Icon Placeholder - matching ProductGridCard image size/shape */}
                <div className="w-20 h-20 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 flex items-center justify-center overflow-hidden">
                    <Package className="w-10 h-10 text-brand-inactive-text dark:text-dark-body opacity-50" />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    {/* Title + Status */}
                    <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                {item.name}
                            </h3>
                            <Badge
                                variant={item.is_active ? "green" : "red"}
                                className="text-[9px] h-4 px-1 py-3 flex-shrink-0"
                            >
                                {item.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                        </div>
                    </div>

                    {/* Subtitle / Details */}
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate mt-1">
                        {type === "categories" && "Categoria Principal"}
                        {type === "subcategories" && (
                            <span className="flex items-center gap-1">
                                Subcategoria de <span className="font-bold text-brand-green">{parentCategory || "Carregando..."}</span>
                            </span>
                        )}
                        {type === "brands" && "Marca registrada"}
                        {type === "locations" && "Localização de estoque"}
                    </div>
                </div>
            </div>

            {/* Footer Area - matching ProductGridCard border and action position */}
            <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex items-end justify-between">
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Criado em</span>
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                        {new Date(item.created_at).toLocaleDateString()}
                    </span>
                </div>

                <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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
