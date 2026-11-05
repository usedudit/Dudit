import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { SecureLogger } from "@/lib/secure-logger"
import { requireUser, requireStorePermission } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getOrderDepositSummary, patchDepositCheckoutOnPayment, resolveSituationFromPaid } from "@/lib/payments/order-financial-state"
import { buildOrderPaymentMethodLabel, hasReceivedAmount } from "@/lib/payments/payment-ledger"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidatePath } from "next/cache"

/**
 * Confirma manualmente o recebimento do sinal (depósito) de um pedido.
 *
 * Esse fluxo é usado quando o vendedor escolhe "Manter sinal" e o cliente
 * paga o Pix já gerado, mas o webhook do Mercado Pago ainda não confirmou.
 * A confirmação registra o recebimento no ledger do pedido e protege o sinal
 * contra expiração e contra eventos posteriores do Mercado Pago.
 */
export async function POST(request: NextRequest) {
    let user: Awaited<ReturnType<typeof requireUser>>
    try {
        user = await requireUser()
    } catch {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { orderId, mpPaymentId: providedMpPaymentId } = body

        if (!orderId) {
            return NextResponse.json({ error: "orderId é obrigatório" }, { status: 400 })
        }

        const adminClient = createAdminClient()

        const { data: order, error: fetchErr } = await adminClient
            .from("orders")
            .select(
                "id, order_number, situation, partner_id, store_id, total_amount, paid_amount, amount_paid, payment_breakdown, checkout_fulfillment, payment_expires_at, mp_payment_id, payment_method, payment_provider, customer_id, buyer_id, customer_name, finance_account_id, order_source",
            )
            .eq("id", orderId)
            .single()

        if (fetchErr || !order) {
            SecureLogger.error("Failed to fetch order for deposit confirmation:", fetchErr)
            return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 })
        }

        if (!order.partner_id) {
            return NextResponse.json({ error: "Pedido sem parceiro" }, { status: 400 })
        }

        try {
            await requirePermission(order.partner_id, "orders", "edit", user)
            if (order.store_id) await requireStorePermission(order.store_id, order.partner_id, "orders", "edit")
        } catch {
            return NextResponse.json({ error: "Sem permissão para confirmar o sinal" }, { status: 403 })
        }

        const fulfillment = (order.checkout_fulfillment || null) as Record<string, any> | null
        const depositMeta = fulfillment?.depositCheckout as Record<string, any> | undefined

        if (!depositMeta || (!depositMeta.initialChargeAmount && !depositMeta.depositAmount)) {
            return NextResponse.json({ error: "Nenhum sinal encontrado para este pedido" }, { status: 400 })
        }

        const depositSummary = getOrderDepositSummary(order as any)
        const totalAmount = Number(order.total_amount || 0)
        const currentPaid = Math.max(0, Number(order.paid_amount ?? order.amount_paid ?? 0))
        const depositAmount = Math.max(
            0,
            Number(depositSummary.initialChargeAmount || depositSummary.depositAmount || depositMeta.initialChargeAmount || depositMeta.depositAmount || 0),
        )

        if (depositAmount <= 0.009) {
            return NextResponse.json({ error: "Valor do sinal inválido para este pedido" }, { status: 400 })
        }

        // Idempotência: se o sinal já foi recebido, devolve o estado atual.
        if (depositSummary.sinalPaid || currentPaid >= depositAmount - 0.01) {
            return NextResponse.json({
                success: true,
                alreadyConfirmed: true,
                situation: order.situation,
                paidAmount: currentPaid,
                totalAmount,
                depositAmount,
                paymentMethod: order.payment_method,
                paymentBreakdown: Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [],
                checkoutFulfillment: fulfillment,
            })
        }

        if (depositSummary.depositStatus !== "pending") {
            return NextResponse.json(
                { error: "O sinal deste pedido não está mais pendente." },
                { status: 409 },
            )
        }

        const paidAt = new Date().toISOString()
        const nextPaidAmount = Math.min(totalAmount, currentPaid + depositAmount)
        const nextSituation = resolveSituationFromPaid(nextPaidAmount, totalAmount)

        const rawBreakdown = Array.isArray(order.payment_breakdown) ? [...order.payment_breakdown] : []
        // Prefere o ID gravado no pedido; usa o informado pelo cliente como
        // fallback para amarrar a confirmação manual ao Pix correto.
        const providedMpPaymentIdStr = providedMpPaymentId
            ? String(providedMpPaymentId).trim()
            : ""
        const mpPaymentId = order.mp_payment_id
            ? String(order.mp_payment_id)
            : (providedMpPaymentIdStr || null)

        const isMercadoPagoLeg = (entry: any) => {
            const provider = String(entry?.provider || "").toLowerCase()
            const method = String(entry?.method || "").toLowerCase()
            return provider.includes("mercado pago") || method.includes("mercado pago")
        }

        let depositLegIndex = mpPaymentId
            ? rawBreakdown.findIndex(
                (entry: any) => entry?.mpPaymentId && String(entry.mpPaymentId) === mpPaymentId,
            )
            : -1
        if (depositLegIndex < 0) {
            depositLegIndex = rawBreakdown.findIndex(
                (entry: any) => !hasReceivedAmount(entry) && isMercadoPagoLeg(entry),
            )
        }
        if (depositLegIndex < 0) {
            depositLegIndex = rawBreakdown.findIndex(
                (entry: any) => String(entry?.paymentKind || "") === "deposit",
            )
        }

        const baseDepositLeg = depositLegIndex >= 0 ? rawBreakdown[depositLegIndex] : {}
        const depositLeg = {
            ...baseDepositLeg,
            method: "Pix (Mercado Pago)",
            amount: depositAmount,
            effectiveAmount: depositAmount,
            amountReceived: depositAmount,
            netReceivedAmount: depositAmount,
            paymentKind: "deposit",
            provider: "Mercado Pago",
            adjustmentType: "none",
            adjustmentPercent: 0,
            adjustmentAmount: 0,
            installmentNumber: 1,
            feeAmount: Number(baseDepositLeg?.feeAmount || 0),
            fixedFeeAmount: 0,
            interestAmount: 0,
            feeBearer: "merchant",
            paymentMethodId: null,
            mpPaymentMethodId: "pix",
            paymentStatus: "approved",
            paymentStatusDetail: "manually_confirmed",
            manuallyConfirmed: true,
            manuallyConfirmedAt: paidAt,
            manuallyConfirmedBy: user.id,
            ...(mpPaymentId ? { mpPaymentId } : {}),
        }

        const paymentBreakdown =
            depositLegIndex >= 0
                ? rawBreakdown.map((entry: any, index: number) => (index === depositLegIndex ? depositLeg : entry))
                : [depositLeg, ...rawBreakdown]

        const nextFulfillment = patchDepositCheckoutOnPayment(
            fulfillment,
            nextPaidAmount,
            totalAmount,
            paidAt,
        )

        const paymentMethod = buildOrderPaymentMethodLabel(paymentBreakdown, {
            fallbackMethod: order.payment_method,
            usesDeposit: true,
            paidAmount: nextPaidAmount,
            totalAmount,
        })

        const updatePayload: Record<string, unknown> = {
            situation: nextSituation,
            paid_amount: nextPaidAmount,
            amount_paid: nextPaidAmount,
            payment_breakdown: paymentBreakdown,
            payment_method: paymentMethod,
            ...(mpPaymentId ? { mp_payment_id: mpPaymentId } : {}),
            updated_at: paidAt,
            ...(nextFulfillment ? { checkout_fulfillment: nextFulfillment } : {}),
        }

        const { error: updateErr } = await adminClient
            .from("orders")
            .update(updatePayload)
            .eq("id", order.id)

        if (updateErr) {
            SecureLogger.error("Failed to confirm deposit on order:", updateErr)
            return NextResponse.json({ error: "Não foi possível confirmar o sinal" }, { status: 500 })
        }

        // Registra a transação financeira do valor recebido (idempotente por delta).
        try {
            const { createFinancialTransactionsForReceivedAmount } = await import("@/app/actions/erp/orders")
            await createFinancialTransactionsForReceivedAmount(adminClient as any, {
                orderId: order.id,
                orderNumber: order.order_number || order.id,
                partnerId: order.partner_id,
                storeId: order.store_id || null,
                totalAmount,
                newBreakdown: paymentBreakdown,
                oldBreakdown: rawBreakdown,
                customerId: order.customer_id || order.buyer_id || null,
                customerName: order.customer_name || null,
                financeAccountId: order.finance_account_id || null,
                orderSource: order.order_source || "manual",
                paymentMethod,
            })
        } catch (financialErr: any) {
            SecureLogger.error("Failed to create financial transaction for confirmed deposit:", financialErr)
        }

        await logAuditEvent({
            partnerId: order.partner_id,
            actorUserId: user.id,
            entityType: "order",
            entityId: order.id,
            actionType: "deposit_paid",
            changeLines: [
                "confirmou manualmente o recebimento do sinal.",
                `Sinal: R$ ${depositAmount.toFixed(2)}`,
                `Total recebido: R$ ${nextPaidAmount.toFixed(2)}`,
            ],
            metadata: {
                orderNumber: order.order_number,
                depositAmount,
                initialChargeAmount: depositSummary.initialChargeAmount,
                previousPaidAmount: currentPaid,
                newPaidAmount: nextPaidAmount,
                newSituation: nextSituation,
                mpPaymentId,
                statusScope: "deposit",
                manuallyConfirmed: true,
            },
            source: "erp",
        })

        const { revalidateOrderHistory } = await import("@/lib/utils/revalidation")
        await revalidateOrderHistory(order.id)
        revalidatePath(`/order/${order.order_number}`)
        revalidatePath("/erp/pedidos")

        return NextResponse.json({
            success: true,
            alreadyConfirmed: false,
            situation: nextSituation,
            paidAmount: nextPaidAmount,
            totalAmount,
            depositAmount,
            paymentMethod,
            paymentBreakdown,
            checkoutFulfillment: nextFulfillment ?? fulfillment,
        })
    } catch (err: any) {
        SecureLogger.error("confirm-deposit error:", err)
        return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 })
    }
}
