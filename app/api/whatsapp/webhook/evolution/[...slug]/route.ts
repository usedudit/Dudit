/**
 * Catch-all route for Evolution API webhook events when byEvents=true.
 *
 * When byEvents is enabled in the Evolution API, it appends the event name
 * to the webhook URL path. For example:
 *   - /api/whatsapp/webhook/evolution/messages-upsert
 *   - /api/whatsapp/webhook/evolution/connection-update
 *   - /api/whatsapp/webhook/evolution/qrcode-updated
 *
 * This catch-all route ensures those sub-paths are handled by the same
 * handler as the base /api/whatsapp/webhook/evolution route.
 *
 * The event type is read from the request body (body.event), not the URL path,
 * so the same handler works regardless of the path suffix.
 */

export { POST } from "../route"
