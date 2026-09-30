// Teste manual do webhook SuperFrete (assinatura X-ME-Signature).
//
// Uso:
//   node scripts/test-superfrete-webhook.mjs [--event=delivered] [--kind=outbound|return|any]
//     [--id=<shipment-uuid>] [--partner=<partner-uuid>] [--url=<endpoint>] [--dry]
//
//   --event: released | created | generated | posted | delivered | cancelled | all
//   Monta um payload igual ao docs (superfrete.readme.io), assina com HMAC-SHA256
//   usando o webhook_secret_encrypted do banco (contexto "superfrete") e faz POST
//   no endpoint local. Imprime antes/depois de orders, order_shipments e
//   return_requests para validar o paridade com o fluxo de entrega padrão.
//
// Requer: POSTGRES_URL_NON_POOLING (ou POSTGRES_URL) + MASTER_KEY_V1/V2 no .env
// e servidor local rodando (npm run dev) em http://localhost:3000.

import { readFileSync } from "node:fs"
import { createHmac, createHash, hkdfSync, createDecipheriv } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// ─── .env loader (self-contained; não depende de --env-file) ─────────────────
try {
  const envText = readFileSync(path.join(ROOT, ".env"), "utf8")
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let value = m[2]
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value
  }
} catch {
  /* sem .env: usa env do shell */
}

// ─── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const hasFlag = (name) => args.includes(`--${name}`)

const EVENT = getArg("event", "delivered")
const KIND = getArg("kind", "outbound")
const SHIPMENT_ID = getArg("id", null)
const PARTNER_ID = getArg(
  "partner",
  "e83fba88-58d0-42f2-84dd-3177d19531f3",
)
const WEBHOOK_URL = getArg("url", "http://localhost:3000/api/shipping/superfrete/webhook")
const DRY = hasFlag("dry")

const ALL_EVENTS = [
  "order.created",
  "order.released",
  "order.generated",
  "order.posted",
  "order.delivered",
  "order.cancelled",
]

const EVENTS =
  EVENT === "all"
    ? ALL_EVENTS
    : EVENT.startsWith("order.")
      ? [EVENT]
      : [`order.${EVENT}`]

// ─── decrypt (espelho de lib/cryptoService.ts, contexto "superfrete") ────────
const HKDF_SALT = createHash("sha256").update("dudit-crypto-service-hkdf-salt-v1").digest()

function decryptSuperfrete(encrypted) {
  const colon = encrypted.indexOf(":")
  if (colon === -1) throw new Error("payload criptografado sem prefixo de versão")
  const version = encrypted.slice(0, colon)
  const body = encrypted.slice(colon + 1)
  const envVar = `MASTER_KEY_${version.toUpperCase()}`
  const masterKeyB64 = process.env[envVar]
  if (!masterKeyB64) throw new Error(`${envVar} não definido`)
  const masterKey = Buffer.from(masterKeyB64, "base64")
  const key = Buffer.from(
    hkdfSync("sha256", masterKey, HKDF_SALT, "superfrete-token-encryption", 32),
  )
  const packed = Buffer.from(body, "base64")
  const iv = packed.subarray(0, 12)
  const authTag = packed.subarray(12, 28)
  const ciphertext = packed.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 })
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}

// ─── pg ──────────────────────────────────────────────────────────────────────
async function makeClient() {
  const raw =
    process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL
  if (!raw) throw new Error("POSTGRES_URL_NON_POOLING/POSTGRES_URL não definido")
  const url = new URL(raw)
  url.searchParams.delete("sslmode")
  const needsSsl =
    /supabase|neon|aws|amazon|railway|render/i.test(url.hostname) ||
    /sslmode=require/i.test(raw)
  const pgMod = await import("pg")
  const { Client } = pgMod.default ?? pgMod
  return new Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  })
}

// ─── queries ─────────────────────────────────────────────────────────────────
const SHIPMENT_SELECT = `
  id, order_id, partner_id, kind, return_request_id, external_label_id,
  status, tracking_number, tracking_url, label_url, price, paid_at,
  delivered_at, cancelled_at, created_at, payload`

async function fetchShipment(client, id, kind, partnerId) {
  const conds = [`provider_slug = 'superfrete'`]
  const params = []
  if (partnerId) {
    params.push(partnerId)
    conds.push(`partner_id = $${params.length}`)
  }
  if (id) {
    params.push(id)
    conds.push(`id = $${params.length}`)
  } else if (kind === "outbound" || kind === "return") {
    params.push(kind)
    conds.push(`kind = $${params.length}`)
  }
  const { rows } = await client.query(
    `SELECT ${SHIPMENT_SELECT} FROM order_shipments
     WHERE ${conds.join(" AND ")}
     ORDER BY created_at DESC NULLS LAST LIMIT 1`,
    params,
  )
  return rows[0] ?? null
}

async function fetchSnapshot(client, shipment) {
  const order = (
    await client.query(
      `SELECT id, order_number, delivery_status, delivery_departure_at,
              delivery_arrived_at, delivery_completed_at, updated_at
       FROM orders WHERE id = $1`,
      [shipment.order_id],
    )
  ).rows[0]

  let returnRequest = null
  if (shipment.return_request_id) {
    returnRequest = (
      await client.query(
        `SELECT id, status, updated_at FROM return_requests WHERE id = $1`,
        [shipment.return_request_id],
      )
    ).rows[0]
  }

  const now = (
    await client.query(
      `SELECT ${SHIPMENT_SELECT} FROM order_shipments WHERE id = $1`,
      [shipment.id],
    )
  ).rows[0]

  return { shipment: now, order, returnRequest }
}

function diff(label, before, after) {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  const changed = []
  for (const f of fields) {
    const a = before?.[f] ?? null
    const b = after?.[f] ?? null
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(`    ${f}: ${a} -> ${b}`)
  }
  console.log(`  ${label}:`)
  if (changed.length === 0) console.log("    (sem mudanças)")
  else changed.forEach((l) => console.log(l))
}

// ─── payload (formato docs: {event, data:{id, status, tracking, ...}}) ───────
function buildPayload(shipment, eventName) {
  const now = new Date().toISOString()
  const tracking =
    shipment.tracking_number || `SBX${Date.now().toString().slice(-10)}`
  const data = {
    id: shipment.external_label_id,
    created_at: shipment.created_at || now,
    tags: ["dudit-webhook-test"],
  }

  switch (eventName) {
    case "order.created":
      data.status = "created"
      break
    case "order.released":
      data.status = "released"
      data.paid_at = shipment.paid_at || now
      break
    case "order.generated":
      data.status = "generated"
      data.tracking = tracking
      data.tracking_url =
        shipment.tracking_url || `https://rastreio.superfrete.com/#/tracking/${tracking}`
      data.generated_at = now
      data.paid_at = shipment.paid_at || now
      break
    case "order.posted":
      data.status = "posted"
      data.tracking = tracking
      data.tracking_url =
        shipment.tracking_url || `https://rastreio.superfrete.com/#/tracking/${tracking}`
      data.posted_at = now
      break
    case "order.delivered":
      data.status = "delivered"
      data.tracking = tracking
      data.tracking_url =
        shipment.tracking_url || `https://rastreio.superfrete.com/#/tracking/${tracking}`
      data.delivered_at = now
      break
    case "order.cancelled":
      data.status = "canceled"
      data.canceled_at = now
      break
    default:
      throw new Error(`evento desconhecido: ${eventName}`)
  }

  return { event: eventName, data }
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  const client = await makeClient()
  await client.connect()

  try {
    const shipment = await fetchShipment(client, SHIPMENT_ID, KIND, PARTNER_ID)
    if (!shipment) {
      console.error(
        "Nenhuma remessa SuperFrete encontrada. Gere uma etiqueta antes (ou use --id/--kind).",
      )
      process.exitCode = 1
      return
    }

    console.log("Remessa alvo:")
    console.log(`  id: ${shipment.id}`)
    console.log(`  external_label_id: ${shipment.external_label_id}`)
    console.log(`  kind: ${shipment.kind}  status atual: ${shipment.status}`)
    console.log(`  order_id: ${shipment.order_id}`)
    if (shipment.return_request_id) console.log(`  return_request_id: ${shipment.return_request_id}`)
    console.log(`  tracking: ${shipment.tracking_number || "-"}`)
    console.log("")

    const { rows: integrations } = await client.query(
      `SELECT webhook_secret_encrypted FROM partner_integrations
       WHERE partner_id = $1 AND provider_slug = 'superfrete'`,
      [shipment.partner_id],
    )
    const encryptedSecret = integrations[0]?.webhook_secret_encrypted
    if (!encryptedSecret) {
      console.error(
        "webhook_secret_encrypted ausente para o partner. Rode setupSuperFreteWebhookAction/connect antes.",
      )
      process.exitCode = 1
      return
    }
    const secret = decryptSuperfrete(encryptedSecret)
    console.log(`Segredo do webhook: ok (${secret.length} chars, contexto superfrete)`)
    console.log(`Endpoint: ${WEBHOOK_URL}`)
    console.log(`Eventos: ${EVENTS.join(", ")}${DRY ? "  [dry-run]" : ""}`)
    console.log("")

    for (const eventName of EVENTS) {
      const payloadObj = buildPayload(shipment, eventName)
      const body = JSON.stringify(payloadObj)
      const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex")

      console.log(`── ${eventName} ──`)
      console.log(`  payload: ${body}`)

      if (DRY) {
        console.log(`  X-ME-Signature: ${signature} (não enviado, --dry)\n`)
        continue
      }

      const before = await fetchSnapshot(client, shipment)

      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-ME-Signature": signature },
        body,
      })
      const text = await res.text()
      console.log(`  HTTP ${res.status}  ${text}`)

      const after = await fetchSnapshot(client, shipment)
      diff("order_shipments", before.shipment, after.shipment)
      if (before.order || after.order) diff("orders", before.order, after.order)
      if (before.returnRequest || after.returnRequest)
        diff("return_requests", before.returnRequest, after.returnRequest)
      console.log("")

      if (EVENTS.length > 1) await new Promise((r) => setTimeout(r, 400))
    }

    if (!DRY) {
      console.log("Concluído. Verifique também o audit log (timeline) no ERP.")
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("Falha:", err.message)
  process.exitCode = 1
})
