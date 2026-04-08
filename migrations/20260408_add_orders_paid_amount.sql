alter table public.orders
  add column if not exists paid_amount numeric(12,2) not null default 0;

update public.orders
set paid_amount = case
  when situation = 'paid' then coalesce(total_amount, 0)
  else 0
end
where paid_amount is null
   or paid_amount = 0;

create index if not exists orders_partner_paid_amount_idx
  on public.orders (partner_id, paid_amount);
