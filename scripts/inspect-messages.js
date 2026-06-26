const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manually parse .env file
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Fetching whatsapp_messages...");
  const { data: messages, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching messages:", error);
  } else {
    console.log(`\n--- WHATSAPP MESSAGES (Latest 20) ---`);
    messages.forEach(m => {
      console.log(`ID: ${m.id} | Status: ${m.status} | Phone: ${m.phone_number} | Template: ${m.template_name || m.message_type} | Error: ${m.error_message || "none"} | Created: ${m.created_at}`);
    });
  }

  // Also query count of messages per status
  const { data: counts, error: countError } = await supabase
    .from("whatsapp_messages")
    .select("status");

  if (countError) {
    console.error("Error fetching counts:", countError);
  } else {
    const statusCounts = {};
    counts.forEach(c => {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
    });
    console.log("\n--- STATUS COUNTS ---");
    console.log(statusCounts);
  }
}

run();
