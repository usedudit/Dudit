import { Client } from "pg";
import path from "path";
import fs from "fs";

// Manual .env loader
function loadEnv() {
    const paths = [
        path.resolve(process.cwd(), '.env.local'),
        path.resolve(process.cwd(), '.env')
    ]
    for (const envPath of paths) {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8')
            envContent.split('\n').forEach(line => {
                const trimmedLine = line.trim()
                if (!trimmedLine || trimmedLine.startsWith('#')) return
                const [key, ...valueParts] = trimmedLine.split('=')
                if (key && valueParts.length > 0) {
                    process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
                }
            })
        }
    }
}

loadEnv();

async function inspect() {
    const connectionString = process.env.POSTGRES_URL_NON_POOLING || "";
    const url = new URL(connectionString);
    const client = new Client({
        host: url.hostname,
        port: parseInt(url.port || "5432"),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1),
        ssl: {
            rejectUnauthorized: false
        }
    });
    await client.connect();

    console.log("Connected to database. Querying columns of reviews table...");
    
    const query = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'reviews';
    `;

    const res = await client.query(query);
    console.log("Columns of reviews table:");
    console.log(JSON.stringify(res.rows, null, 2));

    await client.end();
}

inspect().catch(console.error);
