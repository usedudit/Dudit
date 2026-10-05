export type DreOrderRevenueBucket = "products" | "recurring"

export function getOrderRevenueBucket(orderSource?: string | null): DreOrderRevenueBucket {
  const normalized = String(orderSource || "").trim().toLowerCase()
  return normalized === "assinatura" ? "recurring" : "products"
}

export function isOrderDerivedTransaction(tx?: { kind?: string | null } | null): boolean {
  return String(tx?.kind || "").trim().length > 0
}
