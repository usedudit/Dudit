import { Button } from "@/components/reusable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerServicesCached } from "@/lib/data/services"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function ServicesPage() {
  // Layout already guarantees auth + valid context
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "services", "view")
  if (!allowed) return <AccessDenied />

  const services = await getPartnerServicesCached(partnerId)

  return (
    <div className="min-h-svh p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Serviços</h1>
            <p className="text-muted-foreground">Gerencie seus serviços</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/erp/dashboard" prefetch={false}>Voltar</Link>
            </Button>
            <Button asChild>
              <Link href="/erp/services/new" prefetch={false}>Adicionar serviço</Link>
            </Button>
          </div>
        </div>

        {services && services.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service: any) => (
              <Card key={service.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{service.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {service.description && <p className="text-sm line-clamp-2">{service.description}</p>}
                  <div className="flex justify-between text-sm">
                    <span>Preço:</span>
                    <span className="font-semibold">{formatCurrency(service.price)}</span>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full bg-transparent">
                    <Link href={`/erp/services/${service.id}`} prefetch={false}>Editar</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground mb-4">Nenhum serviço cadastrado ainda</p>
              <Button asChild>
                <Link href="/erp/services/new" prefetch={false}>Adicionar primeiro serviço</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
