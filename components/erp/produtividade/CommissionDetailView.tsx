"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { XIcon, MoneyIcon, ClockIcon } from "@/lib/icons"
import { Button, Tabs, TabsList, TabsTrigger, SkeletonLoader, ListItem, IconPlaceholder } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { formatCurrency } from "@/lib/utils"
import { getSellerCommissionHistoryAction } from "@/app/actions/erp/produtividade"
import type { SellerCommissionRow, CommissionHistoryRow } from "@/app/actions/erp/produtividade"

type Props = {
  isOpen: boolean
  seller: SellerCommissionRow | null
  partnerId: string
  onClose: () => void
  onPay: () => void
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
        <IconPlaceholder
          icon={ClockIcon}
          title="Nenhum histórico encontrado"
          subtitle="Não foram encontrados eventos para este vendedor."
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {history.map((h) => (
        <div
          key={h.id}
          className="flex items-center justify-between px-4 py-3 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{h.description}</p>
            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
              {h.paymentDate ? new Date(h.paymentDate).toLocaleDateString("pt-BR") : "-"}
            </p>
          </div>
          <div className="text-right shrink-0 ml-3">
            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(h.amount)}</p>
            <span className={`text-[11px] font-semibold ${h.status === "paid" ? "text-brand-green" : "text-brand-orange"}`}>
              {h.status === "paid" ? "Pago" : "Pendente"}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function CommissionDetailView({ isOpen, seller, partnerId, onClose, onPay }: Props) {
  const [activeTab, setActiveTab] = useState("general")
  const isCompact = useMediaQuery("(max-width: 1024px)")

  const sellerData = seller

  const rows = useMemo(() => {
    if (!sellerData) return []
    return [
      { label: "Pendente", value: formatCurrency(sellerData.pendingAmount), color: "text-brand-orange" },
      { label: "Pago", value: formatCurrency(sellerData.paidAmount), color: "text-brand-green" },
      { label: "Bônus", value: formatCurrency(sellerData.bonusAmount), color: "text-purple-600" },
      { label: "Total Acumulado", value: formatCurrency(sellerData.totalAccumulated), color: "text-brand-dark dark:text-dark-heading" },
    ]
  }, [sellerData])

  const tabs = (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div className={`${isCompact ? "px-0" : "px-6"} pt-4 shrink-0 border-b border-brand-border dark:border-dark-border`}>
        <TabsList className="px-0">
          <TabsTrigger value="general">Dados Gerais</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>
      </div>
    </Tabs>
  )

  const body = sellerData ? (
    activeTab === "general" ? (
      <>
        <ListItem
          icon={() => (
            <UserProfileImage
              fullName={sellerData.name}
              imageUrl={sellerData.avatarUrl}
              className="w-10 h-10 text-[14px]"
            />
          )}
          title={sellerData.name}
          description={
            sellerData.commissionType === "percentage_sale"
              ? `${sellerData.commissionValue}% sobre venda`
              : sellerData.commissionType === "fixed_per_sale"
                ? `R$ ${sellerData.commissionValue} por venda`
                : "Sem comissão configurada"
          }
          className="px-4 py-3"
        />

        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between"
          >
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{row.label}</span>
            <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
          </div>
        ))}
      </>
    ) : (
      <HistoryTab partnerUserId={sellerData.partnerUserId} partnerId={partnerId} />
    )
  ) : null

  const footer = (
    <div className="shrink-0 border-t border-brand-border dark:border-dark-border p-6 bg-white dark:bg-dark-surface">
      <Button
        className="w-full h-12"
        onClick={onPay}
        leftIcon={<MoneyIcon size={18} />}
      >
        Pagar Comissão
      </Button>
    </div>
  )

  if (isCompact) {
    return (
      <BottomSheet isOpen={isOpen && !!sellerData} onClose={onClose} title={sellerData?.name}>
        {tabs}
        <div className="space-y-4 py-4">{body}</div>
        <div className="sticky bottom-0 -mx-4 -mb-6 mt-4 bg-white dark:bg-dark-background">
          {footer}
        </div>
      </BottomSheet>
    )
  }

  return (
    <AnimatePresence>
      {isOpen && sellerData && (
        <Portal>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "120%" }}
            animate={{ x: 0 }}
            exit={{ x: "120%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-4 top-4 bottom-4 z-50 w-[450px] flex flex-col bg-white shadow-2xl dark:bg-dark-surface overflow-hidden rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
              <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Detalhes da comissão</h2>
              <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                <XIcon className="h-5 w-5" />
              </Button>
            </header>

            {tabs}

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
              {body}
            </div>

            {footer}
          </motion.div>
        </Portal>
      )}
    </AnimatePresence>
  )
}