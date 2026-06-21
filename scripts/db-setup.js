process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: "postgres://postgres.qxuqjkpzargimmbyodnx:MhKkdJ9TkD57PAim@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log("Connected to database successfully.");

    const query = `
      ALTER TABLE public.service_orders
      ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta', 'urgente')),
      ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,2),
      ADD COLUMN IF NOT EXISTS expected_completion_time TEXT,
      ADD COLUMN IF NOT EXISTS discount_value NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percentage', 'coupon')),
      ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS coupon_code TEXT,
      ADD COLUMN IF NOT EXISTS coupon_discount_amount NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS other_costs NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'partially_paid', 'unpaid')),
      ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS payment_method TEXT,
      ADD COLUMN IF NOT EXISTS payment_breakdown JSONB;
    `;

    const res = await client.query(query);
    console.log("Migration executed successfully:", res);
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

main();
