"use client"

import React, { useState, useMemo, useCallback } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { IconPlaceholder } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { usePermissions } from "@/lib/permission-context"
import { useMediaQuery } from "@/components/erp/hooks"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import Pagination from "@/components/reusable/Pagination"
import CommissionPaymentModal from "@/components/erp/produtividade/CommissionPaymentModal"
import CommissionPageControls from "@/components/erp/produtividade/CommissionPageControls"
import CommissionListItem from "@/components/erp/produtividade/CommissionListRow"
import CommissionGridCard from "@/components/erp/produtividade/CommissionGridCard"
import CommissionDetailView from "@/components/erp/produtividade/CommissionDetailView"
import type { CommissionOverview, SellerCommissionRow } from "@/app/actions/erp/produtividade"
import {
  MoneyIcon,
  ChartIcon,
  TargetIcon,
  ArrowUpDownIcon,
} from "@/lib/icons"

type ColumnDef = { id: string; label: string; align: "left" | "center" | "right"; width: string; sortable?: boolean; key?: string }

const COLUMNS: ColumnDef[] = [
  { id: "seller", label: "Vendedor", align: "left", width: "300px", sortable: true, key: "name" },
  { id: "pending", label: "Pendente", align: "right", width: "120px", sortable: true, key: "pending" },
  { id: "paid", label: "Pago", align: "right", width: "120px", sortable: true, key: "paid" },
  { id: "bonus", label: "Bônus a pagar", align: "right", width: "140px", sortable: true, key: "bonus" },
  { id: "total", label: "Total", align: "right", width: "120px", sortable: true, key: "total" },
  { id: "actions", label: "Ações", align: "center", width: "100px" },
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
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: "asc" | "desc" } | null>(null)
  const [page, setPage] = useState(1)
  const [paymentModal, setPaymentModal] = useState<{
    partnerUserId: string
    name: string
    maxAmount: number
  } | null>(null)
  const [detailSeller, setDetailSeller] = useState<SellerCommissionRow | null>(null)

  const PER_PAGE = 20

  const effectiveViewMode = isTablet ? "grid" : viewMode
  const canPayCommission = hasSpecific("productivity_commissions", "can_pay_commission")

  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      return { key, dir: "asc" }
    })
  }, [])

  const sortedSellers = useMemo(() => {
    const list = [...overview.sellers]
    if (!sortConfig) {
      list.sort((a, b) => b.totalAccumulated - a.totalAccumulated)
      return list
    }
    const { key, dir } = sortConfig
    const mul = dir === "asc" ? 1 : -1
    switch (key) {
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name) * mul)
        break
      case "pending":
        list.sort((a, b) => (a.pendingAmount - b.pendingAmount) * mul)
        break
      case "paid":
        list.sort((a, b) => (a.paidAmount - b.paidAmount) * mul)
        break
      case "bonus":
        list.sort((a, b) => (a.bonusAmount - b.bonusAmount) * mul)
        break
      default:
        list.sort((a, b) => (a.totalAccumulated - b.totalAccumulated) * mul)
    }
    return list
  }, [overview.sellers, sortConfig])

  const filteredSellers = useMemo(() => {
    if (!search.trim()) return sortedSellers
    const q = search.toLowerCase().trim()
    return sortedSellers.filter((s) => s.name.toLowerCase().includes(q))
  }, [sortedSellers, search])

  const totalPages = Math.ceil(filteredSellers.length / PER_PAGE)

  const pagedSellers = useMemo(() => {
    return filteredSellers.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  }, [filteredSellers, page])

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
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          viewMode={effectiveViewMode}
          onViewModeChange={setViewModeState}
        />

        <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
          <HorizontalKPICard
            items={[
              {
                title: "Comissão Prevista",
                value: formatCurrency(overview.estimatedCommission),
                icon: ChartIcon,
                iconBg: "bg-blue-100 dark:bg-blue-900/30",
                iconColor: "text-blue-600 dark:text-blue-400",
              },
              {
                title: "Comissão Paga",
                value: formatCurrency(overview.totalPaid),
                icon: MoneyIcon,
                iconBg: "bg-green-100 dark:bg-green-900/30",
                iconColor: "text-green-600 dark:text-green-400",
              },
              {
                title: "Comissão Pendente",
                value: formatCurrency(overview.totalPending),
                icon: TargetIcon,
                iconBg: "bg-orange-100 dark:bg-orange-900/30",
                iconColor: "text-orange-600 dark:text-orange-400",
              },
            ]}
            className="mb-8"
          />

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
            <FadeIn className="w-full">
              {effectiveViewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                  {pagedSellers.map((seller) => (
                    <CommissionGridCard
                      key={seller.partnerUserId}
                      seller={seller}
                      canPayCommission={canPayCommission}
                      onPay={() =>
                        setPaymentModal({
                          partnerUserId: seller.partnerUserId,
                          name: seller.name,
                          maxAmount: seller.pendingAmount + seller.bonusPending,
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
                            const isSorted = sortConfig?.key === col.key
                            const isLast = idx === COLUMNS.length - 1
                            return (
                              <th
                                key={col.id}
                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isLast ? "rounded-r-lg" : idx === 0 ? "rounded-l-lg" : ""} ${col.sortable ? "cursor-pointer hover:bg-gray-200 dark:hover:bg-dark-border transition-colors select-none group" : ""}`}
                                style={{ width: col.width }}
                                onClick={() => col.sortable && col.key && handleSort(col.key)}
                              >
                                <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                  <span>{col.label}</span>
                                  {col.sortable && (
                                    <ArrowUpDownIcon className={`w-3.5 h-3.5 transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading block" : "text-gray-400 hidden group-hover:block opacity-40"}`} />
                                  )}
                                </div>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedSellers.map((seller) => (
                          <CommissionListItem
                            key={seller.partnerUserId}
                            seller={seller}
                            columns={COLUMNS}
                            canPayCommission={canPayCommission}
                            onPay={() =>
                              setPaymentModal({
                                partnerUserId: seller.partnerUserId,
                                name: seller.name,
                                maxAmount: seller.pendingAmount + seller.bonusPending,
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

              {totalPages > 1 && (
                <div className="mt-6">
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </FadeIn>
          )}
        </div>
      </div>

      <CommissionDetailView
        isOpen={!!detailSeller}
        seller={detailSeller}
        partnerId={partnerId}
        onClose={() => setDetailSeller(null)}
        onPay={() => {
          if (detailSeller) {
            setPaymentModal({
              partnerUserId: detailSeller.partnerUserId,
              name: detailSeller.name,
              maxAmount: detailSeller.pendingAmount + detailSeller.bonusPending,
            })
          }
        }}
      />

      {paymentModal && (
        <CommissionPaymentModal
          isOpen={true}
          onClose={() => setPaymentModal(null)}
          partnerId={partnerId}
          sellerName={paymentModal.name}
          sellerPartnerUserId={paymentModal.partnerUserId}
          maxAmount={paymentModal.maxAmount}
          pendingAmount={overview.sellers.find((s) => s.partnerUserId === paymentModal.partnerUserId)?.pendingAmount || 0}
          bonusAmount={overview.sellers.find((s) => s.partnerUserId === paymentModal.partnerUserId)?.bonusPending || 0}
          onSuccess={() => window.location.reload()}
        />
      )}
    </FadeIn>
  )
}
