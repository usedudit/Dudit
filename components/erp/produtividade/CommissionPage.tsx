"use client"

import React, { useState, useEffect, useMemo } from "react"
import { AnimatePresence } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import { Badge } from "@/components/reusable/Badge"
import { SkeletonLoader } from "@/components/reusable/SkeletonLoader"
import { formatCurrency } from "@/lib/utils"
import { usePermissions } from "@/lib/permission-context"
import { useMediaQuery } from "@/components/erp/hooks"
import CommissionPaymentModal from "@/components/erp/produtividade/CommissionPaymentModal"
import CommissionPageControls from "@/components/erp/produtividade/CommissionPageControls"
import CommissionListItem from "@/components/erp/produtividade/CommissionListRow"
import CommissionGridCard from "@/components/erp/produtividade/CommissionGridCard"
import { getSellerCommissionHistoryAction } from "@/app/actions/erp/produtividade"
import { useToast } from "@/hooks/use-toast"
import type { CommissionOverview, SellerCommissionRow, CommissionHistoryRow } from "@/app/actions/erp/produtividade"
import {
  MoneyIcon,
  ChartIcon,
  AwardIcon,
  TargetIcon,
} from "@/lib/icons"

const STATUS_BADGE: Record<string, "green" | "orange" | "red" | "blue" | "gray"> = {
  paid: "green",
  pending: "orange",
  cancelled: "red",
}

const COLUMNS = [
  { id: "seller", label: "Vendedor", align: "left" as const, width: "300px" },
  { id: "pending", label: "Pendente", align: "right" as const, width: "120px" },
  { id: "paid", label: "Pago", align: "right" as const, width: "120px" },
  { id: "bonus", label: "Bônus", align: "right" as const, width: "120px" },
  { id: "total", label: "Total", align: "right" as const, width: "120px" },
  { id: "actions", label: "Ações", align: "center" as const, width: "120px" },
]

type Props = {
  partnerId: string
  overview: CommissionOverview
}

function MetricCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string; size?: number }>
  tone: "green" | "red" | "blue" | "orange"
}) {
  const toneMap = {
    green: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
    red: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    orange: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
  }
  return (
    <div className="rounded-2xl border border-brand-border dark:border-dark-border p-5 bg-white dark:bg-dark-surface flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-1">{title}</p>
        <p className="text-xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight">{value}</p>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toneMap[tone]}`}>
        <Icon size={20} />
      </div>
    </div>
  )
}

function SellerExpandedHistory({
  partnerUserId,
  partnerId,
}: {
  partnerUserId: string
  partnerId: string
}) {
  const [history, setHistory] = useState<CommissionHistoryRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    getSellerCommissionHistoryAction(partnerId, partnerUserId).then((res) => {
      if (res.success) setHistory(res.history)
      setLoading(false)
    })
  }, [partnerId, partnerUserId])

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <SkeletonLoader className="h-10 w-full" />
        <SkeletonLoader className="h-10 w-full" />
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="p-4 text-center">
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

export default function CommissionPage({ partnerId, overview }: Props) {
  const { hasSpecific } = usePermissions()
  const { toast } = useToast()

  const isMobile = useMediaQuery("(max-width: 767px)")
  const isTablet = useMediaQuery("(max-width: 1024px)")

  const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [paymentModal, setPaymentModal] = useState<{
    partnerUserId: string
    name: string
    maxAmount: number
  } | null>(null)

  const effectiveViewMode = isTablet ? "grid" : viewMode
  const canPayCommission = hasSpecific("productivity_commissions", "can_pay_commission")

  const filteredSellers = useMemo(() => {
    if (!search.trim()) return overview.sellers
    const q = search.toLowerCase().trim()
    return overview.sellers.filter((s) => s.name.toLowerCase().includes(q))
  }, [overview.sellers, search])

  const handlePay = (seller: SellerCommissionRow) => {
    setPaymentModal({
      partnerUserId: seller.partnerUserId,
      name: seller.name,
      maxAmount: seller.pendingAmount,
    })
  }

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
        .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
          <div className="flex flex-col gap-2 pt-1">
            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
              Comissões
            </h1>
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
              Acompanhe as comissões dos vendedores
            </p>
          </div>
        </div>

        <CommissionPageControls
          search={search}
          onSearchChange={setSearch}
          viewMode={effectiveViewMode}
          onViewModeChange={setViewModeState}
        />

        <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard title="Total Pendente" value={formatCurrency(overview.totalPending)} icon={MoneyIcon} tone="red" />
            <MetricCard title="Total Pago" value={formatCurrency(overview.totalPaid)} icon={MoneyIcon} tone="green" />
            <MetricCard title="Total Geral" value={formatCurrency(overview.totalGeneral)} icon={ChartIcon} tone="blue" />
            <MetricCard title="Bônus de Metas" value={formatCurrency(overview.goalBonuses)} icon={AwardIcon} tone="orange" />
            <MetricCard title="Comissão Prevista" value={formatCurrency(overview.estimatedCommission)} icon={TargetIcon} tone="blue" />
          </div>

          <AnimatePresence mode="wait">
            {filteredSellers.length === 0 ? (
              <FadeIn
                key="empty"
                className="flex flex-col items-center justify-center h-[400px] text-center p-8 w-full"
              >
                <IconPlaceholder
                  title="Nenhum vendedor encontrado"
                  subtitle={
                    search.trim()
                      ? "Tente ajustar o termo de busca."
                      : "Configure as comissões dos vendedores nas configurações do sistema."
                  }
                />
              </FadeIn>
            ) : (
              <FadeIn key={effectiveViewMode} className="w-full">
                {effectiveViewMode === "grid" ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                      {filteredSellers.map((seller) => (
                        <CommissionGridCard
                          key={seller.partnerUserId}
                          seller={seller}
                          isExpanded={expandedSeller === seller.partnerUserId}
                          onToggleExpand={() =>
                            setExpandedSeller(
                              expandedSeller === seller.partnerUserId ? null : seller.partnerUserId
                            )
                          }
                          canPayCommission={canPayCommission}
                          onPay={() => handlePay(seller)}
                        />
                      ))}
                    </div>
                    {expandedSeller && (() => {
                      const seller = filteredSellers.find((s) => s.partnerUserId === expandedSeller)
                      return seller ? (
                        <div className="rounded-2xl border border-brand-border dark:border-dark-border bg-brand-page-bg/30 dark:bg-dark-background/30 p-4 md:p-6 mb-6">
                          <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                            Histórico de Comissões — {seller.name}
                          </h4>
                          <SellerExpandedHistory
                            partnerUserId={seller.partnerUserId}
                            partnerId={partnerId}
                          />
                        </div>
                      ) : null
                    })()}
                  </>
                ) : (
                  <div className="w-full overflow-hidden rounded-xl relative">
                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                      <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                        <thead>
                          <tr className="bg-brand-gray dark:bg-dark-border/50">
                            {COLUMNS.map((col, idx) => {
                              const isLast = idx === COLUMNS.length - 1
                              return (
                                <th
                                  key={col.id}
                                  className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isLast ? "rounded-r-lg" : idx === 0 ? "rounded-l-lg" : ""}`}
                                  style={{ width: col.width }}
                                >
                                  <div className={`flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                    {col.label}
                                  </div>
                                </th>
                              )
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSellers.map((seller) => (
                            <React.Fragment key={seller.partnerUserId}>
                              <CommissionListItem
                                seller={seller}
                                columns={COLUMNS}
                                isExpanded={expandedSeller === seller.partnerUserId}
                                onToggleExpand={() =>
                                  setExpandedSeller(
                                    expandedSeller === seller.partnerUserId ? null : seller.partnerUserId
                                  )
                                }
                                canPayCommission={canPayCommission}
                                onPay={() => handlePay(seller)}
                              />
                              {expandedSeller === seller.partnerUserId && (
                                <tr className="border-b border-brand-border dark:border-dark-border">
                                  <td colSpan={COLUMNS.length} className="p-0">
                                    <div className="p-4 md:p-6 bg-brand-page-bg/30 dark:bg-dark-background/30">
                                      <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                                        Histórico de Comissões
                                      </h4>
                                      <SellerExpandedHistory
                                        partnerUserId={seller.partnerUserId}
                                        partnerId={partnerId}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </FadeIn>
            )}
          </AnimatePresence>
        </div>
      </div>

      {paymentModal && (
        <CommissionPaymentModal
          isOpen={true}
          onClose={() => setPaymentModal(null)}
          partnerId={partnerId}
          sellerName={paymentModal.name}
          sellerPartnerUserId={paymentModal.partnerUserId}
          maxAmount={paymentModal.maxAmount}
          onSuccess={() => window.location.reload()}
        />
      )}
    </FadeIn>
  )
}
