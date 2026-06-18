-- Adiciona can_apply_discount às permissões de quotes para todos os roles
-- Necessário para permitir validação granular de desconto em orçamentos

-- Atualiza o template base
UPDATE public.roles
SET permissions = jsonb_set(
    permissions,
    '{quotes,can_apply_discount}',
    'false',
    true
)
WHERE id = '__base_template';

-- Admin e Manager: podem aplicar desconto em orçamentos
UPDATE public.roles
SET permissions = jsonb_set(
    permissions,
    '{quotes,can_apply_discount}',
    'true',
    true
)
WHERE id IN ('admin', 'manager');

-- Operator e Delivery: não podem aplicar desconto em orçamentos
UPDATE public.roles
SET permissions = jsonb_set(
    permissions,
    '{quotes,can_apply_discount}',
    'false',
    true
)
WHERE id IN ('operator', 'delivery');

-- Owner não precisa de alteração (código faz bypass para owner)
