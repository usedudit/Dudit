"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import { EditIcon, SparklesIcon, TrashIcon, TagIcon } from "@/lib/icons"
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
  onDetails: (coupon: CouponRow) => void
  onEdit: (coupon: CouponRow) => void
  onToggleStatus: (coupon: CouponRow) => void
  onDelete: (coupon: CouponRow) => void
}

const CouponGridCard = React.memo(
  ({ coupon, onDetails, onEdit, onToggleStatus, onDelete }: CouponGridCardProps) => {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18 }}
        onClick={() => onDetails(coupon)}
        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary/80 via-brand-green/70 to-brand-primary/40 opacity-70" />

        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
            <TagIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">{coupon.code}</h3>
                <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  {getCouponPrimaryMeta(coupon)}
                </p>
              </div>
              <Badge variant={getCouponStatusVariant(coupon)} className="whitespace-nowrap scale-90">
                {getCouponStatusLabel(coupon)}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="gray" icon={null}>
                {getCouponApplyScopeLabel(coupon.apply_scope)}
              </Badge>
              {coupon.is_automatic && (
                <Badge variant="blue" icon={<SparklesIcon />}>
                  Automatico
                </Badge>
              )}
              {coupon.customer_scope === "specific" && (
                <Badge variant="orange" icon={null}>
                  Segmentado
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div className="rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/40 dark:bg-dark-border/20 p-3">
            <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body mb-1">Uso</p>
            <p className="font-bold text-brand-dark dark:text-dark-heading leading-tight">{getCouponUsageSummary(coupon)}</p>
          </div>
          <div className="rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/40 dark:bg-dark-border/20 p-3">
            <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body mb-1">Validade</p>
            <p className="font-bold text-brand-dark dark:text-dark-heading leading-tight">
              {coupon.ends_at ? getCouponValiditySummary(coupon) : "Sem vencimento"}
            </p>
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={(event) => {
              event.stopPropagation()
              onEdit(coupon)
            }}
          >
            <EditIcon className="w-4 h-4 mr-2" />
            Editar
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={(event) => {
              event.stopPropagation()
              onToggleStatus(coupon)
            }}
          >
            {coupon.is_active ? "Desativar" : "Ativar"}
          </Button>
          <Button
            variant="ghost"
            className="w-10 h-10 p-0 shrink-0"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(coupon)
            }}
          >
            <TrashIcon className="w-4 h-4 text-brand-red-dark" />
          </Button>
        </div>
      </motion.div>
    )
  },
)

CouponGridCard.displayName = "CouponGridCard"

export default CouponGridCard
