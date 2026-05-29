/**
 * Railway cron worker: chama o endpoint de processamento WhatsApp e encerra.
 *
 * Use em um serviço SEPARADO do Next.js:
 * - Start Command: node scripts/whatsapp-cron.mjs
 * - Cron Schedule: */5 * * * *
 * - Variáveis: CRON_SECRET, APP_URL (ou NEXT_PUBLIC_APP_URL)
 */

const secret = process.env.CRON_SECRET
const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")

if (!secret) {
  console.error("[whatsapp-cron] CRON_SECRET não definido")
  process.exit(1)
}

if (!baseUrl) {
  console.error("[whatsapp-cron] APP_URL ou NEXT_PUBLIC_APP_URL não definido")
  process.exit(1)
}

const url = `${baseUrl}/api/cron/whatsapp-process`

try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.text()
  console.log(`[whatsapp-cron] ${res.status}`, body)
  process.exit(res.ok ? 0 : 1)
} catch (err) {
  console.error("[whatsapp-cron] falhou:", err)
  process.exit(1)
}
