/**
 * Script: apply-1000-migration.mjs
 *
 * 1. Aplica migration DDL (ALTER TABLE + INDEXES)
 * 2. Executa backfill idempotente em 3 steps
 * 3. Gera relatório final
 *
 * Uso: node migrations/apply-1000-migration.mjs
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgres://postgres.qxuqjkpzargimmbyodnx:MhKkdJ9TkD57PAim@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
  max: 1,
  ssl: { rejectUnauthorized: false },
});

const supabase = createClient(
  'https://qxuqjkpzargimmbyodnx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dXFqa3B6YXJnaW1tYnlvZG54Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg0MjYzNiwiZXhwIjoyMDkzNDE4NjM2fQ.rKiPrGDiDozUh7OxR3XH-cpzAQfM1E_hZY-BLsMDxbc'
);

async function query(text) {
  const client = await pool.connect();
  try {
    const result = await client.query(text);
    return result;
  } finally {
    client.release();
  }
}

async function step1_ddl() {
  console.log('\n=== STEP 1: DDL ===');
  console.log('Adding column customer_id to orders...');
  await query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
  `);
  console.log('  ✅ customer_id column added');

  console.log('Creating index idx_orders_customer_id...');
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);`);
  console.log('  ✅ Index created');

  console.log('Creating composite index idx_orders_partner_customer...');
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_partner_customer ON orders(partner_id, customer_id);`);
  console.log('  ✅ Composite index created');
}

async function step2_backfill() {
  console.log('\n=== STEP 2: BACKFILL ===');

  // Before counts
  const { rows: before } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE buyer_id IS NOT NULL AND customer_id IS NULL) AS pending_backfill,
      COUNT(*) FILTER (WHERE buyer_id IS NOT NULL AND customer_id IS NOT NULL) AS already_filled,
      COUNT(*) FILTER (WHERE buyer_id IS NULL) AS no_buyer_id
    FROM orders;
  `);
  console.log(`  Before: ${before[0].pending_backfill} pending, ${before[0].already_filled} already filled, ${before[0].no_buyer_id} without buyer_id`);

  // Step 2A: Vitrine Online orders — match by customers.user_id
  const r2a = await query(`
    UPDATE orders o
    SET customer_id = c.id
    FROM customers c
    WHERE o.customer_id IS NULL
      AND c.user_id IS NOT NULL
      AND c.user_id = o.buyer_id;
  `);
  console.log(`  Step 2A (Vitrine → user_id match): ${r2a.rowCount} orders updated`);

  // Step 2B: ERP orders — buyer_id IS customers.id
  const r2b = await query(`
    UPDATE orders o
    SET customer_id = o.buyer_id
    WHERE o.customer_id IS NULL
      AND o.buyer_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM customers c WHERE c.id = o.buyer_id);
  `);
  console.log(`  Step 2B (ERP → customers.id match): ${r2b.rowCount} orders updated`);

  // Step 2C: Remaining Vitrine Online — match by email via auth.users lookup
  const r2c = await query(`
    WITH unmatched AS (
      SELECT o.id AS order_id, o.buyer_id
      FROM orders o
      WHERE o.customer_id IS NULL AND o.buyer_id IS NOT NULL
    ),
    auth_emails AS (
      SELECT u.id AS auth_id, u.raw_user_meta_data->>'email' AS email
      FROM auth.users u
      WHERE u.id IN (SELECT buyer_id FROM unmatched)
    ),
    customer_by_email AS (
      SELECT c.id AS cust_id, c.email
      FROM customers c
      WHERE c.email IS NOT NULL
    )
    UPDATE orders o
    SET customer_id = cbe.cust_id
    FROM unmatched u
    JOIN auth_emails ae ON ae.auth_id = u.buyer_id
    JOIN customer_by_email cbe ON cbe.email = ae.email
    WHERE o.id = u.order_id AND o.customer_id IS NULL;
  `);
  console.log(`  Step 2C (email match via auth.users): ${r2c.rowCount} orders updated`);

  // After counts
  const { rows: after } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE buyer_id IS NOT NULL AND customer_id IS NULL) AS still_pending,
      COUNT(*) FILTER (WHERE buyer_id IS NOT NULL AND customer_id IS NOT NULL) AS filled,
      COUNT(*) FILTER (WHERE buyer_id IS NULL) AS no_buyer_id,
      COUNT(*) AS total
    FROM orders;
  `);
  console.log(`\n  After: ${after[0].filled} filled, ${after[0].still_pending} still pending, ${after[0].no_buyer_id} without buyer_id`);

  return { before: before[0], after: after[0], r2a: r2a.rowCount, r2b: r2b.rowCount, r2c: r2c.rowCount };
}

async function step3_report(stats) {
  console.log('\n=== STEP 3: RELATORIO FINAL ===');
  console.log('========================================');
  console.log('MIGRATION 1000 — add_customer_id_to_orders');
  console.log('========================================');
  console.log('');
  console.log(`Total de orders:              ${stats.after.total}`);
  console.log(`Com buyer_id:                 ${Number(stats.after.filled) + Number(stats.after.still_pending)}`);
  console.log(`Sem buyer_id:                 ${stats.after.no_buyer_id}`);
  console.log('');
  console.log('--- BACKFILL ---');
  console.log(`Step 2A (user_id match):      ${stats.r2a} orders`);
  console.log(`Step 2B (customers.id match): ${stats.r2b} orders`);
  console.log(`Step 2C (email match):        ${stats.r2c} orders`);
  console.log(`Total preenchidos:            ${Number(stats.r2a) + Number(stats.r2b) + Number(stats.r2c)}`);
  console.log(`Ainda sem customer_id:        ${stats.after.still_pending}`);
  console.log('');

  if (Number(stats.after.still_pending) > 0) {
    const { rows: pending } = await query(`
      SELECT o.order_number, o.buyer_id, o.customer_name, o.order_source, o.created_at
      FROM orders o
      WHERE o.customer_id IS NULL AND o.buyer_id IS NOT NULL
      ORDER BY o.created_at DESC;
    `);
    console.log('--- Orders que ficaram sem customer_id ---');
    for (const p of pending) {
      console.log(`  #${p.order_number || '?'} | buyer_id=${p.buyer_id} | name="${p.customer_name}" | src=${p.order_source} | ${p.created_at}`);
    }
    console.log('');
    console.log('Motivo: buyer_id nao existe em customers.id nem customers.user_id,');
    console.log('e o email do auth.user nao corresponde a nenhum customer existente.');
    console.log('Provavelmente sao customers que foram deletados manualmente da tabela customers.');
  }

  console.log('========================================');
  console.log('MIGRATION CONCLUIDA');
  console.log('========================================');
}

async function verify_structure() {
  console.log('\n=== VERIFICACAO DA ESTRUTURA ===');
  const { rows } = await query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'customer_id';
  `);
  if (rows.length > 0) {
    console.log(`  ✅ customer_id (${rows[0].data_type}, nullable=${rows[0].is_nullable})`);
  } else {
    console.log('  ❌ customer_id column NOT FOUND');
  }

  const { rows: indexes } = await query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'orders' AND indexname LIKE '%customer%';
  `);
  for (const idx of indexes) {
    console.log(`  ✅ ${idx.indexname}`);
  }
}

async function main() {
  try {
    const startTime = Date.now();

    await step1_ddl();
    await verify_structure();
    const stats = await step2_backfill();
    await step3_report(stats);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nTempo total: ${elapsed}s`);

    await pool.end();
  } catch (err) {
    console.error('ERRO:', err);
    await pool.end();
    process.exit(1);
  }
}

main();
