-- Create stores table for multi-store support
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_stores_partner_id ON stores(partner_id);
CREATE INDEX IF NOT EXISTS idx_stores_created_at ON stores(created_at DESC);

-- Set up Row Level Security (RLS)
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for stores
CREATE POLICY "Partners can view their stores" ON stores
  FOR SELECT USING (
    partner_id = (
      SELECT id FROM partners WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Partners can create stores" ON stores
  FOR INSERT WITH CHECK (
    partner_id = (
      SELECT id FROM partners WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Partners can update their stores" ON stores
  FOR UPDATE USING (
    partner_id = (
      SELECT id FROM partners WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Partners can delete their stores" ON stores
  FOR DELETE USING (
    partner_id = (
      SELECT id FROM partners WHERE user_id = auth.uid()
    )
  );
