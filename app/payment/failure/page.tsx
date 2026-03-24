import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/reusable"
import Link from "next/link"
import { XCircle } from "@/lib/icons"
import { redirect } from "next/navigation"

export default async function PaymentFailurePage({
  searchParams,
}: {
  searchParams: { order_id?: string }
}) {
  const orderId = searchParams.order_id

  if (!orderId) {
    redirect("/")
  }

  const supabase = await getSupabaseServerClient()

  const { data: order } = await supabase.from("orders").select("order_number, total_amount").eq("id", orderId).single()

  return (
    <div className="container max-w-2xl mx-auto py-12 px-4">
      <Card className="text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <XCircle className="h-16 w-16 text-brand-red" />
          </div>
          <CardTitle className="text-3xl">Pagamento Não Processado</CardTitle>
          <CardDescription>Não foi possível concluir seu pagamento. Por favor, tente novamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {order && (
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="text-sm text-muted-foreground">Número do Pedido</p>
              <p className="text-2xl font-bold">{order.order_number}</p>
              <p className="text-lg">Total: R$ {Number(order.total_amount).toFixed(2)}</p>
            </div>
          )}

          <div className="flex gap-3 justify-center pt-4">
            <Button asChild>
              <Link href="/cart" prefetch={false}>Voltar ao Carrinho</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/marketplace">Continuar Comprando</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
