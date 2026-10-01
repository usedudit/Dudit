// Sonda leitura: o que a API SuperFrete retorna sobre DC-e/DACE numa etiqueta real.
// Uso: node scripts/tmp-dce-probe.mjs [--id=<external_label_id>]
import { readFileSync } from "node:fs"
import { createHash, hkdfSync, createDecipheriv } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
try {
  const envText = readFileSync(path.join(ROOT, ".env"), "utf8")
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let value = m[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = value
  }
} catch {}

const args = process.argv.slice(2)
const hit = args.find((a) => a.startsWith("--id="))
const LABEL_ID = hit ? hit.slice(5) : null
const PARTNER_ID = "e83fba88-58d0-42f2-84dd-3177d19531f3"

const HKDF_SALT = createHash("sha256").update("dudit-crypto-service-hkdf-salt-v1").digest()
function decryptSuperfrete(encrypted) {
  const colon = encrypted.indexOf(":")
  const version = encrypted.slice(0, colon)
  const masterKey = Buffer.from(process.env[`MASTER_KEY_${version.toUpperCase()}`], "base64")
  const key = Buffer.from(hkdfSync("sha256", masterKey, HKDF_SALT, "superfrete-token-encryption", 32))
  const packed = Buffer.from(encrypted.slice(colon + 1), "base64")
  const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12), { authTagLength: 16 })
  decipher.setAuthTag(packed.subarray(12, 28))
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8")
}

async function main() {
  const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
  const url = new URL(raw)
  url.searchParams.delete("sslmode")
  const pgMod = await import("pg")
  const { Client } = pgMod.default ?? pgMod
  const db = new Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()

  try {
    const integ = (
      await db.query(
        `SELECT * FROM partner_integrations WHERE partner_id = $1 AND provider_slug = 'superfrete'`,
        [PARTNER_ID],
      )
    ).rows[0]
    const safe = { ...integ }
    for (const k of Object.keys(safe))
      if (/encrypted|secret|token/i.test(k)) delete safe[k]
    console.log("integração:", safe)
    if (!integ?.access_token_encrypted) return

    let labelId = LABEL_ID
    if (!labelId) {
      const s = (
        await db.query(
          `SELECT external_label_id, kind, status, tracking_number, created_at FROM order_shipments
           WHERE partner_id = $1 AND provider_slug = 'superfrete' AND external_label_id IS NOT NULL
           ORDER BY created_at DESC LIMIT 1`,
          [PARTNER_ID],
        )
      ).rows[0]
      labelId = s?.external_label_id
      console.log("label alvo (mais recente):", s)
    }
    if (!labelId) {
      console.error("nenhuma etiqueta encontrada")
      process.exitCode = 1
      return
    }

    const cfgEnv = String((integ.config && integ.config.environment) || integ.environment || "")
    const base = /production|prod/i.test(cfgEnv) ? "https://api.superfrete.com" : "https://sandbox.superfrete.com"
    console.log(`base URL: ${base} (environment=${cfgEnv || "?"})`)
    const token = decryptSuperfrete(integ.access_token_encrypted)
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "Dudit (integracao@dudit.com.br)",
    }

    const args2 = process.argv.slice(2)
    if (args2.includes("--all")) {
      const { rows: ships } = await db.query(
        `SELECT external_label_id, kind, status, paid_at, payload->>'payment_simulated' AS simulated, created_at
         FROM order_shipments WHERE partner_id = $1 AND provider_slug = 'superfrete'
           AND external_label_id IS NOT NULL
         ORDER BY created_at DESC LIMIT 12`,
        [PARTNER_ID],
      )
      console.log("remessas locais:")
      for (const s of ships) console.log(" ", s)
      for (const s of ships) {
        const r = await fetch(`${base}/api/v0/order/info/${s.external_label_id}`, { headers })
        if (!r.ok) { console.log(`  ${s.external_label_id}: HTTP ${r.status}`); continue }
        const j = await r.json()
        const keys = Object.keys(j)
        const dceKeys = keys.filter((k) => /dce|dace|declar|content|document/i.test(k))
        console.log(
          `  ${s.external_label_id}: sf_status=${j.status} generated_at=${j.generated_at || "-"} ` +
            `dce_keys=[${dceKeys.join(",")}] invoice=${JSON.stringify(j.invoice)} products=${(j.products || []).length}`,
        )
        for (const k of dceKeys) console.log(`      ${k}: ${JSON.stringify(j[k])}`)
      }
      return
    }

    const infoRes = await fetch(`${base}/api/v0/order/info/${labelId}`, { headers })
    console.log(`\nGET /api/v0/order/info/${labelId} -> HTTP ${infoRes.status}`)
    const infoText = await infoRes.text()
    try {
      console.log(JSON.stringify(JSON.parse(infoText), null, 2))
    } catch {
      console.log(infoText.slice(0, 2000))
    }

    const printRes = await fetch(`${base}/api/v0/tag/print`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ orders: [labelId] }),
    })
    console.log(`\nPOST /api/v0/tag/print -> HTTP ${printRes.status}`)
    const printText = await printRes.text()
    let printUrl = null
    try {
      const parsed = JSON.parse(printText)
      printUrl = parsed.url || null
      console.log(JSON.stringify(parsed, null, 2))
    } catch {
      console.log(printText.slice(0, 1000))
    }

    if (printUrl) {
      try {
        const pdfRes = await fetch(printUrl, { redirect: "follow", signal: AbortSignal.timeout(15000) })
        console.log(`\nPDF print -> HTTP ${pdfRes.status} ${pdfRes.headers.get("content-type") || ""}`)
        const buf = Buffer.from(await pdfRes.arrayBuffer())
        console.log(`PDF bytes: ${buf.length}`)
        if (pdfRes.ok) {
          const tmpOut = path.join(ROOT, "scripts", "tmp-label-probe.pdf")
          const { writeFileSync } = await import("node:fs")
          writeFileSync(tmpOut, buf)
          console.log(`salvo em ${tmpOut} (checar se contém DACE)`)
          const text = buf.toString("latin1")
          const hasDace = /DACE|DACE-|DECLARA[ÇC][ÃA]O DE CONTE[ÚU]DO/i.test(text)
          console.log(`texto com DACE/declaração: ${hasDace}`)
        }
      } catch (e) {
        console.log(`\nPDF fetch falhou: ${e.message}`)
      }
    }
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error("Falha:", e.message)
  process.exitCode = 1
})
