import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import type { User } from "@supabase/supabase-js"
import type { PartnerPermissions } from "@/lib/permissions/types"
import type { RoleId } from "@/lib/permissions/rbac-types"
import { can } from "@/lib/permissions/can"
import { getPermissionTemplate } from "@/lib/permissions/rbac-template-loader"
import { normalizePermissions } from "@/lib/permissions/rbac-normalize"
import { normalizeBusinessInfo } from "@/lib/business-info"

// ─── Auth Errors ────────────────────────────────────────────────────────────

export class AuthError extends Error {
  public readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = "AuthError"
    this.statusCode = statusCode
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = "Não autenticado") {
    super(message, 401)
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = "Acesso negado") {
    super(message, 403)
    this.name = "ForbiddenError"
  }
}

// ─── Core Auth Helpers ──────────────────────────────────────────────────────

import { getCurrentUser } from "@/lib/auth/server-user"
export { getCurrentUser }

/**
 * Strict authentication check - use in ALL state-changing server actions.
 * REDIRECTS to /auth/login if no user session exists.
 * NEVER returns null - guarantees a valid User.
 *
 * Performance: Uses React cache() to deduplicate within the same request.
 */
export async function requireUser(resolvedUser?: User | any): Promise<User> {
  if (resolvedUser && resolvedUser.id) return resolvedUser as User
  const user = await getCurrentUser()
  if (!user) {
    redirect("/auth/login")
  }
  return user
}

/**
 * Alias for requireUser(). Semantically identical.
 * Provided for readability in contexts where "requireAuth" reads better.
 */
export const requireAuth = requireUser

// ─── Partner Lookup ─────────────────────────────────────────────────────────

/**
 * Get the current user's partner record, or null if not a partner.
 * Uses React cache() for deduplication.
 */
export const getCurrentPartner = cache(async (resolvedUser?: User | any): Promise<{ id: string; user_id: string } | null> => {
  const user = resolvedUser || await getCurrentUser()
  if (!user) return null

  const supabase = await getSupabaseServerClient()
  const { data: partner } = await supabase
    .from("partners")
    .select("id, user_id")
    .eq("user_id", user.id)
    .single()

  return partner
})

/**
 * Strict partner lookup - THROWS if user is not authenticated or not a partner.
 * Guarantees a valid partner record belonging to the authenticated user.
 *
 * Performance: Uses cached getCurrentPartner to avoid duplicate queries.
 */
export async function requirePartner(resolvedUser?: User | any): Promise<{ id: string; user_id: string; email: string }> {
  const user = await requireUser(resolvedUser) // Throws if not authenticated
  const partner = await getCurrentPartner(user)

  if (!partner) {
    throw new ForbiddenError("Conta de parceiro não encontrada")
  }

  // Defense-in-depth: verify server-side user_id matches
  if (partner.user_id !== user.id) {
    throw new ForbiddenError("Acesso negado ao parceiro")
  }

  return { ...partner, email: user.email || "" }
}

import { getAllUserPartnerAccess } from "@/lib/auth/partner-context"

/**
 * Check if a user has access to a partner via partner_users OR as the legacy owner.
 * Returns the access record if found, or null if no access.
 * 
 * OPTIMIZED FAST-PATH:
 * - Avoids sequential DB queries by reading from the already-fetched request-cached `getPartnerContextHelper`.
 * - Falls back to the globally cached `getAllUserPartnerAccess` (unstable_cache + admin, keyed by userId).
 */
const checkPartnerAccess = async (
  partnerId: string,
  userId: string
): Promise<{ roleId: RoleId; permissions: any } | null> => {
  // 1. FAST PATH: Check the active partner context in the current request memory.
  try {
    const context = await getPartnerContextHelper({ id: userId });
    if (context && context.partnerId === partnerId) {
      if (context.roleId && context.permissions) {
        return { roleId: context.roleId, permissions: context.permissions };
      }
    }
  } catch (err) {
    // Graceful fail of fast-path; do not block fallback
  }

  // 2. FALLBACK/LAYER 2: Utilize the optimized RPC cached loader to avoid N+1 queries.
  const allAccess = await getAllUserPartnerAccess({ id: userId });
  const match = allAccess.find(a => a.partnerId === partnerId);

  if (match && match.roleId && match.permissions) {
    return { roleId: match.roleId, permissions: match.permissions };
  }

  // 3. AUTHORITATIVE DB FALLBACK
  const admin = getAdminClient()
  const template = await getPermissionTemplate()
  const [invitedAccessRes, ownedPartnerRes] = await Promise.all([
    admin.from("partner_users").select("role_id, roles:roles!inner(permissions)").eq("partner_id", partnerId).eq("user_id", userId).maybeSingle(),
    admin.from("partners").select("user_id").eq("id", partnerId).single()
  ]);

  if (invitedAccessRes.error || ownedPartnerRes.error) {
    // .maybeSingle() suppresses not-found, but .single() throws PGRST116 if empty.
    // We consider anything else as a critical DB error that requires aborting gracefully.
    const isOwnerEmpty = ownedPartnerRes.error?.code === "PGRST116";
    if (invitedAccessRes.error || (!isOwnerEmpty && ownedPartnerRes.error)) {
      console.error("[AUTH FALLBACK ERROR]", {
        userId,
        partnerId,
        invitedError: invitedAccessRes.error,
        ownedError: ownedPartnerRes.error
      });
      return null;
    }
  }

  // Explicitly validate returned truthy data
  if (invitedAccessRes.data && invitedAccessRes.data.role_id) {
    const roleId = String(invitedAccessRes.data.role_id || "delivery").toLowerCase() as RoleId
    const permissions = normalizePermissions(template, (invitedAccessRes.data as any).roles?.permissions)
    return { roleId, permissions }
  }

  if (ownedPartnerRes.data && ownedPartnerRes.data.user_id === userId) {
    return {
      roleId: "owner",
      permissions: normalizePermissions(template, {})
    }
  }

  return null
}

// ─── Soft Ownership Verification (backward-compatible) ──────────────────────
// These return boolean. PREFER the require*() variants in new code.

/**
 * @deprecated Use `requireProductOwnership()` instead. This function returns
 * a boolean which callers may forget to check, leading to security bypasses.
 */
export async function verifyProductOwnership(productId: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false

  const supabase = await getSupabaseServerClient()
  const { data: product } = await supabase
    .from("products")
    .select("partner_id")
    .eq("id", productId)
    .single()

  if (!product) return false

  const access = await checkPartnerAccess(product.partner_id, user.id)
  return !!access
}

/**
 * @deprecated Use `requirePartnerOwnership()` instead.
 */
export async function verifyPartnerOwnership(partnerId: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false

  const supabase = await getSupabaseServerClient()
  const { data: partner } = await supabase
    .from("partners")
    .select("user_id")
    .eq("id", partnerId)
    .single()

  return partner?.user_id === user.id
}

/**
 * @deprecated Use `requireOrderAccess()` instead.
 */
export async function verifyOrderAccess(
  orderId: string,
): Promise<{ canAccess: boolean; role: "buyer" | "seller" | null }> {
  const user = await getCurrentUser()
  if (!user) return { canAccess: false, role: null }

  const supabase = await getSupabaseServerClient()
  const { data: order } = await supabase
    .from("orders")
    .select("buyer_id, partner_id")
    .eq("id", orderId)
    .single()

  if (!order) return { canAccess: false, role: null }

  if (order.buyer_id === user.id) {
    return { canAccess: true, role: "buyer" }
  }

  const access = await checkPartnerAccess(order.partner_id, user.id)
  if (access) {
    return { canAccess: true, role: "seller" }
  }

  return { canAccess: false, role: null }
}

/**
 * @deprecated Use `requireCustomerOwnership()` instead.
 */
export async function verifyCustomerOwnership(customerId: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false

  const supabase = await getSupabaseServerClient()
  const { data: customer } = await supabase
    .from("customers")
    .select("partner_id")
    .eq("id", customerId)
    .single()

  if (!customer) return false

  const access = await checkPartnerAccess(customer.partner_id, user.id)
  return !!access
}

/**
 * @deprecated Use `requireSupplierOwnership()` instead.
 */
export async function verifySupplierOwnership(supplierId: string): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false

  const supabase = await getSupabaseServerClient()
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("partner_id")
    .eq("id", supplierId)
    .single()

  if (!supplier) return false

  const access = await checkPartnerAccess(supplier.partner_id, user.id)
  return !!access
}

// ─── Strict Ownership Enforcement (THROWS on failure) ───────────────────────
// Use these in server actions where failure MUST stop execution.

/**
 * @deprecated Use `requirePartnerAccess()` instead for multi-user support.
 * Requires the authenticated user to own the specified partner.
 * THROWS ForbiddenError if ownership check fails.
 */
export async function requirePartnerOwnership(partnerId: string): Promise<void> {
  const user = await requireUser()

  const access = await checkPartnerAccess(partnerId, user.id)
  if (!access) {
    throw new ForbiddenError("Você não tem acesso a este parceiro")
  }
}

/**
 * Requires the authenticated user to have access to the product (via partner_users).
 * Supports both owners and invited users.
 * THROWS ForbiddenError if access check fails.
 */
export async function requireProductOwnership(productId: string): Promise<void> {
  const user = await requireUser()

  const supabase = await getSupabaseServerClient()
  const { data: product } = await supabase
    .from("products")
    .select("partner_id")
    .eq("id", productId)
    .single()

  if (!product) {
    throw new ForbiddenError("Produto não encontrado")
  }

  const access = await checkPartnerAccess(product.partner_id, user.id)
  if (!access) {
    throw new ForbiddenError("Você não tem acesso a este produto")
  }
}

/**
 * Requires the authenticated user to have access to the customer (via partner_users).
 * Supports both owners and invited users.
 * THROWS ForbiddenError if access check fails.
 */
export async function requireCustomerOwnership(customerId: string): Promise<void> {
  const user = await requireUser()

  const supabase = await getSupabaseServerClient()
  const { data: customer } = await supabase
    .from("customers")
    .select("partner_id")
    .eq("id", customerId)
    .single()

  if (!customer) {
    throw new ForbiddenError("Cliente não encontrado")
  }

  const access = await checkPartnerAccess(customer.partner_id, user.id)
  if (!access) {
    throw new ForbiddenError("Você não tem acesso a este cliente")
  }
}

/**
 * Requires the authenticated user to have access to the supplier (via partner_users).
 * Supports both owners and invited users.
 * THROWS ForbiddenError if access check fails.
 */
export async function requireSupplierOwnership(supplierId: string): Promise<void> {
  const user = await requireUser()

  const supabase = await getSupabaseServerClient()
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("partner_id")
    .eq("id", supplierId)
    .single()

  if (!supplier) {
    throw new ForbiddenError("Fornecedor não encontrado")
  }

  const access = await checkPartnerAccess(supplier.partner_id, user.id)
  if (!access) {
    throw new ForbiddenError("Você não tem acesso a este fornecedor")
  }
}

/**
 * Requires the authenticated user to have access to the quote (via partner_users).
 * Supports both owners and invited users.
 * THROWS ForbiddenError if access check fails.
 */
export async function requireQuoteOwnership(quoteId: string): Promise<void> {
  const user = await requireUser()

  const supabase = await getSupabaseServerClient()
  const { data: quote } = await supabase
    .from("quotes")
    .select("partner_id")
    .eq("id", quoteId)
    .single()

  if (!quote) {
    throw new ForbiddenError("Orçamento não encontrado")
  }

  const access = await checkPartnerAccess(quote.partner_id, user.id)
  if (!access) {
    throw new ForbiddenError("Você não tem acesso a este orçamento")
  }
}

/**
 * Requires the authenticated user to have buyer or seller access to the order.
 * THROWS ForbiddenError if neither role applies.
 * Returns the user's role for downstream logic.
 */
export async function requireOrderAccess(
  orderId: string,
): Promise<{ role: "buyer" | "seller" }> {
  const user = await requireUser()

  const supabase = await getSupabaseServerClient()
  const { data: order } = await supabase
    .from("orders")
    .select("buyer_id, partner_id")
    .eq("id", orderId)
    .single()

  if (!order) {
    throw new ForbiddenError("Pedido não encontrado")
  }

  if (order.buyer_id === user.id) {
    return { role: "buyer" }
  }

  const access = await checkPartnerAccess(order.partner_id, user.id)
  if (access) {
    return { role: "seller" }
  }

  throw new ForbiddenError("Você não tem acesso a este pedido")
}

// ─── Partner Access via partner_users (multi-user) ──────────────────────────

import { getCurrentPartnerContext as getPartnerContextHelper } from "@/lib/auth/partner-context"

/**
 * Get the current user's partner access record, or null.
 * Checks partner_users table (supports invited users, not just owners).
 * Respects the active_partner_id cookie for multi-ERP context.
 * Uses React cache() for deduplication within the same request.
 */
export const getCurrentPartnerAccess = cache(async (): Promise<{
  partnerId: string
  userId: string
  roleId: RoleId
  permissions: any
} | null> => {
  const context = await getPartnerContextHelper()
  if (!context) return null
  return { ...context, roleId: context.roleId as RoleId }
})

/**
 * Requires the authenticated user to have access to a specific partner.
 * Checks against both owned and invited stores via partner_users. THROWS if no access.
 * Optionally checks granular permissions for a specific resource and action.
 */
export async function requirePartnerAccessWithPermission(
  partnerId: string,
  resource?: keyof PartnerPermissions,
  action?: string,
  resolvedUser?: User | any
): Promise<{
  partnerId: string
  userId: string
  roleId: RoleId
  permissions: any
}> {
  const user = await requireUser(resolvedUser)

  const access = await checkPartnerAccess(partnerId, user.id)
  if (!access) {
    throw new ForbiddenError("Você não tem acesso a este ERP")
  }

  const permissions = access.permissions
  const roleId = access.roleId

  // Canonical RBAC enforcement: resource.action => permissions[resource][action] === true
  if (resource && action) {
    const permissionKey = `${String(resource)}.${String(action)}`
    if (!can({ role_id: roleId, permissions }, permissionKey)) {
      throw new ForbiddenError("Sem permissão para esta ação")
    }
  }

  return {
    partnerId,
    userId: user.id,
    roleId,
    permissions,
  }
}

/**
 * Checks if the partner has a specific business capability based on their business_info.
 * Returns boolean indicating whether they possess the required capability.
 */
export const hasBusinessCapability = cache(async (
  partnerId: string,
  capability: "products" | "services"
): Promise<boolean> => {
  // Try to get business_info from cached partner context first (avoids extra DB query)
  const { getCurrentPartnerContext: getCtx } = await import("@/lib/auth/partner-context")
  const ctx = await getCtx()
  let info: any = null

  if (ctx && ctx.partnerId === partnerId && ctx.businessInfo) {
    info = ctx.businessInfo
  } else {
    const admin = getAdminClient()
    const { data: partner } = await admin.from("partners").select("business_info").eq("id", partnerId).single()
    info = normalizeBusinessInfo(partner?.business_info)
  }

  const sells = normalizeBusinessInfo(info).sells || []

  if (capability === "products" && !sells.includes("products")) return false
  if (capability === "services" && !sells.includes("services")) return false

  return true
})

/**
 * Non-throwing permission check for page-level inline access control.
 * Returns { allowed: true/false } instead of throwing.
 * Use this when you want to render an inline "Access Denied" wrapper
 * rather than redirecting or triggering an error boundary.
 */
export async function checkPartnerPermission(
  partnerId: string,
  resource: keyof PartnerPermissions,
  action: string
): Promise<{ allowed: boolean }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { allowed: false }

    const access = await checkPartnerAccess(partnerId, user.id)
    if (!access) return { allowed: false }

    const permissionKey = `${String(resource)}.${String(action)}`
    return { allowed: can({ role_id: access.roleId, permissions: access.permissions }, permissionKey) }
  } catch {
    return { allowed: false }
  }
}

/**
 * Requires the authenticated user to have access to a specific partner.
 * Checks against both owned and invited stores. THROWS if no access.
 * Uses React cache() for deduplication.
 */
export const requirePartnerAccess = cache(async (partnerId: string, resolvedUser?: User | any): Promise<{
  partnerId: string
  userId: string
  roleId: RoleId
  permissions: any
}> => {
  return requirePartnerAccessWithPermission(partnerId, undefined, undefined, resolvedUser)
})

/**
 * Route-aware authorization sourced from DB RBAC permissions.
 *
 * NOTE: This maps ERP routes to canonical RBAC permission keys (module.view)
 * and (optionally) a small set of supported specificPermission -> permission keys.
 */
export async function requirePartnerRouteAccess(
  partnerId: string,
  routeKey: import("@/lib/permissions/types").RouteKey,
  options?: { specificPermission?: string; resolvedUser?: User | any }
): Promise<{
  partnerId: string
  userId: string
  roleId: RoleId
  permissions: any
}> {
  const access = await requirePartnerAccessWithPermission(partnerId, undefined, undefined, options?.resolvedUser)

  const routePermissionKey = routeKeyToPermissionKey(routeKey)
  if (!routePermissionKey || !can({ role_id: access.roleId, permissions: access.permissions }, routePermissionKey)) {
    throw new ForbiddenError("Sem permissão para acessar este módulo")
  }

  if (options?.specificPermission) {
    const specificKey = specificPermissionToPermissionKey(options.specificPermission)
    if (!specificKey || !can({ role_id: access.roleId, permissions: access.permissions }, specificKey)) {
      throw new ForbiddenError("Sem permissão para esta ação")
    }
  }

  return {
    partnerId: access.partnerId,
    userId: access.userId,
    roleId: access.roleId,
    permissions: access.permissions,
  }
}

function routeKeyToPermissionKey(routeKey: string): string | null {
  switch (routeKey) {
    case "dashboard": return "dashboard.view"
    case "orders": return "orders.view"
    case "returns": return "orders.view"
    case "quotes": return "quotes.view"
    case "appointments": return "appointments.view"
    case "customers": return "customers.view"
    case "products": return "products.view"
    case "stock_movements": return "stock_movements.view"
    case "pos": return "pdv.view"
    case "financial_transactions": return "financial.view"
    case "settings": return "settings.view"
    case "settings_business": return "settings.settings_negocio"
    case "settings_team": return "settings.settings_team"
    case "settings_subscription": return "settings.settings_plan"
    case "settings_integrations": return "settings.settings_integrations"
    case "logistics": return "delivery.view"
    case "goals": return "goals.view"
    case "marketing_coupons": return "coupons.view"
    case "cadastros_produtos": return "categories.view"
    case "cadastros_financeiro": return "financial.view"
    case "services": return "services.view"
    case "store_customize": return "settings.settings_vitrine"
    default: return null
  }
}

function specificPermissionToPermissionKey(specificPermission: string): string | null {
  switch (specificPermission) {
    case "can_cancel_order": return "orders.cancel"
    case "can_assign_delivery": return "orders.can_add_delivery"
    case "can_discount": return "pdv.can_apply_discount"
    case "can_add_delivery": return "pdv.can_add_delivery"
    default: return null
  }
}

import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan, type PlanTierSlug } from "@/lib/subscription/plan-tier"

/**
 * Requires the partner to have a specific minimum plan.
 * THROWS ForbiddenError if they are on a lower plan.
 */
export async function requireMinimumPlan(partnerId: string, minimumSlug: PlanTierSlug): Promise<void> {
  const plan = await getPartnerPlan(partnerId)
  if (!hasMinimumPlan(plan.slug, minimumSlug)) {
    throw new ForbiddenError(`Esta funcionalidade requer o plano ${minimumSlug === "crescer" ? "Crescer" : "Escalar"}.`)
  }
}
