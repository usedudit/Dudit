/**
 * Rótulo único para meio de pagamento (evita "Dinheiro" vs "dinheiro", "PIX (pix)", etc.).
 */
export function formatPaymentMethodLabel(
  name: string | null | undefined,
  paymentType: string | null | undefined,
): string {
  const rawName = (name || "").trim()
  const rawType = (paymentType || "").trim()

  if (!rawName && !rawType) return ""

  // Helper to normalize and translate the payment type to a friendly Portuguese label
  const getFriendlyTypeLabel = (typeOrName: string): string => {
    const norm = typeOrName.toLowerCase().trim()
    if (norm.includes("pix")) return "Pix"
    if (norm.includes("credito") || norm.includes("crédito") || norm.includes("credit")) return "Cartão de Crédito"
    if (norm.includes("debito") || norm.includes("débito") || norm.includes("debit")) return "Cartão de Débito"
    if (norm.includes("dinheiro") || norm.includes("cash") || norm.includes("money")) return "Dinheiro"
    if (norm.includes("transfer") || norm.includes("ted") || norm.includes("doc")) return "Transferência"
    if (norm.includes("cartao") || norm.includes("cartão") || norm.includes("card")) return "Cartão"
    if (norm.includes("other") || norm.includes("outro")) return "Outros"
    if (norm.includes("método não definido") || norm.includes("pendente")) return "Método não definido"

    // Capitalize type if not recognized
    return typeOrName.charAt(0).toUpperCase() + typeOrName.slice(1)
  }

  // Get the friendly type label
  const typeLabel = getFriendlyTypeLabel(rawType || rawName)

  // Extract the real descriptive name, resolving any previous formatting/parentheses
  let displayName = rawName || rawType

  const match = displayName.match(/^([^(]+)\(([^)]+)\)$/)
  if (match) {
    const part1 = match[1].trim()
    const part2 = match[2].trim()

    const typeLabelLower = typeLabel.toLowerCase()
    const part1Lower = part1.toLowerCase()
    const part2Lower = part2.toLowerCase()

    const standardTypesLower = [
      "dinheiro", "cash", "money",
      "pix",
      "cartão de crédito", "cartao de credito", "credito", "crédito", "credit card", "credit",
      "cartão de débito", "cartao de debito", "debito", "débito", "debit card", "debit",
      "transferência", "transferencia", "transferência bancária", "transferencia bancaria", "bank transfer",
      "cartão", "cartao", "card",
      "outros", "outro", "other"
    ]

    const isType1 = standardTypesLower.includes(part1Lower) || part1Lower === typeLabelLower
    const isType2 = standardTypesLower.includes(part2Lower) || part2Lower === typeLabelLower

    if (isType1 && !isType2) {
      displayName = part2
    } else if (isType2 && !isType1) {
      displayName = part1
    } else {
      // If both or neither match, pick the longer one as it is more descriptive, e.g. "Pix 2% Desconto" vs "Pix"
      displayName = part1.length > part2.length ? part1 : part2
    }
  }

  // Capitalize name words nicely
  const titleWords = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
      .filter(Boolean)
      .join(" ")

  const finalName = titleWords(displayName)
  const finalType = titleWords(typeLabel)

  return finalName.toLowerCase() === finalType.toLowerCase() ? finalType : `${finalType} (${finalName})`
}
