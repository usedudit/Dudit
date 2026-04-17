export const normalizePDVPaymentMethodLabel = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return ""
  if (normalized === "dinheiro") return "Dinheiro"
  if (normalized === "pix") return "Pix"
  if (normalized === "cartao" || normalized === "cartão") return "Cartão"
  if (normalized === "pendente") return "Pendente"
  return String(value || "").trim()
}

export const normalizePDVSearchTerm = (value?: string | null) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
