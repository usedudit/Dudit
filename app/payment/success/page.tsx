import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/reusable"
import Link from "next/link"
import { CheckCircleIcon } from "@/lib/icons"
import { redirect } from "next/navigation"
import { formatCurrency } from "@/lib/utils"

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string; payment_id?: string }>
}) {
  const params = await searchParams
  const orderId = params.order_id
  const paymentId = params.payment_id

  if (!orderId) {
    redirect("/")
  }

  const supabase = await getSupabaseServerClient()

  const { data: order } = await supabase
    .from("orders")
    .select("order_number, total_amount, situation, delivery_fee, discount_amount, payment_method_discount_amount, payment_method_extra_amount, payment_breakdown, order_items(subtotal, product_price, quantity)")
    .eq("id", orderId)
    .single()

  const checkoutPricing = (Array.isArray(order?.payment_breakdown) ? order?.payment_breakdown : [])
    .find((entry: any) => entry?.checkoutPricing)?.checkoutPricing
  const subtotal = checkoutPricing?.subtotal ?? (order?.order_items || []).reduce(
    (sum: number, item: any) => sum + Number(item.subtotal ?? Number(item.product_price || 0) * Number(item.quantity || 0)),
    0,
  )
  const deliveryFee = Math.max(0, Number(checkoutPricing?.deliveryFee ?? order?.delivery_fee ?? 0))
  const couponDiscount = Math.max(0, Number(checkoutPricing?.couponDiscount ?? order?.discount_amount ?? 0))
  const paymentMethodDiscount = Math.max(0, Number(checkoutPricing?.paymentMethodDiscount ?? order?.payment_method_discount_amount ?? 0))
  const paymentMethodExtra = Math.max(0, Number(
    checkoutPricing
      ? Number(checkoutPricing.paymentMethodInterest || 0) + Number(checkoutPricing.paymentMethodFee || 0)
      : order?.payment_method_extra_amount || 0,
  ))

  return (
    <div className="container max-w-2xl mx-auto py-12 px-4">
      <Card className="text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <CheckCircleIcon className="h-16 w-16 text-green-600" />
          </div>
          <CardTitle className="text-3xl">Pagamento Confirmado</CardTitle>
          <CardDescription>Seu pedido foi processado com sucesso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {order && (
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="text-sm text-muted-foreground">Número do Pedido</p>
              <p className="text-2xl font-bold">{order.order_number}</p>
              <div className="space-y-1 text-sm text-left max-w-sm mx-auto">
                <p className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></p>
                <p className="flex justify-between"><span>Entrega</span><span>{formatCurrency(deliveryFee)}</span></p>
                {couponDiscount > 0 && <p className="flex justify-between text-green-700"><span>Cupom</span><span>-{formatCurrency(couponDiscount)}</span></p>}
                {paymentMethodDiscount > 0 && <p className="flex justify-between text-green-700"><span>Pagamento</span><span>-{formatCurrency(paymentMethodDiscount)}</span></p>}
                {paymentMethodExtra > 0 && <p className="flex justify-between"><span>Juros e taxas</span><span>+{formatCurrency(paymentMethodExtra)}</span></p>}
                <p className="flex justify-between text-lg font-bold pt-2 border-t"><span>Total</span><span>{formatCurrency(order.total_amount)}</span></p>
              </div>
              <p className="text-sm">
                Status: <span className="font-semibold">{order.situation === "paid" ? "Pago" : "Processando"}</span>
              </p>
            </div>
          )}

          {paymentId && <p className="text-sm text-muted-foreground">ID do Pagamento: {paymentId}</p>}

          <div className="flex gap-3 justify-center pt-4">
            <Button asChild>
              <Link href="/pedidos" prefetch={false}>Ver Meus Pedidos</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/marketplace" prefetch={false}>Continuar Comprando</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
