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

const sql = `
-- Create promotion_services table if not exists
CREATE TABLE IF NOT EXISTS public.promotion_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_services_unique UNIQUE (promotion_id, service_id)
);

-- Enable RLS for promotion_services
ALTER TABLE public.promotion_services ENABLE ROW LEVEL SECURITY;

-- Drop check constraint and recreate it on promotions
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_apply_scope_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_apply_scope_check CHECK (apply_scope IN ('specific_products', 'category', 'entire_cart', 'specific_services'));

-- Recreate policies for campaigns
DROP POLICY IF EXISTS campaigns_partner_users ON public.campaigns;
CREATE POLICY campaigns_partner_users ON public.campaigns FOR ALL USING (partner_id IN (SELECT public.get_user_partner_ids()));

-- Recreate policies for promotions
DROP POLICY IF EXISTS promotions_partner_users ON public.promotions;
CREATE POLICY promotions_partner_users ON public.promotions FOR ALL USING (partner_id IN (SELECT public.get_user_partner_ids()));

-- Recreate policies for promotion_products
DROP POLICY IF EXISTS promotion_products_partner_users ON public.promotion_products;
CREATE POLICY promotion_products_partner_users ON public.promotion_products FOR ALL USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_products.promotion_id AND p.partner_id IN (SELECT public.get_user_partner_ids())));

-- Recreate policies for promotion_categories
DROP POLICY IF EXISTS promotion_categories_partner_users ON public.promotion_categories;
CREATE POLICY promotion_categories_partner_users ON public.promotion_categories FOR ALL USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_categories.promotion_id AND p.partner_id IN (SELECT public.get_user_partner_ids())));

-- Create policy for promotion_services
DROP POLICY IF EXISTS promotion_services_partner_users ON public.promotion_services;
CREATE POLICY promotion_services_partner_users ON public.promotion_services FOR ALL USING (EXISTS (SELECT 1 FROM public.promotions p WHERE p.id = promotion_services.promotion_id AND p.partner_id IN (SELECT public.get_user_partner_ids())));
`;

async function run() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    console.log("Connected to PostgreSQL database. Running migration...");
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
