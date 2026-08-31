-- ============================================================================
-- SYSTEM SETTINGS & MAINTENANCE SCHEMA
-- ============================================================================
-- Manages platform-wide runtime configurations such as:
-- 1. Maintenance Mode (with bypass tokens and schedule)
-- 2. Global Announcements (dismissible top banner with expiry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.system_settings IS 'Global platform runtime configurations (Maintenance mode, Global banners, System flags).';
COMMENT ON COLUMN public.system_settings.key IS 'Unique setting key (e.g. maintenance, global_announcement)';
COMMENT ON COLUMN public.system_settings.value IS 'Configuration payload stored as structured JSONB';
COMMENT ON COLUMN public.system_settings.is_public IS 'If true, safe for public frontend reads (e.g. active banner). If false, admin/service-role only.';

-- Enable Row Level Security
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ────────────────────────────────────────────────────────────

-- Public & Authenticated users can read public settings (like announcements and maintenance public info)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'allow_read_public_system_settings' AND tablename = 'system_settings'
  ) THEN
    CREATE POLICY "allow_read_public_system_settings" ON public.system_settings
      FOR SELECT
      USING (
        is_public = true
        OR EXISTS (
          SELECT 1 FROM public.admin_roles
          WHERE user_id = auth.uid()
          AND role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- Admins can update system settings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'allow_admin_update_system_settings' AND tablename = 'system_settings'
  ) THEN
    CREATE POLICY "allow_admin_update_system_settings" ON public.system_settings
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.admin_roles
          WHERE user_id = auth.uid()
          AND role IN ('admin', 'super_admin')
        )
      );
  END IF;
END $$;

-- ─── Seed Initial Settings ───────────────────────────────────────────────────

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES
  (
    'maintenance',
    '{
      "enabled": false,
      "message": "Estamos realizando uma manutenção programada para trazer melhorias na plataforma Dudit. Voltaremos em breve!",
      "estimated_end": null,
      "allow_admin_bypass": true,
      "bypass_token": "dudit_sec_bypass"
    }'::jsonb,
    'Configurações do Modo Manutenção Geral da plataforma',
    true
  ),
  (
    'global_announcement',
    '{
      "active": false,
      "id": "announcement_default",
      "title": "Aviso Importante",
      "message": "",
      "type": "warning",
      "closable": true,
      "expires_at": null,
      "link_url": null,
      "link_text": null
    }'::jsonb,
    'Banner de aviso global no topo do site',
    true
  )
ON CONFLICT (key) DO NOTHING;
