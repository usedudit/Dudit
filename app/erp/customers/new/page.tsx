import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { ComprehensiveCustomerForm } from "@/components/erp/comprehensive-customer-form"
import Link from "next/link"
import { Button } from "@/components/reusable"
import { ERPHeader } from "@/components/erp/erp-header"

import { getCurrentPartnerContext } from "@/lib/auth/partner-context"

export default async function NewCustomerPage() {
  const context = await getCurrentPartnerContext()

  if (!context) {
    redirect("/select-erp")
  }

  const partnerId = context.partnerId

  return (
    <>
      <ERPHeader pageTitle="Novo Cliente" isSubPage />
      <div className="min-h-svh p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <ComprehensiveCustomerForm partnerId={partnerId} />
        </div>
      </div>
    </>
  )
}
