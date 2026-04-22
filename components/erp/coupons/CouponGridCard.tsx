"use client"

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Checkbox } from "@/components/reusable"
import { SparklesIcon, TagIcon } from "@/lib/icons"
import {
  CouponRow,
  getCouponApplyScopeLabel,
  getCouponPrimaryMeta,
  getCouponStatusLabel,
  getCouponStatusVariant,
  getCouponUsageSummary,
  getCouponValiditySummary,
} from "@/lib/types/coupon"

interface CouponGridCardProps {
  coupon: CouponRow
  selected: boolean
  onSelect: () => void
  onDetails: (coupon: CouponRow) => void
  onEdit: (coupon: CouponRow) => void
  onToggleStatus: (coupon: CouponRow) => void
  onDelete: (coupon: CouponRow) => void
}

const CouponGridCard = React.memo(
  ({ coupon, selected, onSelect, onDetails, onEdit, onToggleStatus, onDelete }: CouponGridCardProps) => {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => onDetails(coupon)}
        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative overflow-hidden"
      >
        <div className="flex gap-4 mb-2">
          <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
            <TagIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex justify-between items-start gap-1">
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                  {coupon.code}
                </h3>
                <Badge variant={getCouponStatusVariant(coupon)} className="whitespace-nowrap scale-90 shrink-0">
                  {getCouponStatusLabel(coupon)}
                </Badge>
              </div>

              <div className="shrink-0 -mt-1 -mr-1" onClick={(event) => event.stopPropagation()}>
                <Checkbox checked={selected} onChange={onSelect} />
              </div>
            </div>

            <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate mt-1">
              {getCouponPrimaryMeta(coupon)}
            </div>
            <div className="text-[16px] font-bold text-brand-dark dark:text-dark-heading mt-1.5">
              {getCouponApplyScopeLabel(coupon.apply_scope)}
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {coupon.is_automatic && (
                <Badge variant="purple" className="whitespace-nowrap scale-90 shrink-0">
                  Automatico
                </Badge>
              )}
              {coupon.customer_scope === "specific" && (
                <Badge variant="gray" className="whitespace-nowrap scale-90 shrink-0">
                  Clientes especificos
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Validade</span>
              <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-[170px]">
                {getCouponValiditySummary(coupon)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 items-end">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Uso</span>
              <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                {getCouponUsageSummary(coupon)}
              </span>
            </div>
          </div>

          <div className="flex items-end justify-between mt-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Status</span>
              <div className="flex items-center gap-2.5">
                <Badge variant={getCouponStatusVariant(coupon)} className="whitespace-nowrap scale-90">
                  {getCouponStatusLabel(coupon)}
                </Badge>
                {coupon.is_automatic && <SparklesIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />}
              </div>
            </div>

            <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
              <ActionsDropdown
                onView={() => onDetails(coupon)}
                onEdit={() => onEdit(coupon)}
                onCancel={() => onToggleStatus(coupon)}
                cancelLabel={coupon.is_active ? "Desativar" : "Ativar"}
                onDelete={() => onDelete(coupon)}
              />
            </div>
          </div>
        </div>
      </motion.div>
    )
  },
)

CouponGridCard.displayName = "CouponGridCard"

export default CouponGridCard
