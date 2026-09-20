import { AiProvider } from "./index"

function getTimeoutMs(): number {
  const parsed = Number(process.env.AI_PRODUCT_TIMEOUT_MS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000
}

export class GroqProvider implements AiProvider {
  readonly defaultModel: string
  readonly fallbackModels: string[]
  private apiKey: string

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || ""
    this.defaultModel = "meta-llama/llama-4-scout-17b-16e-instruct"
    this.fallbackModels = []
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
      throw new Error("GROQ_API_KEY não configurada no servidor.")
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(timeout),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Groq API error (Status ${response.status}): ${errText}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) {
      throw new Error("Resposta vazia do Groq.")
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

  async generateWithImage(
    prompt: string,
    imageBase64: string,
    mimeType: string,
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
      throw new Error("GROQ_API_KEY não configurada no servidor.")
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                },
              },
            ],
          }
        ],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: { type: "json_object" }
      }),
      signal: AbortSignal.timeout(timeout),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Groq API error (Status ${response.status}): ${errText}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) {
      throw new Error("Resposta vazia do Groq.")
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
