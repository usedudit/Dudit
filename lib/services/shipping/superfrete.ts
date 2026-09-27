import { createHash, createHmac } from "crypto"

const SUPERFRETE_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.superfrete.com"
    : "https://sandbox.superfrete.com"

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

class SuperFreteClient {
  constructor(private token: string, private userEmail?: string) {}

  private get userAgent(): string {
    return USER_AGENT_TEMPLATE(this.userEmail)
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const res = await fetch(`${SUPERFRETE_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": this.userAgent,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let errorDetail: any = text
      try {
        errorDetail = JSON.parse(text)
      } catch {}
      const err = new Error(
        `SuperFrete API ${res.status}: ${errorDetail?.message || errorDetail || "Unknown error"}`,
      ) as any
      err.status = res.status
      err.detail = errorDetail
      throw err
    }

    const text = await res.text()
    return text ? JSON.parse(text) : { success: true }
  }

  async getUserInfo(): Promise<SuperFreteUserInfo> {
    return this.request("GET", "api/v0/user") as Promise<SuperFreteUserInfo>
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
    }) as Promise<SuperFreteQuote[]>
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
      },
      platform: "Dudit ERP",
      ...(params.tags ? { tags: params.tags } : {}),
    }) as Promise<SuperFreteLabelOrder>
  }

  async checkoutOrders(orderIds: string[]): Promise<SuperFreteCheckoutResult> {
    return this.request("POST", "api/v0/checkout", {
      orders: orderIds,
    }) as Promise<SuperFreteCheckoutResult>
  }

  async getOrderInfo(orderId: string): Promise<SuperFreteOrderInfo> {
    return this.request("GET", `api/v0/order/info/${orderId}`) as Promise<SuperFreteOrderInfo>
  }

  async getLabelPrintUrl(orderIds: string[]): Promise<{ url: string }> {
    return this.request("POST", "api/v0/tag/print", {
      orders: orderIds,
    }) as Promise<{ url: string }>
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

export function createSuperFreteClient(token: string, userEmail?: string): SuperFreteClient {
  return new SuperFreteClient(token, userEmail)
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
