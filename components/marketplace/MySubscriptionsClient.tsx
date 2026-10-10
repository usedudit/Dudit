"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Badge, IconPlaceholder, SkeletonLoader, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { useToast } from "@/hooks/use-toast"
import { getMySubscriptionCreditsAction } from "@/app/actions/marketplace/recurring-subscriptions"
import { formatFullDate, formatCurrency, formatDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getPlanUrl } from "@/lib/utils/url-generator"
import Link from "next/link"
import { CalendarIcon, ChevronRightIcon } from "@/lib/icons"
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader"
import {
  MySubscriptionDetailPage,
  getStatusConfig,
  getStatusLabel,
} from "@/components/marketplace/MySubscriptionDetailPage"

const SUBSCRIPTIONS_PER_PAGE = 10
const PLACEHOLDER_STORE_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

interface MySubscriptionsClientProps {
  subscriptions: any[]
  initialSubscriptionId?: string | null
  userProfile?: any
  cartCount?: number
  userId?: string | null
}

export function MySubscriptionsClient({
  subscriptions,
  initialSubscriptionId,
  userProfile,
  cartCount,
  userId,
}: MySubscriptionsClientProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"subscriptions" | "credits">("subscriptions")
  const [items, setItems] = useState(subscriptions)
  const [currentPage, setCurrentPage] = useState(1)

  // Credits state
  const [credits, setCredits] = useState<any[]>([])
  const [loadingCredits, setLoadingCredits] = useState(false)
  const creditsFetchedRef = useRef(false)

  // Detail state (mesmo padrão de /pedidos: query param `view`, sem sair da rota)
  const initialActiveId = useMemo(() => {
    if (!initialSubscriptionId) return null
    return subscriptions?.some((s) => s.id === initialSubscriptionId) ? initialSubscriptionId : null
  }, [initialSubscriptionId, subscriptions])

  const [activeSubId, setActiveSubId] = useState<string | null>(initialActiveId)
  const activeSubRef = useRef<string | null>(initialActiveId)
  activeSubRef.current = activeSubId

  useEffect(() => {
    if (activeTab === "credits" && !creditsFetchedRef.current) {
      void fetchCredits()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const fetchCredits = async () => {
    creditsFetchedRef.current = true
    setLoadingCredits(true)
    const res = await getMySubscriptionCreditsAction()
    setLoadingCredits(false)
    if (res.success) {
      setCredits(res.data || [])
    } else {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
    }
  }

  // ── Instant 0ms popstate synchronization (browser Back / Forward) ─────
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return
      const url = new URL(window.location.href)
      const subId = url.searchParams.get("view") || url.searchParams.get("subscription")

      if (subId) {
        const found = items?.find((s: any) => s.id === subId || s.id === decodeURIComponent(subId))
        const foundId = found ? found.id : null
        activeSubRef.current = foundId
        setActiveSubId(foundId)
      } else {
        activeSubRef.current = null
        setActiveSubId(null)
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [items])

  const handleOpenDetails = useCallback((id: string) => {
    activeSubRef.current = id
    setActiveSubId(id)

    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.set("view", id)

    const nextRelative = `${url.pathname}${url.search}${url.hash}`
    const currentRelative = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (nextRelative !== currentRelative) {
      window.history.pushState(window.history.state, "", nextRelative)
    }
  }, [])

  const handleCloseDetails = useCallback(() => {
    if (!activeSubRef.current) return
    activeSubRef.current = null
    setActiveSubId(null)

    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.delete("view")
    url.searchParams.delete("subscription")
    const nextRelative = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState(window.history.state, "", nextRelative)
  }, [])

  const handleCardClick = (e: React.MouseEvent, id: string) => {
    const target = e.target as HTMLElement
    if (
      target.closest("a") ||
      target.closest("button") ||
      target.closest("textarea") ||
      target.closest("input") ||
      target.closest('[role="dialog"]') ||
      target.closest('[class*="Dialog"]') ||
      target.closest('[class*="Modal"]')
    ) {
      return
    }
    handleOpenDetails(id)
  }

  const refreshItem = (updated: any) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === updated.id
          ? {
              ...item,
              ...updated,
              statusLabel: getStatusLabel(updated.status),
            }
          : item
      )
    )
  }

  const activeSubscription = activeSubId ? items.find((s) => s.id === activeSubId) || null : null

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(items.length / SUBSCRIPTIONS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedSubscriptions = useMemo(() => {
    const start = (safePage - 1) * SUBSCRIPTIONS_PER_PAGE
    return items.slice(start, start + SUBSCRIPTIONS_PER_PAGE)
  }, [items, safePage])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value as "subscriptions" | "credits")
    setCurrentPage(1)
  }

  const headerTitle = activeSubscription ? "Detalhes da assinatura" : "Minhas Assinaturas"

  return (
    <>
      <MarketplaceHeader simpleTitle={headerTitle} userProfile={userProfile} cartCount={cartCount} />

      <div className="flex-1 flex flex-col container mx-auto px-4 max-w-[1400px] w-full md:pt-10 pb-20 mt-[78px] lg:mt-[108px] relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeSubscription ? (
            <MySubscriptionDetailPage
              key={activeSubscription.id}
              subscription={activeSubscription}
              onBack={handleCloseDetails}
              onUpdate={refreshItem}
              userId={userId}
            />
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col flex-1 w-full"
            >
            {/* Header (desktop) */}
            <div className="hidden lg:block items-center mb-8">
              <div>
                <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                  Minhas Assinaturas
                  {items.length > 0 && (
                    <span className="text-brand-inactive-text dark:text-dark-body font-bold text-base lg:text-lg ml-2">
                      ({items.length})
                    </span>
                  )}
                </h1>
                <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">
                  Acompanhe seus planos recorrentes, entregas e créditos
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="mb-6">
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="mb-6">
                  <TabsTrigger value="subscriptions">
                    Assinaturas <span className="ml-1.5 text-xs font-normal">({items.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="credits">
                    Meus Créditos{" "}
                    {creditsFetchedRef.current && <span className="ml-1.5 text-xs font-normal">({credits.length})</span>}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex-1">
              <AnimatePresence mode="wait">
                {activeTab === "subscriptions" ? (
                  <motion.div
                    key="subscriptions"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col flex-1 w-full"
                  >
                    {paginatedSubscriptions.length > 0 ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start w-full">
                        {paginatedSubscriptions.map((sub) => {
                          const statusConfig = getStatusConfig(sub.status)
                          const StatusIcon = statusConfig.icon
                          const storeName = sub.partner?.name || sub.partner?.store_name || "Loja Parceira"
                          const storeImage = sub.partner?.logo_url
                            ? getR2ImageUrl(sub.partner.logo_url)
                            : PLACEHOLDER_STORE_IMAGE
                          const isClosed = sub.status === "cancelled" || sub.status === "expired"
                          const proposedAmount = Number(sub.plan?.price || 0) + Number(sub.shippingAmount || 0)
                          const isPriceFrozen = !!sub.priceChangeRequestedAt && !sub.priceChangeDecision
                          // Assinatura encerrada/congelada nunca acompanha preço novo do plano.
                          const cycleAmount = isClosed
                            ? sub.contractedAmount != null
                              ? Number(sub.contractedAmount)
                              : proposedAmount
                            : isPriceFrozen
                              ? Number(sub.contractedAmount || proposedAmount)
                              : proposedAmount

                          return (
                            <div
                              key={sub.id}
                              onClick={(e) => handleCardClick(e, sub.id)}
                              className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden transition-all duration-200 hover:shadow-md hover:border-brand-green dark:hover:border-brand-green w-full cursor-pointer"
                            >
                              {/* Card Header */}
                              <div className="px-6 py-4 flex flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-4 min-w-0">
                                  <img
                                    src={storeImage}
                                    alt={storeName}
                                    className="w-10 h-10 rounded-full object-cover border border-brand-border dark:border-dark-border bg-white shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                      {storeName}
                                    </h3>
                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 flex items-center gap-1.5 flex-wrap">
                                      {sub.plan ? (
                                        <Link
                                          href={getPlanUrl(sub.plan, sub.partner)}
                                          prefetch={false}
                                          className="font-medium hover:text-brand-green transition-colors truncate"
                                        >
                                          {sub.plan.name}
                                        </Link>
                                      ) : (
                                        <span className="font-medium">Plano</span>
                                      )}
                                      {sub.mpPreapprovalId && (
                                        <Badge variant="blue" className="scale-90 whitespace-nowrap">
                                          Faturamento automático
                                        </Badge>
                                      )}
                                      <span className="hidden lg:inline">•</span>
                                      <span className="hidden lg:inline">{formatFullDate(sub.createdAt)}</span>
                                    </div>
                                    <span className="block lg:hidden text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                      {formatFullDate(sub.createdAt)}
                                    </span>
                                  </div>
                                </div>

                                {/* Right side: Status as plain colored text */}
                                <div className={`flex items-center gap-1.5 text-xs font-bold shrink-0 ${statusConfig.color}`}>
                                  <StatusIcon size={14} />
                                  <span>{statusConfig.label}</span>
                                </div>
                              </div>

                              {/* Card Content */}
                              <div className="px-6 pb-6 pt-0">
                                <div className="h-px bg-brand-border dark:bg-dark-border w-full mb-6" />

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mb-1">
                                      Último pagamento
                                    </span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                      {sub.lastExecutionAt ? formatDate(sub.lastExecutionAt) : "—"}
                                    </span>
                                  </div>

                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mb-1">
                                      {isClosed ? "Encerrada em" : "Próxima cobrança"}
                                    </span>
                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                                      <CalendarIcon size={14} className="text-brand-inactive-text" />
                                      {isClosed
                                        ? statusConfig.label
                                        : sub.nextExecutionAt
                                          ? formatDate(sub.nextExecutionAt)
                                          : "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Card Footer (mesmo layout do card de pedido: valor à esquerda, ação à direita) */}
                              <div className="flex flex-row justify-between items-center gap-4 px-6 py-4 border-t border-brand-border dark:border-dark-border w-full flex-wrap">
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                    Valor atual {sub.frequencyLabel ? `• ${sub.frequencyLabel}` : ""}
                                  </span>
                                  <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(cycleAmount)}
                                  </span>
                                  {sub.contractedAmount != null &&
                                    Math.abs(Number(sub.contractedAmount) - cycleAmount) > 0.009 && (
                                      <span className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                                        Contratado: {formatCurrency(sub.contractedAmount)}
                                      </span>
                                    )}
                                </div>

                                <Button
                                  variant="outline"
                                  className="w-auto shrink-0"
                                  onClick={() => handleOpenDetails(sub.id)}
                                  rightIcon={<ChevronRightIcon size={16} />}
                                >
                                  Ver detalhes
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center flex flex-col items-center justify-center mb-6 py-12 w-full">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
                          imageAlt="Você ainda não possui assinaturas"
                          title="Você ainda não possui assinaturas"
                          subtitle="Assine um plano recorrente e receba seus itens favoritos a cada ciclo, sem esforço."
                          itemButton={{
                            text: "Explorar planos",
                            action: "/explorar",
                          }}
                        />
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="credits"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col flex-1 w-full"
                  >
                    {loadingCredits ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden"
                          >
                            <div className="px-6 py-4 flex items-start justify-between gap-4">
                              <div>
                                <SkeletonLoader width={160} height={18} className="mb-2" />
                                <SkeletonLoader width={110} height={14} />
                              </div>
                              <SkeletonLoader width={90} height={24} className="rounded-full" />
                            </div>
                            <div className="px-6 pb-6">
                              <div className="h-px bg-brand-border dark:bg-dark-border w-full mb-6" />
                              <SkeletonLoader height={8} className="rounded-full mb-3" />
                              <SkeletonLoader width={180} height={14} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : credits.length === 0 ? (
                      <div className="text-center flex flex-col items-center justify-center py-12 w-full">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/ValesCompra.png"
                          imageAlt="Nenhum crédito ativo"
                          title="Você não possui créditos"
                          subtitle="Alguns planos liberam créditos de serviços a cada ciclo. Assine um plano para começar a acumular."
                          itemButton={{
                            text: "Explorar planos",
                            action: "/explorar",
                          }}
                        />
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {credits.map((cred) => {
                          const percent = Math.min(100, Math.max(0, (cred.remainingCredits / cred.totalCredits) * 100))
                          return (
                            <div
                              key={cred.id}
                              className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden transition-all duration-200 hover:shadow-md hover:border-brand-green dark:hover:border-brand-green w-full"
                            >
                              <div className="px-6 py-4 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {cred.itemName}
                                  </h4>
                                  <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 truncate">
                                    {cred.planName} • {cred.storeName}
                                  </p>
                                </div>
                                <Badge variant={cred.remainingCredits > 0 ? "green" : "gray"} className="shrink-0">
                                  {cred.remainingCredits} Restantes
                                </Badge>
                              </div>

                              <div className="px-6 pb-6">
                                <div className="h-px bg-brand-border dark:bg-dark-border w-full mb-6" />

                                <div className="flex justify-between text-xs font-semibold mb-2">
                                  <span className="text-brand-inactive-text dark:text-dark-body">Consumidos</span>
                                  <span className="text-brand-dark dark:text-dark-heading">
                                    {cred.consumedCredits} / {cred.totalCredits}
                                  </span>
                                </div>

                                <div className="h-2 bg-brand-gray dark:bg-dark-surface rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-brand-green rounded-full transition-all duration-500"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>

                                <div className="mt-4 pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between gap-2 text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                  <span>Adquirido em: {cred.createdAt ? cred.createdAt.slice(0, 10) : ""}</span>
                                  <span>Expira em: {cred.expiresAt ? cred.expiresAt.slice(0, 10) : "Não expira"}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {activeTab === "subscriptions" && totalPages > 1 && (
              <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={handlePageChange} />
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </>
  )
}
