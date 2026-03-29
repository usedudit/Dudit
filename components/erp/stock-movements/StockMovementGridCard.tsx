'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Button } from "@/components/reusable"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import { ThreeDotsIcon, RotateIcon, ChevronDownIcon, ChevronUpIcon } from "@/lib/icons"

interface StockMovementGridCardProps {
  movement: any
  selected: boolean
  onSelect: () => void
  onUndo: (id: string) => void
  onDetails: (id: string) => void
}

const StockMovementGridCard = React.memo(
  ({
    movement,
    selected,
    onSelect,
    onUndo,
    onDetails
  }: StockMovementGridCardProps) => {

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-dark-heading/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
        onClick={() => onDetails(movement.id)}
      >
        <div className="flex gap-4 mb-2">
          {/* Imagem do Produto */}
          <div className="w-20 h-20 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border flex-shrink-0 overflow-hidden">
            <img
              src={movement.product.image || "https://img.dudit.com.br/static/Placeholder.png"}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover rounded-full mix-blend-multiply dark:mix-blend-normal"
            />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {/* Linha 1: Nome + Badge Checkbox */}
            <div className="flex justify-between items-start gap-1">
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <h3
                  className="flex-1 min-w-0 font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate"
                  title={movement.product.name}
                >
                  {movement.product.name}
                </h3>

                <Badge
                  variant={movement.type === 'in' ? "green" : "red"}
                  icon={movement.type === 'in' ? <ChevronDownIcon /> : <ChevronUpIcon />}
                  className="whitespace-nowrap"
                >
                  {movement.type === 'in' ? "Entrada" : "Saída"}
                </Badge>
              </div>

              {/* Checkbox com stopPropagation */}
              <div className="flex-shrink-0 -mt-1 -mr-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected} onChange={onSelect} />
              </div>
            </div>

            {/* Linha 2: SKU */}
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate mt-1">
              <span>SKU {movement.product.sku || "N/A"}</span>
            </div>

            {/* Linha 3: ID */}
            <div className="mt-1">
              <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                ID {movement.displayId}
              </span>
            </div>
          </div>
        </div>

        {/* Área do Rodapé */}
        <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
          {/* Linha A: Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Quantidade</span>
              <span className={`text-[14px] font-bold ${movement.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                {movement.type === 'in' ? '+' : '-'}{movement.quantity}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 items-end">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Estoque Final</span>
              <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                {movement.product.currentStock}
              </span>
            </div>
          </div>

          {/* Linha B: Data e Ações */}
          <div className="flex items-end justify-between mt-1">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{movement.date.split(',')[0]}</span>
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{movement.date.split(',')[1]}</span>
            </div>

            {/* Botão de Ações */}
            <div
              className="flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Dropdown
                align="right"
                showChevron={false}
                trigger={
                  <Button
                    variant="outline"
                    className="w-[34px] h-[34px] rounded-full border-brand-border hover:bg-white dark:hover:bg-dark-surface p-0 flex items-center justify-center"
                  >
                    <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                  </Button>
                }
              >
                <DropdownItem onClick={() => onUndo(movement.id)}>
                  <RotateIcon className="w-4 h-4 mr-2" /> Desfazer movimentação
                </DropdownItem>
              </Dropdown>
            </div>
          </div>
        </div>
      </motion.div>
    )
  },
  (prev, next) =>
    prev.selected === next.selected &&
    prev.movement === next.movement
)

StockMovementGridCard.displayName = "StockMovementGridCard"

export default StockMovementGridCard
