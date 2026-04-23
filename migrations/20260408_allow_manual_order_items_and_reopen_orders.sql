-- Allow manual order items and preserve cancel/reopen state for ERP orders

ALTER TABLE public.order_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_manual_name_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_manual_name_check
  CHECK (product_id IS NOT NULL OR NULLIF(TRIM(product_name), '') IS NOT NULL);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS previous_situation_before_cancel TEXT,
  ADD COLUMN IF NOT EXISTS stock_restored_on_cancel BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.handle_order_payment_stock()
returns trigger
language plpgsql
security definer
as $$
declare
  v_items jsonb;
begin
  if new.situation = 'paid'
     and coalesce(old.situation, '') <> 'paid'
     and coalesce(new.previous_situation_before_cancel, '') <> 'paid' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_id', oi.product_id,
          'variant_id', null,
          'quantity', oi.quantity
        )
      ),
      '[]'::jsonb
    )
    into v_items
    from public.order_items oi
    where oi.order_id = new.id
      and oi.product_id is not null;

    if jsonb_array_length(v_items) > 0 then
      perform public.create_batch_stock_movement(
        new.partner_id,
        'out',
        'Venda confirmada',
        'Baixa automática do pedido ' || coalesce(new.order_number, new.id::text),
        new.created_by,
        v_items
      );
    end if;
  end if;

  return new;
end;
$$;
