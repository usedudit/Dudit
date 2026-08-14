import { AiProvider } from "./index"

const DEFAULT_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
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

export class GeminiProvider implements AiProvider {
  readonly defaultModel: string
  readonly fallbackModels: string[]
  private apiKey: string

  constructor() {
    this.apiKey = process.env.GOOGLE_GEMINI_API_KEY || ""
    this.defaultModel = process.env.AI_PRODUCT_MODEL || "gemini-3.6-flash"
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
      throw new Error("GOOGLE_GEMINI_API_KEY não configurada no servidor.")
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json"
          },
        }),
        signal: AbortSignal.timeout(timeout),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Gemini API error (Status ${response.status}): ${errText}`)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      throw new Error("Resposta vazia do Gemini.")
    }

    const usage = data.usageMetadata
    return {
      text,
      modelUsed: targetModel,
      tokensPrompt: usage?.promptTokenCount || null,
      tokensCompletion: usage?.candidatesTokenCount || null,
    }
  }
}
