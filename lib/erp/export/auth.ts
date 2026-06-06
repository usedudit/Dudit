import "server-only"

import { ForbiddenError, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import type { PartnerPermissions } from "@/lib/permissions/types"
import type { ErpExportModule } from "./types"

const EXPORT_ROLES = new Set(["owner", "admin", "manager"])

const MODULE_RESOURCE: Record<ErpExportModule, keyof PartnerPermissions> = {
  orders: "orders",
  sales: "orders",
  products: "products",
  customers: "customers",
  services: "services",
  appointments: "appointments",
  subscriptions: "recurring_subscriptions",
}

export async function requireErpExportPermission(partnerId: string, module: ErpExportModule) {
  const resource = MODULE_RESOURCE[module]
  const access = await requirePartnerAccessWithPermission(partnerId, resource, "view")
  const role = String(access.roleId || "").toLowerCase()
  if (!EXPORT_ROLES.has(role)) {
    throw new ForbiddenError("Exportação disponível apenas para Proprietário, Administrador ou Gestor.")
  }
  return access
}
