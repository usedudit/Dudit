import "server-only"

// ============================================================================
// Discord Webhook - Service Unificado com Rate Limiting e Retry
// ============================================================================

export interface DiscordEmbed {
  title: string
  description?: string
  color: number
  fields: Array<{ name: string; value: string; inline?: boolean }>
  footer?: { text: string }
  timestamp?: string
  thumbnail?: { url: string }
  image?: { url: string }
  url?: string
}

export interface DiscordWebhookPayload {
  username?: string
  avatar_url?: string
  embeds: DiscordEmbed[]
}

interface WebhookConfig {
  url: string
  username: string
  avatarUrl: string
}

// Rate limiting state per webhook URL
const rateLimitState = new Map<string, number>()
const RATE_LIMIT_INTERVAL_MS = 210 // ~5 req/s (Discord limit is 5/s, add buffer)

const DISCORD_VALID_URL_PREFIX = "https://discord.com/api/webhooks/"

/**
 * Lê as env vars em tempo de execução (não no top-level do módulo).
 * No Next.js serverless, process.env pode não estar disponível no cold start.
 */
function getWebhookConfig(channel: string): WebhookConfig | null {
  if (channel === "moderation") {
    const url = process.env.DISCORD_MODERATION_WEBHOOK_URL || ""
    return { url, username: "Dudit Moderação", avatarUrl: "https://dudit.com.br/icon-192x192.png" }
  }
  if (channel === "general") {
    const url = process.env.DISCORD_GENERAL_WEBHOOK_URL || ""
    return { url, username: "Dudit Sistema", avatarUrl: "https://dudit.com.br/icon-192x192.png" }
  }
  return null
}

function getWebhookUrl(channel: string): string {
  return getWebhookConfig(channel)?.url || ""
}

function isWebhookConfigured(channel: string): boolean {
  const url = getWebhookUrl(channel)
  if (!url) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[discord-webhook] ${channel} URL is empty. Env: DISCORD_${channel.toUpperCase()}_WEBHOOK_URL = "${process.env[`DISCORD_${channel.toUpperCase()}_WEBHOOK_URL`] || "(not set)"}"`)
    }
    return false
  }
  return url.startsWith(DISCORD_VALID_URL_PREFIX)
}

async function waitForRateLimit(webhookUrl: string): Promise<void> {
  const lastRequest = rateLimitState.get(webhookUrl) || 0
  const now = Date.now()
  const elapsed = now - lastRequest
  if (elapsed < RATE_LIMIT_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_INTERVAL_MS - elapsed))
  }
  rateLimitState.set(webhookUrl, Date.now())
}

async function sendEmbeds(
  channel: string,
  embeds: DiscordEmbed[],
  retries = 3
): Promise<{ success: boolean; error?: string }> {
  if (!isWebhookConfigured(channel)) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[discord-webhook] ${channel} webhook not configured. Skipping.`)
    }
    return { success: true }
  }

  const config = getWebhookConfig(channel)!

  // Discord max 10 embeds per message
  const chunks: DiscordEmbed[][] = []
  for (let i = 0; i < embeds.length; i += 10) {
    chunks.push(embeds.slice(i, i + 10))
  }

  for (const chunk of chunks) {
    let lastError: string | undefined

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        await waitForRateLimit(config.url)

        const body: DiscordWebhookPayload = {
          username: config.username,
          avatar_url: config.avatarUrl,
          embeds: chunk,
        }

        const response = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        })

        if (response.ok) {
          return { success: true }
        }

        // Rate limited by Discord - wait and retry
        if (response.status === 429) {
          const retryAfter = await response.json().then((d: any) => (d.retry_after || 1) * 1000).catch(() => 2000)
          await new Promise(resolve => setTimeout(resolve, retryAfter))
          rateLimitState.set(config.url, Date.now())
          continue
        }

        const errorText = await response.text().catch(() => "unknown")
        lastError = `Status ${response.status}: ${errorText.slice(0, 200)}`
        console.error(`[discord-webhook] ${channel} attempt ${attempt + 1} failed:`, lastError)

        // Backoff: 1s, 2s, 4s
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown error"
        console.error(`[discord-webhook] ${channel} attempt ${attempt + 1} exception:`, lastError)

        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
        }
      }
    }

    return { success: false, error: lastError }
  }

  return { success: true }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Envia um embed único para um canal do Discord
 */
export async function sendDiscordEmbed(
  channel: "moderation" | "general",
  embed: DiscordEmbed
): Promise<{ success: boolean; error?: string }> {
  return sendEmbeds(channel, [embed])
}

/**
 * Envia múltiplos embeds (agrupados automaticamente em mensagens de até 10)
 */
export async function sendDiscordEmbeds(
  channel: "moderation" | "general",
  embeds: DiscordEmbed[]
): Promise<{ success: boolean; error?: string }> {
  if (embeds.length === 0) return { success: true }
  return sendEmbeds(channel, embeds)
}

/**
 * Helper: Mascarar email parcialmente
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "N/A"
  const [local, domain] = email.split("@")
  if (!domain) return email
  const maskedLocal = local.length > 2 ? local[0] + "***" + local[local.length - 1] : local
  return `${maskedLocal}@${domain}`
}

/**
 * Helper: Mascarar ID (mostrar só últimos 4 chars)
 */
export function maskId(id: string | null | undefined): string {
  if (!id) return "N/A"
  if (id.length <= 4) return id
  return "***" + id.slice(-4)
}

/**
 * Helper: Formatar valor em R$
 */
export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Helper: Truncar texto para embed field (máx 1024 chars)
 */
export function truncate(text: string, maxLen = 1020): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text
}

/**
 * Helper: Formatar data para pt-BR
 */
export function formatDateTime(date?: string | Date | null): string {
  if (!date) return "N/A"
  return new Date(date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
}
