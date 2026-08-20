"use client"

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import { Button, IconPlaceholder, ThreeDotsLoader, Input } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import {
    listAvailableDeliveryOffersAction,
    acceptDeliveryOfferAction,
} from "@/app/actions/delivery-drivers"
import { toast } from "@/hooks/use-notification"
import {
    ReloadIcon,
    ArrowUpDownIcon,
    SearchIcon,
    GridIcon,
    ListIcon,
    StoreIcon,
    MapPinIcon,
    TruckIcon,
    Package,
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useMediaQuery } from "@/components/erp/hooks"
import AvailableDeliveryGridCard from "./AvailableDeliveryGridCard"

const ITEMS_PER_PAGE = 12

export default function AvailableDeliveriesList() {
    const router = useRouter()
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const [search, setSearch] = useState("")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [currentPage, setCurrentPage] = useState(1)
    const [offers, setOffers] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [acceptingId, setAcceptingId] = useState<string | null>(null)

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const handleScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, [])

    const loadOffers = useCallback(async (isRefresh = false) => {
        if (isRefresh) setIsRefreshing(true)
        else setIsLoading(true)

        try {
            const res = await listAvailableDeliveryOffersAction({ limit: 50 })
            if (res.success) {
                setOffers(res.items || [])
            } else {
                toast.error(res.error || "Não foi possível carregar entregas disponíveis.")
            }
        } catch (e: any) {
            toast.error(e?.message || "Erro inesperado ao buscar ofertas.")
        } finally {
            setIsLoading(false)
            setIsRefreshing(false)
        }
    }, [])

    useEffect(() => {
        void loadOffers()
        // Auto-poll available offers every 10 seconds
        const interval = setInterval(() => {
            void loadOffers(true)
        }, 10000)
        return () => clearInterval(interval)
    }, [loadOffers])

    const handleAccept = async (assignmentId: string) => {
        setAcceptingId(assignmentId)
        try {
            const res = await acceptDeliveryOfferAction(assignmentId)
            if (!res.success) {
                toast.error(res.error || "Não foi possível aceitar a entrega.")
                // Refresh list as it might have been taken
                void loadOffers(true)
                return
            }

            toast.success("Entrega aceita com sucesso! Redirecionando...")
            router.push(`/entregadores/entregas/${assignmentId}`)
        } catch (e: any) {
            toast.error(e?.message || "Erro ao aceitar entrega.")
        } finally {
            setAcceptingId(null)
        }
    }

    // Filter by search
    const filteredOffers = useMemo(() => {
        if (!search.trim()) return offers
        const q = search.trim().toLowerCase()
        return offers.filter((item) => {
            const orderNum = String(item.order_number || item.order_id || "").toLowerCase()
            const store = String(item.store_name || item.partner_name || "").toLowerCase()
            const customer = String(item.customer_name || "").toLowerCase()
            const address = String(item.delivery_address || "").toLowerCase()
            return (
                orderNum.includes(q) ||
                store.includes(q) ||
                customer.includes(q) ||
                address.includes(q)
            )
        })
    }, [offers, search])

    // Paginated slice
    const totalPages = Math.ceil(filteredOffers.length / ITEMS_PER_PAGE) || 1
    const paginatedOffers = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredOffers.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredOffers, currentPage])

    const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* HEADER */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-1 pt-1">
                        <div className="flex items-center gap-2">
                            <h1 className="text-[28px] md:text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                Entregas Disponíveis
                            </h1>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                {offers.length} {offers.length === 1 ? "oferta" : "ofertas"}
                            </span>
                        </div>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm md:text-[15px] font-medium">
                            Ofertas de entrega em tempo real aguardando aceite na sua região.
                        </p>
                    </div>

                    {/* TOP ACTIONS */}
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() => loadOffers(true)}
                            disabled={isRefreshing || isLoading}
                            leftIcon={<ReloadIcon size={16} className={isRefreshing ? "animate-spin" : ""} />}
                        >
                            {isRefreshing ? "Atualizando..." : "Atualizar"}
                        </Button>
                    </div>
                </div>

                {/* CONTROLS BAR: SEARCH & VIEW SWITCHER */}
                <div className="px-4 md:px-8 mb-6 flex items-center justify-between gap-4">
                    <div className="relative w-full max-w-md">
                        <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-inactive-text pointer-events-none z-10" />
                        <Input
                            placeholder="Buscar por loja, cliente, endereço ou pedido..."
                            value={search}
                            onChange={(e: any) => {
                                setSearch(e.target.value)
                                setCurrentPage(1)
                            }}
                            className="pl-10 bg-white dark:bg-dark-surface"
                        />
                    </div>

                    {/* VIEW TOGGLE */}
                    <div className="hidden lg:flex items-center gap-1 bg-brand-gray/60 dark:bg-dark-surface border border-brand-border dark:border-dark-border p-1 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setViewMode("list")}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                viewMode === "list"
                                    ? "bg-white dark:bg-dark-border text-brand-dark dark:text-dark-heading shadow-xs font-bold"
                                    : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-white"
                            }`}
                            title="Visualização em Lista"
                        >
                            <ListIcon size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("grid")}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                viewMode === "grid"
                                    ? "bg-white dark:bg-dark-border text-brand-dark dark:text-dark-heading shadow-xs font-bold"
                                    : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-white"
                            }`}
                            title="Visualização em Grade"
                        >
                            <GridIcon size={18} />
                        </button>
                    </div>
                </div>

                {/* CONTENT AREA */}
                <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-12">
                    {isLoading ? (
                        <div className="w-full h-full flex items-center justify-center min-h-[400px]">
                            <ThreeDotsLoader />
                        </div>
                    ) : offers.length === 0 ? (
                        <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc="https://img.dudit.com.br/static/mascots/SemItens.png"
                                imageAlt="Nenhuma oferta disponível"
                                title="Nenhuma entrega disponível no momento"
                                subtitle="Novas solicitações de entrega enviadas pelos lojistas parceiros aparecerão aqui automaticamente."
                                itemButton={{
                                    text: "Verificar agora",
                                    action: () => loadOffers(true),
                                }}
                            />
                        </FadeIn>
                    ) : filteredOffers.length === 0 ? (
                        <FadeIn key="empty-search" className="w-full h-full flex items-center justify-center min-h-[400px]">
                            <IconPlaceholder
                                placeholderType="image"
                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                imageAlt="Nenhum resultado"
                                title="Nenhuma entrega encontrada para a busca"
                                subtitle="Tente alterar os termos pesquisados."
                                itemButton={{
                                    text: "Limpar busca",
                                    action: () => setSearch(""),
                                    variant: "outline",
                                }}
                            />
                        </FadeIn>
                    ) : effectiveViewMode === "grid" ? (
                        /* GRID VIEW */
                        <FadeIn key="grid" className="w-full">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                {paginatedOffers.map((offer) => (
                                    <AvailableDeliveryGridCard
                                        key={offer.assignment_id}
                                        offer={offer}
                                        onAccept={handleAccept}
                                        isAccepting={acceptingId === offer.assignment_id}
                                    />
                                ))}
                            </div>
                        </FadeIn>
                    ) : (
                        /* LIST / TABLE VIEW */
                        <FadeIn key="list" className="w-full">
                            <div className="w-full overflow-hidden rounded-2xl border border-brand-border dark:border-dark-border relative bg-white dark:bg-dark-surface shadow-xs">
                                <div
                                    className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-surface to-transparent z-10 pointer-events-none transition-opacity duration-300 ${
                                        scrollState.left ? "opacity-100" : "opacity-0"
                                    }`}
                                />
                                <div
                                    className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-surface to-transparent z-10 pointer-events-none transition-opacity duration-300 ${
                                        scrollState.right ? "opacity-100" : "opacity-0"
                                    }`}
                                />

                                <div
                                    className="overflow-x-auto"
                                    ref={tableContainerRef}
                                    onScroll={handleScroll}
                                >
                                    <table className="w-full text-left border-collapse min-w-[900px]">
                                        <thead>
                                            <tr className="bg-brand-gray/80 dark:bg-dark-border/40 border-b border-brand-border dark:border-dark-border">
                                                <th className="py-3 px-3 pl-6 text-xs font-semibold text-brand-inactive-text dark:text-dark-body w-[140px]">
                                                    Pedido
                                                </th>
                                                <th className="py-3 px-3 text-xs font-semibold text-brand-inactive-text dark:text-dark-body w-[200px]">
                                                    Estabelecimento
                                                </th>
                                                <th className="py-3 px-3 text-xs font-semibold text-brand-inactive-text dark:text-dark-body w-[280px]">
                                                    Destino da Entrega
                                                </th>
                                                <th className="py-3 px-3 text-xs font-semibold text-brand-inactive-text dark:text-dark-body w-[140px]">
                                                    Taxa do Entregador
                                                </th>
                                                <th className="py-3 px-3 pr-6 text-xs font-semibold text-brand-inactive-text dark:text-dark-body text-right w-[160px]">
                                                    Ação
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedOffers.map((offer) => {
                                                const orderNum = offer.order_number
                                                    ? `#${offer.order_number}`
                                                    : `#${String(offer.order_id).slice(0, 8)}`

                                                return (
                                                    <tr
                                                        key={offer.assignment_id}
                                                        className="hover:bg-brand-gray/60 dark:hover:bg-dark-border/30 transition-colors border-b border-brand-border/60 dark:border-dark-border/40 group"
                                                    >
                                                        <td className="py-3.5 px-3 pl-6">
                                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading font-mono">
                                                                {orderNum}
                                                            </span>
                                                            {offer.assigned_at && (
                                                                <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                    {formatDate(offer.assigned_at)}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="py-3.5 px-3">
                                                            <div className="flex items-center gap-1.5 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                                                <StoreIcon size={14} className="text-brand-green shrink-0" />
                                                                <span className="truncate max-w-[180px]">
                                                                    {offer.store_name || offer.partner_name || "Loja"}
                                                                </span>
                                                            </div>
                                                            {offer.store_address && (
                                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate max-w-[180px] mt-0.5">
                                                                    {offer.store_address}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="py-3.5 px-3">
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-xs text-brand-dark dark:text-dark-heading">
                                                                    {offer.customer_name || "Cliente"}
                                                                </span>
                                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body line-clamp-1 mt-0.5">
                                                                    {offer.delivery_address || "Endereço não informado"}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-3">
                                                            <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                                                                {formatCurrency(offer.delivery_fee || 0)}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-3 pr-6 text-right">
                                                            <Button
                                                                variant="default"
                                                                size="sm"
                                                                onClick={() => handleAccept(offer.assignment_id)}
                                                                disabled={acceptingId === offer.assignment_id}
                                                                isLoading={acceptingId === offer.assignment_id}
                                                                className="font-bold px-4"
                                                            >
                                                                Aceitar
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </FadeIn>
                    )}

                    {/* PAGINATION */}
                    {totalPages > 1 && (
                        <div className="flex justify-center pt-6">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                            />
                        </div>
                    )}
                </div>
            </div>
        </FadeIn>
    )
}
