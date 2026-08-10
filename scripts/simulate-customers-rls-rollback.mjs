/**
 * Applies the proposed customers RLS migration inside one PostgreSQL
 * transaction, creates only transactional role fixtures, exercises the policy
 * matrix, and rolls everything back. Nothing is persisted.
 */

import "dotenv/config"
import fs from "node:fs/promises"
import pg from "pg"

const { Client } = pg
const rawUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL

if (!rawUrl) {
  console.error("Missing POSTGRES_URL_NON_POOLING or POSTGRES_URL")
  process.exit(2)
}

const dbUrl = new URL(rawUrl)
dbUrl.searchParams.delete("sslmode")

const client = new Client({
  connectionString: dbUrl.toString(),
  ssl: { rejectUnauthorized: false },
})

const failures = []
const results = []
let initialProposedViewCount = 0

function check(name, actual, expected) {
  const pass = actual === expected
  results.push({ name, pass, actual, expected })
  if (!pass) failures.push(`${name}: expected ${String(expected)}, got ${String(actual)}`)
}

async function setAuthenticated(userId) {
  await client.query("RESET ROLE")
  await client.query("SET LOCAL ROLE authenticated")
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId])
  await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)")
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
  ])
}

async function count(sql, params = []) {
  const result = await client.query(sql, params)
  return Number(result.rows[0]?.count || 0)
}

async function dml(sql, params = []) {
  const savepoint = `dml_${Math.random().toString(36).slice(2, 10)}`
  await client.query(`SAVEPOINT ${savepoint}`)
  try {
    const result = await client.query(sql, params)
    await client.query(`RELEASE SAVEPOINT ${savepoint}`)
    return { rowCount: result.rowCount, rows: result.rows, error: null }
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    await client.query(`RELEASE SAVEPOINT ${savepoint}`)
    return { rowCount: 0, rows: [], error }
  }
}

async function main() {
  await client.connect()
  const initialViews = await client.query(
    `SELECT count(*)::int AS view_count
       FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name IN ('customers_operator_safe', 'customers_delivery_safe')`,
  )
  initialProposedViewCount = initialViews.rows[0].view_count
  await client.query("BEGIN")
  await client.query("SET LOCAL statement_timeout = '45s'")

  try {
    const partners = await client.query(
      `SELECT p.id, p.user_id, count(c.id)::int AS customer_count
         FROM public.partners p
         JOIN public.customers c ON c.partner_id = p.id
        WHERE p.is_active IS TRUE
          AND COALESCE(p.erp_disabled, false) IS FALSE
        GROUP BY p.id, p.user_id
        ORDER BY customer_count DESC, p.id
        LIMIT 2`,
    )
    const disabledPartner = await client.query(
      `SELECT p.id, p.user_id
         FROM public.partners p
        WHERE p.is_active IS TRUE
          AND COALESCE(p.erp_disabled, false) IS FALSE
          AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.partner_id = p.id)
        ORDER BY p.id
        LIMIT 1`,
    )
    if (partners.rows.length < 2 || disabledPartner.rows.length < 1) throw new Error("Need two active partners with customers and one active partner fixture")
    const [partnerA, partnerB] = partners.rows
    const partnerC = disabledPartner.rows[0]

    const customers = await client.query(
      `SELECT id, partner_id
         FROM public.customers
        WHERE partner_id IN ($1, $2)
        ORDER BY partner_id, created_at
        LIMIT 20`,
      [partnerA.id, partnerB.id],
    )
    const ownCustomer = customers.rows.find((row) => row.partner_id === partnerA.id)
    const foreignCustomer = customers.rows.find((row) => row.partner_id === partnerB.id)
    if (!ownCustomer || !foreignCustomer) throw new Error("Need customer rows in two partners")

    const authUsers = await client.query(`SELECT id FROM auth.users ORDER BY created_at, id`)
    const existingMemberships = await client.query(`SELECT user_id FROM public.partner_users`)
    const occupied = new Set(existingMemberships.rows.map((row) => row.user_id))
    const freeUsers = authUsers.rows.map((row) => row.id).filter((id) => !occupied.has(id))
    if (freeUsers.length < 4) throw new Error("Need four auth.users without partner_users rows for role fixtures")

    const roleFixtures = ["admin", "manager", "operator", "delivery"].map((role, index) => ({
      role,
      userId: freeUsers[index],
      partnerId: partnerA.id,
    }))

    for (const fixture of roleFixtures) {
      await client.query(
        `INSERT INTO public.partner_users
          (partner_id, user_id, role, role_id, permissions, created_by_user_id, is_active)
         VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, true)`,
        [fixture.partnerId, fixture.userId, fixture.role.toUpperCase(), fixture.role, partnerA.user_id],
      )
    }

    const inactiveUser = roleFixtures[2].userId
    await client.query(
      `INSERT INTO public.partner_users
        (partner_id, user_id, role, role_id, permissions, created_by_user_id, is_active)
       VALUES ($1, $2, 'OPERATOR', 'operator', '{}'::jsonb, $3, false)`,
      [partnerB.id, inactiveUser, partnerA.user_id],
    )

    const disabledUser = roleFixtures[3].userId
    await client.query(
      `INSERT INTO public.partner_users
        (partner_id, user_id, role, role_id, permissions, created_by_user_id, is_active)
       VALUES ($1, $2, 'DELIVERY', 'delivery', '{}'::jsonb, $3, true)`,
      [partnerC.id, disabledUser, partnerA.user_id],
    )
    await client.query(`UPDATE public.partners SET is_active = false WHERE id = $1`, [partnerC.id])

    // The live database may already contain the proposed migration. Remove
    // only its objects inside this transaction so the same rollback harness
    // can validate both pre-apply and post-apply states. The final ROLLBACK
    // restores the live schema unchanged.
    await client.query(`
      DROP POLICY IF EXISTS customers_select_privileged ON public.customers;
      DROP POLICY IF EXISTS customers_insert_rbac ON public.customers;
      DROP POLICY IF EXISTS customers_update_rbac ON public.customers;
      DROP POLICY IF EXISTS customers_delete_rbac ON public.customers;
      DROP VIEW IF EXISTS public.customers_operator_safe;
      DROP VIEW IF EXISTS public.customers_delivery_safe;
    `)

    let migration = await fs.readFile("migrations/20260807_proposed_customers_rbac_rls.sql", "utf8")
    migration = migration.replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "")
    await client.query(migration)

    const ownerContext = { role: "owner", userId: partnerA.user_id }
    const contexts = [ownerContext, ...roleFixtures]

    for (const context of contexts) {
      await setAuthenticated(context.userId)
      const baseVisible = await count(`SELECT count(*) FROM public.customers WHERE partner_id = $1`, [partnerA.id])
      const foreignVisible = await count(`SELECT count(*) FROM public.customers WHERE partner_id = $1`, [partnerB.id])
      const baseExpected = ["owner", "admin", "manager"].includes(context.role)
      check(`${context.role} own base SELECT`, baseVisible > 0, baseExpected)
      check(`${context.role} foreign base SELECT`, foreignVisible, 0)

      if (context.role === "operator") {
        check("operator safe view SELECT", await count(`SELECT count(*) FROM public.customers_operator_safe WHERE partner_id = $1`, [partnerA.id]) > 0, true)
        check("operator safe view cross-tenant", await count(`SELECT count(*) FROM public.customers_operator_safe WHERE partner_id = $1`, [partnerB.id]), 0)
      }
      if (context.role === "delivery") {
        check("delivery safe view SELECT", await count(`SELECT count(*) FROM public.customers_delivery_safe WHERE partner_id = $1`, [partnerA.id]) > 0, true)
        check("delivery safe view cross-tenant", await count(`SELECT count(*) FROM public.customers_delivery_safe WHERE partner_id = $1`, [partnerB.id]), 0)
      }

      const directInsert = context.role === "operator"
        ? await dml(`INSERT INTO public.customers (partner_id, name) VALUES ($1, $2)`, [partnerA.id, `rls-sim-${context.role}`])
        : await dml(`INSERT INTO public.customers (partner_id, name) VALUES ($1, $2) RETURNING id`, [partnerA.id, `rls-sim-${context.role}`])
      check(`${context.role} INSERT`, directInsert.rowCount === 1, ["owner", "admin", "manager", "operator"].includes(context.role))

      const mutationCustomerId = directInsert.rows?.[0]?.id || ownCustomer.id
      const directUpdate = await dml(`UPDATE public.customers SET name = name WHERE id = $1`, [mutationCustomerId])
      check(`${context.role} UPDATE`, directUpdate.rowCount === 1, ["owner", "admin", "manager"].includes(context.role))

      const crossUpdate = await dml(`UPDATE public.customers SET name = name WHERE id = $1`, [foreignCustomer.id])
      check(`${context.role} cross-tenant UPDATE`, crossUpdate.rowCount, 0)

      const directDelete = await dml(`DELETE FROM public.customers WHERE id = $1`, [mutationCustomerId])
      check(`${context.role} DELETE`, directDelete.rowCount === 1, ["owner", "admin", "manager"].includes(context.role))

      const partnerChange = await dml(`UPDATE public.customers SET partner_id = $1 WHERE id = $2`, [partnerB.id, mutationCustomerId])
      check(`${context.role} partner_id change blocked`, partnerChange.rowCount, 0)
    }

    await setAuthenticated(roleFixtures[2].userId)
    check("inactive membership safe view blocked", await count(`SELECT count(*) FROM public.customers_operator_safe WHERE partner_id = $1`, [partnerB.id]), 0)

    await setAuthenticated(disabledUser)
    check("disabled partner safe view blocked", await count(`SELECT count(*) FROM public.customers_delivery_safe WHERE partner_id = $1`, [partnerC.id]), 0)

    const viewColumns = await client.query(
      `SELECT table_name, array_agg(column_name ORDER BY ordinal_position) AS columns
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('customers_operator_safe', 'customers_delivery_safe')
        GROUP BY table_name
        ORDER BY table_name`,
    )
    const columnsByView = Object.fromEntries(viewColumns.rows.map((row) => [row.table_name, row.columns]))
    check("operator view excludes internal PII columns", !columnsByView.customers_operator_safe.includes("cpf") && !columnsByView.customers_operator_safe.includes("cnpj") && !columnsByView.customers_operator_safe.includes("deleted_at"), true)
    check("delivery view excludes internal PII columns", !columnsByView.customers_delivery_safe.includes("cpf") && !columnsByView.customers_delivery_safe.includes("cnpj") && !columnsByView.customers_delivery_safe.includes("deleted_at"), true)

    const viewOptions = await client.query(
      `SELECT relname, reloptions
         FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname IN ('customers_operator_safe', 'customers_delivery_safe')
        ORDER BY relname`,
    )
    results.push({ name: "view options", pass: true, actual: viewOptions.rows })

    const grantChecks = await client.query(
      `SELECT
         has_table_privilege('anon', 'public.customers', 'SELECT') AS anon_select,
         has_table_privilege('authenticated', 'public.customers', 'TRUNCATE') AS auth_truncate,
         has_table_privilege('authenticated', 'public.customers', 'REFERENCES') AS auth_references,
         has_table_privilege('authenticated', 'public.customers', 'TRIGGER') AS auth_trigger,
         has_table_privilege('service_role', 'public.customers', 'SELECT') AS service_select`,
    )
    const grants = grantChecks.rows[0]
    check("anon SELECT grant removed", grants.anon_select, false)
    check("authenticated TRUNCATE grant removed", grants.auth_truncate, false)
    check("authenticated REFERENCES grant removed", grants.auth_references, false)
    check("authenticated TRIGGER grant removed", grants.auth_trigger, false)
    check("service_role SELECT preserved", grants.service_select, true)

    await client.query("ROLLBACK")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

main()
  .then(async () => {
    const verification = await client.query(
      `SELECT count(*)::int AS view_count
         FROM information_schema.views
        WHERE table_schema = 'public'
          AND table_name IN ('customers_operator_safe', 'customers_delivery_safe')`,
    )
    results.push({ name: "rollback restored proposed views state", pass: verification.rows[0].view_count === initialProposedViewCount, actual: verification.rows[0].view_count, expected: initialProposedViewCount })
    if (verification.rows[0].view_count !== initialProposedViewCount) failures.push("rollback did not restore proposed views state")
  })
  .then(() => {
    console.log(JSON.stringify({ failures, results }, null, 2))
    process.exitCode = failures.length ? 1 : 0
  })
  .catch((error) => {
    console.error(error.stack || error.message)
    process.exitCode = 2
  })
  .finally(() => client.end())
