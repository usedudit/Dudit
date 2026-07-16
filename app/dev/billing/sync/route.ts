import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { syncSubscriptionToBilling } from "@/lib/billing/sync-subscription"

/**
 * DEV-ONLY: Sync a subscription to billing.
 *
 * GET  /dev/billing/sync?subscriptionId=<uuid>
 *
 * Also accepts POST with { subscriptionId } in body.
 *
 * Security: blocked in production.
 */
export async function GET(request: NextRequest) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Apenas disponível em desenvolvimento" }, { status: 403 })
    }

    const subscriptionId = request.nextUrl.searchParams.get("subscriptionId")
    if (!subscriptionId) {
        return NextResponse.json({ error: "Parâmetro subscriptionId é obrigatório" }, { status: 400 })
    }

    try {
        const result = await syncSubscriptionToBilling(subscriptionId, "manual")
        return NextResponse.json({
            success: true,
            purchaseId: result.purchaseId,
            created: result.created,
        })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Apenas disponível em desenvolvimento" }, { status: 403 })
    }

    const body = await request.json()
    const subscriptionId = body.subscriptionId || request.nextUrl.searchParams.get("subscriptionId")

    if (!subscriptionId) {
        return NextResponse.json({ error: "subscriptionId é obrigatório" }, { status: 400 })
    }

    try {
        const result = await syncSubscriptionToBilling(subscriptionId, "manual")
        return NextResponse.json({
            success: true,
            purchaseId: result.purchaseId,
            created: result.created,
        })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}
