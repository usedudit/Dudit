const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envPath = 'c:/Users/MuriloSTR/Downloads/Dudit/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.substring(1, value.length - 1);
    env[key] = value.trim();
  }
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data: deliveries, error: dErr } = await supabase
    .from('deliveries')
    .select('id, delivery_number, status, partner_id, created_at');
  console.log('DELIVERIES:', deliveries);

  const { data: links, error: lErr } = await supabase
    .from('delivery_orders')
    .select('id, delivery_id, order_id, status');
  console.log('DELIVERY ORDERS:', links);
}

test();
