drop trigger if exists order_payment_stock_trigger on public.orders;
drop trigger if exists update_stock_on_payment on public.orders;
drop trigger if exists order_status_stock_movement on public.orders;
drop trigger if exists on_order_payment on public.orders;
drop trigger if exists on_order_status_change on public.orders;

drop function if exists public.handle_order_payment_stock() cascade;
drop function if exists public.handle_payment_stock_update() cascade;
drop function if exists public.handle_order_status_change() cascade;

create or replace function public.handle_order_payment_stock()
returns trigger
language plpgsql
security definer
as $$
declare
  v_items jsonb;
begin
  if new.situation = 'paid' and coalesce(old.situation, '') <> 'paid' then
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

create trigger order_payment_stock_trigger
after update on public.orders
for each row
execute function public.handle_order_payment_stock();
