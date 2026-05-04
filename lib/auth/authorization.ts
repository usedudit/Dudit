import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import type { User } from "@supabase/supabase-js"
import type { PartnerPermissions, PartnerRole, ResourcePermissions, RouteKey } from "@/lib/permissions/types"
import { canAccessRoute, canPerformAction, hasSpecificPermission, normalizeToRoutePermissions } from "@/lib/permissions/route-permissions"

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
import { mergePartnerPermissions } from "@/lib/permissions/merge-partner-permissions"
import { PERMISSION_PRESETS } from "@/lib/permissions/partner-roles"

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
): Promise<{ role: string; permissions: any } | null> => {
  // 1. FAST PATH: Check the active partner context in the current request memory.
  try {
    const context = await getPartnerContextHelper({ id: userId });
    if (context && context.partnerId === partnerId) {
      if (context.role && context.permissions) {
        return { role: context.role, permissions: context.permissions };
      }
    }
  } catch (err) {
    // Graceful fail of fast-path; do not block fallback
  }

  // 2. FALLBACK/LAYER 2: Utilize the optimized RPC cached loader to avoid N+1 queries.
  const allAccess = await getAllUserPartnerAccess({ id: userId });
  const match = allAccess.find(a => a.partnerId === partnerId);

  if (match && match.role && match.permissions) {
    return { role: match.role, permissions: match.permissions };
  }

  // 3. AUTHORITATIVE DB FALLBACK
  const admin = getAdminClient()
  const [invitedAccessRes, ownedPartnerRes] = await Promise.all([
    admin.from("partner_users").select("role, permissions").eq("partner_id", partnerId).eq("user_id", userId).maybeSingle(),
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
  if (invitedAccessRes.data && invitedAccessRes.data.role) {
    const role = String(invitedAccessRes.data.role) as PartnerRole
    const permissions = mergePartnerPermissions(role, invitedAccessRes.data.permissions)
    return { role: invitedAccessRes.data.role, permissions }
  }

  if (ownedPartnerRes.data && ownedPartnerRes.data.user_id === userId) {
    return {
      role: "OWNER",
      permissions: PERMISSION_PRESETS.OWNER
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
  role: string
  permissions: any
} | null> => {
  const context = await getPartnerContextHelper()
  if (!context) return null
  return { ...context, role: String(context.role) }
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
  role: string
  permissions: PartnerPermissions
}> {
  const user = await requireUser(resolvedUser)

  const access = await checkPartnerAccess(partnerId, user.id)
  if (!access) {
    throw new ForbiddenError("Você não tem acesso a este ERP")
  }

  const permissions = access.permissions as PartnerPermissions
  const role = String(access.role) as PartnerRole

  // Check granular permission if resource and action are specified.
  // IMPORTANT: always normalize DB JSON and evaluate server-side route/action guards.
  if (resource && action) {
    const normalizedRoute = normalizeToRoutePermissions(role, permissions)
    if (!hasPermissionForResourceAction(normalizedRoute, resource, action)) {
      throw new ForbiddenError("Sem permissão para esta ação")
    }
  }

  return {
    partnerId,
    userId: user.id,
    role: String(access.role),
    permissions,
  }
}

/**
 * Checks if the partner has a specific business capability based on their business_info.
 * Returns boolean indicating whether they possess the required capability.
 */
export const hasBusinessCapability = cache(async (
  partnerId: string,
  capability: "products" | "services" | "online" | "pdv"
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
    info = typeof partner?.business_info === "string"
      ? JSON.parse(partner.business_info)
      : (partner?.business_info || { sells: ["products"], channels: ["online"] })
  }

  const sells = info.sells || []
  const channels = info.channels || []

  if (capability === "products" && !sells.includes("products")) return false
  if (capability === "services" && !sells.includes("services")) return false
  if (capability === "online" && !channels.includes("online")) return false
  if (capability === "pdv" && !channels.includes("pdv")) return false

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

    const role = String(access.role) as PartnerRole
    const routePermissions = normalizeToRoutePermissions(role, access.permissions)
    return { allowed: hasPermissionForResourceAction(routePermissions, resource, action) }
  } catch {
    return { allowed: false }
  }
}

function hasPermissionForResourceAction(
  routePermissions: ReturnType<typeof normalizeToRoutePermissions>,
  resource: keyof PartnerPermissions,
  action: string,
): boolean {
  const checks = RESOURCE_ACTION_ROUTE_CHECKS[resource]
  if (!checks) return false
  const checker = checks[action]
  if (!checker) return false
  return checker(routePermissions)
}

type RoutePermissionSet = ReturnType<typeof normalizeToRoutePermissions>

const canRouteAccess = (routeKey: RouteKey) => (perms: RoutePermissionSet) => canAccessRoute(perms, routeKey)
const canRouteAction = (routeKey: RouteKey, action: "create" | "edit" | "delete") => (perms: RoutePermissionSet) => canPerformAction(perms, routeKey, action)
const canRouteSpecific = (routeKey: RouteKey, specificPermission: string) => (perms: RoutePermissionSet) => hasSpecificPermission(perms, routeKey, specificPermission)

const RESOURCE_ACTION_ROUTE_CHECKS: Partial<
  Record<keyof PartnerPermissions, Record<string, (perms: RoutePermissionSet) => boolean>>
> = {
  orders: {
    view: canRouteAccess("orders"),
    create: canRouteAction("orders", "create"),
    edit: canRouteAction("orders", "edit"),
    delete: canRouteAction("orders", "delete"),
    cancel: canRouteSpecific("orders", "can_cancel_order"),
    can_apply_discount: canRouteSpecific("pos", "can_discount"),
    can_add_delivery: canRouteSpecific("orders", "can_assign_delivery"),
  },
  appointments: {
    view: canRouteAccess("appointments"),
    create: canRouteAction("appointments", "create"),
    edit: canRouteAction("appointments", "edit"),
    delete: canRouteAction("appointments", "delete"),
    can_apply_discount: (perms) => canRouteSpecific("pos", "can_discount")(perms) || canRouteSpecific("orders", "can_view_values")(perms),
  },
  customers: {
    view: canRouteAccess("customers"),
    create: canRouteAction("customers", "create"),
    edit: canRouteAction("customers", "edit"),
    delete: canRouteAction("customers", "delete"),
  },
  products: {
    view: canRouteAccess("products"),
    create: canRouteAction("products", "create"),
    edit: canRouteAction("products", "edit"),
    delete: canRouteAction("products", "delete"),
  },
  suppliers: {
    view: canRouteAccess("suppliers"),
    create: canRouteAction("suppliers", "create"),
    edit: canRouteAction("suppliers", "edit"),
    delete: canRouteAction("suppliers", "delete"),
  },
  stock_movements: {
    view: canRouteAccess("stock_movements"),
    create: canRouteAction("stock_movements", "create"),
    undo: canRouteAction("stock_movements", "delete"),
  },
  pdv: {
    view: canRouteAccess("pos"),
    sell: canRouteSpecific("pos", "can_sell"),
    can_apply_discount: canRouteSpecific("pos", "can_discount"),
    can_add_delivery: canRouteSpecific("pos", "can_add_delivery"),
    open_pdv: canRouteSpecific("cash_register", "can_open_cash"),
    close_pdv: canRouteSpecific("cash_register", "can_close_cash"),
    sangria: canRouteSpecific("cash_register", "can_manage_cash"),
    reforco: canRouteSpecific("cash_register", "can_manage_cash"),
  },
  services: {
    view: canRouteAccess("services"),
    create: canRouteAction("services", "create"),
    edit: canRouteAction("services", "edit"),
    delete: canRouteAction("services", "delete"),
  },
  quotes: {
    view: canRouteAccess("quotes"),
    create: canRouteAction("quotes", "create"),
    edit: canRouteAction("quotes", "edit"),
    delete: canRouteAction("quotes", "delete"),
  },
  financial: {
    view: canRouteAccess("financial_transactions"),
    create: canRouteAction("financial_transactions", "create"),
    edit: canRouteAction("financial_transactions", "edit"),
    delete: canRouteAction("financial_transactions", "delete"),
    cancel: canRouteSpecific("financial_transactions", "can_cancel"),
  },
  categories: {
    view: canRouteAccess("cadastros_produtos"),
    create: canRouteAction("cadastros_produtos", "create"),
    edit: canRouteAction("cadastros_produtos", "edit"),
    delete: canRouteAction("cadastros_produtos", "delete"),
  },
  coupons: {
    view: canRouteAccess("marketing_coupons"),
    create: canRouteAction("marketing_coupons", "create"),
    edit: canRouteAction("marketing_coupons", "edit"),
    delete: canRouteAction("marketing_coupons", "delete"),
  },
  goals: {
    view: canRouteAccess("goals"),
    create: canRouteAction("goals", "create"),
    edit: canRouteAction("goals", "edit"),
    delete: canRouteAction("goals", "delete"),
  },
  delivery: {
    view: canRouteAccess("logistics"),
    create: canRouteAction("logistics", "create"),
    edit: canRouteAction("logistics", "edit"),
    update_status: canRouteSpecific("logistics", "can_update_delivery_status"),
  },
  settings: {
    view: canRouteAccess("settings"),
    settings_negocio: canRouteAccess("settings_business"),
    settings_team: canRouteAccess("settings_team"),
    settings_plan: canRouteAccess("settings_subscription"),
    settings_payments: canRouteAccess("settings"),
    settings_comissions: canRouteAccess("settings"),
    settings_returns: canRouteAccess("returns"),
    settings_vitrine: canRouteAccess("store_customize"),
    settings_os: canRouteAccess("appointments"),
    settings_messages: canRouteAccess("settings"),
    settings_delivery: canRouteAccess("logistics"),
    settings_integrations: canRouteAccess("settings_integrations"),
  },
  settings_negocio: {
    edit: canRouteSpecific("settings_business", "can_edit_business_data"),
  },
  settings_team: {
    invite: canRouteSpecific("settings_team", "can_invite"),
    edit: canRouteSpecific("settings_team", "can_manage_team"),
    remove: canRouteSpecific("settings_team", "can_remove_member"),
    revoke_invite: canRouteSpecific("settings_team", "can_revoke_invite"),
  },
  settings_plans: {
    change_plan: canRouteSpecific("settings_subscription", "can_change_subscription"),
  },
  payment_methods: {
    view: () => true,
    create: canRouteAction("settings", "create"),
    edit: canRouteAction("settings", "edit"),
    delete: canRouteAction("settings", "delete"),
  },
  settings_comissions: {
    edit: canRouteAction("settings", "edit"),
  },
}

/**
 * Requires the authenticated user to have access to a specific partner.
 * Checks against both owned and invited stores. THROWS if no access.
 * Uses React cache() for deduplication.
 */
export const requirePartnerAccess = cache(async (partnerId: string, resolvedUser?: User | any): Promise<{
  partnerId: string
  userId: string
  role: string
  permissions: any
}> => {
  return requirePartnerAccessWithPermission(partnerId, undefined, undefined, resolvedUser)
})

/**
 * Route-aware authorization sourced from DB permissions.
 * This is the canonical backend guard for ERP route-level checks.
 */
export async function requirePartnerRouteAccess(
  partnerId: string,
  routeKey: import("@/lib/permissions/types").RouteKey,
  options?: { specificPermission?: string; resolvedUser?: User | any }
): Promise<{
  partnerId: string
  userId: string
  role: PartnerRole
  permissions: PartnerPermissions
}> {
  const access = await requirePartnerAccessWithPermission(partnerId, undefined, undefined, options?.resolvedUser)
  const role = String(access.role) as PartnerRole
  const routePermissions = normalizeToRoutePermissions(role, access.permissions)

  if (!canAccessRoute(routePermissions, routeKey)) {
    throw new ForbiddenError("Sem permissão para acessar este módulo")
  }

  if (options?.specificPermission && !hasSpecificPermission(routePermissions, routeKey, options.specificPermission)) {
    throw new ForbiddenError("Sem permissão para esta ação")
  }

  return {
    partnerId: access.partnerId,
    userId: access.userId,
    role,
    permissions: access.permissions as PartnerPermissions,
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
