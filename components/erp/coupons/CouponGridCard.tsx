"use client"

import React from "react"
import { ActionsDropdown, Badge, Checkbox } from "@/components/reusable"
import { SparklesIcon, TagIcon, Users } from "@/lib/icons"
import {
    CouponRow,
    getCouponApplyScopeLabel,
    getCouponPrimaryMeta,
    getCouponStatusLabel,
    getCouponStatusVariant,
    getCouponUsageSummary,
    getCouponValiditySummary,
} from "@/lib/types/coupon"
import { FadeIn } from "@/components/animations/FadeIn"

interface CouponGridCardProps {
    coupon: CouponRow
    selected: boolean
    onSelect: () => void
    onDetails: (coupon: CouponRow) => void
    onEdit?: (coupon: CouponRow) => void
    onToggleStatus?: (coupon: CouponRow) => void
    onDelete?: (coupon: CouponRow) => void
}

const CouponGridCard = React.memo(
    ({ coupon, selected, onSelect, onDetails, onEdit, onToggleStatus, onDelete }: CouponGridCardProps) => {
        return (
            <FadeIn
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
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                    {coupon.code}
                                </h3>
                                <Badge variant={getCouponStatusVariant(coupon)} className="whitespace-nowrap scale-90 shrink-0">
                                    {getCouponStatusLabel(coupon)}
                                </Badge>
                                {coupon.is_automatic && (
                                    <Badge variant="purple" icon={<SparklesIcon />} className="whitespace-nowrap scale-90 shrink-0" />
                                )}
                                {coupon.customer_scope === "specific" && (
                                    <Badge variant="gray" icon={<Users />} className="whitespace-nowrap scale-90 shrink-0" />
                                )}
                            </div>

                            <div className="shrink-0 -mt-1 -mr-1" onClick={(event) => event.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
                            {getCouponPrimaryMeta(coupon)}
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Validade</span>
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-[170px]">
                                {getCouponValiditySummary(coupon)}
                            </span>
                        </div>
                        <div className="flex flex-col gap-0.5 items-end">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Uso</span>
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                {getCouponUsageSummary(coupon)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-end justify-between mt-3">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Escopo</span>
                            <div className="flex items-center gap-2.5">
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                    {getCouponApplyScopeLabel(coupon.apply_scope)}
                                </span>
                            </div>
                        </div>

                        <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
                            <ActionsDropdown
                                onView={() => onDetails(coupon)}
                                onEdit={onEdit ? () => onEdit(coupon) : undefined}
                                onCancel={onToggleStatus ? () => onToggleStatus(coupon) : undefined}
                                cancelLabel={coupon.is_active ? "Desativar" : "Ativar"}
                                onDelete={onDelete ? () => onDelete(coupon) : undefined}
                            />
                        </div>
                    </div>
                </div>
            </FadeIn>
        )
    },
)

CouponGridCard.displayName = "CouponGridCard"

export default CouponGridCard
