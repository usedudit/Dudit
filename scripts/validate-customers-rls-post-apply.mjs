import "dotenv/config"
import pg from "pg"

const { Client } = pg
const rawUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!rawUrl) throw new Error("Missing POSTGRES_URL_NON_POOLING or POSTGRES_URL")

const dbUrl = new URL(rawUrl)
dbUrl.searchParams.delete("sslmode")
const client = new Client({
  connectionString: dbUrl.toString(),
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  const query = async (sql) => (await client.query(sql)).rows
  const policyRows = await query(`
    SELECT policyname, roles, cmd, permissive
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customers'
    ORDER BY policyname
  `)
  const grantRows = await query(`
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND grantee IN ('anon', 'authenticated', 'service_role')
    ORDER BY grantee, privilege_type
  `)
  const securityRows = await query(`
    SELECT c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'customers'
  `)
  const viewRows = await query(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name IN ('customers_operator_safe', 'customers_delivery_safe')
    ORDER BY table_name
  `)
  const triggerRows = await query(`
    SELECT t.tgname, pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'customers'
      AND NOT t.tgisinternal
    ORDER BY t.tgname
  `)
  const functionRows = await query(`
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS arguments,
           p.prosecdef,
           p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('customers_has_rbac_access', 'prevent_customer_partner_change')
    ORDER BY p.proname
  `)

  const policyNames = policyRows.map((row) => row.policyname)
  const grantSet = new Set(grantRows.map((row) => `${row.grantee}:${row.privilege_type}`))
  const expectedPolicies = [
    "customers_delete_rbac",
    "customers_insert_rbac",
    "customers_select_privileged",
    "customers_update_rbac",
  ]
  const failures = []
  for (const name of expectedPolicies) {
    if (!policyNames.includes(name)) failures.push(`missing policy ${name}`)
  }
  if (policyRows.length !== expectedPolicies.length) failures.push(`unexpected policy count ${policyRows.length}`)
  if (securityRows[0]?.relrowsecurity !== true || securityRows[0]?.relforcerowsecurity !== true) failures.push("customers RLS/FORCE RLS not enabled")
  if (grantSet.has("anon:SELECT")) failures.push("anon SELECT still granted")
  for (const privilege of ["TRUNCATE", "REFERENCES", "TRIGGER"]) {
    if (grantSet.has(`authenticated:${privilege}`)) failures.push(`authenticated ${privilege} still granted`)
  }
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
    if (!grantSet.has(`authenticated:${privilege}`)) failures.push(`authenticated ${privilege} missing`)
    if (!grantSet.has(`service_role:${privilege}`)) failures.push(`service_role ${privilege} missing`)
  }
  for (const name of ["customers_operator_safe", "customers_delivery_safe"]) {
    if (!viewRows.some((row) => row.table_name === name)) failures.push(`missing view ${name}`)
  }
  if (!triggerRows.some((row) => row.tgname === "customers_partner_id_immutable")) failures.push("missing immutable partner trigger")
  if (!functionRows.some((row) => row.proname === "customers_has_rbac_access" && row.prosecdef)) failures.push("missing SECURITY DEFINER RBAC helper")
  if (!functionRows.some((row) => row.proname === "prevent_customer_partner_change" && row.prosecdef)) failures.push("missing SECURITY DEFINER immutable trigger function")

  console.log(JSON.stringify({
    failures,
    policyNames,
    grants: grantRows,
    security: securityRows,
    views: viewRows,
    triggers: triggerRows,
    functions: functionRows,
  }, null, 2))
  if (failures.length > 0) process.exitCode = 1
} finally {
  await client.end()
}
