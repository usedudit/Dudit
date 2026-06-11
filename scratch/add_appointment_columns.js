process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve('.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const envVars = {}
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    let key = match[1]
    let value = match[2] || ''
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1)
    }
    envVars[key] = value
  }
}

const connectionString = envVars.POSTGRES_URL || envVars.POSTGRES_URL_NON_POOLING

if (!connectionString) {
  console.error("No connection string found.")
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString,
})

async function run() {
  const client = await pool.connect()
  try {
    console.log("Running migration...")
    await client.query(`
      ALTER TABLE public.appointments 
        ADD COLUMN IF NOT EXISTS service_id UUID NULL REFERENCES public.services(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS category_id UUID NULL REFERENCES public.service_categories(id) ON DELETE SET NULL;
    `)
    console.log("Migration successful!")
  } catch (err) {
    console.error("Migration failed:", err)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
