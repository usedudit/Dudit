import "server-only"
import dns from "node:dns"

import { classifyEvolutionError } from "../errors"
import { SecureLogger } from "@/lib/secure-logger"
import type {
  ProviderSendResult,
  SendTextInput,
  SendImageInput,
  SendDocumentInput,
  SendAudioInput,
  SendLocationInput,
  ConnectionStatusResult,
  InstanceInfoResult,
  ConnectResult,
  WhatsappConnectionStatus,
} from "../types"

// ─── URL Validation ──────────────────────────────────────────────────────────

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"])
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
])

function isPrivateIPAddress(ip: string): boolean {
  const normalized = ip.toLowerCase().trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "")

  // IPv4-mapped IPv6 addresses must be evaluated as their IPv4 address.
  const mappedIPv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  const ipv4 = mappedIPv4 || (normalized.includes(":") ? null : normalized)

  if (ipv4) {
    const parts = ipv4.split(".").map(Number)
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false
    }

    const [first, second] = parts
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first >= 224
    )
  }

  // IPv6 loopback, unspecified, link-local, and unique-local ranges.
  return (
    normalized === "::" ||
    normalized === "::1" ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  )
}

function isRFC1918IPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [first, second] = parts
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

/**
 * Normalizes and validates an Evolution API URL.
 *
 * Fixes the root cause of "URL da Evolution API inválida":
 * - Auto-prepends https:// when protocol is missing
 * - Strips trailing slashes to avoid double-slash in endpoint paths
 * - Trims all whitespace including unicode (NBSP, Zero-Width Space)
 */
function normalizeEvolutionUrl(raw: string): string {
  // Aggressive trim: remove all unicode whitespace and control characters
  let url = raw.replace(/^[\s\u200B\uFEFF\u00A0]+|[\s\u200B\uFEFF\u00A0]+$/g, "")

  // Auto-prepend https:// if no protocol is present
  if (url && !url.match(/^https?:\/\//i)) {
    url = `https://${url}`
  }

  // Strip trailing slashes to prevent double-slash when appending paths
  url = url.replace(/\/+$/, "")

  return url
}

function validateEvolutionUrl(url: string): URL {
  const normalized = normalizeEvolutionUrl(url)

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error(
      `URL da Evolution API inválida: não foi possível interpretar "${url.substring(0, 60)}"`,
    )
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Protocolo não permitido: ${parsed.protocol}`)
  }
  if (BLOCKED_HOSTNAMES.has(parsed.hostname)) {
    throw new Error("URL não permitida por segurança (endereço local/reservado)")
  }
  if (isPrivateIPAddress(parsed.hostname)) {
    if (isRFC1918IPv4(parsed.hostname)) {
      throw new Error("URL não permitida (rede privada)")
    }
    throw new Error("URL não permitida por segurança (endereço local/reservado)")
  }
  return parsed
}

async function validateHostnameNotPrivate(hostname: string): Promise<void> {
  const isIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")
  let ip = hostname
  if (!isIp) {
    try {
      const result = await dns.promises.lookup(hostname)
      ip = result.address
    } catch {
      throw classifyEvolutionError(500, `Não foi possível resolver o hostname: ${hostname}`)
    }
  }

  // Block loopback, private, link-local, metadata, and reserved IPv4/IPv6 IPs.
  if (isPrivateIPAddress(ip)) {
    throw classifyEvolutionError(400, "URL não permitida por segurança (endereço local/reservado)")
  }
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private readonly threshold: number
  private readonly resetTimeMs: number

  constructor(threshold = 5, resetTimeSec = 30) {
    this.threshold = threshold
    this.resetTimeMs = resetTimeSec * 1000
  }

  isOpen(): boolean {
    if (this.failures < this.threshold) return false
    if (Date.now() - this.lastFailureTime > this.resetTimeMs) {
      this.reset()
      return false
    }
    return true
  }

  recordSuccess(): void {
    this.reset()
  }

  recordFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()
  }

  private reset(): void {
    this.failures = 0
    this.lastFailureTime = 0
  }
}

// ─── Evolution API Error ─────────────────────────────────────────────────────

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly raw?: unknown,
  ) {
    super(message)
    this.name = "EvolutionApiError"
  }
}

// ─── Evolution API Client ────────────────────────────────────────────────────

export class EvolutionWhatsappClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly instanceName: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly circuitBreaker: CircuitBreaker

  constructor(config: {
    apiUrl: string
    apiKey: string
    instanceName: string
    timeoutMs?: number
    maxRetries?: number
  }) {
    const validated = validateEvolutionUrl(config.apiUrl)
    this.baseUrl = validated.origin
    this.apiKey = config.apiKey
    this.instanceName = config.instanceName
    this.timeoutMs = config.timeoutMs ?? 15_000
    this.maxRetries = config.maxRetries ?? 3
    this.circuitBreaker = new CircuitBreaker(5, 30)
  }

  // ─── Text ────────────────────────────────────────────────────────────────

  async sendText(input: SendTextInput): Promise<ProviderSendResult> {
    return this.request<ProviderSendResult>(
      `/message/sendText/${this.instanceName}`,
      {
        number: input.to,
        text: input.body,
      },
      "sendText",
    )
  }

  // ─── Image ───────────────────────────────────────────────────────────────

  async sendImage(input: SendImageInput): Promise<ProviderSendResult> {
    return this.request<ProviderSendResult>(
      `/message/sendMedia/${this.instanceName}`,
      {
        number: input.to,
        mediatype: "image",
        media: input.imageUrl,
        caption: input.caption || "",
      },
      "sendImage",
    )
  }

  // ─── Document ────────────────────────────────────────────────────────────

  async sendDocument(input: SendDocumentInput): Promise<ProviderSendResult> {
    return this.request<ProviderSendResult>(
      `/message/sendMedia/${this.instanceName}`,
      {
        number: input.to,
        mediatype: "document",
        media: input.documentUrl,
        caption: input.caption || "",
        fileName: input.filename,
      },
      "sendDocument",
    )
  }

  // ─── Audio ───────────────────────────────────────────────────────────────

  async sendAudio(input: SendAudioInput): Promise<ProviderSendResult> {
    return this.request<ProviderSendResult>(
      `/message/sendWhatsAppAudio/${this.instanceName}`,
      {
        number: input.to,
        audio: input.audioUrl,
      },
      "sendAudio",
    )
  }

  // ─── Location ────────────────────────────────────────────────────────────

  async sendLocation(input: SendLocationInput): Promise<ProviderSendResult> {
    return this.request<ProviderSendResult>(
      `/message/sendLocation/${this.instanceName}`,
      {
        number: input.to,
        latitude: input.latitude,
        longitude: input.longitude,
        name: input.name || "",
        address: input.address || "",
      },
      "sendLocation",
    )
  }

  // ─── Mark as Read ────────────────────────────────────────────────────────

  async markAsRead(messageId: string): Promise<void> {
    await this.request(
      `/chat/markMessageAsRead/${this.instanceName}`,
      { readMessages: [{ id: messageId }] },
      "markAsRead",
    )
  }

  // ─── Connection ──────────────────────────────────────────────────────────

  async getConnectionStatus(): Promise<ConnectionStatusResult> {
    const data = await this.request<Record<string, unknown>>(
      `/instance/connectionState/${this.instanceName}`,
      null,
      "getConnectionStatus",
      "GET",
    )

    const instanceObj = (data?.instance ?? {}) as Record<string, unknown>
    const rawState = String(data?.state ?? instanceObj.state ?? "close")
    const status = this.mapConnectionState(rawState)

    return {
      status,
      instanceName: this.instanceName,
      phoneNumber: (instanceObj.owner as string) || null,
    }
  }

  async getInstanceInfo(): Promise<InstanceInfoResult> {
    const data = await this.request<Record<string, unknown>>(
      `/instance/fetchInstances`,
      null,
      "getInstanceInfo",
      "GET",
    )

    const instances = Array.isArray(data) ? data : (data?.instances ?? []) as Record<string, unknown>[]
    const instance = (instances as Record<string, unknown>[]).find(
      (i) => i.instanceName === this.instanceName || i.name === this.instanceName,
    )

    if (!instance) {
      return {
        instanceName: this.instanceName,
        phoneNumber: null,
        status: "disconnected",
      }
    }

    const rawState = String(instance.connectionStatus ?? instance.state ?? "close")

    return {
      instanceName: this.instanceName,
      phoneNumber: (instance.owner as string) || null,
      status: this.mapConnectionState(rawState),
      platform: (instance.platform as string) || null,
      profilePictureUrl: (instance.profilePicUrl as string) || null,
    }
  }

  async connectInstance(): Promise<ConnectResult> {
    const data = await this.request<Record<string, unknown>>(
      `/instance/connect/${this.instanceName}`,
      null,
      "connectInstance",
      "GET",
    )

    const qrcodeObj = (data?.qrcode ?? {}) as Record<string, unknown>
    const qrCode = (qrcodeObj.base64 as string) || (data?.base64 as string) || (data?.code as string) || null
    const status: WhatsappConnectionStatus = qrCode ? "qr_pending" : "connecting"

    return { status, qrCode }
  }

  async disconnectInstance(): Promise<void> {
    await this.request(
      `/instance/logout/${this.instanceName}`,
      null,
      "disconnectInstance",
      "DELETE",
    )
  }

  async restartInstance(): Promise<void> {
    await this.request(
      `/instance/restart/${this.instanceName}`,
      null,
      "restartInstance",
      "PUT",
    )
  }

  // ─── Instance Management ──────────────────────────────────────────────────

  /**
   * Checks if an instance with this client's instanceName already exists
   * on the Evolution server by calling GET /instance/fetchInstances.
   */
  async instanceExists(): Promise<boolean> {
    try {
      const data = await this.request<unknown>(
        `/instance/fetchInstances`,
        null,
        "instanceExists",
        "GET",
      )

      const instances = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.instances ?? []) as Record<string, unknown>[]
      return (instances as Record<string, unknown>[]).some(
        (i) => i.instanceName === this.instanceName || i.name === this.instanceName,
      )
    } catch {
      return false
    }
  }

  /**
   * Creates a new instance on the Evolution server.
   * Uses POST /instance/create with inline webhook config to avoid
   * a separate /webhook/set call.
   *
   * Returns the QR code if qrcode=true was set and the instance isn't
   * already connected.
   */
  async createInstance(
    webhookUrl: string,
    webhookEvents: string[],
    headers?: Record<string, string>,
  ): Promise<ConnectResult> {
    const data = await this.request<Record<string, unknown>>(
      `/instance/create`,
      {
        instanceName: this.instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          events: webhookEvents,
          headers: headers,
        },
      },
      "createInstance",
    )

    // Extract QR code from response
    const qrcodeObj = (data?.qrcode ?? {}) as Record<string, unknown>
    const qrCode = (qrcodeObj.base64 as string) || (data?.base64 as string) || (data?.code as string) || null
    const status: WhatsappConnectionStatus = qrCode ? "qr_pending" : "connecting"

    return { status, qrCode }
  }

  /**
   * Sets/updates webhook configuration for an existing instance.
   * Uses POST /webhook/set/{instanceName}.
   * Only needed when the instance already existed and webhook wasn't set during creation.
   */
  async setWebhook(
    webhookUrl: string,
    webhookEvents: string[],
    headers?: Record<string, string>,
  ): Promise<void> {
    await this.request(
      `/webhook/set/${this.instanceName}`,
      {
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          events: webhookEvents,
          headers: headers,
        },
      },
      "setWebhook",
    )
  }

  // ─── Test Connection ─────────────────────────────────────────────────────

  async testConnection(): Promise<boolean> {
    try {
      const status = await this.getConnectionStatus()
      return status.status === "connected"
    } catch {
      return false
    }
  }

  // ─── Internal: HTTP Request with retry, circuit breaker, timeout ────────

  private async request<T = unknown>(
    path: string,
    body: unknown | null,
    operation: string,
    method: "POST" | "GET" | "PUT" | "DELETE" = "POST",
  ): Promise<T> {
    if (this.circuitBreaker.isOpen()) {
      throw classifyEvolutionError(
        503,
        `Circuit breaker aberto para ${this.instanceName} - muitas falhas recentes`,
      )
    }

    const url = `${this.baseUrl}${path}`
    const parsedUrl = new URL(url)
    await validateHostnameNotPrivate(parsedUrl.hostname)

    const startTime = Date.now()
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

      try {
        const headers: Record<string, string> = {
          apikey: this.apiKey,
          "Content-Type": "application/json",
        }

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        }

        if (body !== null && method !== "GET") {
          fetchOptions.body = JSON.stringify(body)
        }

        const response = await fetch(url, fetchOptions)

        if (!response.ok) {
          let errorMessage: string
          try {
            const errorBody = await response.json()
            errorMessage = String(
              errorBody.message ?? errorBody.error ?? errorBody.response?.message ?? response.statusText,
            )
          } catch {
            errorMessage = response.statusText || `HTTP ${response.status}`
          }

          const classified = classifyEvolutionError(response.status, errorMessage)

          if (!classified.retryable || attempt >= this.maxRetries) {
            this.circuitBreaker.recordFailure()
            this.logRequest(operation, startTime, false, errorMessage)
            throw classified
          }

          lastError = classified
          continue
        }

        let responseData: T
        const contentType = response.headers.get("content-type") || ""
        if (contentType.includes("application/json")) {
          const json = await response.json()
          // Normalize Evolution API response to ProviderSendResult when applicable
          if (operation.startsWith("send")) {
            responseData = {
              providerMessageId: String(
                json.key?.id ?? json.messageId ?? json.id ?? json.message?.id ?? "",
              ),
              raw: json,
            } as T
          } else {
            responseData = json as T
          }
        } else {
          responseData = {} as T
        }

        this.circuitBreaker.recordSuccess()
        this.logRequest(operation, startTime, true)
        return responseData
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          lastError = classifyEvolutionError(408, "Timeout na requisição à Evolution API")
          if (attempt >= this.maxRetries) {
            this.circuitBreaker.recordFailure()
            this.logRequest(operation, startTime, false, "timeout")
            throw lastError
          }
          continue
        }

        // Already classified errors (WhatsappError) - re-throw
        if (err instanceof Error && err.name === "WhatsappError") {
          throw err
        }

        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt >= this.maxRetries) {
          this.circuitBreaker.recordFailure()
          this.logRequest(operation, startTime, false, lastError.message)
          throw classifyEvolutionError(500, lastError.message)
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error("Erro inesperado na Evolution API")
  }

  // ─── Internal: Connection state mapping ────────────────────────────────

  private mapConnectionState(rawState: string): WhatsappConnectionStatus {
    const state = rawState.toLowerCase()
    if (state === "open" || state === "connected") return "connected"
    if (state === "close" || state === "closed" || state === "disconnected") return "disconnected"
    if (state === "connecting") return "connecting"
    if (state === "qr" || state === "qrcode") return "qr_pending"
    return "disconnected"
  }

  // ─── Internal: Structured logging (never logs secrets) ─────────────────

  private logRequest(operation: string, startTime: number, success: boolean, error?: string): void {
    const durationMs = Date.now() - startTime
    const level = success ? "info" : "error"
    SecureLogger[level](`[evolution] ${operation}`, {
      instance: this.instanceName,
      durationMs,
      success,
      ...(error ? { error } : {}),
    })
  }
}
