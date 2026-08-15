"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Button, ActionsDropdown, Tooltip } from "@/components/reusable"
import { StoreIcon, MapPinIcon, PhoneIcon, StarIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

export interface StoreRow {
    id: string
    partner_id: string
    name: string
    slug: string | null
    description: string | null
    phone: string | null
    whatsapp_phone?: string | null
    image_url?: string | null
    logo_url: string | null
    zip_code: string | null
    street: string | null
    number: string | null
    neighborhood: string | null
    city?: string | null
    state?: string | null
    complement: string | null
    opening_hours: Record<string, unknown> | null
    is_headquarters: boolean
    is_active: boolean
    created_at: string
}

interface StoreGridCardProps {
    store: StoreRow
    selected: boolean
    isCurrentStore: boolean
    onSelect: () => void
    onSwitchStore: () => void
    onEdit: () => void
    onDelete: () => void
}

const StoreGridCard = React.memo(
    ({
        store,
        selected,
        isCurrentStore,
        onSelect,
        onSwitchStore,
        onEdit,
        onDelete,
    }: StoreGridCardProps) => {
        const logoUrl = getR2ImageUrl(store.logo_url)

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={onEdit}
            >
                <div className="flex gap-4 mb-3">
                    {/* Avatar da Loja */}
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
                        {logoUrl ? (
                            <img src={logoUrl} alt={store.name} className="w-full h-full object-cover rounded-full" />
                        ) : (
                            <StoreIcon className="w-6 h-6 text-brand-primary" />
                        )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {/* Linha 1: Nome + Badges + Checkbox */}
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0 pr-1">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate" title={store.name}>
                                    <span className="truncate">{store.name}</span>
                                </h3>
                                <Tooltip text={store.is_active ? "Ativa" : "Inativa"}>
                                    <Badge
                                        variant={store.is_active ? "green" : "red"}
                                        className="w-2.5 h-2.5 p-0 min-w-0 min-h-0"
                                    />
                                </Tooltip>
                                {store.is_headquarters && (
                                    <Tooltip text="Matriz">
                                        <Badge variant="blue" className="w-2.5 h-2.5 p-0 min-w-0 min-h-0" icon={<StarIcon />}></Badge>
                                    </Tooltip>
                                )}
                            </div>

                            <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        {/* Linha 2: Endereço */}
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center mt-1">
                            <MapPinIcon size={12} className="mr-1 shrink-0 text-brand-inactive-text" />
                            <span className="truncate">
                                {store.street
                                    ? `${store.street}, ${store.number || ""}`
                                    : store.city && store.state
                                        ? `${store.city}, ${store.state}`
                                        : "Sem endereço cadastrado"}
                            </span>
                        </div>

                        {/* Linha 3: Contato */}
                        {Boolean(store.phone || store.whatsapp_phone) && (
                            <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center mt-1">
                                <PhoneIcon size={12} className="mr-1 shrink-0 text-brand-inactive-text" />
                                <span>{store.phone || store.whatsapp_phone}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Rodapé: Acessar Loja + ActionsDropdown */}
                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between gap-2">
                    <Button
                        variant={isCurrentStore ? "outline" : "filled"}
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation()
                            onSwitchStore()
                        }}
                        className={isCurrentStore ? "border-brand-primary text-brand-primary text-xs" : "bg-brand-primary text-white text-xs"}
                    >
                        {isCurrentStore ? "Loja Atual" : "Acessar Loja"}
                    </Button>

                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <ActionsDropdown
                            onEdit={onEdit}
                            onDelete={store.is_headquarters ? undefined : onDelete}
                        />
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.isCurrentStore === next.isCurrentStore &&
        prev.store.id === next.store.id &&
        prev.store.name === next.store.name &&
        prev.store.is_active === next.store.is_active &&
        prev.store.logo_url === next.store.logo_url
)

StoreGridCard.displayName = "StoreGridCard"

export default StoreGridCard
