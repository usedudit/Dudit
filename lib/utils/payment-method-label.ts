/**
 * Rótulo único para meio de pagamento (evita "Dinheiro" vs "dinheiro", "PIX (pix)", etc.).
 */

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

const LOWERCASE_WORDS = new Set(["de", "do", "da", "dos", "das", "e", "em", "na", "no"])

function titleWords(s: string): string {
  return s
    .split(/\s+/)
    .map((w, idx) => {
      if (!w) return ""
      const lower = w.toLowerCase()
      if (idx > 0 && LOWERCASE_WORDS.has(lower)) {
        return lower
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .filter(Boolean)
    .join(" ")
}

const STANDARD_TYPES = [
  "dinheiro", "cash", "money",
  "pix",
  "crédito do cliente", "credito do cliente", "crédito de cliente", "credito de cliente", "store_credit", "store-credit",
  "vale-compra", "vale_compra", "crédito de troca", "credito de troca",
  "cartão de crédito", "cartao de credito", "credito", "crédito", "credit card", "credit",
  "cartão de débito", "cartao de debito", "debito", "débito", "debit card", "debit",
  "transferência", "transferencia", "transferência bancária", "transferencia bancaria", "bank transfer",
  "cartão", "cartao", "card",
  "boleto", "boleto bancário", "boleto bancario",
  "outros", "outro", "other"
]

function isKnownType(str: string): boolean {
  const lower = str.toLowerCase()
  const norm = stripAccents(lower)
  if (norm.includes("assinatura") || norm.includes("subscription")) return true
  return STANDARD_TYPES.some(t => t === lower || t === norm) ||
    norm.includes("credito") || norm.includes("debito") || norm.includes("dinheiro") ||
    norm.includes("pix") || norm.includes("boleto") || norm.includes("transfer") ||
    norm.includes("cartao") || norm.includes("card") || norm.includes("money") ||
    norm.includes("cash") || norm.includes("outro") || norm.includes("other")
}

function isSamePaymentConcept(a: string, b: string): boolean {
  const aL = a.toLowerCase()
  const bL = b.toLowerCase()
  const aN = stripAccents(aL)
  const bN = stripAccents(bL)
  if (aL === bL || aN === bN) return true
  // Check if both refer to the same payment concept
  const concepts: [string[], string[]][] = [
    [["assinatura", "subscription", "assinatura (créditos)", "créditos de assinatura", "subscription_credits"], ["assinatura (créditos)"]],
    [["crédito do cliente", "credito do cliente", "crédito de cliente", "credito de cliente", "crédito cliente", "credito cliente", "store_credit", "store-credit", "store credit", "crédito em loja", "credito em loja", "crédito na loja", "credito na loja"], ["crédito do cliente"]],
    [["crédito de troca", "credito de troca", "exchange"], ["crédito de troca"]],
    [["vale-compra", "vale_compra", "vale compra", "voucher"], ["vale-compra"]],
    [["dinheiro", "cash", "money", "espécie", "espece", "carteira"], ["dinheiro"]],
    [["pix"], ["pix"]],
    [["cartão de crédito", "cartao de credito", "credito", "crédito", "credit", "credit_card", "creditcard", "cartão", "cartao", "card"], ["cartão de crédito"]],
    [["cartão de débito", "cartao de debito", "debito", "débito", "debit", "debit_card", "debitcard", "cartão", "cartao", "card"], ["cartão de débito"]],
    [["transferência", "transferencia", "ted", "doc", "bank_transfer"], ["transferência"]],
    [["boleto", "boleto bancário", "boleto bancario"], ["boleto"]],
    [["outros", "outro", "other"], ["outros"]],
  ]
  for (const [variants, canonicals] of concepts) {
    const aMatch = variants.some(v => aN.includes(v) || aL.includes(v))
    const bMatch = variants.some(v => bN.includes(v) || bL.includes(v)) || canonicals.some(c => bN.includes(stripAccents(c)) || bL.includes(c))
    if (aMatch && bMatch) return true
  }
  return false
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

  if (
    normName.includes("assinatura") ||
    normName.includes("subscription") ||
    normName === "subscription_credits" ||
    normType.includes("assinatura") ||
    normType.includes("subscription") ||
    normType === "subscription_credits"
  ) {
    return "Assinatura (Créditos)";
  }

  const isCustCredit = (s: string) => {
    return s === "store_credit" || s === "store-credit" || s === "store credit" ||
      s.includes("credito do cliente") || s.includes("crédito do cliente") ||
      s.includes("credito de cliente") || s.includes("crédito de cliente") ||
      s.includes("credito cliente") || s.includes("crédito cliente") ||
      s.includes("credito em loja") || s.includes("crédito em loja") ||
      s.includes("credito na loja") || s.includes("crédito na loja");
  };

  const isExchange = (s: string) => s === "exchange" || s.includes("credito de troca") || s.includes("crédito de troca");
  const isVoucher = (s: string) => s.includes("vale-compra") || s.includes("vale_compra") || s.includes("vale compra");

  if (isCustCredit(normName) || isCustCredit(normType)) {
    return "Crédito do cliente";
  }
  if (isExchange(normName) || isExchange(normType)) {
    return "Crédito de troca";
  }
  if (isVoucher(normName) || isVoucher(normType)) {
    return "Vale-compra";
  }

  const getFriendlyTypeLabel = (typeOrName: string): string => {
    const norm = typeOrName.toLowerCase().trim()
    if (isExchange(norm)) return "Crédito de troca"
    if (isCustCredit(norm)) return "Crédito do cliente"
    if (isVoucher(norm)) return "Vale-compra"
    if (norm.includes("assinatura") || norm.includes("subscription")) return "Assinatura (Créditos)"
    if (norm.includes("pix")) return "Pix"
    if (norm.includes("credito") || norm.includes("crédito") || norm.includes("credit")) return "Cartão de Crédito"
    if (norm.includes("debito") || norm.includes("débito") || norm.includes("debit")) return "Cartão de Débito"
    if (norm.includes("dinheiro") || norm.includes("cash") || norm.includes("money")) return "Dinheiro"
    if (norm.includes("transfer") || norm.includes("ted") || norm.includes("doc")) return "Transferência"
    if (norm.includes("cartao") || norm.includes("cartão") || norm.includes("card")) return "Cartão"
    if (norm.includes("boleto")) return "Boleto"
    if (norm.includes("other") || norm.includes("outro")) return "Outros"
    if (norm.includes("método não definido") || norm.includes("pendente")) return "Método não definido"
    return typeOrName.charAt(0).toUpperCase() + typeOrName.slice(1)
  }

  let displayName = rawName || rawType

  // Separate trailing installment suffix (" - 2x")
  let installmentSuffix = ""
  const suffixMatch = displayName.match(/(.*?)\s+-\s*(\d+)x\s*$/i)
  if (suffixMatch) {
    displayName = suffixMatch[1].trimEnd()
    installmentSuffix = ` - ${suffixMatch[2]}x`
  }

  // Parse "Part1 (Part2)" pattern
  const parenMatch = displayName.match(/^([^(]+)\(([^)]+)\)$/)
  if (parenMatch) {
    const part1 = parenMatch[1].trim()
    const part2 = parenMatch[2].trim()

    // If both parts are identical (e.g. "Cartao Credito (Cartao Credito)"), just use one
    if (part1.toLowerCase() === part2.toLowerCase() || stripAccents(part1.toLowerCase()) === stripAccents(part2.toLowerCase())) {
      displayName = part1
    } else {
      const p1IsType = isKnownType(part1)
      const p2IsType = isKnownType(part2)

      if (p2IsType && !p1IsType) {
        // "Mercado Pago (Boleto)" -> "Boleto (Mercado Pago)"
        displayName = `${part2} (${part1})`
      } else if (p1IsType && !p2IsType) {
        // "Cartão de Crédito (Visa)" -> keep as "Cartão de Crédito (Visa)"
        displayName = `${part1} (${part2})`
      } else if (!p1IsType && !p2IsType) {
        // Neither is a known type, pick the longer/more descriptive one
        displayName = part1.length >= part2.length ? `${part1} (${part2})` : `${part2} (${part1})`
      } else {
        // Both are types, just keep the first
        displayName = part1
      }
    }
  }

  // Now resolve the final label
  // If displayName already has the "Type (Detail)" format, respect it
  const finalMatch = displayName.match(/^([^(]+)\(([^)]+)\)$/)
  if (finalMatch) {
    const typePart = finalMatch[1].trim()
    const detailPart = finalMatch[2].trim()
    const typeLabel = getFriendlyTypeLabel(typePart)

    // Cash change info ("Dinheiro (Troco para R$ X)" / "Dinheiro (Valor exato)")
    // is stored separately on the order, so the method label stays just "Dinheiro".
    if (/^\s*(troco\b|valor\s+exato)/i.test(detailPart)) {
      const base = titleWords(typeLabel)
      return installmentSuffix ? `${base}${installmentSuffix}` : base
    }

    // If the type part resolves to the same concept as the detail, just use the type
    if (isSamePaymentConcept(typePart, detailPart)) {
      const base = titleWords(typeLabel)
      return installmentSuffix ? `${base}${installmentSuffix}` : base
    }

    // If the detail is a more specific version of the type (e.g. "Cartão de Crédito" + "Visa")
    const detailAsType = getFriendlyTypeLabel(detailPart)
    if (isSamePaymentConcept(typePart, detailAsType)) {
      const base = titleWords(typeLabel)
      return installmentSuffix ? `${base}${installmentSuffix}` : base
    }

    // Otherwise keep both: "Type (Detail)"
    const base = `${titleWords(typeLabel)} (${titleWords(detailPart)})`
    return installmentSuffix ? `${base}${installmentSuffix}` : base
  }

  // No parentheses - just resolve the type
  const typeLabel = getFriendlyTypeLabel(displayName)
  const base = titleWords(typeLabel)
  return installmentSuffix ? `${base}${installmentSuffix}` : base
}
