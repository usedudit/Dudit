import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { SecureLogger } from "@/lib/secure-logger"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getOrderDepositSummary } from "@/lib/payments/order-financial-state"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidatePath } from "next/cache"

export async function POST(request: NextRequest) {
    let user: Awaited<ReturnType<typeof requireUser>>
    try {
        user = await requireUser()
    } catch {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    try {
        const body = await request.json();
        const { orderId, reason } = body;

        if (!orderId) {
            return NextResponse.json({ error: "orderId é obrigatório" }, { status: 400 });
        }

        const adminClient = createAdminClient();

        const { data: order, error: fetchErr } = await adminClient
            .from("orders")
            .select("checkout_fulfillment, order_number, partner_id, total_amount, amount_paid, paid_amount, payment_breakdown, payment_expires_at")
            .eq("id", orderId)
            .single();

        if (fetchErr || !order) {
            SecureLogger.error("Failed to fetch order for deposit cancellation:", fetchErr);
            return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
        }

        if (!order.partner_id) {
            return NextResponse.json({ error: "Pedido sem parceiro" }, { status: 400 });
        }

        try {
            await requirePermission(order.partner_id, "orders", "edit", user)
        } catch {
            return NextResponse.json({ error: "Sem permissão para cancelar o sinal" }, { status: 403 });
        }

        const fulfillment = order.checkout_fulfillment as Record<string, any> | null;
        const depositMeta = fulfillment?.depositCheckout as Record<string, any> | undefined;

        if (!depositMeta || (!depositMeta.initialChargeAmount && !depositMeta.depositAmount)) {
            return NextResponse.json({ error: "Nenhum sinal encontrado para este pedido" }, { status: 400 });
        }

        const depositSummary = getOrderDepositSummary(order as any)
        if (depositSummary.sinalPaid || depositSummary.paidAmount > 0.009) {
            return NextResponse.json(
                { error: "O sinal já foi pago. Cancele ou estorne o pagamento antes de desfazer o sinal." },
                { status: 409 },
            )
        }

        const cancelledAt = new Date().toISOString()
        const history = Array.isArray(fulfillment?.depositCheckoutHistory)
            ? fulfillment!.depositCheckoutHistory
            : []

        const clearedFulfillment = {
            ...fulfillment,
            depositCheckoutHistory: [
                ...history,
                {
                    ...depositMeta,
                    depositStatus: "cancelled",
                    cancelledAt,
                    cancelledBy: user.id,
                    cancellationReason: typeof reason === "string" ? reason.slice(0, 500) : null,
                },
            ],
        };
        delete (clearedFulfillment as Record<string, any>).depositCheckout;

        const { error: updateErr } = await adminClient
            .from("orders")
            .update({
                checkout_fulfillment: clearedFulfillment,
                // Clear payment method fields so customer can pay the full amount afterward
                payment_expires_at: null,
                mp_payment_id: null,
                payment_provider: null,
                payment_method: "Não informado",
                updated_at: cancelledAt,
            })
            .eq("id", orderId);

        if (updateErr) {
            SecureLogger.error("Failed to clear deposit on order:", updateErr);
            return NextResponse.json({ error: "Não foi possível cancelar o sinal" }, { status: 500 });
        }

        await logAuditEvent({
            partnerId: order.partner_id,
            actorUserId: user.id,
            entityType: "order",
            entityId: orderId,
            actionType: "deposit_cancelled",
            changeLines: [
                "cancelou o sinal do pedido.",
                `Sinal: R$ ${Number(depositMeta.depositAmount || 0).toFixed(2)}`,
            ],
            metadata: {
                orderNumber: order.order_number,
                depositAmount: depositMeta.depositAmount,
                initialChargeAmount: depositMeta.initialChargeAmount,
                reason: typeof reason === "string" ? reason.slice(0, 500) : null,
            },
            source: "erp",
        })

        const { revalidateOrderHistory } = await import("@/lib/utils/revalidation");
        await revalidateOrderHistory(orderId);
        revalidatePath(`/order/${order.order_number}`);
        revalidatePath("/erp/pedidos");
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        SecureLogger.error("cancel-deposit error:", err);
        return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 });
    }
}
