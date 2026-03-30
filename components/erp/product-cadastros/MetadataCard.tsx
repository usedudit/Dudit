"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import { ThreeDotsIcon, EditIcon, TrashIcon, CadastrosIcon } from "@/lib/icons"

interface MetadataItem {
    id: string
    name: string
    is_active: boolean
    parent_name?: string
}

interface MetadataCardProps {
    item: MetadataItem
    type: "category" | "subcategory" | "brand" | "location"
    onEdit: (item: MetadataItem) => void
    onDelete: (item: MetadataItem) => void
}

const MetadataCard = React.memo(({ item, type, onEdit, onDelete }: MetadataCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            className="group relative bg-white dark:bg-dark-background border border-brand-border dark:border-dark-border rounded-xl p-5 transition-all duration-300 hover:shadow-md hover:border-brand-green/30"
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    {/* Icon Container */}
                    <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border/50 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-green/10 transition-colors duration-300">
                        <CadastrosIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body group-hover:text-brand-green transition-colors" />
                    </div>

                    <div className="flex flex-col min-w-0 pt-0.5">
                        <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading leading-tight truncate pr-4">
                            {item.name}
                        </h3>
                        
                        {type === "subcategory" && item.parent_name && (
                            <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body mt-1">
                                {item.parent_name}
                            </span>
                        )}

                        <div className="mt-3">
                            <Badge variant={item.is_active ? "green" : "red"} className="text-[11px] h-6">
                                {item.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* Actions Dropdown */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Dropdown
                        align="right"
                        showChevron={false}
                        trigger={
                            <Button
                                variant="ghost"
                                className="w-8 h-8 p-0 flex items-center justify-center rounded-lg hover:bg-brand-gray dark:hover:bg-dark-border/50"
                            >
                                <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                            </Button>
                        }
                    >
                        <DropdownItem onClick={() => onEdit(item)}>
                            <EditIcon className="w-4 h-4 mr-2" /> Editar
                        </DropdownItem>
                        <DropdownItem
                            onClick={() => onDelete(item)}
                            className="text-brand-red focus:text-brand-red focus:bg-red-50 dark:focus:bg-red-900/10"
                        >
                            <TrashIcon className="w-4 h-4 mr-2" /> Excluir
                        </DropdownItem>
                    </Dropdown>
                </div>
            </div>
        </motion.div>
    )
})

MetadataCard.displayName = "MetadataCard"

export default MetadataCard
