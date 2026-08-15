'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Button, ActionsDropdown } from "@/components/reusable"
import { StarIcon, StoreIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import type { StoreRow } from "./StoreGridCard"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface StoreListRowProps {
    store: StoreRow
    columns: ColumnDef[]
    selected: boolean
    isCurrentStore: boolean
    onSelect: (id: string) => void
    onSwitchStore: () => void
    onEdit: (store: StoreRow) => void
    onDelete: (store: StoreRow) => void
}

const StoreListRow = React.memo(
    ({
        store,
        columns,
        selected,
        isCurrentStore,
        onSelect,
        onSwitchStore,
        onEdit,
        onDelete,
    }: StoreListRowProps) => {
        const logoUrl = getR2ImageUrl(store.logo_url)

        const getAddressLine = () => {
            if (store.street) {
                return `${store.street}, ${store.number || "S/N"}`
            }
            const parts = [store.neighborhood, store.city, store.state].filter(Boolean)
            return parts.length > 0 ? parts.join(" - ") : "-"
        }

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "name":
                    return (
                        <div className="flex items-center gap-3 text-left">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                                {logoUrl ? (
                                    <img src={logoUrl} alt={store.name} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    <StoreIcon className="w-5 h-5 text-brand-primary" />
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 flex items-center gap-1.5">
                                    <span className="truncate max-w-[150px] xl:max-w-[250px]">{store.name}</span>
                                    {store.is_headquarters && (
                                        <Badge variant="blue" className="whitespace-nowrap scale-90 shrink-0" icon={<StarIcon />}>Matriz</Badge>
                                    )}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {store.city && store.state
                                        ? `${store.city}, ${store.state}`
                                        : store.city || store.state || "Sem endereço"}
                                </span>
                            </div>
                        </div>
                    )

                case "address":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                            {getAddressLine()}
                        </span>
                    )

                case "contact":
                    return (
                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                            {formatBrazilPhone(store.phone || store.whatsapp_phone || "") || "-"}
                        </span>
                    )

                case "status":
                    return (
                        <Badge variant={store.is_active ? "green" : "red"}>
                            {store.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                    )

                case "actions": {
                    return (
                        <div
                            className="flex items-center justify-center gap-2 action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Button
                                variant={isCurrentStore ? "outline" : "filled"}
                                size="sm"
                                onClick={onSwitchStore}
                                className={isCurrentStore ? "border-brand-primary text-brand-primary text-xs" : "bg-brand-primary text-white text-xs"}
                            >
                                {isCurrentStore ? "Atual" : "Acessar"}
                            </Button>
                            <ActionsDropdown
                                onEdit={() => onEdit(store)}
                                onDelete={store.is_headquarters ? undefined : () => onDelete(store)}
                            />
                        </div>
                    )
                }

                default:
                    return null
            }
        }

        const getJustifyClass = (align?: string) => {
            if (align === "center") return "justify-center"
            if (align === "right") return "justify-end"
            return "justify-start"
        }

        const getAlignClass = (align?: string) => {
            if (align === "center") return "text-center"
            if (align === "right") return "text-right"
            return "text-left"
        }

        return (
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                onClick={() => onEdit(store)}
            >
                <td
                    className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox checked={selected} onChange={() => onSelect(store.id)} />
                </td>

                {columns.map((col) => (
                    <td
                        key={col.id}
                        className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
                    >
                        <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
                            {renderCellContent(col.id)}
                        </div>
                    </td>
                ))}
            </motion.tr>
        )
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.isCurrentStore === next.isCurrentStore &&
        prev.store.id === next.store.id &&
        prev.store.name === next.store.name &&
        prev.store.is_active === next.store.is_active &&
        prev.store.street === next.store.street &&
        prev.store.city === next.store.city &&
        prev.store.state === next.store.state &&
        prev.store.phone === next.store.phone &&
        prev.store.logo_url === next.store.logo_url &&
        prev.columns === next.columns
)

StoreListRow.displayName = "StoreListRow"

export default StoreListRow
