-- Appointments module tables

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  customer_id uuid null references public.customers(id) on delete set null,
  customer_name text not null,
  service_name text not null,
  start_date date not null,
  start_time time not null,
  end_date date not null,
  end_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  staff_partner_user_id uuid not null references public.partner_users(id) on delete restrict,
  staff_name text not null,
  status text not null default 'Reservado',
  price numeric(12,2) not null default 0,
  pricing_unit text not null default 'Por Serviço',
  notes text null,
  source text not null default 'appointment',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_appointments_partner_start on public.appointments(partner_id, start_date, start_time);
create index if not exists idx_appointments_partner_staff on public.appointments(partner_id, staff_partner_user_id);

alter table public.appointments enable row level security;

drop policy if exists appointments_select_partner on public.appointments;
create policy appointments_select_partner on public.appointments
for select using (
  exists (
    select 1
    from public.partner_users pu
    where pu.partner_id = appointments.partner_id
      and pu.user_id = auth.uid()
  )
);

drop policy if exists appointments_insert_partner on public.appointments;
create policy appointments_insert_partner on public.appointments
for insert with check (
  exists (
    select 1
    from public.partner_users pu
    where pu.partner_id = appointments.partner_id
      and pu.user_id = auth.uid()
  )
);

drop policy if exists appointments_update_partner on public.appointments;
create policy appointments_update_partner on public.appointments
for update using (
  exists (
    select 1
    from public.partner_users pu
    where pu.partner_id = appointments.partner_id
      and pu.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.partner_users pu
    where pu.partner_id = appointments.partner_id
      and pu.user_id = auth.uid()
  )
);

drop policy if exists appointments_delete_partner on public.appointments;
create policy appointments_delete_partner on public.appointments
for delete using (
  exists (
    select 1
    from public.partner_users pu
    where pu.partner_id = appointments.partner_id
      and pu.user_id = auth.uid()
  )
);

create or replace function public.set_appointments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_appointments_updated_at on public.appointments;
create trigger trg_set_appointments_updated_at
before update on public.appointments
for each row
execute function public.set_appointments_updated_at();

alter table public.appointments
  add column if not exists sale_id uuid null references public.sales(id) on delete set null;

alter table public.appointments
  add column if not exists receivable_transaction_id uuid null references public.transactions(id) on delete set null;

alter table public.appointments
  add column if not exists payment_transaction_id uuid null references public.transactions(id) on delete set null;

alter table public.appointments
  add column if not exists paid_amount numeric(14,2) not null default 0;
