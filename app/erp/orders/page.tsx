import { Button } from "@/components/reusable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"
import { getPartnerOrdersCached } from "@/lib/data/orders"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"

export default async function OrdersPage() {
  // Layout already guarantees auth + valid context
  const context = (await getCurrentPartnerContext())!
  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "orders", "view")
  if (!allowed) return <AccessDenied />

  const orders = await getPartnerOrdersCached(partnerId)

  return (
    <div className="min-h-svh p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Pedidos</h1>
            <p className="text-muted-foreground">Gerencie os pedidos recebidos</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/erp/dashboard" prefetch={false}>Voltar</Link>
          </Button>
        </div>

        {orders && orders.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Lista de Pedidos</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order: any) => {
                    const totalItems =
                      order.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || order.quantity

                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.mp_payment_id || order.order_number}</TableCell>
                        <TableCell>
                          {order.customer_name || order.profiles?.full_name || order.profiles?.email || "-"}
                        </TableCell>
                        <TableCell>
                          {totalItems} {totalItems === 1 ? "item" : "itens"}
                        </TableCell>
                        <TableCell>R$ {Number(order.total_amount).toFixed(2)}</TableCell>
                        <TableCell>
                          {(() => {
                            const isPendingExpired =
                              (order.situation === "pending" || order.situation === "in_process") &&
                              new Date(order.created_at).getTime() < Date.now() - 24 * 60 * 60 * 1000

                            const statusMap: Record<string, { label: string; color: string }> = {
                              paid: { label: "Pago", color: "text-green-600" },
                              shipped: { label: "Enviado", color: "text-blue-600" },
                              delivered: { label: "Entregue", color: "text-green-700" },
                              cancelled: { label: "Cancelado", color: "text-brand-red" },
                              in_process: { label: "Em análise", color: "text-brand-orange" },
                              pending: { label: "Pendente", color: "text-yellow-600" },
                            }

                            const status = statusMap[order.situation] || { label: order.situation, color: "text-yellow-600" }

                            return (
                              <span className={status.color}>
                                {status.label}
                                {isPendingExpired && (
                                  <span className="text-xs text-muted-foreground ml-1" title="Pedido pendente há mais de 24h">(expirado?)</span>
                                )}
                              </span>
                            )
                          })()}
                        </TableCell>
                        <TableCell>{new Date(order.created_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/erp/orders/${order.id}`} prefetch={false}>Ver detalhes</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Nenhum pedido ainda</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
