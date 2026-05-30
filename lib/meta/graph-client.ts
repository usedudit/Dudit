import "server-only"

export const DEFAULT_META_GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0"
export const META_GRAPH_BASE_URL = "https://graph.facebook.com"

export class MetaGraphError extends Error {
  readonly code: string | number
  readonly status: number
  readonly raw: unknown

  constructor(message: string, options: { code: string | number; status: number; raw: unknown }) {
    super(message)
    this.name = "MetaGraphError"
    this.code = options.code
    this.status = options.status
    this.raw = options.raw
  }
}

export class MetaGraphClient {
  constructor(
    private readonly accessToken: string,
    private readonly version = DEFAULT_META_GRAPH_VERSION,
  ) {}

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "DELETE"
      body?: Record<string, unknown>
      searchParams?: Record<string, string | number | boolean | undefined | null>
    } = {},
  ): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`
    const url = new URL(`${META_GRAPH_BASE_URL}/${this.version}${normalizedPath}`)

    for (const [key, value] of Object.entries(options.searchParams || {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }

    const res = await fetch(url.toString(), {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = (json as Record<string, any>)?.error || {}
      throw new MetaGraphError(err.message || res.statusText, {
        code: err.code || res.status,
        status: res.status,
        raw: json,
      })
    }

    return json as T
  }
}
