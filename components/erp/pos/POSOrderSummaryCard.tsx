"use client"

import { memo } from "react"
import { ArchiveIcon, ChevronRightIcon, EditIcon, TagIcon, ThreeDotsIcon, TrashIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { Button } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"

type SummaryProps = {
  itemCount: number
  subtotal: number
  discountVal: number
  shippingFee: number
  otherCosts: number
  total: number
  isFinalizing: boolean
  canContinue: boolean
  canReset: boolean
  onReset: () => void
  onOpenItems: () => void
  onOpenDiscount: () => void
  onContinue: () => void
  onSaveDraft: () => unknown | Promise<unknown>
  onAddShipping: () => void
  onOpenNotes: () => void
  showItemsShortcut?: boolean
}

function POSOrderActionsMenu({
  onSaveDraft,
  onOpenDiscount,
  onAddShipping,
  onOpenNotes,
}: Pick<SummaryProps, "onSaveDraft" | "onOpenDiscount" | "onAddShipping" | "onOpenNotes">) {
  return (
    <Dropdown
      trigger={
        <Button variant="outline" className="h-12 w-12 shrink-0 rounded-full border-brand-border bg-white p-0">
          <ThreeDotsIcon className="h-5 w-5 text-brand-inactive-text dark:text-dark-body" />
        </Button>
      }
      showChevron={false}
      width="w-64"
      align="right"
      className="inline-block w-auto"
    >
      <DropdownItem onClick={onSaveDraft}>
        <ArchiveIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" /> Salvar Pedido
      </DropdownItem>
      <DropdownItem onClick={onOpenDiscount}>
        <TagIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" /> Aplicar Desconto
      </DropdownItem>
      <DropdownItem onClick={onAddShipping}>
        <ArchiveIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" /> Adicionar Frete
      </DropdownItem>
      <DropdownItem onClick={onOpenNotes}>
        <ArchiveIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" /> Adicionar Observação
      </DropdownItem>
    </Dropdown>
  )
}

export const POSOrderSummaryContent = memo(function POSOrderSummaryContent({
  itemCount,
  subtotal,
  discountVal,
  shippingFee,
  otherCosts,
  total,
  isFinalizing,
  canContinue,
  onOpenItems,
  onOpenDiscount,
  onContinue,
  onSaveDraft,
  onAddShipping,
  onOpenNotes,
  showItemsShortcut = true,
}: Omit<SummaryProps, "canReset" | "onReset">) {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-4 space-y-4 dark:bg-dark-surface">
      {showItemsShortcut && (
        <button
          type="button"
          onClick={onOpenItems}
          className="flex w-full items-center justify-between rounded-[24px] border border-brand-border bg-brand-gray/50 px-4 py-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-brand-primary">
              <ArchiveIcon className="h-4 w-4" />
            </div>
            <span className="font-bold text-brand-dark dark:text-dark-heading">Itens do Pedido ({itemCount})</span>
          </div>
          <ChevronRightIcon className="h-4 w-4 text-brand-inactive-text" />
        </button>
      )}

      <button
        type="button"
        onClick={onOpenDiscount}
        className="flex w-full items-center justify-between rounded-[24px] border border-brand-border bg-brand-gray/50 px-4 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-dark text-white">
            <TagIcon className="h-4 w-4" />
          </div>
          <span className="font-bold text-brand-dark dark:text-dark-heading">
            {discountVal > 0 ? `Desconto Aplicado (${formatCurrency(discountVal)})` : "Aplicar Desconto"}
          </span>
        </div>
        <EditIcon className="h-4 w-4 text-brand-inactive-text" />
      </button>

      <div className="space-y-3 pt-1 text-sm">
        <div className="flex items-center justify-between text-brand-inactive-text dark:text-dark-body">
          <span>Sub-Total</span>
          <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(subtotal)}</span>
        </div>
        {discountVal > 0 && (
          <div className="flex items-center justify-between text-brand-inactive-text dark:text-dark-body">
            <span>Desconto</span>
            <span className="font-bold text-brand-red">-{formatCurrency(discountVal)}</span>
          </div>
        )}
        {shippingFee > 0 && (
          <div className="flex items-center justify-between text-brand-inactive-text dark:text-dark-body">
            <span>Taxa</span>
            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(shippingFee)}</span>
          </div>
        )}
        {otherCosts > 0 && (
          <div className="flex items-center justify-between text-brand-inactive-text dark:text-dark-body">
            <span>Outros custos</span>
            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(otherCosts)}</span>
          </div>
        )}
        <div className="border-t border-brand-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">Total</span>
            <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button className="h-12 flex-1" onClick={onContinue} isLoading={isFinalizing} disabled={!canContinue}>
          Continuar
        </Button>
        <POSOrderActionsMenu
          onSaveDraft={onSaveDraft}
          onOpenDiscount={onOpenDiscount}
          onAddShipping={onAddShipping}
          onOpenNotes={onOpenNotes}
        />
      </div>
    </div>
  )
})

export default function POSDesktopOrderPanel({
  canReset,
  onReset,
  ...summaryProps
}: SummaryProps) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-brand-border bg-brand-gray p-4 dark:bg-dark-border/50 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Resumo do Pedido</h3>
        <Button variant="outline" className="h-9" onClick={onReset} disabled={!canReset}>
          <TrashIcon className="h-4 w-4 text-brand-red dark:text-brand-red" /> Limpar Pedido
        </Button>
      </div>

      <div className="mt-auto">
        <POSOrderSummaryContent {...summaryProps} />
      </div>
    </div>
  )
}
