ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN NOT NULL DEFAULT FALSE;

DROP TRIGGER IF EXISTS order_payment_stock_trigger ON public.orders;
DROP FUNCTION IF EXISTS public.handle_order_payment_stock() CASCADE;

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
     and coalesce(new.previous_situation_before_cancel, '') <> 'paid'
     and coalesce(new.inventory_deducted, false) = false then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_id', oi.product_id,
          'variant_id', oi.variant_id,
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
        'Baixa automatica do pedido ' || coalesce(new.order_number, new.id::text),
        new.created_by,
        v_items
      );
    end if;
  end if;

  return new;
end;
$$;

CREATE TRIGGER order_payment_stock_trigger
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_order_payment_stock();
