"use client"

/**
 * Intercepts unauthenticated calls from Mercado Pago Brick to:
 * https://api.mercadolibre.com/countries/{country}/zip_codes/{cep}
 * which fail with HTTP 401 Unauthorized because Mercado Libre removed unauthenticated access.
 *
 * Automatically reroutes those calls to Dudit's /api/mercadopago/zip-code endpoint,
 * which resolves the Brazilian address using ViaCEP, BrasilAPI, AwesomeAPI, and Geocode,
 * returning the exact JSON schema that Mercado Pago Brick expects.
 */

let isInstalled = false
let originalFetch: typeof window.fetch | null = null
let originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null
let activePartnerId: string | null = null

export function installMercadoPagoZipInterceptor(partnerId?: string | null): () => void {
  if (typeof window === "undefined") {
    return () => {}
  }

  if (partnerId) {
    activePartnerId = partnerId
  }

  if (isInstalled) {
    return () => {}
  }

  isInstalled = true
  originalFetch = window.fetch
  originalXHROpen = XMLHttpRequest.prototype.open

  const ZIP_CODE_REGEX = /mercadolibre\.com(?::\d+)?\/countries\/[A-Z]{2}\/zip_codes\/(\d{5}-?\d{3}|\d{8})/i

  // 1. Intercept window.fetch
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const urlString =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : (input as any)?.url || ""

    if (typeof urlString === "string" && ZIP_CODE_REGEX.test(urlString)) {
      const match = urlString.match(/zip_codes\/(\d{5}-?\d{3}|\d{8})/i)
      const cleanCep = match ? match[1].replace(/\D/g, "") : ""
      const partnerParam = activePartnerId ? `&partnerId=${encodeURIComponent(activePartnerId)}` : ""
      const proxyUrl = `/api/mercadopago/zip-code?cep=${cleanCep}${partnerParam}`

      try {
        const response = await originalFetch!(proxyUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        })
        if (response.ok) {
          return response
        }
      } catch (err) {
        console.warn("[MP ZipInterceptor] Proxy fetch failed, falling back to original fetch:", err)
      }
    }

    return originalFetch!.apply(this, [input, init])
  }

  // 2. Intercept XMLHttpRequest.prototype.open
  const proto = XMLHttpRequest.prototype
  proto.open = function (method: string, url: string | URL, ...rest: any[]) {
    const urlString = typeof url === "string" ? url : url.toString()
    if (typeof urlString === "string" && ZIP_CODE_REGEX.test(urlString)) {
      const match = urlString.match(/zip_codes\/(\d{5}-?\d{3}|\d{8})/i)
      const cleanCep = match ? match[1].replace(/\D/g, "") : ""
      const partnerParam = activePartnerId ? `&partnerId=${encodeURIComponent(activePartnerId)}` : ""
      const proxyUrl = `/api/mercadopago/zip-code?cep=${cleanCep}${partnerParam}`
      return (originalXHROpen as any).call(this, "GET", proxyUrl, ...rest)
    }
    return (originalXHROpen as any).apply(this, [method, url, ...rest])
  }

  return () => {
    // Keep active during session or allow uninstall
  }
}
