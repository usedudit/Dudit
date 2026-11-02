import { getErpRequestContext } from "@/lib/auth/erp-context"
import { checkPermission } from "@/lib/permissions/access"
import { AccessDenied } from "@/components/erp/access-denied"
import AppointmentsPage from "@/components/erp/appointments/AppointmentsPage"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { scopeActiveOnly } from "@/lib/supabase/query-helpers"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { requireAuthorizedCustomerContext } from "@/lib/services/authorized-customer-access"
import { APPOINTMENT_LIST_COLUMNS } from "@/app/actions/erp/appointments"

export const dynamic = "force-dynamic"

/**
 * SSR catalog loader - fetches team, customers, services and unavailable types
 * in a single parallel batch with ONE auth context.
 * Replaces 4 separate client-side server actions that each did their own auth.
 */
async function loadCatalogs(partnerId: string, storeId?: string | null) {
  const supabase = await getSupabaseServerClient()
  const customerAccess = await requireAuthorizedCustomerContext(partnerId, "view")

  let servicesQuery = scopeActiveOnly(supabase
    .from("services")
    .select("id, name, price, promotional_price, category_id, duration_minutes, buffer_minutes, billing_unit, resources, service_categories!category_id(name)")
    .eq("partner_id", partnerId)
    .eq("is_active", true))

  if (storeId) {
    servicesQuery = servicesQuery.eq("store_id", storeId)
  }

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  let appointmentsQuery = supabase
    .from("appointments")
    .select(APPOINTMENT_LIST_COLUMNS)
    .eq("partner_id", partnerId)
    .lte("start_date", todayStr)
    .or(`end_date.gte.${todayStr},and(end_date.is.null,start_date.gte.${todayStr})`)

  if (storeId) {
    appointmentsQuery = appointmentsQuery.or(`store_id.eq.${storeId},store_id.is.null`)
  }

  const [partnerUsersRes, partnerRes, customersRes, servicesRes, unavailableRes, appointmentsRes] = await Promise.all([
    supabase
      .from("partner_users")
      .select("id, user_id, role_id, role")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("partners")
      .select("user_id, stores(id, opening_hours)")
      .eq("id", partnerId)
      .single(),
    customerAccess.admin
      .from("customers")
      .select("id, name, email, phone, image_url")
      .eq("partner_id", partnerId)
      .eq("status", "ativo")
      .order("name", { ascending: true })
      .limit(500),
    servicesQuery.order("name").limit(500),
    supabase
      .from("unavailable_types")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .order("name"),
    appointmentsQuery
      .order("start_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(500),
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
      phone: c.phone || undefined,
      avatar_url: c.image_url || null,
    })),
    services: (servicesRes.data || []).map((s: any) => ({
      id: String(s.id),
      name: String(s.name || ""),
      price: Number(s.price || 0),
      promotional_price: s.promotional_price ? Number(s.promotional_price) : null,
      category_id: s.category_id || null,
      duration: String(Number(s.duration_minutes || 60)),
      bufferMinutes: Number(s.buffer_minutes || 0),
      category: (s as any).service_categories?.name || "Serviços",
      billingUnit: String(s.billing_unit || "per_service"),
      resources: Array.isArray(s.resources) ? s.resources : [],
    })),
    unavailableTypes: unavailableRes.data || [],
    initialAppointments: appointmentsRes.data || [],
    openingHours: (() => {
      const stores = (partner as any)?.stores || []
      const activeStore = storeId ? stores.find((s: any) => s.id === storeId) : null
      const rawHours = activeStore?.opening_hours || stores[0]?.opening_hours || (partner as any)?.opening_hours || null
      return rawHours ? normalizeOpeningHours(rawHours) : null
    })(),
  }
}

export default async function AgendamentosPage() {
  const context = await getErpRequestContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId
  const activeStoreId = context.activeStoreId || null

  const { allowed } = await checkPermission(partnerId, "appointments", "view")
  if (!allowed) return <AccessDenied />

  // SSR: single parallel fetch replaces 4 client-side server actions
  const catalogs = await loadCatalogs(partnerId, activeStoreId)

  return (
    <>
      <ERPPageHeader title="Agendamentos" />
      <FadeIn className="p-4">
        <AppointmentsPage
          partnerId={partnerId}
          storeId={activeStoreId}
          initialTeam={catalogs.team}
          initialCustomers={catalogs.customers}
          initialServices={catalogs.services}
          initialUnavailableTypes={catalogs.unavailableTypes}
          initialAppointments={catalogs.initialAppointments}
          openingHours={catalogs.openingHours}
        />
      </FadeIn>
    </>
  )
}
