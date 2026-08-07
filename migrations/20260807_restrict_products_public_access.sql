-- Fase 2: remover leitura global e fechar INSERT autenticado.
-- Consumidores publicos ja usam marketplace_products_public.

BEGIN;

DROP POLICY IF EXISTS products_insert_authenticated ON public.products;

CREATE POLICY products_insert_authenticated
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  partner_id IN (
    SELECT p.id
    FROM public.partners AS p
    WHERE p.user_id = (SELECT auth.uid())
    UNION
    SELECT pu.partner_id
    FROM public.partner_users AS pu
    WHERE pu.user_id = (SELECT auth.uid())
      AND pu.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  )
);

DROP POLICY IF EXISTS products_select_all ON public.products;

NOTIFY pgrst, 'reload schema';

COMMIT;
