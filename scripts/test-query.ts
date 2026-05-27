import { createClient } from "@supabase/supabase-js";
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

async function test() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log("Testing partners query with reviews count...");
    const { data, error } = await supabase
        .from("partners")
        .select(`
            id,
            store_name,
            reviews(count)
        `)
        .limit(3);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Success! Data:", JSON.stringify(data, null, 2));
    }
}

test().catch(console.error);
