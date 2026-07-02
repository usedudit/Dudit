"use client"

import React, { useState, useMemo } from "react"
import { AnimatePresence } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import { IconPlaceholder } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { usePermissions } from "@/lib/permission-context"
import { useMediaQuery } from "@/components/erp/hooks"
import CommissionPaymentModal from "@/components/erp/produtividade/CommissionPaymentModal"
import CommissionPageControls from "@/components/erp/produtividade/CommissionPageControls"
import CommissionListItem from "@/components/erp/produtividade/CommissionListRow"
import CommissionGridCard from "@/components/erp/produtividade/CommissionGridCard"
import CommissionDetailView from "@/components/erp/produtividade/CommissionDetailView"
import type { CommissionOverview, SellerCommissionRow } from "@/app/actions/erp/produtividade"
import {
  MoneyIcon,
  ChartIcon,
  AwardIcon,
  TargetIcon,
} from "@/lib/icons"

const COLUMNS = [
  { id: "seller", label: "Vendedor", align: "left", width: "300px" },
  { id: "pending", label: "Pendente", align: "right", width: "120px" },
  { id: "paid", label: "Pago", align: "right", width: "120px" },
  { id: "bonus", label: "Bônus", align: "right", width: "120px" },
  { id: "total", label: "Total", align: "right", width: "120px" },
  { id: "actions", label: "Ações", align: "center", width: "100px" },
]

const metricIcons = [MoneyIcon, MoneyIcon, ChartIcon, AwardIcon, TargetIcon]
const metricTones = [
  "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
  "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
  "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
]

type Props = {
  partnerId: string
  overview: CommissionOverview
}

export default function CommissionPage({ partnerId, overview }: Props) {
  const { hasSpecific } = usePermissions()

  const isMobile = useMediaQuery("(max-width: 767px)")
  const isTablet = useMediaQuery("(max-width: 1024px)")

  const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
  const [search, setSearch] = useState("")
  const [paymentModal, setPaymentModal] = useState<{
    partnerUserId: string
    name: string
    maxAmount: number
  } | null>(null)
  const [detailSeller, setDetailSeller] = useState<SellerCommissionRow | null>(null)

  const effectiveViewMode = isTablet ? "grid" : viewMode
  const canPayCommission = hasSpecific("productivity_commissions", "can_pay_commission")

  const filteredSellers = useMemo(() => {
    if (!search.trim()) return overview.sellers
    const q = search.toLowerCase().trim()
    return overview.sellers.filter((s) => s.name.toLowerCase().includes(q))
  }, [overview.sellers, search])

  if (detailSeller) {
    return (
      <CommissionDetailView
        seller={detailSeller}
        partnerId={partnerId}
        onBack={() => setDetailSeller(null)}
      />
    )
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
          {/* Metric Cards - estilo dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
            {[
              { title: "Total Pendente", value: formatCurrency(overview.totalPending) },
              { title: "Total Pago", value: formatCurrency(overview.totalPaid) },
              { title: "Total Geral", value: formatCurrency(overview.totalGeneral) },
              { title: "Bônus de Metas", value: formatCurrency(overview.goalBonuses) },
              { title: "Comissão Prevista", value: formatCurrency(overview.estimatedCommission) },
            ].map((card, i) => {
              const Icon = metricIcons[i]
              const toneClass = metricTones[i]
              return (
                <div
                  key={card.title}
                  className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${toneClass}`}>
                        <Icon size={18} />
                      </div>
                      <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{card.title}</span>
                    </div>
                  </div>
                  <div className="flex items-baseline mt-2">
                    <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                      {card.value}
                    </h2>
                  </div>
                </div>
              )
            })}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                    {filteredSellers.map((seller) => (
                      <CommissionGridCard
                        key={seller.partnerUserId}
                        seller={seller}
                        canPayCommission={canPayCommission}
                        onPay={() =>
                          setPaymentModal({
                            partnerUserId: seller.partnerUserId,
                            name: seller.name,
                            maxAmount: seller.pendingAmount,
                          })
                        }
                        onDetails={() => setDetailSeller(seller)}
                      />
                    ))}
                  </div>
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
                            <CommissionListItem
                              key={seller.partnerUserId}
                              seller={seller}
                              columns={COLUMNS}
                              canPayCommission={canPayCommission}
                              onPay={() =>
                                setPaymentModal({
                                  partnerUserId: seller.partnerUserId,
                                  name: seller.name,
                                  maxAmount: seller.pendingAmount,
                                })
                              }
                              onDetails={() => setDetailSeller(seller)}
                            />
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
