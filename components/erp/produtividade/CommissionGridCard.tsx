'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem, Tooltip } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { MoneyIcon, EyeIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import type { SellerCommissionRow } from "@/app/actions/erp/produtividade"

interface CommissionGridCardProps {
  seller: SellerCommissionRow
  canPayCommission: boolean
  onPay: () => void
  onDetails: () => void
}

const CommissionGridCard = React.memo(
  ({
    seller,
    canPayCommission,
    onPay,
    onDetails,
  }: CommissionGridCardProps) => {
    const commissionLabel =
      seller.commissionType === "percentage_sale"
        ? `${seller.commissionValue}%`
        : seller.commissionType === "fixed_per_sale"
          ? `R$ ${seller.commissionValue}`
          : "Sem comissão"

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
        onClick={onDetails}
      >
        <div className="flex gap-4 mb-2">
          <UserProfileImage
            fullName={seller.name || "Vendedor"}
            imageUrl={seller.avatarUrl}
            className="w-12 h-12 text-lg"
          />

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex justify-between items-start gap-1">
              <div className="flex flex-wrap items-center min-w-0 pr-1 gap-2">
                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                  {seller.name}
                </h3>
                <Tooltip text={`Comissão: ${commissionLabel}`}>
                  <Badge
                    variant={seller.commissionType !== "none" ? "blue" : "gray"}
                    className="whitespace-nowrap scale-90 shrink-0"
                  />
                </Tooltip>
              </div>
            </div>

            <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate mt-0.5">
              {commissionLabel}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pendente</span>
              <span className="text-[14px] font-bold text-orange-600 dark:text-orange-400">
                {formatCurrency(seller.pendingAmount)}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 items-end">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pago</span>
              <span className="text-[14px] font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(seller.paidAmount)}
              </span>
            </div>
          </div>

          <div className="flex items-end justify-between mt-1">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Total</span>
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                {formatCurrency(seller.totalAccumulated)}
              </span>
            </div>

            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <ActionsDropdown>
                {canPayCommission && seller.pendingAmount > 0 && (
                  <DropdownItem onClick={onPay}>
                    <MoneyIcon size={18} /> Pagar comissão
                  </DropdownItem>
                )}
                <DropdownItem onClick={onDetails}>
                  <EyeIcon size={18} /> Ver detalhes
                </DropdownItem>
              </ActionsDropdown>
            </div>
          </div>
        </div>
      </motion.div>
    )
  },
  (prev, next) =>
    prev.seller.partnerUserId === next.seller.partnerUserId &&
    prev.seller.pendingAmount === next.seller.pendingAmount &&
    prev.seller.paidAmount === next.seller.paidAmount &&
    prev.seller.bonusAmount === next.seller.bonusAmount &&
    prev.seller.totalAccumulated === next.seller.totalAccumulated &&
    prev.canPayCommission === next.canPayCommission
)

CommissionGridCard.displayName = "CommissionGridCard"

export default CommissionGridCard
