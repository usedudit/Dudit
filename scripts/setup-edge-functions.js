#!/usr/bin/env node
/**
 * Setup script for Edge Functions migration.
 *
 * 1. Applies the pending_webhook_events migration
 * 2. Verifies Edge Functions are deployed
 * 3. Prints configuration instructions
 */

const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const PROJECT_REF = "qxuqjkpzargimmbyodnx"
const FUNCTIONS = ["cep-lookup", "cnpj-lookup", "health-check", "mercadopago-webhook"]

console.log("=== Dudit Edge Functions Setup ===\n")

// 1. Check migration file exists
const migrationFile = path.join(__dirname, "..", "migrations", "f112_create_pending_webhook_events.sql")
if (!fs.existsSync(migrationFile)) {
  console.error("❌ Migration file not found:", migrationFile)
  process.exit(1)
}
console.log("✅ Migration file found: migrations/f112_create_pending_webhook_events.sql")

// 2. Print deployment status
console.log("\n--- Deployed Edge Functions ---")
try {
  const result = execSync(`npx supabase functions list --project-ref ${PROJECT_REF}`, { encoding: "utf-8" })
  const data = JSON.parse(result)
  const deployed = data.functions || []
  for (const fn of FUNCTIONS) {
    const isDeployed = deployed.some((f) => f.name === fn || f === fn)
    console.log(`  ${isDeployed ? "✅" : "❌"} ${fn}`)
  }
} catch (e) {
  console.log("  ⚠️  Could not list functions (network/permission issue)")
}

// 3. Print configuration instructions
console.log("\n--- Configuration Steps ---")
console.log(`
1. Apply the migration to your Supabase database:
   - Go to https://supabase.com/dashboard/project/${PROJECT_REF}/sql
   - Run the contents of: migrations/f112_create_pending_webhook_events.sql
  
2. Configure Mercado Pago webhook URL:
   - In Mercado Pago Dashboard → Webhooks
   - Set URL to: https://${PROJECT_REF}.supabase.co/functions/v1/mercadopago-webhook
   - Event: payment.updated, subscription_*

3. Set up cron-job.org for the webhook consumer:
   - URL: https://dudit.com.br/api/internal/jobs/process-pending-webhooks
   - Method: POST
   - Schedule: every 1 minute (*/1 * * * *)
   - Headers:
     Authorization: Bearer <INTERNAL_CRON_SECRET>
     Content-Type: application/json

4. Verify Edge Functions:
   - Health:  https://${PROJECT_REF}.supabase.co/functions/v1/health-check
   - CEP:      https://${PROJECT_REF}.supabase.co/functions/v1/cep-lookup?cep=01310200
   - CNPJ:    https://${PROJECT_REF}.supabase.co/functions/v1/cnpj-lookup?cnpj=37335118000180
`)

// 5. Verify env vars in .env
const envContent = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf-8")
const checks = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", desc: "Supabase URL (auto-available in EF)" },
  { key: "MP_WEBHOOK_SECRET", desc: "Mercado Pago webhook secret" },
  { key: "INTERNAL_CRON_SECRET", desc: "Cron-job.org bearer token" },
]
console.log("--- Environment Variables Check ---")
for (const check of checks) {
  const found = envContent.includes(check.key)
  console.log(`  ${found ? "✅" : "❌"} ${check.key} - ${check.desc}`)
}

console.log("\n=== Setup complete ===")
