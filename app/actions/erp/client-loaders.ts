"use server"

import { getPartnerOrdersCached } from "@/lib/data/orders"
import { checkPartnerPermission, getCurrentUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerSuppliersCached } from "@/lib/data/suppliers"

export async function fetchERPOrdersClient() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "orders", "view")
  if (!allowed) throw new Error("Forbidden")

  return getPartnerOrdersCached(partnerId)
}

import { getERPProductsPageData } from "@/app/actions/erp/products"
import { fetchCustomersWithStorePriority } from "@/lib/store-queries"

export async function fetchERPProductsClient() {
  const data = await getERPProductsPageData()
  if (!data || !data.products) throw new Error("Forbidden or no data")
  return data.products
}

export async function fetchERPCustomersClient(storeId: string | null = null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "customers", "view")
  if (!allowed) throw new Error("Forbidden")

  return fetchCustomersWithStorePriority(partnerId, storeId)
}

export async function fetchERPSuppliersClient() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  const context = await getCurrentPartnerContext()
  if (!context) throw new Error("No context")
  const partnerId = context.partnerId
  const { allowed } = await checkPartnerPermission(partnerId, "suppliers", "view")
  if (!allowed) throw new Error("Forbidden")

  return getPartnerSuppliersCached(partnerId)
}
