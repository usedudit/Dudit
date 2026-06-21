'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface QuickModeItemCardProps {
    item: {
        id: string
        name: string
        price: number
        images: string[]
        is_active: boolean
        itemType: 'product' | 'service'
    }
    onEdit: () => void
    onDelete: () => void
    onDuplicate: () => void
}

const QuickModeItemCard = ({
    item,
    onEdit,
    onDelete,
    onDuplicate,
}: QuickModeItemCardProps) => {

    const hasImage = item.images && item.images.length > 0 && item.images[0] && item.images[0].trim() !== ''
    const imageUrl = hasImage ? getR2ImageUrl(item.images[0]) : "https://img.dudit.com.br/static/Placeholder.png"

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(value)
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-5 hover:border-brand-green/30 dark:hover:border-brand-green/30 transition-all duration-300 flex flex-col h-full relative"
        >
            <div className="flex gap-4 mb-4">
                {/* Imagem */}
                <div className="w-16 h-16 rounded-[16px] bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden border border-brand-border dark:border-dark-border">
                    <img
                        src={imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                    />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex justify-between items-start gap-1">
                        <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                            {item.name}
                        </h3>
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                        <Badge
                            variant={item.is_active ? "green" : "red"}
                            className="scale-90 origin-left"
                        >
                            {item.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        <span className="text-[10px] uppercase font-bold text-brand-inactive-text dark:text-dark-body tracking-wider">
                            {item.itemType === 'product' ? 'Produto' : 'Serviço'}
                        </span>
                    </div>

                    <div className="mt-2">
                        <span className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(item.price)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
                <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                    Ações rápidas
                </span>
                <ActionsDropdown
                    onEdit={onEdit}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                />
            </div>
        </motion.div>
    )
}

export default QuickModeItemCard
