/**
 * Sanitizes and cleans order notes by removing internal tracking markers
 * and cancellation system lines, returning only genuine user/customer notes.
 */
export function cleanOrderNotes(value?: string | null): string {
  if (!value) return ""
  return String(value)
    .replace(/\n*Pedido cancelado por:[\s\S]*$/i, "")
    .replace(/service_order:[0-9a-f-]+:order/gi, "")
    .replace(/^Pedido criado a partir do orçamento\s+[^\n.]*(\.|\n|$)/gim, "")
    .trim()
}

/**
 * Normalizes order source labels for UI display.
 * E.g., maps legacy 'admin_service_order' to 'Ordem de Serviço'.
 */
export function normalizeOrderSource(source?: string | null): string {
  if (!source) return "Manual"
  const trimmed = source.trim()
  if (trimmed === "admin_service_order") return "Ordem de Serviço"
  if (trimmed === "Direct Sales") return "Manual"
  if (trimmed === "Online Store") return "Loja Online"
  return trimmed
}
