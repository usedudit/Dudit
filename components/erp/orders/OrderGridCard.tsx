'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { StoreIcon, ClockIcon } from "@/lib/icons"

interface OrderGridCardProps {
  order: any
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onDetails: () => void
}

const OrderGridCard = React.memo(
  ({
    order,
    selected,
    onSelect,
    onEdit,
    onDelete,
    onDetails
  }: OrderGridCardProps) => {

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-dark-border/90 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
        onClick={onDetails}
      >
        <div className="flex gap-4 mb-2">
          {/* Order Visual Indicator */}
          <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border flex-shrink-0 flex items-center justify-center">
             <StoreIcon className="w-6 h-6 text-brand-dark dark:text-dark-heading" />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {/* ID + Checkbox */}
            <div className="flex justify-between items-start gap-1">
              <div className="flex flex-col min-w-0 pr-1 gap-1">
                <h3
                  className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate"
                  title={order.displayId}
                >
                  <span className="truncate">{order.displayId}</span>
                </h3>
               
                <div className="flex items-center gap-1.5 flex-wrap">
                   <Badge
                    variant={order.statusColor}
                    className="text-[9px] h-4 px-1 py-3 flex-shrink-0 w-max"
                  >
                    {order.statusLabel}
                  </Badge>
                  {order.isUnfulfilled && (
                    <Badge variant="gray" className="text-[9px] h-4 px-1 py-3 opacity-70">
                      Pendente
                    </Badge>
                  )}
                </div>
              </div>

              {/* Checkbox */}
              <div className="flex-shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected} onChange={onSelect} />
              </div>
            </div>
          </div>
        </div>

        {/* Info Rows */}
        <div className="mt-4 flex flex-col gap-3">
           <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                  {order.customer_name}
                </span>
                {order.customer_id && (
                  <Badge variant="gray" className="text-[9px] h-3.5 px-0.5">
                    {order.customer_id}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
               <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Canal</span>
               <div className="flex items-center gap-1.5">
                 <StoreIcon size={12} className="text-brand-inactive-text" />
                 <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                   {order.store_name || "Loja"}
                 </span>
               </div>
            </div>
        </div>

        {/* Footer Area */}
        <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
               <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Total</span>
               <span className="text-[14px] font-bold text-brand-primary">
                 R$ {Number(order.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
               </span>
            </div>

            <div className="flex flex-col gap-0.5 items-end">
               <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Data</span>
               <div className="flex items-center gap-1 justify-end">
                 <ClockIcon size={12} className="text-brand-inactive-text" />
                 <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                   {order.formattedDate}
                 </span>
               </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-1">
             <div className="text-xs text-brand-inactive-text italic">
                {order.items_count} {order.items_count === 1 ? 'item' : 'itens'}
             </div>

            {/* Dropdown Button */}
            <div
              className="flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <ActionsDropdown
                onView={onDetails}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          </div>
        </div>
      </motion.div>
    )
  },
  (prev, next) =>
    prev.selected === next.selected &&
    prev.order === next.order
)

OrderGridCard.displayName = "OrderGridCard"

export default OrderGridCard
