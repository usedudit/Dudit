import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser, ForbiddenError } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requirePermission } from "@/lib/permissions/access"
import type { User } from "@supabase/supabase-js"
import type { RoleId } from "@/lib/permissions/rbac-types"

type CustomerPermission = "view" | "create" | "edit" | "delete"

export type AuthorizedPartnerContext = {
  user: User
  partnerId: string
  roleId: RoleId
  admin: ReturnType<typeof getAdminClient>
}

export type AuthorizedCustomerContext = AuthorizedPartnerContext

export async function requireActivePartnerContext(
  requestedPartnerId?: string,
): Promise<AuthorizedPartnerContext> {
  const user = await requireUser()
  const context = await getCurrentPartnerContext(user)

  if (!context?.partnerId) {
    throw new ForbiddenError("Parceiro ativo não encontrado")
  }

  if (requestedPartnerId && requestedPartnerId !== context.partnerId) {
    throw new ForbiddenError("O parceiro informado não corresponde ao contexto ativo")
  }

  return {
    user,
    partnerId: context.partnerId,
    roleId: context.roleId,
    admin: getAdminClient(),
  }
}

export async function requireAuthorizedPartnerContext(
  requestedPartnerId: string | undefined,
  resource: string,
  permission: string,
): Promise<AuthorizedPartnerContext> {
  const context = await requireActivePartnerContext(requestedPartnerId)
  const access = await requirePermission(context.partnerId, resource as any, permission as any, context.user)
  return { ...context, partnerId: access.partnerId, roleId: access.roleId }
}

/**
 * Resolves the tenant from the authenticated active-partner context.
 * A partnerId supplied by a browser is only accepted as a consistency check;
 * it is never used as the authorization source or query scope.
 */
export async function requireAuthorizedCustomerContext(
  requestedPartnerId: string | undefined,
  permission: CustomerPermission,
): Promise<AuthorizedCustomerContext> {
  return requireAuthorizedPartnerContext(requestedPartnerId, "customers", permission)
}

/**
 * Loads only the tenant key with the service client after the caller is
 * authenticated. The returned customer is still checked against the active
 * partner context before it can be used by a mutation.
 */
export async function requireAuthorizedCustomerRecord(
  customerId: string,
  permission: CustomerPermission,
): Promise<AuthorizedCustomerContext & { customer: { id: string; partner_id: string } }> {
  const context = await requireAuthorizedCustomerContext(undefined, permission)
  const { data: customer, error } = await context.admin
    .from("customers")
    .select("id, partner_id")
    .eq("id", customerId)
    .maybeSingle()

  if (error || !customer || customer.partner_id !== context.partnerId) {
    throw new ForbiddenError("Cliente não encontrado ou fora do parceiro ativo")
  }

  return { ...context, customer }
}
