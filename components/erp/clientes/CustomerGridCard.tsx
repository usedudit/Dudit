'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { ThreeDotsIcon } from "@/lib/icons"

interface CustomerGridCardProps {
  customer: any
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onDetails: () => void
}

const CustomerGridCard = React.memo(
  ({
    customer,
    selected,
    onSelect,
    onEdit,
    onDelete,
    onDetails
  }: CustomerGridCardProps) => {

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
          {/* Avatar do Cliente */}
          <div className="w-20 h-20 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 overflow-hidden">
            <img
              src={customer.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.name || 'C')}&background=random`}
              alt={customer.name}
              loading="lazy"
              className="w-full h-full object-cover rounded-full"
            />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {/* Linha 1: Nome + Badge Status + Checkbox */}
            <div className="flex justify-between items-start gap-1">
              <div className="flex flex-col min-w-0 pr-1 gap-1">
                <h3
                  className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate"
                  title={customer.name}
                >
                  <span className="truncate">{customer.name}</span>
                </h3>
                <Badge
                  variant={customer.status === 'Active' ? "green" : customer.status === 'Inactive' ? "gray" : "red"}
                  className="text-[9px] h-4 px-1 py-3 flex-shrink-0 w-max"
                >
                  {customer.status === 'Active' ? "Ativo" : customer.status === 'Inactive' ? "Inativo" : "Bloqueado"}
                </Badge>
              </div>

              {/* Checkbox com stopPropagation */}
              <div className="flex-shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected} onChange={onSelect} />
              </div>
            </div>

            {/* Linha 2: ID */}
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate mt-1">
              <span>ID {customer.id || "-"}</span>
            </div>
          </div>
        </div>

        {/* Área do Rodapé */}
        <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
          {/* Linha A: Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Total Gasto</span>
              <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                {customer.totalOrderValue ? `R$ ${customer.totalOrderValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 items-end">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pedidos</span>
              <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                {customer.orders || 0}
              </span>
            </div>
          </div>

          {/* Linha B: Último Pedido e Ações */}
          <div className="flex items-end justify-between mt-1">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Último Pedido</span>
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.lastOrderDate || "-"}</span>
            </div>

            {/* Botão de Ações */}
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
    prev.customer === next.customer
)

CustomerGridCard.displayName = "CustomerGridCard"

export default CustomerGridCard
