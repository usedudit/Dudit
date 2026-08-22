import "server-only"

import { headers } from "next/headers"

/**
 * Optional server-action tracing. Only static action names and the server-
 * generated request id are emitted; no user, token, payload, or URL data.
 */
export async function traceServerAction(action: string): Promise<void> {
    if (process.env.DUDIT_REQUEST_TRACE !== "true") return

    let headerList: Awaited<ReturnType<typeof headers>>
    try {
        headerList = await headers()
    } catch {
        return
    }
    const requestId = headerList.get("x-dudit-request-id") || "missing"
    console.log(`[DUDIT_TRACE] request=${requestId} action=${action}`)
}
