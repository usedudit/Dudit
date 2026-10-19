/**
 * Helper function to make fetch requests with CSRF token automatically included
 */

import { fetchCSRFTokenSingleton, clearCSRFTokenCache as clearHookCache } from "@/hooks/use-csrf-token"

export async function getCSRFToken(): Promise<string> {
  // Delegate to the shared singleton so the token returned here always matches
  // the one stored in the cookie (both the hook and this fetcher share the same
  // cache). This prevents "Token CSRF inválido" caused by divergent caches.
  const token = await fetchCSRFTokenSingleton()
  return token || ""
}

export function clearCSRFTokenCache() {
  clearHookCache()
}

/**
 * Fetch with CSRF token automatically included
 * 
 * @example
 * const response = await fetchWithCSRF("/api/upload-image", {
 *   method: "POST",
 *   body: formData
 * })
 */
export async function fetchWithCSRF(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getCSRFToken()

  // Merge headers
  const headers = new Headers(options.headers)
  headers.set("x-csrf-token", token)

  // For FormData, we don't set Content-Type (browser will set it with boundary)
  if (!(options.body instanceof FormData)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: "include", // Important for cookies
  })
}

/**
 * Fetch JSON with CSRF token
 * 
 * @example
 * const data = await fetchJSONWithCSRF("/api/endpoint", {
 *   method: "POST",
 *   body: { key: "value" }
 * })
 */
export async function fetchJSONWithCSRF<T = any>(
  url: string,
  options: Omit<RequestInit, "body"> & { body?: any } = {},
): Promise<T> {
  const { body, ...fetchOptions } = options

  const response = await fetchWithCSRF(url, {
    ...fetchOptions,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`
    let errorCode: string | undefined
    try {
      const error = await response.json()
      // Tentar diferentes caminhos de erro
      if (error.error) {
        errorMessage = error.error
      } else if (error.message) {
        errorMessage = error.message
      } else if (error.errors?.[0]?.message) {
        errorMessage = error.errors[0].message
      }
      errorCode = error.code
    } catch (parseErr) {
      // Se não conseguir fazer parse, usar a mensagem padrão
      console.error("[CSRF] Erro ao fazer parse da resposta de erro:", parseErr)
    }
    const err = new Error(errorMessage) as Error & { error?: string; code?: string }
    err.error = errorMessage
    err.code = errorCode
    throw err
  }

  return response.json()
}
