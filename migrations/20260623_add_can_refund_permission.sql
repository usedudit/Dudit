-- Adiciona permissão can_refund ao template base e às roles
-- Necessário para que requirePermission("orders", "can_refund") funcione
-- para roles não-owner (owner tem bypass no can())

-- 1. Adiciona can_refund ao template base (__base_template)
UPDATE roles
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{orders,can_refund}',
    'false'
)
WHERE id = '__base_template'
  AND (permissions->'orders'->>'can_refund' IS NULL OR NOT (permissions->'orders' ? 'can_refund'));

-- 2. Owner já tem bypass no can() - não precisa de permissão explícita.

-- 3. ADMIN: herda do template base, mas vamos garantir can_refund = true
UPDATE roles
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{orders,can_refund}',
    'true'
)
WHERE id = 'admin'
  AND COALESCE(permissions->'orders'->>'can_refund', 'false') = 'false';

-- 4. MANAGER / OPERATOR / DELIVERY: can_refund = false (já é o padrão)
-- O template base já define como false, mas explicitamos para segurança
UPDATE roles
SET permissions = jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{orders,can_refund}',
    'false'
)
WHERE id IN ('manager', 'operator', 'delivery')
  AND COALESCE(permissions->'orders'->>'can_refund', 'false') = 'true';
