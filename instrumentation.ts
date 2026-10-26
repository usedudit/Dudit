import * as Sentry from "@sentry/nextjs";

function isClientAbortError(error: unknown): boolean {
  if (!error) return false
  const err = error as Record<string, unknown>
  const code = typeof err.code === "string" ? err.code : ""
  const message = typeof err.message === "string" ? err.message : String(error)
  const name = typeof err.name === "string" ? err.name : ""

  return (
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ECANCELED" ||
    code === "ERR_STREAM_PREMATURE_CLOSE" ||
    code === "UND_ERR_ABORTED" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    message === "aborted" ||
    message.includes("aborted") ||
    message.includes("ECONNRESET") ||
    message.includes("socket hang up") ||
    message.includes("The user aborted a request") ||
    message.includes("Premature close") ||
    name === "AbortError"
  )
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Increase default EventEmitter max listeners to 25.
    // Next.js 16+ internals + Sentry APM instrumentation attach 11 close listeners to ServerResponse,
    // which exceeds Node's default threshold of 10 and emits a false-positive warning.
    const events = await import("node:events");
    events.defaultMaxListeners = 25;

    await import("./sentry.server.config");

    // Catch and safely ignore client disconnection / abort events
    // preventing unhandled crash logs (e.g. uncaughtException: Error: aborted { code: 'ECONNRESET' })
    process.on("uncaughtException", (error: unknown) => {
      if (isClientAbortError(error)) {
        return
      }
      console.error("[SERVER] Uncaught exception:", error)
    })

    process.on("unhandledRejection", (reason: unknown) => {
      if (isClientAbortError(reason)) {
        return
      }
      console.error("[SERVER] Unhandled rejection:", reason)
    })
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (error, request, context) => {
  if (isClientAbortError(error)) {
    return
  }
  return Sentry.captureRequestError(error, request, context)
}
