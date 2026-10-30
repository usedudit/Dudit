import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { SecureLogger } from "@/lib/secure-logger"
import { requireUser, requireStorePermission } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getOrderDepositSummary } from "@/lib/payments/order-financial-state"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
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
            .select("checkout_fulfillment, order_number, partner_id, store_id, total_amount, amount_paid, paid_amount, payment_breakdown, payment_expires_at, updated_at, mp_payment_id")
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
            if (order.store_id) await requireStorePermission(order.store_id, order.partner_id, "orders", "edit")
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

        if (!order.updated_at) {
            return NextResponse.json({ error: "Não foi possível verificar a versão atual do pedido para cancelar o sinal." }, { status: 409 })
        }

        const mpPaymentId = order.mp_payment_id ? String(order.mp_payment_id) : null
        const cancellationRequestedAt = new Date().toISOString()
        const cancellationIntent = {
            ...fulfillment,
            depositCancelRequest: {
                paymentId: mpPaymentId,
                requestedAt: cancellationRequestedAt,
                requestedBy: user.id,
            },
        }

        // Persist intent first so the webhook can distinguish cancellation of a
        // pending deposit payment from cancellation of the entire order.
        const { data: intentOrder, error: intentError } = await adminClient
            .from("orders")
            .update({
                checkout_fulfillment: cancellationIntent,
                updated_at: cancellationRequestedAt,
            })
            .eq("id", orderId)
            .eq("updated_at", order.updated_at)
            .select("updated_at")
            .maybeSingle();

        if (intentError) {
            SecureLogger.error("Failed to record deposit cancellation intent:", intentError);
            return NextResponse.json({ error: "Não foi possível cancelar o sinal" }, { status: 500 });
        }
        if (!intentOrder?.updated_at) {
            return NextResponse.json({ error: "O pedido foi atualizado durante o cancelamento. Atualize e tente novamente." }, { status: 409 })
        }

        let gatewayStatus = "not_required"
        if (mpPaymentId) {
            let providerStatus: string | null = null
            try {
                const accessToken = await getValidMercadoPagoAccessToken(order.partner_id)
                const headers = {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                }
                const cancelResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
                    method: "PUT",
                    headers,
                    body: JSON.stringify({ status: "cancelled" }),
                    signal: AbortSignal.timeout(10000),
                })
                const cancelBody = await cancelResponse.json().catch(() => null)
                providerStatus = typeof cancelBody?.status === "string" ? cancelBody.status : null

                if (!cancelResponse.ok || providerStatus !== "cancelled") {
                    const statusResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                        signal: AbortSignal.timeout(10000),
                    })
                    const statusBody = await statusResponse.json().catch(() => null)
                    if (!statusResponse.ok || typeof statusBody?.status !== "string") {
                        SecureLogger.error("Could not confirm Mercado Pago deposit payment status", {
                            partnerId: order.partner_id,
                            paymentId: mpPaymentId,
                            cancelStatus: cancelResponse.status,
                            statusStatus: statusResponse.status,
                        })
                        return NextResponse.json({ error: "Não foi possível confirmar o cancelamento no Mercado Pago. O sinal continua registrado para nova tentativa." }, { status: 502 })
                    }
                    providerStatus = statusBody.status
                }

                if (providerStatus === "approved") {
                    return NextResponse.json({ error: "O pagamento já foi aprovado no Mercado Pago. Atualize o pedido; o sinal não foi cancelado." }, { status: 409 })
                }
                if (providerStatus !== "cancelled" && providerStatus !== "rejected" && providerStatus !== "expired") {
                    SecureLogger.error("Mercado Pago did not confirm a terminal unpaid deposit status", {
                        partnerId: order.partner_id,
                        paymentId: mpPaymentId,
                        status: providerStatus,
                    })
                    return NextResponse.json({ error: "O Mercado Pago não confirmou o cancelamento. O sinal continua registrado para nova tentativa." }, { status: 502 })
                }
                gatewayStatus = providerStatus
            } catch (gatewayError) {
                SecureLogger.error("Mercado Pago deposit cancellation request failed", {
                    partnerId: order.partner_id,
                    paymentId: mpPaymentId,
                    error: gatewayError,
                })
                return NextResponse.json({ error: "Não foi possível confirmar o cancelamento no Mercado Pago. O sinal continua registrado para nova tentativa." }, { status: 502 })
            }
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
                    cancelledMpPaymentId: mpPaymentId,
                    gatewayStatus,
                    cancelledAt,
                    cancelledBy: user.id,
                    cancellationReason: typeof reason === "string" ? reason.slice(0, 500) : null,
                },
            ],
        };
        delete (clearedFulfillment as Record<string, any>).depositCheckout;
        delete (clearedFulfillment as Record<string, any>).depositCancelRequest;

        // Finalize only if no approved-payment webhook changed the order while
        // the Mercado Pago cancellation request was in flight.
        const { data: updatedOrder, error: updateErr } = await adminClient
            .from("orders")
            .update({
                checkout_fulfillment: clearedFulfillment,
                payment_expires_at: null,
                mp_payment_id: null,
                payment_provider: null,
                payment_method: "Não informado",
                updated_at: cancelledAt,
            })
            .eq("id", orderId)
            .eq("updated_at", intentOrder.updated_at)
            .select("id")
            .maybeSingle();

        if (updateErr) {
            SecureLogger.error("Failed to finalize deposit cancellation:", updateErr);
            return NextResponse.json({ error: "O pagamento foi cancelado no Mercado Pago, mas não foi possível finalizar o pedido. Atualize e tente novamente." }, { status: 500 });
        }
        if (!updatedOrder) {
            return NextResponse.json({ error: "O pedido foi atualizado durante o cancelamento. O Mercado Pago respondeu; atualize o pedido antes de tentar novamente." }, { status: 409 })
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
