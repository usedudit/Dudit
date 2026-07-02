"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { ChevronLeftIcon } from "@/lib/icons"
import { Button, Badge, Tabs, TabsContent, TabsList, TabsTrigger, SkeletonLoader } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { formatCurrency } from "@/lib/utils"
import { getSellerCommissionHistoryAction } from "@/app/actions/erp/produtividade"
import type { SellerCommissionRow, CommissionHistoryRow } from "@/app/actions/erp/produtividade"

const STATUS_BADGE: Record<string, "green" | "orange" | "red" | "blue" | "gray"> = {
  paid: "green",
  pending: "orange",
  cancelled: "red",
}

type Props = {
  seller: SellerCommissionRow
  partnerId: string
  onBack: () => void
}

function GeneralTab({ seller }: { seller: SellerCommissionRow }) {
  const commissionLabel =
    seller.commissionType === "percentage_sale"
      ? `${seller.commissionValue}% sobre venda`
      : seller.commissionType === "fixed_per_sale"
        ? `R$ ${seller.commissionValue} por venda`
        : "Sem comissão configurada"

  const rows = [
    { label: "Pendente", value: formatCurrency(seller.pendingAmount), color: "text-orange-600 dark:text-orange-400" },
    { label: "Pago", value: formatCurrency(seller.paidAmount), color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Bônus", value: formatCurrency(seller.bonusAmount), color: "text-purple-600 dark:text-purple-400" },
    { label: "Total Acumulado", value: formatCurrency(seller.totalAccumulated), color: "text-brand-dark dark:text-dark-heading" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
        <UserProfileImage
          fullName={seller.name}
          imageUrl={seller.avatarUrl}
          className="w-14 h-14 text-xl"
        />
        <div>
          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{seller.name}</h3>
          <p className="text-sm text-brand-inactive-text dark:text-dark-body">{commissionLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-2xl border border-brand-border dark:border-dark-border p-4 bg-white dark:bg-dark-surface"
          >
            <p className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-1">{row.label}</p>
            <p className={`text-xl font-extrabold tracking-tight ${row.color}`}>{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoryTab({ partnerUserId, partnerId }: { partnerUserId: string; partnerId: string }) {
  const [history, setHistory] = useState<CommissionHistoryRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getSellerCommissionHistoryAction(partnerId, partnerUserId).then((res) => {
      if (res.success) setHistory(res.history)
      setLoading(false)
    })
  }, [partnerId, partnerUserId])

  if (loading) {
    return (
      <div className="space-y-2">
        <SkeletonLoader className="h-10 w-full" />
        <SkeletonLoader className="h-10 w-full" />
        <SkeletonLoader className="h-10 w-full" />
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum histórico de comissão encontrado.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body border-b border-brand-border dark:border-dark-border">
            <th className="pb-2 pr-4">Descrição</th>
            <th className="pb-2 pr-4">Valor</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2 pr-4">Data</th>
            <th className="pb-2">Referência</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} className="border-b border-brand-border/50 dark:border-dark-border/50">
              <td className="py-2.5 pr-4 text-brand-dark dark:text-dark-heading font-medium">{h.description}</td>
              <td className="py-2.5 pr-4 font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(h.amount)}</td>
              <td className="py-2.5 pr-4">
                <Badge variant={STATUS_BADGE[h.status] || "gray"}>{h.status}</Badge>
              </td>
              <td className="py-2.5 pr-4 text-brand-inactive-text dark:text-dark-body">
                {h.paymentDate ? new Date(h.paymentDate).toLocaleDateString("pt-BR") : "-"}
              </td>
              <td className="py-2.5 text-brand-inactive-text dark:text-dark-body text-[12px] max-w-[120px] truncate">
                {h.referenceNote || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CommissionDetailView({ seller, partnerId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState("general")

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="h-full flex flex-col bg-white dark:bg-dark-surface"
    >
      <div className="flex items-center gap-3 px-6 py-4 border-b border-brand-border dark:border-dark-border shrink-0">
        <Button variant="ghost" onClick={onBack} className="w-9 h-9 p-0">
          <ChevronLeftIcon size={18} />
        </Button>
        <div>
          <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{seller.name}</h2>
          <p className="text-xs text-brand-inactive-text dark:text-dark-body">Detalhes da Comissão</p>
        </div>
      </div>

      <div className="px-6 pt-4 shrink-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="px-0">
            <TabsTrigger value="general">Dados Gerais</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activeTab === "general" ? (
          <GeneralTab seller={seller} />
        ) : (
          <HistoryTab partnerUserId={seller.partnerUserId} partnerId={partnerId} />
        )}
      </div>
    </motion.div>
  )
}
