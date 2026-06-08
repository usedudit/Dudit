-- Adiciona coluna promotional_price na tabela services (igual já existe em products)
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS promotional_price NUMERIC(10,2);

-- Adiciona índice para filtrar serviços em promoção
CREATE INDEX IF NOT EXISTS idx_services_promotional_price ON public.services (promotional_price) WHERE promotional_price IS NOT NULL;
