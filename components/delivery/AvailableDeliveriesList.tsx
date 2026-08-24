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
    XIcon,
} from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import AvailableDeliveryGridCard from "./AvailableDeliveryGridCard"
import AvailableDeliveryListRow, { type AvailableDeliveryOffer } from "./AvailableDeliveryListRow"

type SortKey = "order" | "partner" | "dest" | "fee"
type SortDirection = "asc" | "desc"

const ITEMS_PER_PAGE = 8

const FIXED_COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "order", label: "Pedido", align: "left" as const, width: "180px" },
    { id: "partner", label: "Estabelecimento", align: "left" as const, width: "220px" },
    { id: "dest", label: "Destino da Entrega", align: "left" as const, width: "300px" },
    { id: "fee", label: "Taxa do Entregador", align: "left" as const, width: "150px" },
    { id: "actions", label: "Ação", align: "right" as const, width: "150px" },
]

function playNewOfferSound() {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioContextClass) return
        const ctx = new AudioContextClass()
        if (ctx.state === "suspended") {
            ctx.resume()
        }
        const now = ctx.currentTime

        // Primeiro tom (C5)
        const osc1 = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc1.type = "sine"
        osc1.frequency.setValueAtTime(523.25, now)
        gain1.gain.setValueAtTime(0.15, now)
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
        osc1.connect(gain1)
        gain1.connect(ctx.destination)
        osc1.start(now)
        osc1.stop(now + 0.22)

        // Segundo tom ascendente (G5 - aviso claro de nova corrida)
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = "sine"
        osc2.frequency.setValueAtTime(783.99, now + 0.12)
        gain2.gain.setValueAtTime(0.2, now + 0.12)
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start(now + 0.12)
        osc2.stop(now + 0.45)
    } catch {
        // Silencioso se áudio bloqueado pelo navegador
    }
}

export default function AvailableDeliveriesList() {
    const router = useRouter()
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const [search, setSearch] = useState("")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [currentPage, setCurrentPage] = useState(1)
    const [offers, setOffers] = useState<AvailableDeliveryOffer[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [acceptingId, setAcceptingId] = useState<string | null>(null)
    const [refreshCooldown, setRefreshCooldown] = useState(false)
    const knownOfferIdsRef = useRef<Set<string>>(new Set())

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
        key: "dest",
        direction: "desc",
    })

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
        if (isRefresh) {
            if (refreshCooldown) return
            setIsRefreshing(true)
            setRefreshCooldown(true)
            setTimeout(() => setRefreshCooldown(false), 5000)
        } else setIsLoading(true)

        try {
            const res = await listAvailableDeliveryOffersAction({ limit: 50 })
            if (res.success) {
                const incoming = res.items || []
                // Se for refresh e chegaram novos IDs, toca som de notificação
                if (isRefresh && knownOfferIdsRef.current.size > 0) {
                    const hasNew = incoming.some((item) => !knownOfferIdsRef.current.has(item.id))
                    if (hasNew) {
                        playNewOfferSound()
                        toast.info("Nova entrega disponível na sua região!")
                    }
                }
                knownOfferIdsRef.current = new Set(incoming.map((item) => item.id))
                setOffers(incoming)
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
        // Auto-poll available offers every 6 seconds
        const interval = setInterval(() => {
            void loadOffers(true)
        }, 6000)
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
            const phone = String(item.customer_phone || "").replace(/\D/g, "")
            const qPhone = q.replace(/\D/g, "")

            const matchesText =
                orderNum.includes(q) ||
                store.includes(q) ||
                customer.includes(q) ||
                address.includes(q)
            const matchesPhone = qPhone && phone.includes(qPhone)

            return matchesText || matchesPhone
        })
    }, [offers, search])

    // Sorted offers
    const sortedOffers = useMemo(() => {
        const list = [...filteredOffers]
        const { key, direction } = sortConfig

        list.sort((a, b) => {
            let res = 0
            if (key === "dest") {
                const dateA = new Date(a.assigned_at || 0).getTime()
                const dateB = new Date(b.assigned_at || 0).getTime()
                res = dateA - dateB
            } else if (key === "fee") {
                res = (a.delivery_fee || 0) - (b.delivery_fee || 0)
            } else if (key === "order") {
                const numA = Number(a.order_number) || 0
                const numB = Number(b.order_number) || 0
                res = numA - numB
            } else if (key === "partner") {
                res = String(a.store_name || a.partner_name || "").localeCompare(String(b.store_name || b.partner_name || ""))
            }
            return direction === "asc" ? res : -res
        })

        return list
    }, [filteredOffers, sortConfig])

    // Paginated slice
    const totalPages = Math.ceil(sortedOffers.length / ITEMS_PER_PAGE) || 1
    const paginatedOffers = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return sortedOffers.slice(start, start + ITEMS_PER_PAGE)
    }, [sortedOffers, currentPage])

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
        }))
    }

    const hasAnyOffers = offers.length > 0
    const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode

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
                {/* DESKTOP HEADER */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                Entregas Disponíveis
                            </h1>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                {offers.length} {offers.length === 1 ? "oferta" : "ofertas"}
                            </span>
                        </div>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Ofertas de entrega em tempo real aguardando aceite na sua região.
                        </p>
                    </div>

                    {/* TOP CONTROLS: REFRESH */}
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadOffers(true)}
                            disabled={isRefreshing || isLoading || refreshCooldown}
                            className="shrink-0"
                        >
                            <ReloadIcon size={15} className={isRefreshing ? "animate-spin" : ""} />
                        </Button>
                    </div>
                </div>

                {/* CONTROLS BAR: SEARCH & VIEW SWITCHER */}
                <div className="w-full flex-none px-4 md:px-8 mb-4">
                    {/* MOBILE CONTROLS */}
                    <div className="flex md:hidden items-center gap-2 mb-3">
                        <div className="flex-1 relative">
                            <Input
                                name="search"
                                placeholder="Buscar ofertas..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value)
                                    setCurrentPage(1)
                                }}
                                className="h-[42px] w-full"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                                label=""
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                                >
                                    <XIcon size={14} />
                                </button>
                            )}
                        </div>

                        <Button
                            variant="outline"
                            onClick={() => loadOffers(true)}
                            disabled={isRefreshing || isLoading || refreshCooldown}
                            className="w-[42px] h-[42px] p-0 flex items-center justify-center shrink-0"
                            aria-label="Atualizar ofertas"
                        >
                            <ReloadIcon size={16} className={isRefreshing ? "animate-spin" : ""} />
                        </Button>
                    </div>

                    {/* DESKTOP CONTROLS */}
                    <div className="hidden md:flex items-center w-full gap-4">
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="w-80 relative">
                                <Input
                                    name="search"
                                    placeholder="Buscar por loja, cliente, endereço ou pedido..."
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value)
                                        setCurrentPage(1)
                                    }}
                                    className="h-[42px]"
                                    variant="full-rounded"
                                    label=""
                                />
                                {search && (
                                    <button
                                        onClick={() => setSearch("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                                    >
                                        <XIcon size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* View Mode Toggles (ONLY VISIBLE ON DESKTOP) */}
                        {!isTabletOrMobile && (
                            <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0 ml-auto">
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list"
                                        ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading"
                                        : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                                        }`}
                                    title="Visualização em lista/tabela"
                                    aria-label="Visualização em lista"
                                >
                                    <ListIcon className="w-[18px] h-[18px]" />
                                </button>
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid"
                                        ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading"
                                        : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                                        }`}
                                    title="Visualização em cards/grid"
                                    aria-label="Visualização em grid"
                                >
                                    <GridIcon className="w-[18px] h-[18px]" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* CONTENT AREA */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-0 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {isLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : !hasAnyOffers ? (
                            <FadeIn
                                key="empty-no-data"
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/Entregas.png"
                                    imageAlt="Nenhuma oferta disponível"
                                    title="Nenhuma entrega disponível no momento"
                                    subtitle="Novas solicitações de entrega enviadas pelos lojistas parceiros aparecerão aqui automaticamente."
                                    itemButton={{
                                        text: "Verificar agora",
                                        action: () => loadOffers(true),
                                    }}
                                />
                            </FadeIn>
                        ) : paginatedOffers.length === 0 ? (
                            <FadeIn
                                key="empty-search"
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhuma entrega encontrada"
                                    title="Nenhuma entrega encontrada para a busca"
                                    subtitle="Tente ajustar os termos pesquisados."
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
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
                                <div className="w-full overflow-hidden rounded-xl relative">
                                    <div
                                        className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"
                                            }`}
                                    />
                                    <div
                                        className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"
                                            }`}
                                    />

                                    <div
                                        className="overflow-x-auto pb-4 custom-scrollbar"
                                        ref={tableContainerRef}
                                        onScroll={handleScroll}
                                    >
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    {FIXED_COLUMNS.map((col) => {
                                                        const isSorted = sortConfig.key === col.id
                                                        return (
                                                            <th
                                                                key={col.id}
                                                                className={`py-3 px-2 pl-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                                                    } ${col.id !== "actions" ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading" : ""} group select-none transition-colors ${col.id === "actions" ? "rounded-r-lg" : col.id === "order" ? "rounded-l-lg" : ""
                                                                    }`}
                                                                style={{ width: col.width }}
                                                                onClick={() => {
                                                                    if (col.id === "actions") return
                                                                    const sortKey = col.id as SortKey
                                                                    handleSort(sortKey)
                                                                }}
                                                            >
                                                                <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                    <span>{col.label}</span>
                                                                    {col.id !== "actions" && (
                                                                        <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                            <ArrowUpDownIcon
                                                                                size={14}
                                                                                className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && sortConfig.direction === "desc" ? "rotate-180" : ""}`}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </th>
                                                        )
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedOffers.map((offer) => (
                                                    <AvailableDeliveryListRow
                                                        key={offer.assignment_id}
                                                        offer={offer}
                                                        onAccept={handleAccept}
                                                        isAccepting={acceptingId === offer.assignment_id}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </FadeIn>
                        )}
                    </AnimatePresence>

                    {/* PAGINATION */}
                    {!isLoading && hasAnyOffers && paginatedOffers.length > 0 && totalPages > 1 && (
                        <div className="pt-4">
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