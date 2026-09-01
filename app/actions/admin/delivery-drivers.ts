"use server"

import { randomBytes, createHash } from "node:crypto"
import { revalidatePath } from "next/cache"

import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { getAdminClient } from "@/lib/supabase/admin"
import { SMTP2GOService } from "@/lib/services/smtp2go.service"
import { SMTP2GO_TEMPLATE_IDS } from "@/lib/services/smtp2go-templates"
import type { InternalEmailRequest } from "@/lib/types/unosend.types"
import type { DeliveryDriverVehicle } from "@/lib/delivery/types"

function clean(value: unknown, max = 160) {
  return String(value || "").trim().slice(0, max)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char))
}

function inviteUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"
  return `${base.replace(/\/$/, "")}/entregadores/convite/${token}`
}

export async function listDeliveryDriversAdminAction(params?: { limit?: number; cursor?: string | null }) {
  await requireAdminScope("user_enforcement", "admin")
  const admin = getAdminClient()
  const limit = Math.min(Math.max(Number(params?.limit || 25), 1), 50)
  let query = admin
    .from("delivery_drivers")
    .select("user_id, city, neighborhood, vehicle_type, availability_status, is_active, notes, created_at, updated_at")
    .order("created_at", { ascending: false })
    .order("user_id", { ascending: false })
    .limit(limit + 1)

  if (params?.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(params.cursor, "base64url").toString("utf8"))
      if (decoded.createdAt && decoded.userId) {
        query = query.or(`created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},user_id.lt.${decoded.userId})`)
      }
    } catch {
      return { success: false as const, error: "Cursor inválido." }
    }
  }

  const { data, error } = await query
  if (error) return { success: false as const, error: "Não foi possível carregar os entregadores." }
  const rows = Array.isArray(data) ? data : []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const profiles = page.length
    ? (await admin.from("user_profiles").select("user_id, full_name, phone, avatar_url").in("user_id", page.map((row: any) => row.user_id))).data || []
    : []
  const profileById = new Map((profiles as any[]).map((profile) => [String(profile.user_id), profile]))
  const users = await Promise.all(page.map(async (row: any) => {
    const result = await admin.auth.admin.getUserById(String(row.user_id))
    return [String(row.user_id), result.data?.user?.email || null] as const
  }))
  const emailById = new Map(users)
  const items = page.map((row: any) => ({
    ...row,
    email: emailById.get(String(row.user_id)),
    profile: profileById.get(String(row.user_id)) || null,
  }))
  const last = items[items.length - 1]
  return {
    success: true as const,
    items,
    hasMore,
    nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.created_at, userId: last.user_id })).toString("base64url") : null,
  }
}

export async function getDeliveryDriverAdminAction(driverId: string) {
  await requireAdminScope("user_enforcement", "admin")
  const admin = getAdminClient()
  const { data: driver, error } = await admin
    .from("delivery_drivers")
    .select("user_id, city, neighborhood, vehicle_type, availability_status, is_active, notes, terms_accepted_at, terms_version, created_at, updated_at")
    .eq("user_id", driverId)
    .maybeSingle()
  if (error || !driver) return { success: false as const, error: "Entregador não encontrado." }

  const [{ data: profile }, authResult, { data: assignments }, { data: links }] = await Promise.all([
    admin.from("user_profiles").select("user_id, full_name, phone, avatar_url").eq("user_id", driverId).maybeSingle(),
    admin.auth.admin.getUserById(driverId),
    admin.from("delivery_assignments").select("id, order_id, partner_id, status, delivery_fee, assigned_at, completed_at, failure_reason, payment_confirmed_at").eq("driver_id", driverId).order("assigned_at", { ascending: false }).limit(100),
    admin.from("delivery_driver_partners").select("id, partner_id, is_active, created_at").eq("driver_id", driverId).order("created_at", { ascending: false }),
  ])

  const partnerIds = Array.from(new Set((links || []).map((row: any) => String(row.partner_id)).filter(Boolean)))
  const { data: stores } = partnerIds.length
    ? await admin.from("stores").select("partner_id, name").in("partner_id", partnerIds).order("is_headquarters", { ascending: false })
    : { data: [] as any[] }
  const partnerNames = new Map<string, string>()
  for (const store of stores || []) {
    if (!partnerNames.has(String(store.partner_id))) partnerNames.set(String(store.partner_id), String(store.name || "Parceiro"))
  }

  const rows = assignments || []
  const completed = rows.filter((row: any) => row.status === "delivered").length
  const failed = rows.filter((row: any) => row.status === "failed").length
  return {
    success: true as const,
    driver: {
      ...driver,
      profile: profile || null,
      email: authResult.data?.user?.email || null,
      assignments: rows.map((row: any) => ({ ...row, partner_name: partnerNames.get(String(row.partner_id)) || "Parceiro" })),
      partners: (links || []).map((row: any) => ({ ...row, partner_name: partnerNames.get(String(row.partner_id)) || "Parceiro" })),
      metrics: {
        total: rows.length,
        completed,
        failed,
        successRate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
      },
    },
  }
}

export async function createDeliveryDriverInvitationAdminAction(input: {
  email: string
  fullName: string
  phone: string
  city: string
  neighborhood: string
  vehicleType: DeliveryDriverVehicle
  notes?: string
  zipCode?: string
  street?: string
  number?: string
  complement?: string
  state?: string
  latitude?: number | null
  longitude?: number | null
}) {
  const adminUser = await requireAdminScope("user_enforcement", "admin")
  const email = clean(input.email, 254).toLowerCase()
  const fullName = clean(input.fullName)
  const phone = clean(input.phone, 40)
  const city = clean(input.city, 100)
  const neighborhood = clean(input.neighborhood, 100)
  const notes = clean(input.notes, 500) || null
  const zipCode = clean(input.zipCode, 20) || null
  const street = clean(input.street, 255) || null
  const number = clean(input.number, 50) || null
  const complement = clean(input.complement, 100) || null
  const state = clean(input.state, 10) || null
  const latitude = typeof input.latitude === "number" && !isNaN(input.latitude) ? input.latitude : null
  const longitude = typeof input.longitude === "number" && !isNaN(input.longitude) ? input.longitude : null

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false as const, error: "Email inválido." }
  if (!fullName || !phone || !city || !neighborhood) return { success: false as const, error: "Preencha nome, telefone, cidade e bairro." }
  if (!(["moto", "carro"] as string[]).includes(input.vehicleType)) return { success: false as const, error: "Veículo inválido." }

  const admin = getAdminClient()

  const { data: pending } = await admin
    .from("delivery_driver_invitations")
    .select("id")
    .eq("email", email)
    .is("used_at", null)
    .is("revoked_at", null)
    .maybeSingle()
  if (pending) return { success: false as const, error: "Já existe um convite pendente para este email." }

  const token = randomBytes(32).toString("hex")
  const tokenHash = createHash("sha256").update(token).digest("hex")
  const { data: invitation, error } = await admin.from("delivery_driver_invitations").insert({
    email,
    token_hash: tokenHash,
    full_name: fullName,
    phone,
    city,
    neighborhood,
    vehicle_type: input.vehicleType,
    notes,
    zip_code: zipCode,
    street,
    number,
    complement,
    state,
    latitude,
    longitude,
    created_by: adminUser.userId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).select("id").single()
  if (error || !invitation) return { success: false as const, error: "Não foi possível criar o convite." }

  const url = inviteUrl(token)
  const templateId = SMTP2GO_TEMPLATE_IDS.deliveryDriverInvitation || undefined
  const emailRequest: InternalEmailRequest = {
    to: [{ email, name: fullName }],
    subject: "Convite para o Portal do Entregador Dudit",
    template_id: templateId,
    variables: templateId ? {
      full_name: fullName,
      invite_url: url,
      expiration_days: "7",
    } : undefined,
    html: templateId ? undefined : `<p>Olá, ${escapeHtml(fullName)}.</p><p>Você foi convidado para o Portal do Entregador Dudit.</p><p><a href="${escapeHtml(url)}">Criar minha conta</a></p><p>Este convite expira em 7 dias e só pode ser aceito com este email.</p>`,
    text: `Olá, ${fullName}. Acesse ${url} para criar sua conta no Portal do Entregador Dudit. O convite expira em 7 dias.`,
    userId: adminUser.userId,
  }
  const emailResult = await SMTP2GOService.sendEmail(emailRequest)
  await adminAuditLog({
    adminUserId: adminUser.userId,
    actionType: AdminActionType.DELIVERY_DRIVER_INVITE_CREATE,
    targetType: "system",
    targetId: invitation.id,
    metadata: { emailDomain: email.split("@")[1], emailSent: emailResult.success },
  })
  revalidatePath("/ddt-admin/entregadores")
  return { success: true as const, emailSent: emailResult.success }
}

export async function updateDeliveryDriverAdminAction(input: {
  driverId: string
  city: string
  neighborhood: string
  vehicleType: DeliveryDriverVehicle
  isActive: boolean
  notes?: string
  zipCode?: string
  street?: string
  number?: string
  complement?: string
  state?: string
  latitude?: number | null
  longitude?: number | null
}) {
  const adminUser = await requireAdminScope("user_enforcement", "admin")
  const city = clean(input.city, 100)
  const neighborhood = clean(input.neighborhood, 100)
  const zipCode = clean(input.zipCode, 20) || null
  const street = clean(input.street, 255) || null
  const number = clean(input.number, 50) || null
  const complement = clean(input.complement, 100) || null
  const state = clean(input.state, 10) || null
  const latitude = typeof input.latitude === "number" && !isNaN(input.latitude) ? input.latitude : null
  const longitude = typeof input.longitude === "number" && !isNaN(input.longitude) ? input.longitude : null

  if (!input.driverId || !city || !neighborhood || !(["moto", "carro"] as string[]).includes(input.vehicleType)) {
    return { success: false as const, error: "Dados do entregador inválidos." }
  }
  const admin = getAdminClient()
  const patch: Record<string, unknown> = {
    city,
    neighborhood,
    vehicle_type: input.vehicleType,
    is_active: !!input.isActive,
    notes: clean(input.notes, 500) || null,
    zip_code: zipCode,
    street,
    number,
    complement,
    state,
    latitude,
    longitude,
    updated_at: new Date().toISOString(),
  }
  if (!input.isActive) patch.availability_status = "offline"
  const { error } = await admin.from("delivery_drivers").update(patch).eq("user_id", input.driverId)
  if (error) return { success: false as const, error: "Não foi possível atualizar o entregador." }
  await adminAuditLog({
    adminUserId: adminUser.userId,
    actionType: input.isActive ? AdminActionType.DELIVERY_DRIVER_UPDATE : AdminActionType.DELIVERY_DRIVER_DEACTIVATE,
    targetType: "user",
    targetId: input.driverId,
    metadata: { city, neighborhood, vehicleType: input.vehicleType, isActive: !!input.isActive },
  })
  revalidatePath("/ddt-admin/entregadores")
  return { success: true as const }
}

export async function getDeliveryDriverStatsAdminAction() {
  await requireAdminScope("user_enforcement", "admin")
  const admin = getAdminClient()
  const [totalRes, activeRes, inactiveRes, availableRes, offlineRes, invitesRes] = await Promise.all([
    admin.from("delivery_drivers").select("user_id", { count: "exact", head: true }),
    admin.from("delivery_drivers").select("user_id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("delivery_drivers").select("user_id", { count: "exact", head: true }).eq("is_active", false),
    admin.from("delivery_drivers").select("user_id", { count: "exact", head: true }).eq("is_active", true).eq("availability_status", "available"),
    admin.from("delivery_drivers").select("user_id", { count: "exact", head: true }).or("is_active.eq.false,availability_status.eq.offline"),
    admin.from("delivery_driver_invitations").select("id", { count: "exact", head: true }).is("used_at", null).is("revoked_at", null),
  ])
  return {
    total: totalRes.count || 0,
    active: activeRes.count || 0,
    inactive: inactiveRes.count || 0,
    available: availableRes.count || 0,
    offline: offlineRes.count || 0,
    pendingInvites: invitesRes.count || 0,
  }
}

export async function listDeliveryDriverInvitationsAdminAction(params?: { limit?: number }) {
  await requireAdminScope("user_enforcement", "admin")
  const admin = getAdminClient()
  const limit = Math.min(Math.max(Number(params?.limit || 50), 1), 100)

  const { data, error } = await admin
    .from("delivery_driver_invitations")
    .select("id, email, full_name, phone, city, neighborhood, vehicle_type, notes, created_at, expires_at, used_at, revoked_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return { success: false as const, error: "Não foi possível carregar os convites." }
  }

  return {
    success: true as const,
    items: Array.isArray(data) ? data : [],
  }
}

export async function revokeDeliveryDriverInvitationAdminAction(invitationId: string) {
  const adminUser = await requireAdminScope("user_enforcement", "admin")
  const admin = getAdminClient()

  const { error } = await admin
    .from("delivery_driver_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)

  if (error) {
    return { success: false as const, error: "Não foi possível revogar o convite." }
  }

  await adminAuditLog({
    adminUserId: adminUser.userId,
    actionType: AdminActionType.DELIVERY_DRIVER_INVITE_REVOKE,
    targetType: "system",
    targetId: invitationId,
    metadata: { invitationId },
  })

  revalidatePath("/ddt-admin/entregadores")
  return { success: true as const }
}

export async function resendDeliveryDriverInvitationAdminAction(invitationId: string) {
  const adminUser = await requireAdminScope("user_enforcement", "admin")
  const admin = getAdminClient()

  const { data: inv, error } = await admin
    .from("delivery_driver_invitations")
    .select("id, email, full_name, phone, city, neighborhood, vehicle_type, notes")
    .eq("id", invitationId)
    .maybeSingle()

  if (error || !inv) {
    return { success: false as const, error: "Convite não encontrado." }
  }

  const token = randomBytes(32).toString("hex")
  const tokenHash = createHash("sha256").update(token).digest("hex")

  await admin
    .from("delivery_driver_invitations")
    .update({
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      revoked_at: null,
      used_at: null,
    })
    .eq("id", invitationId)

  const url = inviteUrl(token)
  const templateId = SMTP2GO_TEMPLATE_IDS.deliveryDriverInvitation || undefined
  const emailRequest: InternalEmailRequest = {
    to: [{ email: inv.email, name: inv.full_name }],
    subject: "Convite para o Portal do Entregador Dudit",
    template_id: templateId,
    variables: templateId ? {
      full_name: inv.full_name,
      invite_url: url,
      expiration_days: "7",
    } : undefined,
    html: templateId ? undefined : `<p>Olá, ${escapeHtml(inv.full_name)}.</p><p>Você foi convidado para o Portal do Entregador Dudit.</p><p><a href="${escapeHtml(url)}">Criar minha conta</a></p><p>Este convite expira em 7 dias e só pode ser aceito com este email.</p>`,
    text: `Olá, ${inv.full_name}. Acesse ${url} para criar sua conta no Portal do Entregador Dudit. O convite expira em 7 dias.`,
    userId: adminUser.userId,
  }

  const emailResult = await SMTP2GOService.sendEmail(emailRequest)
  await adminAuditLog({
    adminUserId: adminUser.userId,
    actionType: AdminActionType.DELIVERY_DRIVER_INVITE_RESEND,
    targetType: "system",
    targetId: invitationId,
    metadata: { invitationId, email: inv.email, emailSent: emailResult.success },
  })
  return { success: true as const, emailSent: emailResult.success, inviteUrl: url }
}
