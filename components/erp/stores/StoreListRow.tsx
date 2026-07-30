"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Button, ActionsDropdown } from "@/components/reusable"
import { StoreIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import type { StoreRow } from "./StoreGridCard"

interface StoreListRowProps {
  store: StoreRow
  selected: boolean
  isCurrentStore: boolean
  onSelect: () => void
  onSwitchStore: () => void
  onEdit: () => void
  onDelete: () => void
}

const StoreListRow = React.memo(
  ({
    store,
    selected,
    isCurrentStore,
    onSelect,
    onSwitchStore,
    onEdit,
    onDelete,
  }: StoreListRowProps) => {
    const logoUrl = getR2ImageUrl(store.logo_url)

    return (
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
        onClick={onEdit}
      >
        {/* Checkbox */}
        <td
          className="py-2.5 pl-6 pr-0 border-b border-brand-border dark:border-dark-border w-14"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox checked={selected} onChange={onSelect} />
        </td>

        {/* Coluna Loja (Avatar + Nome + Badge Matriz) */}
        <td className="p-2.5 border-b border-brand-border dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={store.name} className="w-full h-full object-cover rounded-full" />
              ) : (
                <StoreIcon className="w-5 h-5 text-brand-primary" />
              )}
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 flex items-center gap-1.5">
                <span className="truncate max-w-[200px] xl:max-w-[300px]">{store.name}</span>
                {store.is_headquarters && (
                  <Badge variant="blue" className="shrink-0 text-[10px]">
                    Matriz
                  </Badge>
                )}
              </span>
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                {store.street ? `${store.street}, ${store.number || ""}` : (store.city && store.state ? `${store.city}, ${store.state}` : "Sem endereço")}
              </span>
            </div>
          </div>
        </td>

        {/* Coluna Endereço */}
        <td className="p-2.5 border-b border-brand-border dark:border-dark-border text-xs text-brand-inactive-text dark:text-dark-body">
          {store.street ? `${store.street}, ${store.number || "S/N"}` : "-"}
        </td>

        {/* Coluna Contato */}
        <td className="p-2.5 border-b border-brand-border dark:border-dark-border text-xs text-brand-inactive-text dark:text-dark-body">
          {store.phone || store.whatsapp_phone || "-"}
        </td>

        {/* Coluna Status */}
        <td className="p-2.5 border-b border-brand-border dark:border-dark-border text-center">
          <Badge variant={store.is_active ? "green" : "red"}>
            {store.is_active ? "Ativa" : "Inativa"}
          </Badge>
        </td>

        {/* Coluna Ações */}
        <td className="p-2.5 border-b border-brand-border dark:border-dark-border text-right pr-6">
          <div className="flex items-center justify-end gap-2 action-btn" onClick={(e) => e.stopPropagation()}>
            <Button
              variant={isCurrentStore ? "outline" : "filled"}
              size="sm"
              onClick={onSwitchStore}
              className={isCurrentStore ? "border-brand-primary text-brand-primary text-xs" : "bg-brand-primary text-white text-xs"}
            >
              {isCurrentStore ? "Atual" : "Acessar"}
            </Button>
            <ActionsDropdown
              onEdit={onEdit}
              onDelete={store.is_headquarters ? undefined : onDelete}
            />
          </div>
        </td>
      </motion.tr>
    )
  },
  (prev, next) =>
    prev.selected === next.selected &&
    prev.isCurrentStore === next.isCurrentStore &&
    prev.store.id === next.store.id &&
    prev.store.name === next.store.name &&
    prev.store.is_active === next.store.is_active
)

StoreListRow.displayName = "StoreListRow"

export default StoreListRow
