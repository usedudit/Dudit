/**
 * Helper function to make fetch requests with CSRF token automatically included
 */

let csrfTokenCache: string | null = null
let csrfTokenPromise: Promise<string> | null = null

/**
 * Get CSRF token (with caching)
 */
export async function getCSRFToken(): Promise<string> {
  // Return cached token if available
  if (csrfTokenCache) {
    return csrfTokenCache
  }

  // Return existing promise if already fetching
  if (csrfTokenPromise) {
    return csrfTokenPromise
  }

  // Fetch new token
  csrfTokenPromise = fetch("/api/csrf-token")
    .then((response) => response.json())
    .then((data) => {
      csrfTokenCache = data.token
      csrfTokenPromise = null
      return data.token
    })
    .catch((error) => {
      csrfTokenPromise = null
      console.error("[CSRF] Error fetching token:", error)
      throw error
    })

  return csrfTokenPromise
}

/**
 * Clear CSRF token cache (useful after logout or token expiration)
 */
export function clearCSRFTokenCache() {
  csrfTokenCache = null
  csrfTokenPromise = null
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
    } catch (parseErr) {
      // Se não conseguir fazer parse, usar a mensagem padrão
      console.error("[CSRF] Erro ao fazer parse da resposta de erro:", parseErr)
    }
    const err = new Error(errorMessage)
      ; (err as any).error = errorMessage
    throw err
  }

  return response.json()
}
