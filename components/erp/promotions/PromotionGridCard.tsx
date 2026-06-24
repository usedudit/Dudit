'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { MegaphoneIcon, Users, CalendarIcon } from "@/lib/icons"

interface PromotionGridCardProps {
    campaign: any
    campaignPromotions: any[]
    selected: boolean
    onSelect: () => void
    onDetails: () => void
    onEdit: () => void
    onDelete: () => void
}

const getPromotionTypeLabel = (rule: any) => {
    if (!rule) return "Sem regras"
    switch (rule.promotion_type) {
        case "discount": return "Desconto Direto"
        case "buy_x_pay_y": return "Leve X Pague Y"
        case "gift": return "Ganhar Brinde"
        default: return rule.promotion_type || "Outro"
    }
}

const formatRuleDetails = (rule: any) => {
    if (!rule) return { above: "Sem limites de uso", below: "-" }
    let above = "Sem limites de uso"
    const globalLimit = rule.usage_limit
    const customerLimit = rule.usage_limit_per_customer
    if (globalLimit && customerLimit) {
        above = `Global: ${globalLimit} | Por cliente: ${customerLimit}`
    } else if (globalLimit) {
        above = `Limite global: ${globalLimit}`
    } else if (customerLimit) {
        above = `Limite por cliente: ${customerLimit}`
    }

    let below = ""
    if (rule.promotion_type === "discount") {
        const isPercent = rule.discount_type === "percentage"
        const formatCurrency = (val: any) => {
            if (val === undefined || val === null) return ""
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
        }
        const valStr = isPercent
            ? `${rule.discount_value}% Desc.`
            : `${formatCurrency(rule.discount_value)} Desc.`
        const maxStr = rule.max_discount_amount
            ? ` - Max ${formatCurrency(rule.max_discount_amount)}`
            : ""
        below = `${valStr}${maxStr}`
    } else if (rule.promotion_type === "buy_x_pay_y") {
        below = `Leve ${rule.buy_quantity} Pague ${rule.pay_quantity}`
    } else if (rule.promotion_type === "gift") {
        below = `1 Brinde`
    }

    if (rule.min_spend_amount) {
        const formatCurrency = (val: any) => {
            if (val === undefined || val === null) return ""
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
        }
        below += ` - Min ${formatCurrency(rule.min_spend_amount)}`
    }

    return { above, below }
}

const PromotionGridCard = React.memo(({
    campaign,
    campaignPromotions,
    selected,
    onSelect,
    onDetails,
    onEdit,
    onDelete
}: PromotionGridCardProps) => {
    const rule = campaignPromotions[0]
    const promoTypeLabel = getPromotionTypeLabel(rule)
    const ruleDetails = formatRuleDetails(rule)

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
            onClick={onDetails}
        >
            <div className="flex gap-4 mb-2">
                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                    <MegaphoneIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-2 min-w-0 pr-1 flex-nowrap">
                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate" title={campaign.name}>
                                {campaign.name}
                            </h3>
                            <div className="flex items-center gap-1 shrink-0">
                                <Tooltip text={campaign.is_active ? "Status: Ativa" : "Status: Inativa"}>
                                    <Badge
                                        variant={campaign.is_active ? "green" : "gray"}
                                        className="whitespace-nowrap scale-90 shrink-0"
                                    />
                                </Tooltip>
                                <Tooltip text={campaign.customer_scope === "specific" ? "Público: Segmentado" : "Público: Geral"}>
                                    <Badge
                                        variant={campaign.customer_scope === "specific" ? "blue" : "gray"}
                                        icon={<Users />}
                                        className="whitespace-nowrap scale-90 shrink-0"
                                    />
                                </Tooltip>
                            </div>
                        </div>

                        <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selected} onChange={onSelect} />
                        </div>
                    </div>

                    <p className="text-xs text-brand-inactive-text dark:text-dark-body font-semibold mt-0.5">
                        {promoTypeLabel}
                    </p>
                </div>
            </div>

            <div className="my-3 flex flex-col">
                <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">{ruleDetails.above}</span>
                <span className="text-xs font-bold text-brand-dark dark:text-dark-heading mt-0.5">{ruleDetails.below}</span>
            </div>

            <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body flex items-center gap-1">
                        <CalendarIcon className="w-3.5 h-3.5" /> Vigência
                    </span>
                    {campaign.starts_at && campaign.ends_at ? (
                        <div className="flex flex-col mt-0.5">
                            <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                {new Date(campaign.starts_at).toLocaleDateString('pt-BR')}
                            </span>
                            <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">
                                {new Date(campaign.ends_at).toLocaleDateString('pt-BR')}
                            </span>
                        </div>
                    ) : (
                        <span className="text-xs font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                            Indeterminado
                        </span>
                    )}
                </div>

                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <ActionsDropdown
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                </div>
            </div>
        </motion.div>
    )
})

PromotionGridCard.displayName = "PromotionGridCard"

export default PromotionGridCard
