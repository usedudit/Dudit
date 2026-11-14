"use server"

import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getAdminClient } from "@/lib/supabase/admin"

export interface ErpItemTimestamp {
    id: string
    created_at: string
}

export interface ErpBillItem {
    id: string
    due_date: string
}

export interface ErpSidebarBadgesRawData {
    orders: ErpItemTimestamp[]
    returns: ErpItemTimestamp[]
    quotes: ErpItemTimestamp[]
    serviceOrders: ErpItemTimestamp[]
    billsToPay: ErpBillItem[]
}

const EMPTY_BADGES: ErpSidebarBadgesRawData = {
    orders: [],
    returns: [],
    quotes: [],
    serviceOrders: [],
    billsToPay: [],
}

export async function getErpSidebarBadgesAction(storeId?: string | null): Promise<ErpSidebarBadgesRawData> {
    try {
        const context = await getCurrentPartnerContext()
        if (!context?.partnerId) {
            return EMPTY_BADGES
        }

        const partnerId = context.partnerId
        const effectiveStoreId = storeId ?? context.activeStoreId ?? null
        const admin = getAdminClient()
        const todayYmd = new Date().toISOString().slice(0, 10)

        // 1. Orders (needing preparation / not delivered)
        let ordersQuery = admin
            .from("orders")
            .select("id, created_at")
            .eq("partner_id", partnerId)
            .neq("situation", "cancelled")
            .neq("situation", "refunded")
            .in("situation", ["paid", "pending", "approved", "processing"])
            .neq("delivery_status", "delivered")

        // 2. Returns (pending seller action)
        let returnsQuery = admin
            .from("return_requests")
            .select("id, created_at")
            .eq("partner_id", partnerId)
            .is("deleted_at", null)
            .in("status", [
                "requested",
                "under_review",
                "disputed",
                "PENDING_REVIEW",
                "UNDER_ANALYSIS",
                "ESCALATED",
                "WAITING_ITEM_RETURN",
            ])

        // 3. Quotes (pending / draft / sent)
        let quotesQuery = admin
            .from("quotes")
            .select("id, created_at")
            .eq("partner_id", partnerId)
            .in("status", ["pending", "draft", "sent"])

        // 4. Service Orders (open / under analysis / waiting parts)
        let osQuery = admin
            .from("service_orders")
            .select("id, created_at")
            .eq("partner_id", partnerId)
            .in("status", ["open", "budget_pending", "in_analysis", "waiting_parts", "in_repair"])

        // 5. Contas a Pagar (expenses pending and due today or overdue)
        let billsQuery = admin
            .from("transactions")
            .select("id, due_date")
            .eq("partner_id", partnerId)
            .eq("transaction_type", "expense")
            .eq("status", "pending")
            .lte("due_date", todayYmd)

        if (effectiveStoreId) {
            ordersQuery = ordersQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)
            returnsQuery = returnsQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)
            quotesQuery = quotesQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)
            osQuery = osQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)
            billsQuery = billsQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`)
        }

        const [ordersRes, returnsRes, quotesRes, osRes, billsRes] = await Promise.all([
            ordersQuery.order("created_at", { ascending: false }).limit(50),
            returnsQuery.order("created_at", { ascending: false }).limit(50),
            quotesQuery.order("created_at", { ascending: false }).limit(50),
            osQuery.order("created_at", { ascending: false }).limit(50),
            billsQuery.order("due_date", { ascending: true }).limit(50),
        ])

        return {
            orders: ((ordersRes.data || []) as any[]).map((o) => ({ id: String(o.id), created_at: String(o.created_at) })),
            returns: ((returnsRes.data || []) as any[]).map((r) => ({ id: String(r.id), created_at: String(r.created_at) })),
            quotes: ((quotesRes.data || []) as any[]).map((q) => ({ id: String(q.id), created_at: String(q.created_at) })),
            serviceOrders: ((osRes.data || []) as any[]).map((s) => ({ id: String(s.id), created_at: String(s.created_at) })),
            billsToPay: ((billsRes.data || []) as any[]).map((b) => ({ id: String(b.id), due_date: String(b.due_date) })),
        }
    } catch (err) {
        console.error("[ERP_BADGES] Failed to fetch badge counts:", err)
        return EMPTY_BADGES
    }
}
