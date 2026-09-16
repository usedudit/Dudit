/**
 * Rótulo único para meio de pagamento (evita "Dinheiro" vs "dinheiro", "PIX (pix)", etc.).
 */

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export function formatPaymentMethodLabel(
  name: string | null | undefined,
  paymentType: string | null | undefined,
): string {
  let rawName = (name || "").trim()
  let rawType = (paymentType || "").trim()

  if (!rawName && !rawType) return ""

  const normName = rawName.toLowerCase();
  const normType = rawType.toLowerCase();

  if (normName === "exchange" || normName === "store_credit" || normName === "store-credit" || normName.includes("vale-compra") || normName.includes("vale_compra")) {
    rawName = normName === "exchange" ? "Crédito de troca" : "Vale-compra";
  }
  if (normType === "exchange" || normType === "store_credit" || normType === "store-credit" || normType.includes("vale-compra") || normType.includes("vale_compra")) {
    rawType = normType === "exchange" ? "exchange" : "store_credit";
  }

  // Helper to normalize and translate the payment type to a friendly Portuguese label
  const getFriendlyTypeLabel = (typeOrName: string): string => {
    const norm = typeOrName.toLowerCase().trim()
    if (norm === "exchange") return "Crédito de troca"
    if (norm === "store_credit" || norm === "store-credit" || norm.includes("vale-compra") || norm.includes("vale_compra")) return "Vale-compra"
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

  // Extract the real descriptive name, resolving any previous formatting/parentheses
  let displayName = rawName || rawType

  // Separate a trailing installment suffix (" - 2x") so it doesn't break parenthesis parsing below
  let installmentSuffix = ""
  const suffixMatch = displayName.match(/(.*?)\s+-\s*(\d+)x\s*$/i)
  if (suffixMatch) {
    displayName = suffixMatch[1].trimEnd()
    installmentSuffix = ` - ${suffixMatch[2]}x`
  }

  // Get the friendly type label
  const typeLabel = getFriendlyTypeLabel(displayName)

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
      "boleto", "boleto bancário", "boleto bancario",
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

  const nameLower = finalName.toLowerCase()
  const typeLower = finalType.toLowerCase()
  const nameNorm = stripAccents(nameLower)
  const typeNorm = stripAccents(typeLower)

  const isSameConcept = 
    nameLower === typeLower ||
    nameNorm === typeNorm ||
    (typeLower === "dinheiro" && (nameLower === "cash" || nameLower === "money" || nameLower === "dinheiro" || nameLower === "espécie" || nameLower === "espece" || nameLower === "carteira")) ||
    (typeLower === "pix" && nameLower === "pix") ||
    (typeLower === "cartão de crédito" && (nameLower === "cartão de crédito" || nameLower === "cartao de credito" || nameLower === "cartão de credito" || nameLower === "cartao de crédito" || nameLower === "credito" || nameLower === "crédito" || nameLower === "credit" || nameLower === "credit_card" || nameLower === "creditcard" || nameLower === "cartão" || nameLower === "cartao" || nameLower === "card")) ||
    (typeLower === "cartão de débito" && (nameLower === "cartão de débito" || nameLower === "cartao de debito" || nameLower === "cartão de debito" || nameLower === "cartao de débito" || nameLower === "debito" || nameLower === "débito" || nameLower === "debit" || nameLower === "debit_card" || nameLower === "debitcard" || nameLower === "cartão" || nameLower === "cartao" || nameLower === "card")) ||
    (typeLower === "cartão" && (nameLower === "cartão" || nameLower === "cartao" || nameLower === "card" || nameLower.includes("credito") || nameLower.includes("crédito") || nameLower.includes("debito") || nameLower.includes("débito"))) ||
    (typeLower === "transferência" && (nameLower === "transferência" || nameLower === "transferencia" || nameLower === "transferência bancária" || nameLower === "transferencia bancaria" || nameLower === "bank_transfer" || nameLower === "ted" || nameLower === "doc")) ||
    (typeLower === "outros" && (nameLower === "outros" || nameLower === "outro" || nameLower === "other")) ||
    (typeLower === "boleto" && (nameLower === "boleto" || nameLower === "boleto bancário" || nameLower === "boleto bancario"))

  // Se o tipo for apenas "Cartão" e o nome for "Cartão de Crédito", use "Cartão de Crédito"
  let resolvedLabel = finalType
  if (typeLower === "cartão" && (nameLower.includes("crédito") || nameLower.includes("credito"))) {
    resolvedLabel = "Cartão de Crédito"
  } else if (typeLower === "cartão" && (nameLower.includes("débito") || nameLower.includes("debito"))) {
    resolvedLabel = "Cartão de Débito"
  }

  const base = isSameConcept ? resolvedLabel : `${resolvedLabel} (${finalName})`
  return installmentSuffix ? `${base}${installmentSuffix}` : base
}
