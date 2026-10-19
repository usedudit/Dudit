import "server-only"

import { ForbiddenError } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"
import type { PermissionTemplate } from "@/lib/permissions/rbac-types"
import type { ErpExportModule } from "./types"

const MODULE_RESOURCE: Record<ErpExportModule, keyof PermissionTemplate> = {
  orders: "orders",
  sales: "orders",
  products: "products",
  customers: "customers",
  services: "services",
  appointments: "appointments",
  subscriptions: "recurring_subscriptions",
  returns: "orders",
  "stock-movements": "products",
  transactions: "orders",
  suppliers: "products",
  "service-orders": "services",
  "cash-register": "orders",
  "xml-import": "products",
  quotes: "quotes",
  coupons: "coupons",
  deliveries: "delivery",
  reviews: "products",
}

export async function requireErpExportPermission(partnerId: string, module: ErpExportModule) {
  const resource = MODULE_RESOURCE[module]
  const access = await requirePermission(partnerId, resource as any, "view")
  if (!can(access as RbacUserLike, "orders.can_refund")) {
    throw new ForbiddenError("Exportação disponível apenas para Proprietário, Administrador ou Gestor.")
  }
  return access
}
