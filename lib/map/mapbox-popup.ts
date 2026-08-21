/**
 * Utilitários para renderizar cards do Mapbox no estilo nativo da Dudit.
 */

export const escapeHtml = (value: any): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

export function formatCurrencyBRL(value: number | string | null | undefined): string {
  if (value == null || value === "") return ""
  const amount = typeof value === "string" ? parseFloat(value) : value
  if (isNaN(amount)) return ""
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount)
}

const PIN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`

export type DeliveryStopPopupOptions = {
  orderId?: string
  displayId?: string
  position: number
  totalPoints?: number
  customerName?: string | null
  address?: string | null
  latitude: number
  longitude: number
  distanceKm?: number | null
  totalAmount?: number | string | null
  deliveryStatus?: string | null
  situation?: string | null
  paymentMethod?: string | null
  tag?: string | null
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  cash: "Dinheiro",
  money: "Dinheiro",
  store_credit: "Vale-crédito",
  exchange: "Troca",
}

export function buildDeliveryStopPopupHtml(opt: DeliveryStopPopupOptions): string {
  const total = opt.totalPoints ?? 1
  const isLast = total > 1 && opt.position === total
  const isOnlyOne = total === 1

  let tagText = opt.tag
  let badgeClass = "dmp-badge-gray"

  if (!tagText) {
    if (isOnlyOne) {
      tagText = "Início / Fim"
      badgeClass = "dmp-badge-green"
    } else if (isLast) {
      tagText = "Fim da rota"
      badgeClass = "dmp-badge-purple"
    } else {
      tagText = `${opt.position}ª parada`
      badgeClass = "dmp-badge-gray"
    }
  } else if (tagText.toLowerCase().includes("início") || tagText.toLowerCase().includes("fim")) {
    badgeClass = isOnlyOne ? "dmp-badge-green" : isLast ? "dmp-badge-purple" : "dmp-badge-gray"
  }

  const orderTitle = opt.displayId || `Pedido ${opt.position}`
  const customer = opt.customerName?.trim()
  const addressText = opt.address?.trim() || "Endereço não informado"
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${opt.latitude},${opt.longitude}`

  const metaItems: string[] = []
  if (opt.distanceKm != null && opt.distanceKm > 0) {
    metaItems.push(`<span>${opt.distanceKm.toFixed(1)} km</span>`)
  }
  if (opt.totalAmount != null) {
    const formattedPrice = formatCurrencyBRL(opt.totalAmount)
    if (formattedPrice) {
      metaItems.push(`<span class="font-bold text-brand-dark dark:text-dark-heading">${escapeHtml(formattedPrice)}</span>`)
    }
  }
  if (opt.paymentMethod) {
    const pLabel = PAYMENT_METHOD_LABELS[opt.paymentMethod] || opt.paymentMethod
    metaItems.push(`<span>${escapeHtml(pLabel)}</span>`)
  }

  const metaHtml = metaItems.length > 0
    ? `<div class="dmp-meta-row">${metaItems.join(`<span class="dmp-dot">•</span>`)}</div>`
    : ""

  return `
    <div class="dmp-card">
      <div class="dmp-header">
        <div class="dmp-header-text">
          <span class="dmp-title">${escapeHtml(orderTitle)}</span>
          ${customer ? `<span class="dmp-customer">${escapeHtml(customer)}</span>` : ""}
        </div>
        <span class="dmp-badge ${badgeClass}">${escapeHtml(tagText)}</span>
      </div>

      <div class="dmp-body">
        <div class="dmp-address-row">
          <span class="dmp-address-icon">${PIN_ICON_SVG}</span>
          <span class="dmp-address-text">${escapeHtml(addressText)}</span>
        </div>
        ${metaHtml}
      </div>

      <div class="dmp-footer">
        <a href="${navUrl}" target="_blank" rel="noopener noreferrer" class="dmp-button">
          Ver no Google Maps
        </a>
      </div>
    </div>
  `
}

export type StoreOriginPopupOptions = {
  storeName?: string | null
  address?: string | null
  latitude: number
  longitude: number
  tag?: string
}

export function buildStoreOriginPopupHtml(opt: StoreOriginPopupOptions): string {
  const storeName = opt.storeName?.trim() || "Sua Loja"
  const addressText = opt.address?.trim() || "Início da rota"
  const navUrl = `https://www.google.com/maps/search/?api=1&query=${opt.latitude},${opt.longitude}`

  return `
    <div class="dmp-card">
      <div class="dmp-header">
        <div class="dmp-header-text">
          <span class="dmp-title">${escapeHtml(storeName)}</span>
          <span class="dmp-customer">Ponto de saída</span>
        </div>
        <span class="dmp-badge dmp-badge-green">${escapeHtml(opt.tag || "Início")}</span>
      </div>

      <div class="dmp-body">
        <div class="dmp-address-row">
          <span class="dmp-address-icon">${PIN_ICON_SVG}</span>
          <span class="dmp-address-text">${escapeHtml(addressText)}</span>
        </div>
      </div>

      <div class="dmp-footer">
        <a href="${navUrl}" target="_blank" rel="noopener noreferrer" class="dmp-button">
          Ver no Google Maps
        </a>
      </div>
    </div>
  `
}

export type VendorLocationPopupOptions = {
  name: string
  address?: string | null
  latitude: number
  longitude: number
  rating?: number | null
}

export function buildVendorLocationPopupHtml(opt: VendorLocationPopupOptions): string {
  const name = opt.name?.trim() || "Loja Parceira"
  const addressText = opt.address?.trim() || "Endereço da loja"
  const navUrl = `https://www.google.com/maps/search/?api=1&query=${opt.latitude},${opt.longitude}`

  return `
    <div class="dmp-card">
      <div class="dmp-header">
        <div class="dmp-header-text">
          <span class="dmp-title">${escapeHtml(name)}</span>
        </div>
      </div>

      <div class="dmp-body">
        <div class="dmp-address-row">
          <span class="dmp-address-icon">${PIN_ICON_SVG}</span>
          <span class="dmp-address-text">${escapeHtml(addressText)}</span>
        </div>
      </div>

      <div class="dmp-footer">
        <a href="${navUrl}" target="_blank" rel="noopener noreferrer" class="dmp-button">
          Ver no Google Maps
        </a>
      </div>
    </div>
  `
}
