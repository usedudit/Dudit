"use client"

import { memo, type ReactNode } from "react"
import { ChevronRightIcon, FileIcon, TagIcon, ThreeDotsIcon, TrashIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { Button, IconPlaceholder } from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"

type SummaryProps = {
  itemCount: number
  subtotal: number
  discountVal: number
  discountType?: "fixed" | "percentage" | "coupon"
  discountInputValue?: number
  discountCouponCode?: string
  couponDiscountValue?: number
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
  onOpenCreateProduct: () => void
  onOpenNotes: () => void
  showItemsShortcut?: boolean
  showActionsMenu?: boolean
  isEmpty?: boolean
  emptyState?: ReactNode
}

function POSOrderActionsMenu({
  onSaveDraft,
  onOpenDiscount,
  onAddShipping,
  onOpenCreateProduct,
  onOpenNotes,
  showActionsMenu = true,
}: Pick<SummaryProps, "onSaveDraft" | "onOpenDiscount" | "onAddShipping" | "onOpenCreateProduct" | "onOpenNotes" | "showActionsMenu">) {
  if (!showActionsMenu) return null

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
        <FileIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" /> Salvar Pedido
      </DropdownItem>
      <DropdownItem onClick={onOpenDiscount}>
        <TagIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" /> Aplicar Desconto
      </DropdownItem>
      <DropdownItem onClick={onAddShipping}>
        <FileIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" /> Adicionar Frete
      </DropdownItem>
      <DropdownItem onClick={onOpenCreateProduct}>
        <FileIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" /> Criar Produto
      </DropdownItem>
      <DropdownItem onClick={onOpenNotes}>
        <FileIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" /> Adicionar Observação
      </DropdownItem>
    </Dropdown>
  )
}

export const POSOrderSummaryContent = memo(function POSOrderSummaryContent({
  itemCount,
  subtotal,
  discountVal,
  discountType = "fixed",
  discountInputValue = 0,
  discountCouponCode = "",
  couponDiscountValue = 0,
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
  onOpenCreateProduct,
  onOpenNotes,
  showItemsShortcut = true,
  showActionsMenu = true,
  isEmpty = false,
  emptyState,
}: Omit<SummaryProps, "canReset" | "onReset">) {
  if (isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-brand-border bg-white p-6 dark:bg-dark-surface">
        {emptyState || (
          <IconPlaceholder
            title="Nenhum item no pedido"
            subtitle="Adicione produtos para começar o atendimento."
            className="py-8"
          />
        )}
      </div>
    )
  }

  return (
    <div className="bg-white space-y-4 dark:bg-dark-surface lg:rounded-2xl lg:border lg:border-brand-border lg:p-4">
      {showItemsShortcut && (
        <button
          type="button"
          onClick={onOpenItems}
          className="flex w-full items-center justify-between rounded-full border border-brand-border bg-brand-gray/50 dark:bg-brand-border/50 px-1 py-1 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-dark text-white">
              <FileIcon className="h-4 w-4" />
            </div>
            <span className="font-bold text-brand-dark dark:text-dark-heading">Itens do Pedido ({itemCount})</span>
          </div>
          <ChevronRightIcon className="mr-2 h-5 w-5 text-brand-inactive-text" />
        </button>
      )}

      <div className="space-y-3 pt-1 text-sm">
        <div className="flex items-center justify-between text-brand-inactive-text dark:text-dark-body">
          <span>Sub-Total</span>
          <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(subtotal)}</span>
        </div>
        {discountVal > 0 && (
          <div className="flex items-center justify-between text-brand-inactive-text dark:text-dark-body">
            <span>
              {discountType === "percentage"
                ? `Desconto (${Number(discountInputValue || 0)}%)`
                : discountType === "coupon"
                  ? `Desconto (Cupom ${discountCouponCode || "—"} - ${formatCurrency(Number(couponDiscountValue || discountVal || 0))} OFF)`
                  : `Desconto (${formatCurrency(Number(discountInputValue || 0))})`}
            </span>
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
          onOpenCreateProduct={onOpenCreateProduct}
          onOpenNotes={onOpenNotes}
          showActionsMenu={showActionsMenu}
        />
      </div>
    </div>
  )
})

export default function POSDesktopOrderPanel({
  canReset,
  onReset,
  onOpenNotes,
  hasNotes = false,
  cartItems,
  isEmpty = false,
  emptyState,
  ...summaryProps
}: SummaryProps & {
  hasNotes?: boolean
  cartItems?: ReactNode
  isEmpty?: boolean
  emptyState?: ReactNode
}) {
  if (isEmpty) {
    return (
      <div className="flex h-full min-h-0 flex-col rounded-xl border border-brand-border bg-brand-gray p-4 dark:bg-dark-border/50 md:p-5">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {emptyState || (
            <IconPlaceholder
              title="Nenhum item no pedido"
              subtitle="Adicione produtos para começar o atendimento."
              className="py-8"
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-brand-border bg-brand-gray p-4 dark:bg-dark-border/50 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl lg:text-2xl font-bold text-brand-dark dark:text-dark-heading">Resumo do Pedido</h3>
        <div className="flex items-center gap-2">
          {hasNotes && (
            <Button variant="outline" className="h-9 w-9 p-0" onClick={onOpenNotes}>
              <FileIcon className="h-4 w-4 text-brand-dark dark:text-dark-heading" />
            </Button>
          )}
          <Button variant="outline" className="h-9 text-brand-red dark:text-brand-red" onClick={onReset} disabled={!canReset}>
            <TrashIcon className="h-4 w-4 text-brand-red dark:text-brand-red" /> Limpar Pedido
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {cartItems && <div className="min-h-0 flex-1 overflow-hidden">{cartItems}</div>}
        <POSOrderSummaryContent {...summaryProps} onOpenNotes={onOpenNotes} />
      </div>
    </div>
  )
}
