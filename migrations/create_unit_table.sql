create table if not exists public.unidades_medida (
  id uuid primary key default gen_random_uuid(),
  codigo varchar(10) not null,
  descricao varchar(100) not null,
  tipo varchar(30) not null, -- quantidade, peso, volume, comprimento, tempo, servico
  ativo boolean not null default true,
  created_at timestamptz not null default now(),

  constraint unidades_medida_codigo_unique unique (codigo)
);

insert into public.unidades_medida (codigo, descricao, tipo) values
('UN', 'Unidade', 'quantidade'),
('PC', 'Peça', 'quantidade'),
('CX', 'Caixa', 'quantidade'),

('KG', 'Quilograma', 'peso'),
('G',  'Grama', 'peso'),

('L',  'Litro', 'volume'),

('M',  'Metro', 'comprimento'),

('H',  'Hora', 'tempo'),
('SV', 'Serviço', 'servico');
