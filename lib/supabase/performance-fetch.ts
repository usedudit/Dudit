import "server-only"

/**
 * Adds low-overhead timing to Supabase HTTP calls without logging query
 * strings, headers, tokens, or response bodies.
 *
 * Enable full tracing locally with DUDIT_SUPABASE_TRACE=1. In development,
 * slow calls are logged automatically. Production stays quiet unless tracing
 * is explicitly enabled.
 */
export function createSupabasePerformanceFetch(label: string): typeof fetch {
  return async (input, init) => {
    const startedAt = performance.now()
    const response = await fetch(input, init)
    const elapsedMs = Math.round(performance.now() - startedAt)
    const traceEnabled = process.env.DUDIT_SUPABASE_TRACE === "1"
    const slowThresholdMs = Number(process.env.DUDIT_SUPABASE_SLOW_MS || 250)

    if (traceEnabled || (process.env.NODE_ENV !== "production" && elapsedMs >= slowThresholdMs)) {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      let endpoint = "unknown"
      try {
        const url = new URL(rawUrl)
        endpoint = url.pathname.replace(/^\/rest\/v1\//, "rest/")
      } catch {
        // Keep the log safe even if a custom fetch input is not a valid URL.
      }

      const contentLength = response.headers.get("content-length")
      console.info(
        `[supabase-perf] ${label} ${response.status} ${elapsedMs}ms ${endpoint}${
          contentLength ? ` ${contentLength} bytes` : ""
        }`,
      )
    }

    return response
  }
}
