'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge, Checkbox } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface ServiceMobileItemProps {
    service: any
    onClick: (service: any) => void
    isSelected?: boolean
    onSelect?: (id: string) => void
}

const ServiceMobileItem = React.memo(
    ({ service, onClick, isSelected, onSelect }: ServiceMobileItemProps) => {
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
                className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer"
                onClick={() => onClick(service)}
            >
                <div className="flex items-start gap-4 h-auto">
                    <div className="w-20 h-20 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border shrink-0 overflow-hidden">
                        <img
                            src={getR2ImageUrl(service.images?.[0], "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
                            alt={service.name}
                            className="w-full h-full object-cover"
                        />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading leading-tight truncate pr-1">
                                <span className="truncate">{service.name}</span>
                            </h3>
                            <div
                                className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${service.is_active ? "bg-brand-green" : "bg-brand-red"}`}
                            />
                        </div>

                        <div className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate">
                            <span>{service.sku || "N/A"}</span>
                            {service.service_categories?.name && (
                                <>
                                    <span className="mx-1.5">•</span>
                                    <span>{service.service_categories.name}</span>
                                </>
                            )}
                        </div>

                        <div className="flex items-end justify-between gap-2 mt-0.5">
                            <div className="flex items-center flex-wrap gap-y-1">
                                <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(service.price)}
                                </span>
                                <span className="mx-2 text-brand-inactive-text dark:text-dark-border">•</span>
                                <span className="text-md font-medium text-brand-inactive-text dark:text-dark-body">
                                    {service.duration_minutes ? `${service.duration_minutes} min` : "-"}
                                </span>
                                <span className="mx-2"></span>
                                <Badge variant={service.is_active ? "green" : "red"} className="h-5 text-[10px] px-1.5">
                                    {service.is_active ? "Ativo" : "Inativo"}
                                </Badge>
                            </div>

                            {onSelect && (
                                <div className="flex-none -mb-1" onClick={(e) => e.stopPropagation()}>
                                    <Checkbox checked={!!isSelected} onChange={() => onSelect(service.id)} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) => prev.service === next.service && prev.isSelected === next.isSelected && prev.onSelect === next.onSelect
)

ServiceMobileItem.displayName = "ServiceMobileItem"

export default ServiceMobileItem
