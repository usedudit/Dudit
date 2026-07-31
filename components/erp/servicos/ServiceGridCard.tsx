'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Tooltip } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface ServiceGridCardProps {
    service: any
    selected: boolean
    onSelect: () => void
    onEdit: () => void
    onDelete: () => void
    onArchive?: () => void
    onUnarchive?: () => void
    onDuplicate: () => void
    onDetails: () => void
    onShare: () => void
    /** Prefetch handlers for hover/touch-based entity preloading */
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const ServiceGridCard = React.memo(
    ({
        service,
        selected,
        onSelect,
        onEdit,
        onDelete,
        onArchive,
        onUnarchive,
        onDuplicate,
        onDetails,
        onShare,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: ServiceGridCardProps) => {

        const hasImage = service.images && service.images.length > 0 && service.images[0] && service.images[0].trim() !== ''
        const imageUrl = hasImage && service.images ? getR2ImageUrl(service.images[0]) : "https://img.dudit.com.br/static/Placeholder.png"

        const formatCurrency = (value: number) => {
            return new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
            }).format(value)
        }

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={onDetails}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <div className="flex gap-4 mb-2">
                    {/* Imagem do Serviço */}
                    <div className="w-18 h-18 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden">
                        <img
                            src={imageUrl}
                            alt={service.name}
                            loading="lazy"
                            className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border"
                        />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {/* Linha 1: Nome + Badge Status + Checkbox */}
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                <h3
                                    className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                                    title={service.name}
                                >
                                    <span className="truncate">{service.name}</span>
                                </h3>
                                {(() => {
                                    const isArchived = service.status === "arquivado" || service.status === "archived"
                                    return (
                                        <Tooltip text={isArchived ? "Status: Arquivado" : service.is_active ? "Status: Ativo" : "Status: Inativo"}>
                                            <Badge
                                                variant={isArchived ? "orange" : service.is_active ? "green" : "red"}
                                                className="whitespace-nowrap scale-90 shrink-0"
                                            />
                                        </Tooltip>
                                    )
                                })()}
                            </div>

                            {/* Checkbox com stopPropagation para não abrir os detalhes ao clicar */}
                            <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        {/* Linha 2: SKU • Categoria */}
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center">
                            <span>SKU: {service.sku || "N/A"}</span>
                            {service.service_categories?.name && (
                                <>
                                    <span className="mx-1.5">•</span>
                                    <span className="truncate">{service.service_categories.name}</span>
                                </>
                            )}
                        </div>

                        {/* Linha 3: Preço */}
                        <div className="mt-1.5">
                            <span className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(service.price)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Área do Rodapé */}
                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    {/* Linha: Duração e Ações */}
                    <div className="flex items-end justify-between">
                        {/* Seção de Duração */}
                        <div className="flex flex-col gap-2">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Duração</span>
                            <div className="flex items-center gap-2.5">
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                    {service.duration_minutes ? `${service.duration_minutes} min` : "-"}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 items-center">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Unidade</span>
                            <div className="flex items-center gap-2.5">
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                    {service.unit || "Sessão"}
                                </span>
                            </div>
                        </div>

                        {/* Botão de Ações */}
                        <div
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {(() => {
                                const isArchived = service.status === "arquivado" || service.status === "archived"
                                return (
                                    <ActionsDropdown
                                        onEdit={onEdit}
                                        onDuplicate={onDuplicate}
                                        onDelete={onDelete}
                                        onArchive={!isArchived ? onArchive : undefined}
                                        onUnarchive={isArchived ? onUnarchive : undefined}
                                        onShare={onShare}
                                    />
                                )
                            })()}
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.service === next.service
)

ServiceGridCard.displayName = "ServiceGridCard"

export default ServiceGridCard
