import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import Link from "next/link"
import { Button } from "@/components/reusable"
import { ServiceForm } from "@/components/erp/service-form"

import { getCurrentPartnerContext } from "@/lib/auth/partner-context"

export default async function NewServicePage() {
  const context = await getCurrentPartnerContext()

  if (!context) {
    redirect("/select-erp")
  }

  const partnerId = context.partnerId

  return (
    <div className="min-h-svh p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Novo Serviço</h1>
          </div>
          <Button asChild variant="outline">
            <Link href="/erp/services" prefetch={false}>Voltar</Link>
          </Button>
        </div>

        <ServiceForm partnerId={partnerId} />
      </div>
    </div>
  )
}
