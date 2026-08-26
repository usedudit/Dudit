import { AiProvider } from "./index"

const DEFAULT_FALLBACK_MODELS = [
  "qwen/qwen-2.5-72b-instruct",
  "deepseek/deepseek-chat",
]

function getFallbackModels(envKey: string, defaults: string[]): string[] {
  const raw = process.env[envKey]
  if (!raw) return defaults
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
    )
  )
}

function getTimeoutMs(): number {
  const parsed = Number(process.env.AI_PRODUCT_TIMEOUT_MS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000
}

export class OpenRouterProvider implements AiProvider {
  readonly defaultModel: string
  readonly fallbackModels: string[]
  private apiKey: string

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || ""
    this.defaultModel = process.env.AI_PRODUCT_MODEL || "nvidia/llama-3.3-nemotron-super-49b-v1"
    this.fallbackModels = getFallbackModels("AI_PRODUCT_FALLBACK_MODELS", DEFAULT_FALLBACK_MODELS)
  }

  async generate(
    prompt: string,
    model?: string,
    options?: { timeout?: number }
  ): Promise<{
    text: string
    modelUsed: string
    tokensPrompt: number | null
    tokensCompletion: number | null
  }> {
    const targetModel = model || this.defaultModel
    const timeout = options?.timeout || getTimeoutMs()

    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY não configurada no servidor.")
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://dudit.com.br",
        "X-Title": "Dudit",
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.05,
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(timeout),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenRouter API error (Status ${response.status}): ${errText}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) {
      throw new Error("Resposta vazia do OpenRouter.")
    }

    const promptTokens = data.usage?.prompt_tokens || null
    const completionTokens = data.usage?.completion_tokens || null

    return {
      text,
      modelUsed: targetModel,
      tokensPrompt: promptTokens,
      tokensCompletion: completionTokens,
    }
  }
}
