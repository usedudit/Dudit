process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    console.error(".env not found at", envPath);
    process.exit(1);
}

// Load env vars
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
        let val = match[2] || '';
        if (val.trim().startsWith('"') && val.trim().endsWith('"')) {
            val = val.trim().slice(1, -1);
        } else {
            val = val.trim();
        }
        env[match[1]] = val;
    }
});

const connectionString = env['POSTGRES_URL'] || env['POSTGRES_PRISMA_URL'];
if (!connectionString) {
    console.error("POSTGRES_URL or POSTGRES_PRISMA_URL not found in env");
    process.exit(1);
}

const sql = `ALTER TABLE public.recurring_plans ADD COLUMN IF NOT EXISTS images JSONB NULL;`;

async function run() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    console.log("Connected to PostgreSQL database. Running recurring_plans images migration...");
    await client.query(sql);
    console.log("Migration executed successfully!");
    await client.end();
}

run()
    .then(() => {
        console.log("Done!");
        process.exit(0);
    })
    .catch(err => {
        console.error("Migration failed:", err);
        process.exit(1);
    });
