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
  searchParams: { order_id?: string; payment_id?: string }
}) {
  const orderId = searchParams.order_id
  const paymentId = searchParams.payment_id

  if (!orderId) {
    redirect("/")
  }

  const supabase = await getSupabaseServerClient()

  const { data: order } = await supabase
    .from("orders")
    .select("order_number, total_amount, situation")
    .eq("id", orderId)
    .single()

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
              <p className="text-lg">Total: {formatCurrency(order.total_amount)}</p>
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
