const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;

async function applyMigration() {
  if (!connectionString) {
    console.error("ERRO: Nenhuma string de conexão POSTGRES_URL foi encontrada no .env!");
    process.exit(1);
  }

  console.log("Conectando ao banco de dados Supabase...");
  const client = new Client({
    connectionString: connectionString,
    ssl: false
  });

  try {
    await client.connect();
    console.log("Conectado com sucesso ao Supabase!");

    const sqlPath = path.join(__dirname, '..', 'migrations', '20260801_migration1_security_definer_and_rls_hardening.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log("Executando a Migration 1 no banco de dados...");
    const startTime = Date.now();
    await client.query(sqlContent);
    const duration = Date.now() - startTime;

    console.log(`\n✅ MIGRATION 1 APLICADA COM SUCESSO NO BANCO DE DADOS! (${duration}ms)`);
  } catch (err) {
    console.error("\n❌ ERRO AO APLICAR MIGRATION:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
