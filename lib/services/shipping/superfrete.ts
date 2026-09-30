import { createHash, createHmac } from "crypto"

export type SuperFreteEnvironment = "sandbox" | "production"

const SUPERFRETE_ENV_URLS: Record<SuperFreteEnvironment, string> = {
  sandbox: "https://sandbox.superfrete.com",
  production: "https://api.superfrete.com",
}

export function superfreteBaseUrl(environment?: SuperFreteEnvironment): string {
  if (process.env.SUPERFRETE_BASE_URL) {
    return process.env.SUPERFRETE_BASE_URL.replace(/\/+$/, "")
  }
  if (environment === "sandbox" || environment === "production") {
    return SUPERFRETE_ENV_URLS[environment]
  }
  return SUPERFRETE_ENV_URLS[process.env.NODE_ENV === "production" ? "production" : "sandbox"]
}

export const USER_AGENT_TEMPLATE = (email?: string) =>
  email ? `Dudit/1.0 (${email})` : "Dudit/1.0 (integracao@superfrete.com)"

export type SuperFreteServiceId = 1 | 2 | 3 | 17 | 31 | 33

export const SERVICE_LABELS: Record<number, string> = {
  1: "PAC",
  2: "SEDEX",
  3: "JadLog",
  17: "Mini Envios",
  31: "Loggi",
  33: "J&T",
}

export interface SuperFreteUserInfo {
  id: string
  name: string
  email: string
  cpf_cnpj?: string
  balance?: number
  credit_card?: number
  limit?: {
    label_amount?: number
    daily?: number
  }
}

export interface SuperFreteQuotePackage {
  price: number
  discount: string
  format: string
  dimensions: {
    height: string
    width: string
    length: string
  }
  weight: string
  insurance_value: number
}

export interface SuperFreteQuote {
  id: number
  name: string
  price: number
  discount: string
  currency: string
  delivery_time: number
  delivery_range: {
    min: number
    max: number
  }
  packages: SuperFreteQuotePackage[]
  additional_services: {
    receipt: boolean
    own_hand: boolean
  }
  company: {
    id: number
    name: string
    picture: string
  }
  has_error: boolean
}

export interface SuperFreteLabelOrder {
  id: string
  price: number
  status: "pending" | "released" | "posted" | "delivered" | "cancelled"
  tracking?: string
  service_id?: number
  print?: {
    url?: string
  }
}

export interface SuperFreteCheckoutResult {
  success: boolean
  purchase: {
    status: string
    orders: SuperFreteLabelOrder[]
  }
}

export interface SuperFreteOrderInfo {
  id: string
  status: string
  price: number
  discount?: number
  service_id: number
  tracking?: string
  tracking_url?: string
  print?: {
    url: string
  }
  company: {
    name: string
  }
  from: {
    postal_code: string
    city: string
    state_abbr: string
  }
  to: {
    postal_code: string
    city: string
    state_abbr: string
  }
  created_at: string
  paid_at: string
  generated_at: string
  posted_at?: string
  delivered_at?: string
  canceled_at?: string
}

export interface SuperFreteQuoteParams {
  fromPostalCode: string
  toPostalCode: string
  services: SuperFreteServiceId[]
  package: {
    height: number
    width: number
    length: number
    weight: number
  }
  options?: {
    own_hand?: boolean
    receipt?: boolean
    insurance_value?: number
    use_insurance_value?: boolean
  }
}

export interface SuperFreteCreateLabelParams {
  service: SuperFreteServiceId
  from: {
    name: string
    address: string
    number?: string
    complement?: string
    district: string
    city: string
    state_abbr: string
    postal_code: string
    document?: string
    phone?: string
  }
  to: {
    name: string
    address: string
    number?: string
    complement?: string
    district: string
    city: string
    state_abbr: string
    postal_code: string
    email?: string
    document: string
    phone?: string
  }
  products: Array<{
    name: string
    quantity: number
    unitary_value: number
  }>
  volumes: {
    height: number
    width: number
    length: number
    weight: number
  }
  options?: {
    insurance_value?: number
    receipt?: boolean
    own_hand?: boolean
    non_commercial?: boolean
    invoice?: {
      number: string
      key?: string
    }
  }
  tags?: Array<{
    tag: string
    url?: string
  }>
}

export class SuperFreteClient {
  constructor(
    private token: string,
    private userEmail?: string,
    private environment?: SuperFreteEnvironment,
  ) {}

  private get userAgent(): string {
    return USER_AGENT_TEMPLATE(this.userEmail)
  }

  private static extractErrorText(detail: unknown): string {
    if (detail == null || detail === "") return "Erro desconhecido"
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      const parts = detail
        .map((item) => {
          if (item == null) return null
          if (typeof item === "string") return item
          if (typeof item === "object") {
            const obj = item as Record<string, unknown>
            if (typeof obj.message === "string") return obj.message
            try {
              return JSON.stringify(obj)
            } catch {
              return String(obj)
            }
          }
          return String(item)
        })
        .filter(Boolean) as string[]
      return parts.length ? parts.join(" | ") : "Erro desconhecido"
    }
    if (typeof detail === "object") {
      const d = detail as Record<string, unknown>
      const parts: string[] = []
      const errors = d.errors ?? d.error
      if (errors && typeof errors === "object" && !Array.isArray(errors)) {
        for (const [field, value] of Object.entries(errors as Record<string, unknown>)) {
          if (Array.isArray(value)) {
            const items = value
              .map((v) => {
                if (v != null && typeof v === "object") {
                  const obj = v as Record<string, unknown>
                  if (typeof obj.message === "string") return obj.message
                  try {
                    return JSON.stringify(obj)
                  } catch {
                    return String(obj)
                  }
                }
                return String(v)
              })
              .filter(Boolean)
            if (items.length) parts.push(`${field}: ${items.join(", ")}`)
          } else if (value != null && typeof value === "object") {
            try {
              parts.push(`${field}: ${JSON.stringify(value)}`)
            } catch {
              parts.push(`${field}: ${String(value)}`)
            }
          } else if (value != null) {
            parts.push(`${field}: ${String(value)}`)
          }
        }
      } else if (errors) {
        const flattened = SuperFreteClient.extractErrorText(errors)
        if (flattened) parts.push(flattened)
      }
      const message = typeof d.message === "string" ? d.message : null
      const fallback = typeof d.error_description === "string" ? d.error_description : null
      const head = message || fallback
      if (parts.length) {
        const joined = parts.join(" | ")
        if (head && !joined.includes(head)) return `${head} → ${joined}`
        return joined
      }
      if (head) return head
      try {
        return JSON.stringify(d)
      } catch {
        return String(detail)
      }
    }
    return String(detail)
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 20_000,
  ): Promise<unknown> {
    const url = `${superfreteBaseUrl(this.environment)}/${path.replace(/^\/+/, "")}`
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": this.userAgent,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e: any) {
      if (e?.name === "TimeoutError") {
        throw new Error(
          `A API SuperFrete não respondeu em ${Math.round(timeoutMs / 1000)}s (timeout). Tente novamente.`,
        ) as any
      }
      const cause = e?.cause?.code || e?.cause?.message || e?.message || "erro desconhecido"
      throw new Error(`Falha de conexão com a API SuperFrete (${cause}). Verifique sua rede/proxy e tente novamente.`) as any
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let errorDetail: any = text
      try {
        errorDetail = JSON.parse(text)
      } catch {}
      const err = new Error(
        `SuperFrete API ${res.status}: ${SuperFreteClient.extractErrorText(errorDetail)}`,
      ) as any
      err.status = res.status
      err.detail = errorDetail
      throw err
    }

    const text = await res.text()
    return text ? JSON.parse(text) : { success: true }
  }

  async getUserInfo(): Promise<SuperFreteUserInfo> {
    return this.request("GET", "api/v0/user", undefined, 10_000) as Promise<SuperFreteUserInfo>
  }

  async calculateFreight(params: SuperFreteQuoteParams): Promise<SuperFreteQuote[]> {
    return this.request("POST", "api/v0/calculator", {
      from: { postal_code: params.fromPostalCode },
      to: { postal_code: params.toPostalCode },
      services: params.services.join(","),
      options: {
        own_hand: params.options?.own_hand ?? false,
        receipt: params.options?.receipt ?? false,
        insurance_value: params.options?.insurance_value ?? 0,
        use_insurance_value: params.options?.use_insurance_value ?? false,
      },
      package: {
        height: params.package.height,
        width: params.package.width,
        length: params.package.length,
        weight: params.package.weight,
      },
    }, 12_000) as Promise<SuperFreteQuote[]>
  }

  async createOrder(params: SuperFreteCreateLabelParams): Promise<SuperFreteLabelOrder> {
    return this.request("POST", "api/v0/cart", {
      from: params.from,
      to: params.to,
      service: params.service,
      products: params.products,
      volumes: params.volumes,
      options: {
        insurance_value: params.options?.insurance_value ?? 0,
        receipt: params.options?.receipt ?? false,
        own_hand: params.options?.own_hand ?? false,
        non_commercial: params.options?.non_commercial ?? true,
        ...(params.options?.invoice ? { invoice: params.options.invoice } : {}),
        ...(params.tags ? { tags: params.tags } : {}),
      },
      platform: "Dudit ERP",
    }, 30_000) as Promise<SuperFreteLabelOrder>
  }

  async checkoutOrders(orderIds: string[]): Promise<SuperFreteCheckoutResult> {
    return this.request("POST", "api/v0/checkout", {
      orders: orderIds,
    }, 30_000) as Promise<SuperFreteCheckoutResult>
  }

  async getOrderInfo(orderId: string): Promise<SuperFreteOrderInfo> {
    return this.request("GET", `api/v0/order/info/${orderId}`) as Promise<SuperFreteOrderInfo>
  }

  async getLabelPrintUrl(orderIds: string[]): Promise<{ url: string }> {
    return this.request("POST", "api/v0/tag/print", {
      orders: orderIds,
    }, 12_000) as Promise<{ url: string }>
  }

  async cancelOrder(orderId: string, description: string): Promise<Record<string, unknown>> {
    return this.request("POST", "api/v0/order/cancel", {
      order: { id: orderId, description },
    }) as Promise<Record<string, unknown>>
  }

  async listWebhooks(): Promise<any[]> {
    return this.request("GET", "api/v0/webhook") as Promise<any[]>
  }

  async createWebhook(name: string, url: string, events: string[]): Promise<any> {
    return this.request("POST", "api/v0/webhook", {
      name,
      url,
      events,
    }) as Promise<any>
  }

  async updateWebhook(webhookId: string, data: Partial<{
    name: string
    url: string
    events: string[]
    is_active: boolean
  }>): Promise<any> {
    return this.request("PUT", `api/v0/webhook/${webhookId}`, data) as Promise<any>
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request("DELETE", `api/v0/webhook/${webhookId}`)
  }
}

export function createSuperFreteClient(
  token: string,
  userEmail?: string,
  environment?: SuperFreteEnvironment,
): SuperFreteClient {
  return new SuperFreteClient(token, userEmail, environment)
}

export function verifySuperFreteWebhookSignature(
  body: string,
  signature: string,
  secretToken: string,
): boolean {
  if (!signature || !secretToken) return false
  try {
    const parts = signature.split(",")
    let receivedSignature = ""
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.startsWith("X-ME-Signature=")) {
        receivedSignature = trimmed.replace("X-ME-Signature=", "")
        break
      }
      if (trimmed.startsWith("X-ME-Signature:")) {
        receivedSignature = trimmed.replace("X-ME-Signature:", "").trim()
        break
      }
    }

    if (!receivedSignature) {
      receivedSignature = signature.trim()
    }

    const expectedSignature = createHmac("sha256", secretToken)
      .update(body, "utf8")
      .digest("hex")

    return timingSafeEqual(
      Buffer.from(receivedSignature, "hex"),
      Buffer.from(expectedSignature, "hex"),
    )
  } catch {
    return false
  }
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

export const SUPERFRETE_SERVICE_IDS: SuperFreteServiceId[] = [1, 2, 17, 3, 31, 33]

export const DEFAULT_SUPERFRETE_EVENTS = [
  "order.created",
  "order.released",
  "order.generated",
  "order.posted",
  "order.delivered",
  "order.cancelled",
]

export const SUPERFRETE_LABEL_STATUS: Record<string, string> = {
  pending: "Aguardando pagamento",
  released: "Aguardando postagem",
  posted: "Postado",
  delivered: "Entregue",
  cancelled: "Cancelado",
}

export const SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS: Record<string, string> = {
  pending: "not_sent",
  released: "sent",
  posted: "sent",
  delivered: "delivered",
  cancelled: "cancelled",
}

// Status crus enviados no payload do webhook SuperFrete → status
// persistidos em order_shipments (constraint da tabela). "generated"
// = etiqueta pronta após o pagamento; no Dudit corresponde a "released".
export const SUPERFRETE_WEBHOOK_STATUS_TO_SHIPMENT_STATUS: Record<string, string> = {
  pending: "pending",
  released: "released",
  generated: "released",
  posted: "posted",
  in_transit: "in_transit",
  delivered: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  failed: "failed",
}
