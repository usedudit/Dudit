const { Client } = require('pg');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

async function verifyPostMigration() {
  const client = new Client({ connectionString, ssl: false });
  await client.connect();

  try {
    console.log("=== VERIFICAÇÃO PÓS-MIGRATION 1 NO SUPABASE ===");

    // 1. Check RLS on the 3 target tables
    const rlsRes = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename IN ('partner_moderation_actions', 'notification_scheduled_jobs', 'marketplace_metrics_events');
    `);

    console.log("\n1. STATUS DE RLS NAS 3 TABELAS ALVO:");
    rlsRes.rows.forEach(r => {
      console.log(`  - Tabela: ${r.tablename} | RLS Ativo: ${r.rowsecurity}`);
    });

    // 2. Check total tables without RLS in public
    const allRlsRes = await client.query(`
      SELECT count(*) as count_no_rls
      FROM pg_tables 
      WHERE schemaname = 'public' AND rowsecurity = false;
    `);
    console.log(`\nTotal de tabelas públicas sem RLS restantes no banco: ${allRlsRes.rows[0].count_no_rls}`);

    // 3. Check SECURITY DEFINER functions search_path
    const secDefRes = await client.query(`
      SELECT p.proname, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true;
    `);

    let withSearchPath = 0;
    let withoutSearchPath = 0;
    secDefRes.rows.forEach(r => {
      const config = r.proconfig ? r.proconfig.join(', ') : '';
      if (config.includes('search_path')) {
        withSearchPath++;
      } else {
        withoutSearchPath++;
      }
    });

    console.log("\n2. STATUS DAS FUNÇÕES SECURITY DEFINER:");
    console.log(`  - Com search_path definido: ${withSearchPath}`);
    console.log(`  - Sem search_path (restantes): ${withoutSearchPath}`);

  } catch (err) {
    console.error("Erro na verificação:", err.message);
  } finally {
    await client.end();
  }
}

verifyPostMigration();
