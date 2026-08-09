/**
 * Live, non-persistent policy test harness for the proposed customers RLS.
 *
 * It never commits writes. Each role test runs inside a transaction and is
 * rolled back. It requires a direct Postgres URL because REST/service_role
 * cannot impersonate authenticated users for RLS evaluation.
 *
 * Required for strict mode:
 *   SUPABASE_DB_URL or DATABASE_URL
 *   RLS_TEST_OPERATOR_USER, RLS_TEST_DELIVERY_USER
 *   RLS_TEST_INACTIVE_USER (membership is_active=false)
 *   RLS_TEST_DISABLED_PARTNER_USER (membership belongs to disabled partner)
 *
 * The script discovers active owner/admin/manager users from the database.
 * Set RLS_TEST_STRICT=1 to fail when a required role fixture is missing.
 */

import "dotenv/config"
import pg from "pg"
import { createClient } from "@supabase/supabase-js"

const { Pool } = pg
const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
const strict = process.env.RLS_TEST_STRICT === "1"

if (!databaseUrl) {
  console.error("Missing SUPABASE_DB_URL or DATABASE_URL")
  process.exit(2)
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
})

const failures = []
const skipped = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

function skip(message) {
  skipped.push(message)
}

function expectedFor(role) {
  return {
    baseSelect: ["owner", "admin", "manager"].includes(role),
    safeSelect: ["operator", "delivery"].includes(role),
    insert: ["owner", "admin", "manager", "operator"].includes(role),
    update: ["owner", "admin", "manager", "operator"].includes(role),
    delete: ["owner", "admin", "manager"].includes(role),
  }
}

async function impersonated(userId, callback) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SET LOCAL ROLE authenticated")
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId])
    await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)")
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
    ])
    return await callback(client)
  } finally {
    await client.query("ROLLBACK")
    client.release()
  }
}

async function countFor(client, sql, params = []) {
  const result = await client.query(sql, params)
  return Number(result.rows[0]?.count || 0)
}

async function attempt(client, sql, params = []) {
  try {
    const result = await client.query(sql, params)
    return { rowCount: result.rowCount, error: null }
  } catch (error) {
    return { rowCount: 0, error }
  }
}

async function testRole(client, context, partnerIds, customerIds) {
  const expected = expectedFor(context.role)
  const ownPartner = context.partnerId
  const foreignPartner = partnerIds.find((id) => id !== ownPartner)
  const ownCustomer = customerIds.find((row) => row.partner_id === ownPartner)?.id
  const foreignCustomer = customerIds.find((row) => row.partner_id === foreignPartner)?.id

  check(Boolean(foreignPartner && foreignCustomer), `${context.role}: missing second partner/customer fixture`)
  if (!foreignPartner || !foreignCustomer) return

  const ownVisible = await countFor(client, "SELECT count(*) FROM public.customers WHERE partner_id = $1", [ownPartner])
  const foreignVisible = await countFor(client, "SELECT count(*) FROM public.customers WHERE partner_id = $1", [foreignPartner])
  check(expected.baseSelect ? ownVisible > 0 : ownVisible === 0, `${context.role}: base SELECT expectation failed`)
  check(foreignVisible === 0, `${context.role}: foreign partner rows are visible`)

  if (expected.safeSelect) {
    const view = context.role === "operator" ? "customers_operator_safe" : "customers_delivery_safe"
    const safeVisibleResult = await attempt(client, `SELECT count(*) FROM public.${view} WHERE partner_id = $1`, [ownPartner])
    check(!safeVisibleResult.error, `${context.role}: safe projection is not queryable`)
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [view],
    )
    const exposed = columns.rows.map((row) => row.column_name)
    check(!exposed.some((column) => ["cpf", "cnpj", "notes", "mother_name", "father_name", "deleted_at", "marketplace_user_id"].includes(column)), `${context.role}: safe view exposes PII/internal column`)
  }

  const directMutationExpected = ["owner", "admin", "manager"].includes(context.role)
  const insert = await attempt(client,
    `INSERT INTO public.customers (partner_id, name) VALUES ($1, $2) RETURNING id`,
    [ownPartner, `rls-test-${context.role}`],
  )
  check((insert.rowCount === 1) === (directMutationExpected && expected.insert), `${context.role}: INSERT expectation failed`)

  const update = await attempt(client,
    `UPDATE public.customers SET name = name WHERE id = $1 RETURNING id`,
    [ownCustomer],
  )
  check((update.rowCount === 1) === (directMutationExpected && expected.update), `${context.role}: UPDATE expectation failed`)

  const crossUpdate = await attempt(client,
    `UPDATE public.customers SET name = name WHERE id = $1 RETURNING id`,
    [foreignCustomer],
  )
  check(crossUpdate.rowCount === 0, `${context.role}: cross-tenant UPDATE affected a row`)

  const deleteResult = await attempt(client,
    `DELETE FROM public.customers WHERE id = $1 RETURNING id`,
    [ownCustomer],
  )
  check((deleteResult.rowCount === 1) === (directMutationExpected && expected.delete), `${context.role}: DELETE expectation failed`)

  if (ownCustomer && foreignPartner) {
    let partnerChangeBlocked = false
    try {
      await client.query(`UPDATE public.customers SET partner_id = $1 WHERE id = $2`, [foreignPartner, ownCustomer])
    } catch {
      partnerChangeBlocked = true
    }
    check(partnerChangeBlocked, `${context.role}: partner_id change was not rejected`)
  }
}

async function main() {
  const admin = await pool.connect()
  let partnerIds
  let customerIds
  let roleContexts
  try {
    const partners = await admin.query(
      `SELECT id, user_id FROM public.partners WHERE is_active IS TRUE AND COALESCE(erp_disabled, false) IS FALSE ORDER BY id LIMIT 2`,
    )
    partnerIds = partners.rows.map((row) => row.id)
    check(partnerIds.length === 2, "Need two active partner fixtures")

    const customers = await admin.query(
      `SELECT id, partner_id FROM public.customers WHERE partner_id = ANY($1::uuid[]) ORDER BY partner_id, created_at LIMIT 20`,
      [partnerIds],
    )
    customerIds = customers.rows

    const memberships = await admin.query(
      `SELECT pu.user_id, pu.partner_id, pu.role_id
         FROM public.partner_users pu
         JOIN public.partners p ON p.id = pu.partner_id
        WHERE pu.is_active IS TRUE
          AND p.is_active IS TRUE
          AND COALESCE(p.erp_disabled, false) IS FALSE
          AND pu.role_id IN ('owner', 'admin', 'manager')
        ORDER BY pu.role_id, pu.created_at`,
    )
    roleContexts = memberships.rows.map((row) => ({
      userId: row.user_id,
      partnerId: row.partner_id,
      role: row.role_id,
    }))
  } finally {
    admin.release()
  }

  for (const role of ["owner", "admin", "manager"]) {
    const context = roleContexts.find((row) => row.role === role)
    if (!context) {
      skip(`No active ${role} fixture found`)
      continue
    }
    await impersonated(context.userId, (client) => testRole(client, context, partnerIds, customerIds))
  }

  for (const role of ["operator", "delivery"]) {
    const userId = process.env[`RLS_TEST_${role.toUpperCase()}_USER`]
    const partnerId = process.env[`RLS_TEST_${role.toUpperCase()}_PARTNER`]
    if (!userId || !partnerId) {
      skip(`Set RLS_TEST_${role.toUpperCase()}_USER and RLS_TEST_${role.toUpperCase()}_PARTNER`)
      continue
    }
    await impersonated(userId, (client) => testRole(client, { userId, partnerId, role }, partnerIds, customerIds))
  }

  for (const [label, variable] of [["inactive membership", "RLS_TEST_INACTIVE_USER"], ["disabled partner", "RLS_TEST_DISABLED_PARTNER_USER"]]) {
    const userId = process.env[variable]
    if (!userId) {
      skip(`Set ${variable}`)
      continue
    }
    await impersonated(userId, async (client) => {
      const visible = await countFor(client, "SELECT count(*) FROM public.customers")
      check(visible === 0, `${label}: inactive/disabled context can still see customers`)
    })
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { count, error } = await anon.from("customers").select("id", { count: "exact", head: true })
    check(!error, `anon query failed: ${error?.message || "unknown error"}`)
    check((count || 0) === 0, `anon can see ${count || 0} customer rows`)
  } else {
    skip("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for anon test")
  }

  if (skipped.length) console.warn("Skipped fixtures:\n- " + skipped.join("\n- "))
  if (failures.length) {
    console.error("RLS failures:\n- " + failures.join("\n- "))
    process.exitCode = 1
  } else if (strict && skipped.length) {
    console.error("Strict mode failed because required fixtures were skipped")
    process.exitCode = 2
  } else {
    console.log("customers RLS audit completed without failures")
  }
}

main().finally(() => pool.end())
