"use client"

export interface ClientFeedbackContext {
  browser: string
  screen: string
  pageUrl: string
  appArea: string
}

function detectBrowserAndOS(): string {
  if (typeof window === "undefined" || !navigator) return "Unknown"

  const ua = navigator.userAgent
  let os = "Outro"
  if (ua.includes("Win")) os = "Windows"
  else if (ua.includes("Mac")) os = "macOS"
  else if (ua.includes("Linux")) os = "Linux"
  else if (ua.includes("Android")) os = "Android"
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS"

  let browser = "Navegador"
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome"
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari"
  else if (ua.includes("Firefox")) browser = "Firefox"
  else if (ua.includes("Edg")) browser = "Edge"

  return `${browser} (${os})`
}

function detectAppArea(pathname: string): string {
  if (pathname.startsWith("/erp")) return "ERP"
  if (pathname.startsWith("/ajuda")) return "Central de Ajuda"
  if (pathname.startsWith("/perfil")) return "Perfil"
  if (pathname.startsWith("/admin")) return "Painel Admin"
  if (pathname.startsWith("/pedidos") || pathname.startsWith("/carrinho")) return "Marketplace (Checkout/Pedidos)"
  return "Marketplace"
}

export function getClientFeedbackContext(): ClientFeedbackContext {
  if (typeof window === "undefined") {
    return {
      browser: "Unknown",
      screen: "Unknown",
      pageUrl: "",
      appArea: "Unknown",
    }
  }

  const width = window.innerWidth
  const height = window.innerHeight
  const isMobile = width < 768
  const screenType = isMobile ? "Mobile" : width < 1024 ? "Tablet" : "Desktop"
  const screen = `${screenType} (${width}x${height})`

  return {
    browser: detectBrowserAndOS(),
    screen,
    pageUrl: window.location.href,
    appArea: detectAppArea(window.location.pathname),
  }
}
