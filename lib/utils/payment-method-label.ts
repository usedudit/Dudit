/**
 * Rótulo único para meio de pagamento (evita "Dinheiro" vs "dinheiro", "PIX (pix)", etc.).
 */
export function formatPaymentMethodLabel(
  name: string | null | undefined,
  paymentType: string | null | undefined,
): string {
  const rawName = (name || "").trim()
  const rawType = (paymentType || "").trim()

  const titleWords = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
      .filter(Boolean)
      .join(" ")

  if (!rawName && !rawType) return ""
  const tn = titleWords(rawType)
  const nn = titleWords(rawName)
  if (!rawType) return nn
  if (!rawName) return tn
  if (rawName.toLowerCase() === rawType.toLowerCase()) return tn

  const paren = rawName.match(/^(.*)\(([^)]+)\)\s*$/)
  if (paren) {
    const outer = paren[1].trim()
    const inner = paren[2].trim()
    if (inner.toLowerCase() === rawType.toLowerCase()) {
      const o = titleWords(outer)
      if (o.toLowerCase() === rawType.toLowerCase() || outer.toLowerCase() === inner.toLowerCase()) return tn
      return o || tn
    }
  }

  if (nn.toLowerCase() === rawType.toLowerCase()) return nn
  return `${nn} (${tn})`
}
