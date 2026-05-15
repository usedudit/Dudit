import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import AppointmentsPage from "@/components/erp/appointments/AppointmentsPage"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

/**
 * SSR catalog loader - fetches team, customers, services and unavailable types
 * in a single parallel batch with ONE auth context.
 * Replaces 4 separate client-side server actions that each did their own auth.
 */
async function loadCatalogs(partnerId: string) {
  const supabase = await getSupabaseServerClient()

  const [partnerUsersRes, partnerRes, customersRes, servicesRes, unavailableRes] = await Promise.all([
    supabase
      .from("partner_users")
      .select("id, user_id, role_id, role")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("partners")
      .select("user_id")
      .eq("id", partnerId)
      .single(),
    supabase
      .from("customers")
      .select("id, name, email")
      .eq("partner_id", partnerId)
      .eq("status", "ativo")
      .order("name", { ascending: true })
      .limit(500),
    supabase
      .from("services")
      .select("id, name, price, duration_minutes, buffer_minutes, billing_unit, service_categories!category_id(name)")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    supabase
      .from("unavailable_types")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .order("name"),
  ])

  // Resolve team member display names from user_profiles
  let partnerUsers = partnerUsersRes.data || []
  const partner = partnerRes.data
  const ownerUserId = partner?.user_id

  // Fix: Ensure owner is in partner_users so they appear in the scheduler.
  // This satisfies the database foreign key constraint for appointments.
  if (ownerUserId && !partnerUsers.some((pu: any) => pu.user_id === ownerUserId)) {
    const admin = getAdminClient()
    const { data: newPu, error: insertErr } = await admin
      .from("partner_users")
      .insert({
        partner_id: partnerId,
        user_id: ownerUserId,
        role_id: "owner",
        role: "OWNER" // Legacy field support
      })
      .select("id, user_id, role_id, role")
      .single()

    if (!insertErr && newPu) {
      partnerUsers = [newPu, ...partnerUsers]
    }
  }

  const userIds = partnerUsers.map((pu: any) => pu.user_id)

  let profileMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)
    for (const p of profiles || []) {
      if (p.full_name) profileMap[p.user_id] = p.full_name
    }
  }

  return {
    team: partnerUsers.map((pu: any) => ({
      id: String(pu.id),
      name: profileMap[pu.user_id] || "Sem nome",
      role: String(pu.role_id || pu.role || "staff").toUpperCase(),
    })),
    customers: (customersRes.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email || undefined,
    })),
    services: (servicesRes.data || []).map((s: any) => ({
      id: String(s.id),
      name: String(s.name || ""),
      price: Number(s.price || 0),
      duration: String(Number(s.duration_minutes || 60)),
      bufferMinutes: Number(s.buffer_minutes || 0),
      category: (s as any).service_categories?.name || "Serviços",
      billingUnit: String(s.billing_unit || "per_service"),
    })),
    unavailableTypes: unavailableRes.data || [],
  }
}

export default async function AgendamentosPage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "appointments", "view")
  if (!allowed) return <AccessDenied />

  // SSR: single parallel fetch replaces 4 client-side server actions
  const catalogs = await loadCatalogs(partnerId)

  return (
    <>
      <ERPPageHeader title="Agendamentos" />
      <FadeIn className="p-4">
        <AppointmentsPage
          partnerId={partnerId}
          initialTeam={catalogs.team}
          initialCustomers={catalogs.customers}
          initialServices={catalogs.services}
          initialUnavailableTypes={catalogs.unavailableTypes}
        />
      </FadeIn>
    </>
  )
}
