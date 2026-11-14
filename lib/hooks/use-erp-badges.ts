"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { usePathname } from "next/navigation"
import { getErpSidebarBadgesAction, type ErpSidebarBadgesRawData } from "@/app/actions/erp/badges"

const SEEN_PREFIX = "dudit_seen_"

interface ErpBadgesState {
    orders: number
    returns: number
    quotes: number
    serviceOrders: number
    billsToPay: number
    vendas: number
    servicos: number
    financeiro: number
}

const DEFAULT_BADGES: ErpBadgesState = {
    orders: 0,
    returns: 0,
    quotes: 0,
    serviceOrders: 0,
    billsToPay: 0,
    vendas: 0,
    servicos: 0,
    financeiro: 0,
}

export function useErpBadges(partnerId?: string, storeId?: string | null) {
    const pathname = usePathname()
    const [rawData, setRawData] = useState<ErpSidebarBadgesRawData | null>(null)
    const [seenVersion, setSeenVersion] = useState(0)

    // Mark current section as seen when navigating
    useEffect(() => {
        if (!partnerId || typeof window === "undefined") return

        const nowIso = new Date().toISOString()
        const todayYmd = nowIso.slice(0, 10)

        let changed = false

        if (pathname.startsWith("/erp/pedidos")) {
            localStorage.setItem(`${SEEN_PREFIX}${partnerId}_pedidos`, nowIso)
            changed = true
        } else if (pathname.startsWith("/erp/devolucoes")) {
            localStorage.setItem(`${SEEN_PREFIX}${partnerId}_devolucoes`, nowIso)
            changed = true
        } else if (pathname.startsWith("/erp/orcamentos")) {
            localStorage.setItem(`${SEEN_PREFIX}${partnerId}_orcamentos`, nowIso)
            changed = true
        } else if (pathname.startsWith("/erp/ordens-de-servico")) {
            localStorage.setItem(`${SEEN_PREFIX}${partnerId}_ordens_de_servico`, nowIso)
            changed = true
        } else if (pathname.startsWith("/erp/contas-a-pagar")) {
            localStorage.setItem(`${SEEN_PREFIX}${partnerId}_contas_a_pagar`, todayYmd)
            changed = true
        }

        if (changed) {
            setSeenVersion((v) => v + 1)
        }
    }, [pathname, partnerId])

    // Fetch raw badge data from server
    const fetchBadges = useCallback(async () => {
        if (!partnerId) return
        try {
            const data = await getErpSidebarBadgesAction(storeId)
            setRawData(data)
        } catch {
            // Silently fall back
        }
    }, [partnerId, storeId])

    useEffect(() => {
        fetchBadges()

        // Periodically refresh every 90 seconds
        const interval = setInterval(fetchBadges, 90000)
        return () => clearInterval(interval)
    }, [fetchBadges])

    // Compute badges based on what hasn't been seen yet
    const badges: ErpBadgesState = useMemo(() => {
        if (!rawData || !partnerId || typeof window === "undefined") {
            return DEFAULT_BADGES
        }

        const now = Date.now()
        const todayYmd = new Date().toISOString().slice(0, 10)
        const oneDayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString()

        // Helper for timestamped items (orders, returns, quotes, serviceOrders)
        const countUnseenTimestamp = (key: string, items: Array<{ id: string; created_at: string }>) => {
            const stored = localStorage.getItem(`${SEEN_PREFIX}${partnerId}_${key}`)
            // If never viewed, default to 24 hours ago so we only notify fresh items
            const cutoff = stored ? new Date(stored).getTime() : new Date(oneDayAgoIso).getTime()
            return items.filter((item) => new Date(item.created_at).getTime() > cutoff).length
        }

        // 1. Pedidos
        const ordersCount = countUnseenTimestamp("pedidos", rawData.orders)

        // 2. Devoluções
        const returnsCount = countUnseenTimestamp("devolucoes", rawData.returns)

        // 3. Orçamentos
        const quotesCount = countUnseenTimestamp("orcamentos", rawData.quotes)

        // 4. Ordens de Serviço
        const osCount = countUnseenTimestamp("ordens_de_servico", rawData.serviceOrders)

        // 5. Contas a Pagar (seen date based)
        const billsSeenDate = localStorage.getItem(`${SEEN_PREFIX}${partnerId}_contas_a_pagar`)
        const billsCount = billsSeenDate === todayYmd ? 0 : rawData.billsToPay.length

        return {
            orders: ordersCount,
            returns: returnsCount,
            quotes: quotesCount,
            serviceOrders: osCount,
            billsToPay: billsCount,
            vendas: ordersCount + returnsCount + quotesCount,
            servicos: osCount,
            financeiro: billsCount,
        }
    }, [rawData, partnerId, seenVersion])

    const getBadgeForHref = useCallback(
        (href: string): number => {
            if (href === "/erp/pedidos") return badges.orders
            if (href === "/erp/devolucoes") return badges.returns
            if (href === "/erp/orcamentos") return badges.quotes
            if (href === "/erp/ordens-de-servico") return badges.serviceOrders
            if (href === "/erp/contas-a-pagar") return badges.billsToPay
            return 0
        },
        [badges]
    )

    const getBadgeForGroup = useCallback(
        (label: string): number => {
            if (label === "Vendas") return badges.vendas
            if (label === "Serviços") return badges.servicos
            if (label === "Financeiro") return badges.financeiro
            return 0
        },
        [badges]
    )

    return {
        badges,
        getBadgeForHref,
        getBadgeForGroup,
        refresh: fetchBadges,
    }
}
