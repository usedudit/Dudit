'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface ServiceListItemProps {
    service: any
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
    onEdit: (service: any) => void
    onDuplicate: (service: any) => void
    onDelete: (service: any) => void
    onDetails: (service: any) => void
    /** Prefetch handlers for hover/touch-based entity preloading */
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const ServiceListItem = React.memo(
    ({
        service,
        columns,
        selected,
        onSelect,
        onEdit,
        onDuplicate,
        onDelete,
        onDetails,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: ServiceListItemProps) => {

        const formatCurrency = (value: number) => {
            return new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
            }).format(value)
        }

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "name":
                    return (
                        <div className="flex items-center gap-3 text-left">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                <img
                                    src={getR2ImageUrl(service.images?.[0], "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
                                    alt=""
                                    className="w-full h-full object-cover rounded-full"
                                    loading="lazy"
                                />
                            </div>
                            <div className="flex flex-col text-left">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px] xl:max-w-[300px]">
                                    {service.name}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {service.sku}
                                </span>
                            </div>
                        </div>
                    )

                case "category":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                            {service.service_categories?.name || "-"}
                        </span>
                    )

                case "duration":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                            {service.duration_minutes ? `${service.duration_minutes} min` : "-"}
                        </span>
                    )

                case "price":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                            {formatCurrency(service.price)}
                        </span>
                    )

                case "status":
                    return (
                        <Badge variant={service.is_active ? "green" : "red"}>
                            {service.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                    )

                case "actions":
                    return (
                        <div
                            className="flex justify-center action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onEdit={() => onEdit(service)}
                                onDuplicate={() => onDuplicate(service)}
                                onDelete={() => onDelete(service)}
                            />
                        </div>
                    )

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
                onClick={() => onDetails(service)}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <td
                    className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox checked={selected} onChange={() => onSelect(service.id)} />
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
        prev.service === next.service &&
        prev.selected === next.selected &&
        prev.columns === next.columns
)

ServiceListItem.displayName = "ServiceListItem"

export default ServiceListItem
