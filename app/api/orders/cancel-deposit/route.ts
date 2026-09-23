import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { SecureLogger } from "@/lib/secure-logger"
import { revalidatePath } from "next/cache"

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { orderId } = body;

        if (!orderId) {
            return NextResponse.json({ error: "orderId é obrigatório" }, { status: 400 });
        }

        const adminClient = createAdminClient();

        const { data: order, error: fetchErr } = await adminClient
            .from("orders")
            .select("checkout_fulfillment, order_number")
            .eq("id", orderId)
            .single();

        if (fetchErr || !order) {
            SecureLogger.error("Failed to fetch order for deposit cancellation:", fetchErr);
            return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
        }

        const fulfillment = order.checkout_fulfillment as Record<string, any> | null;
        const depositMeta = fulfillment?.depositCheckout as Record<string, any> | undefined;

        if (!depositMeta || (!depositMeta.initialChargeAmount && !depositMeta.depositAmount)) {
            return NextResponse.json({ error: "Nenhum sinal encontrado para este pedido" }, { status: 400 });
        }

        const clearedFulfillment = { ...fulfillment };
        delete clearedFulfillment.depositCheckout;

        const { error: updateErr } = await adminClient
            .from("orders")
            .update({
                checkout_fulfillment: clearedFulfillment,
                updated_at: new Date().toISOString(),
            })
            .eq("id", orderId);

        if (updateErr) {
            SecureLogger.error("Failed to clear deposit on order:", updateErr);
            return NextResponse.json({ error: "Não foi possível cancelar o sinal" }, { status: 500 });
        }

        revalidatePath(`/order/${order.order_number}`);
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err: any) {
        SecureLogger.error("cancel-deposit error:", err);
        return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 });
    }
}
