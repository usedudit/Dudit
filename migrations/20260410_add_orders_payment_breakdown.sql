alter table public.orders
  add column if not exists payment_breakdown jsonb not null default '[]'::jsonb;

comment on column public.orders.payment_breakdown is
  'Detalhamento dos valores pagos por meio de pagamento. Ex: [{"method":"Pix","amount":50.00}]';
