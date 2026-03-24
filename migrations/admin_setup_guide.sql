-- ============================================================================
-- GUIA DE ADMINISTRAÇÃO DUDIT - COMANDOS SQL
-- ============================================================================

-- 1. BUSCA DE INFORMAÇÕES NECESSÁRIAS
-- ----------------------------------------------------------------------------

-- Encontrar o ID do usuário pelo e-mail
-- Rode isso primeiro para pegar o UUID do usuário
SELECT id, email FROM auth.users WHERE email = 'USUARIO@EMAIL.COM';

-- Encontrar o ID do parceiro (loja) pelo nome
-- Rode isso se quiser dar acesso a uma loja específica
SELECT id, name FROM public.partners WHERE name ILIKE '%NOME_DA_LOJA%';


-- 2. ADICIONAR ADMINISTRADOR GLOBAL (PAINEL ADMIN)
-- ----------------------------------------------------------------------------
-- Use isso para quem deve gerenciar TODO o sistema.

-- Substitua 'USER_ID' pelo UUID encontrado no Passo 1
INSERT INTO public.admin_roles (user_id, role, scopes, is_protected)
VALUES (
  'USER_ID', 
  'super_admin', -- Pode ser: 'super_admin', 'admin', 'moderator'
  '{"moderation", "user_enforcement", "billing_control", "audit_access", "system_settings"}', 
  true
)
ON CONFLICT (user_id) DO UPDATE SET 
  role = EXCLUDED.role,
  scopes = EXCLUDED.scopes;


-- 3. ADICIONAR ADMINISTRADOR DE PARCEIRO (LOJA ESPECÍFICA)
-- ----------------------------------------------------------------------------
-- Use isso para quem deve gerenciar apenas uma loja.

-- Substitua 'PARTNER_ID' e 'USER_ID' pelos UUIDs encontrados no Passo 1
INSERT INTO public.partner_users (partner_id, user_id, role, permissions)
VALUES (
  'PARTNER_ID', 
  'USER_ID', 
  'ADMIN', -- Pode ser: 'OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'DELIVERY', 'VIEWER'
  '{
    "products":  {"view":true,"create":true,"edit":true,"delete":true},
    "services":  {"view":true,"create":true,"edit":true,"delete":true},
    "orders":    {"view":true,"create":true,"edit":true,"delete":true},
    "financial": {"view":true,"create":true,"edit":true,"delete":true},
    "customers": {"view":true,"create":true,"edit":true,"delete":true}
  }'::jsonb
)
ON CONFLICT (partner_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  permissions = EXCLUDED.permissions;


-- 4. VERIFICAÇÃO DE PERMISSÕES
-- ----------------------------------------------------------------------------

-- Ver quem é Admin Global
SELECT a.role, u.email 
FROM public.admin_roles a
JOIN auth.users u ON a.user_id = u.id;

-- Ver quem é Admin de cada Parceiro
SELECT p.name as loja, u.email, pu.role
FROM public.partner_users pu
JOIN public.partners p ON pu.partner_id = p.id
JOIN auth.users u ON pu.user_id = u.id;
