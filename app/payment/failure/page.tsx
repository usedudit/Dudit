import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/reusable"
import Link from "next/link"
import { CancelCircleIcon } from "@/lib/icons"
import { redirect } from "next/navigation"
import { formatCurrency } from "@/lib/utils"

export default async function PaymentFailurePage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const params = await searchParams
  const orderId = params.order_id

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
            <CancelCircleIcon className="h-16 w-16 text-brand-red" />
          </div>
          <CardTitle className="text-3xl">Pagamento Não Processado</CardTitle>
          <CardDescription>Não foi possível concluir seu pagamento. Por favor, tente novamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {order && (
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="text-sm text-muted-foreground">Número do Pedido</p>
              <p className="text-2xl font-bold">{order.order_number}</p>
              <p className="text-lg">Total: {formatCurrency(order.total_amount)}</p>
            </div>
          )}

          <div className="flex gap-3 justify-center pt-4">
            <Button asChild>
              <Link href="/cart" prefetch={false}>Voltar à Sacola</Link>
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
