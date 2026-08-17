"use server"

import { randomBytes, createHash } from "node:crypto"
import { revalidatePath } from "next/cache"

import { requireAdmin } from "@/lib/auth/admin-authorization"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { getAdminClient } from "@/lib/supabase/admin"
import { UnosendService } from "@/lib/services/unosend.service"
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
  await requireAdmin("admin")
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

export async function createDeliveryDriverInvitationAdminAction(input: {
  email: string
  fullName: string
  phone: string
  city: string
  neighborhood: string
  vehicleType: DeliveryDriverVehicle
  notes?: string
}) {
  const adminUser = await requireAdmin("admin")
  const email = clean(input.email, 254).toLowerCase()
  const fullName = clean(input.fullName)
  const phone = clean(input.phone, 40)
  const city = clean(input.city, 100)
  const neighborhood = clean(input.neighborhood, 100)
  const notes = clean(input.notes, 500) || null
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
    created_by: adminUser.userId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }).select("id").single()
  if (error || !invitation) return { success: false as const, error: "Não foi possível criar o convite." }

  const url = inviteUrl(token)
  const emailRequest: InternalEmailRequest = {
    to: [{ email, name: fullName }],
    subject: "Convite para o Portal do Entregador Dudit",
    html: `<p>Olá, ${escapeHtml(fullName)}.</p><p>Você foi convidado para o Portal do Entregador Dudit.</p><p><a href="${escapeHtml(url)}">Criar minha conta</a></p><p>Este convite expira em 7 dias e só pode ser aceito com este email.</p>`,
    text: `Olá, ${fullName}. Acesse ${url} para criar sua conta no Portal do Entregador Dudit. O convite expira em 7 dias.`,
    userId: adminUser.userId,
  }
  const emailResult = await UnosendService.sendEmail(emailRequest)
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
}) {
  const adminUser = await requireAdmin("admin")
  const city = clean(input.city, 100)
  const neighborhood = clean(input.neighborhood, 100)
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
