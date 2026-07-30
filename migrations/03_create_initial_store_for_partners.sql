-- Script para criar store inicial quando um partner é criado
-- Este script cria uma função trigger que automaticamente cria um local/store
-- para cada parceiro novo, usando o store_name do partner como nome inicial da loja

CREATE OR REPLACE FUNCTION create_initial_store_for_partner()
RETURNS TRIGGER AS $$
BEGIN
  -- Insere uma store inicial com o mesmo nome da loja do partner
  INSERT INTO public.stores (partner_id, name, logo_url)
  VALUES (NEW.id, NEW.store_name, NEW.store_image_url);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria a trigger que executa a função quando um novo partner é criado
DROP TRIGGER IF EXISTS trigger_create_initial_store ON public.partners;
CREATE TRIGGER trigger_create_initial_store
  AFTER INSERT ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION create_initial_store_for_partner();
