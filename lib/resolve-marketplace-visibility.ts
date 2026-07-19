import "server-only"
import { createAdminClient } from "@/lib/supabase/server"

type VisibilityInfo = {
  hasAnyStoreLink: boolean
  hasMarketplaceVisibleAll: boolean
  hasExclusiveOrSelected: boolean
}

/**
 * Filtra products/services aptos para exibição no marketplace global (discovery/search).
 *
 * Regras:
 * - Sem store_products → legacy global → VISÍVEL (backward compat)
 * - Com ao menos 1 store_products com marketplace_visible=true E visibility_scope='all' → VISÍVEL
 * - Apenas store_products com 'exclusive'/'selected' → INVISÍVEL (restrito a lojas específicas)
 * - marketplace_visible=false em todas → INVISÍVEL
 */
export async function filterMarketplaceVisibleProducts(
  productIds: string[]
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()

  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from("store_products")
    .select("product_id, marketplace_visible, visibility_scope")
    .in("product_id", productIds)

  if (!links || links.length === 0) {
    return new Set(productIds)
  }

  const visibilityMap = new Map<string, VisibilityInfo>()
  for (const link of links) {
    if (!visibilityMap.has(link.product_id)) {
      visibilityMap.set(link.product_id, {
        hasAnyStoreLink: false,
        hasMarketplaceVisibleAll: false,
        hasExclusiveOrSelected: false,
      })
    }
    const v = visibilityMap.get(link.product_id)!
    v.hasAnyStoreLink = true
    if (link.marketplace_visible === true && link.visibility_scope === 'all') {
      v.hasMarketplaceVisibleAll = true
    }
    if (link.visibility_scope === 'exclusive' || link.visibility_scope === 'selected') {
      v.hasExclusiveOrSelected = true
    }
  }

  const visible = new Set<string>()
  for (const pid of productIds) {
    const v = visibilityMap.get(pid)
    if (!v || !v.hasAnyStoreLink) {
      visible.add(pid)
    } else if (v.hasMarketplaceVisibleAll) {
      visible.add(pid)
    }
  }

  return visible
}

/**
 * Filtra services aptos para exibição no marketplace global.
 * Mesma lógica de filterMarketplaceVisibleProducts.
 */
export async function filterMarketplaceVisibleServices(
  serviceIds: string[]
): Promise<Set<string>> {
  if (serviceIds.length === 0) return new Set()

  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from("store_services")
    .select("service_id, marketplace_visible, visibility_scope")
    .in("service_id", serviceIds)

  if (!links || links.length === 0) {
    return new Set(serviceIds)
  }

  const visibilityMap = new Map<string, VisibilityInfo>()
  for (const link of links) {
    if (!visibilityMap.has(link.service_id)) {
      visibilityMap.set(link.service_id, {
        hasAnyStoreLink: false,
        hasMarketplaceVisibleAll: false,
        hasExclusiveOrSelected: false,
      })
    }
    const v = visibilityMap.get(link.service_id)!
    v.hasAnyStoreLink = true
    if (link.marketplace_visible === true && link.visibility_scope === 'all') {
      v.hasMarketplaceVisibleAll = true
    }
    if (link.visibility_scope === 'exclusive' || link.visibility_scope === 'selected') {
      v.hasExclusiveOrSelected = true
    }
  }

  const visible = new Set<string>()
  for (const sid of serviceIds) {
    const v = visibilityMap.get(sid)
    if (!v || !v.hasAnyStoreLink) {
      visible.add(sid)
    } else if (v.hasMarketplaceVisibleAll) {
      visible.add(sid)
    }
  }

  return visible
}

/**
 * Resolve visibilidade de produtos para uma store específica.
 * Usado em store pages e PDP com store context.
 * Retorna apenas os productIds que a store pode ver.
 */
export async function resolveProductsForStore(
  productIds: string[],
  storeId: string
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()

  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from("store_products")
    .select("product_id, store_id, visibility_scope")
    .in("product_id", productIds)

  if (!links || links.length === 0) {
    return new Set(productIds)
  }

  const productLinks = new Map<string, { hasAll: boolean; storeHasBridge: boolean }>()
  for (const link of links) {
    if (!productLinks.has(link.product_id)) {
      productLinks.set(link.product_id, { hasAll: false, storeHasBridge: false })
    }
    const v = productLinks.get(link.product_id)!
    if (link.visibility_scope === 'all') v.hasAll = true
    if (link.store_id === storeId) v.storeHasBridge = true
  }

  const visible = new Set<string>()
  for (const pid of productIds) {
    const v = productLinks.get(pid)
    if (!v) {
      visible.add(pid)
    } else if (v.hasAll || v.storeHasBridge) {
      visible.add(pid)
    }
  }

  return visible
}

/**
 * Resolve visibilidade de serviços para uma store específica.
 */
export async function resolveServicesForStore(
  serviceIds: string[],
  storeId: string
): Promise<Set<string>> {
  if (serviceIds.length === 0) return new Set()

  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from("store_services")
    .select("service_id, store_id, visibility_scope")
    .in("service_id", serviceIds)

  if (!links || links.length === 0) {
    return new Set(serviceIds)
  }

  const serviceLinks = new Map<string, { hasAll: boolean; storeHasBridge: boolean }>()
  for (const link of links) {
    if (!serviceLinks.has(link.service_id)) {
      serviceLinks.set(link.service_id, { hasAll: false, storeHasBridge: false })
    }
    const v = serviceLinks.get(link.service_id)!
    if (link.visibility_scope === 'all') v.hasAll = true
    if (link.store_id === storeId) v.storeHasBridge = true
  }

  const visible = new Set<string>()
  for (const sid of serviceIds) {
    const v = serviceLinks.get(sid)
    if (!v) {
      visible.add(sid)
    } else if (v.hasAll || v.storeHasBridge) {
      visible.add(sid)
    }
  }

  return visible
}

/**
 * Filtra kits (product_kits) aptos para exibição no marketplace global.
 * Mesma lógica de filterMarketplaceVisibleProducts.
 */
export async function filterMarketplaceVisibleKits(
  kitIds: string[]
): Promise<Set<string>> {
  if (kitIds.length === 0) return new Set()

  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from("store_product_kits")
    .select("kit_id, marketplace_visible, visibility_scope")
    .in("kit_id", kitIds)

  if (!links || links.length === 0) {
    return new Set(kitIds)
  }

  const visibilityMap = new Map<string, VisibilityInfo>()
  for (const link of links) {
    if (!visibilityMap.has(link.kit_id)) {
      visibilityMap.set(link.kit_id, {
        hasAnyStoreLink: false,
        hasMarketplaceVisibleAll: false,
        hasExclusiveOrSelected: false,
      })
    }
    const v = visibilityMap.get(link.kit_id)!
    v.hasAnyStoreLink = true
    if (link.marketplace_visible === true && link.visibility_scope === 'all') {
      v.hasMarketplaceVisibleAll = true
    }
    if (link.visibility_scope === 'exclusive' || link.visibility_scope === 'selected') {
      v.hasExclusiveOrSelected = true
    }
  }

  const visible = new Set<string>()
  for (const kid of kitIds) {
    const v = visibilityMap.get(kid)
    if (!v || !v.hasAnyStoreLink) {
      visible.add(kid)
    } else if (v.hasMarketplaceVisibleAll) {
      visible.add(kid)
    }
  }

  return visible
}

/**
 * Filtra fornecedores (suppliers) aptos para exibição no marketplace global.
 * Mesma lógica de filterMarketplaceVisibleProducts.
 */
export async function filterMarketplaceVisibleSuppliers(
  supplierIds: string[]
): Promise<Set<string>> {
  if (supplierIds.length === 0) return new Set()

  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from("store_suppliers")
    .select("supplier_id, marketplace_visible, visibility_scope")
    .in("supplier_id", supplierIds)

  if (!links || links.length === 0) {
    return new Set(supplierIds)
  }

  const visibilityMap = new Map<string, VisibilityInfo>()
  for (const link of links) {
    if (!visibilityMap.has(link.supplier_id)) {
      visibilityMap.set(link.supplier_id, {
        hasAnyStoreLink: false,
        hasMarketplaceVisibleAll: false,
        hasExclusiveOrSelected: false,
      })
    }
    const v = visibilityMap.get(link.supplier_id)!
    v.hasAnyStoreLink = true
    if (link.marketplace_visible === true && link.visibility_scope === 'all') {
      v.hasMarketplaceVisibleAll = true
    }
    if (link.visibility_scope === 'exclusive' || link.visibility_scope === 'selected') {
      v.hasExclusiveOrSelected = true
    }
  }

  const visible = new Set<string>()
  for (const sid of supplierIds) {
    const v = visibilityMap.get(sid)
    if (!v || !v.hasAnyStoreLink) {
      visible.add(sid)
    } else if (v.hasMarketplaceVisibleAll) {
      visible.add(sid)
    }
  }

  return visible
}

/**
 * Resolve visibilidade de kits para uma store específica.
 */
export async function resolveKitsForStore(
  kitIds: string[],
  storeId: string
): Promise<Set<string>> {
  if (kitIds.length === 0) return new Set()

  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from("store_product_kits")
    .select("kit_id, store_id, visibility_scope")
    .in("kit_id", kitIds)

  if (!links || links.length === 0) {
    return new Set(kitIds)
  }

  const kitLinks = new Map<string, { hasAll: boolean; storeHasBridge: boolean }>()
  for (const link of links) {
    if (!kitLinks.has(link.kit_id)) {
      kitLinks.set(link.kit_id, { hasAll: false, storeHasBridge: false })
    }
    const v = kitLinks.get(link.kit_id)!
    if (link.visibility_scope === 'all') v.hasAll = true
    if (link.store_id === storeId) v.storeHasBridge = true
  }

  const visible = new Set<string>()
  for (const kid of kitIds) {
    const v = kitLinks.get(kid)
    if (!v) {
      visible.add(kid)
    } else if (v.hasAll || v.storeHasBridge) {
      visible.add(kid)
    }
  }

  return visible
}

/**
 * Resolve visibilidade de fornecedores para uma store específica.
 */
export async function resolveSuppliersForStore(
  supplierIds: string[],
  storeId: string
): Promise<Set<string>> {
  if (supplierIds.length === 0) return new Set()

  const supabase = createAdminClient()

  const { data: links } = await supabase
    .from("store_suppliers")
    .select("supplier_id, store_id, visibility_scope")
    .in("supplier_id", supplierIds)

  if (!links || links.length === 0) {
    return new Set(supplierIds)
  }

  const supplierLinks = new Map<string, { hasAll: boolean; storeHasBridge: boolean }>()
  for (const link of links) {
    if (!supplierLinks.has(link.supplier_id)) {
      supplierLinks.set(link.supplier_id, { hasAll: false, storeHasBridge: false })
    }
    const v = supplierLinks.get(link.supplier_id)!
    if (link.visibility_scope === 'all') v.hasAll = true
    if (link.store_id === storeId) v.storeHasBridge = true
  }

  const visible = new Set<string>()
  for (const sid of supplierIds) {
    const v = supplierLinks.get(sid)
    if (!v) {
      visible.add(sid)
    } else if (v.hasAll || v.storeHasBridge) {
      visible.add(sid)
    }
  }

  return visible
}
