import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("POSTGRES_URL environment variable is missing.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to database. Executing query...");
    
    const res = await client.query("ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;");
    console.log("Migration executed successfully:", res);
  } catch (error) {
    console.error("Error executing migration:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
