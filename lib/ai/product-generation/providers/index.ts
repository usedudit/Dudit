import { OpenRouterProvider } from "./openrouter.provider"
import { GeminiProvider } from "./gemini.provider"

export interface AiProvider {
  /**
   * Executa uma chamada para o provedor de IA configurado.
   */
  generate(
    prompt: string,
    model?: string,
    options?: { timeout?: number }
  ): Promise<{
    text: string
    modelUsed: string
    tokensPrompt: number | null
    tokensCompletion: number | null
  }>
}

/**
   * Retorna o provedor de IA com base nas variáveis de ambiente.
   */
export function getAiProvider(providerName?: string): AiProvider {
  const name = providerName || process.env.AI_PRODUCT_PROVIDER || "openrouter"
  
  switch (name.toLowerCase()) {
    case "gemini":
      return new GeminiProvider()
    case "openrouter":
    default:
      return new OpenRouterProvider()
  }
}
