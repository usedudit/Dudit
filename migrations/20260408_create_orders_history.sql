create table if not exists public.orders_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entry_type varchar(32) not null,
  change_lines text[] not null check (cardinality(change_lines) > 0),
  created_at timestamptz not null default now()
);

create index if not exists orders_history_order_created_idx
  on public.orders_history (order_id, created_at desc, id desc);

create index if not exists orders_history_partner_created_idx
  on public.orders_history (partner_id, created_at desc, id desc);

alter table public.orders_history enable row level security;

drop policy if exists "orders_history_select_own" on public.orders_history;
create policy "orders_history_select_own"
  on public.orders_history for select
  using (
    exists (
      select 1
      from public.partners
      where partners.id = orders_history.partner_id
        and partners.user_id = auth.uid()
    )
  );

drop policy if exists "orders_history_insert_own" on public.orders_history;
create policy "orders_history_insert_own"
  on public.orders_history for insert
  with check (
    exists (
      select 1
      from public.partners
      where partners.id = orders_history.partner_id
        and partners.user_id = auth.uid()
    )
  );
