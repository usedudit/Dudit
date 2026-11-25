-- ============================================================================
-- Migration: 20261125_smart_search_synonyms.sql
--
-- Objetivo (Busca Inteligente - Fase 1):
--   Enriquecer `marketplace_synonym_groups` e `marketplace_synonym_terms` com
--   associações reais entre necessidades do dia a dia, produtos, serviços e
--   tipos de vitrines/lojas (ex: pneu <-> borracharia / oficina mecanica / autocenter,
--   chuveiro/tomada <-> eletricista, vazamento <-> encanador, etc.).
--
-- Idempotente e segura para rodar em produção.
-- ============================================================================

BEGIN;

INSERT INTO public.marketplace_synonym_groups (name, slug, description, category_keywords)
VALUES
  (
    'Automotivo e Borracharia',
    'automotive_services',
    'Pneus, borracharias, oficinas mecânicas e autocenters',
    ARRAY['automotivo', 'borracharia', 'oficina', 'mecanica', 'autocenter', 'pneu', 'pneus', 'freio', 'oleo', 'bateria', 'guincho']
  ),
  (
    'Elétrica e Instalações',
    'electrical_services',
    'Eletricistas, reparos elétricos, chuveiro e disjuntores',
    ARRAY['eletricista', 'eletrica', 'chuveiro', 'tomada', 'disjuntor', 'fiacao', 'iluminacao']
  ),
  (
    'Hidráulica e Encanamento',
    'plumbing_services',
    'Encanadores, vazamentos, torneiras e desentupidoras',
    ARRAY['encanador', 'hidraulica', 'vazamento', 'torneira', 'desentupidora', 'cano', 'caixa dagua']
  ),
  (
    'Casa, Reformas e Climatização',
    'home_maintenance',
    'Ar condicionado, chaveiro, pedreiro, pintor, diarista e manutenção residencial',
    ARRAY['ar condicionado', 'climatizacao', 'refrigeracao', 'chaveiro', 'pedreiro', 'pintor', 'marceneiro', 'diarista', 'faxina', 'dedetizacao']
  ),
  (
    'Beleza e Estética',
    'beauty_services',
    'Barbearia, salão de beleza, manicure, estética e bem-estar',
    ARRAY['barbeiro', 'barbearia', 'cabeleireiro', 'salao', 'manicure', 'pedicure', 'unha', 'sobrancelha', 'estetica', 'massagem']
  ),
  (
    'Alimentação e Festas',
    'food_and_parties',
    'Confeitaria, padaria, bolos, salgados e buffet',
    ARRAY['bolo', 'confeitaria', 'padaria', 'doceria', 'salgados', 'buffet', 'festa', 'marmita', 'lanche', 'pizza']
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.marketplace_synonym_terms (group_id, term, term_normalized)
SELECT g.id, v.term, public.normalize_search_text(v.term)
FROM public.marketplace_synonym_groups g
CROSS JOIN (
  VALUES
    -- Automotivo e Borracharia
    ('automotive_services', 'pneu'),
    ('automotive_services', 'pneus'),
    ('automotive_services', 'borracharia'),
    ('automotive_services', 'borracheiro'),
    ('automotive_services', 'oficina'),
    ('automotive_services', 'oficina mecanica'),
    ('automotive_services', 'mecanico'),
    ('automotive_services', 'autocenter'),
    ('automotive_services', 'alinhamento'),
    ('automotive_services', 'balanceamento'),
    ('automotive_services', 'troca de oleo'),
    ('automotive_services', 'bateria automotiva'),
    ('automotive_services', 'autoeletrica'),
    ('automotive_services', 'guincho'),

    -- Elétrica
    ('electrical_services', 'eletricista'),
    ('electrical_services', 'eletrica'),
    ('electrical_services', 'chuveiro'),
    ('electrical_services', 'tomada'),
    ('electrical_services', 'disjuntor'),
    ('electrical_services', 'curto circuito'),
    ('electrical_services', 'instalacao eletrica'),

    -- Hidráulica
    ('plumbing_services', 'encanador'),
    ('plumbing_services', 'bombeiro hidraulico'),
    ('plumbing_services', 'vazamento'),
    ('plumbing_services', 'desentupidora'),
    ('plumbing_services', 'torneira'),
    ('plumbing_services', 'hidraulica'),

    -- Casa e Climatização
    ('home_maintenance', 'ar condicionado'),
    ('home_maintenance', 'instalacao ar condicionado'),
    ('home_maintenance', 'limpeza ar condicionado'),
    ('home_maintenance', 'refrigeracao'),
    ('home_maintenance', 'chaveiro'),
    ('home_maintenance', 'fechadura'),
    ('home_maintenance', 'diarista'),
    ('home_maintenance', 'faxina'),
    ('home_maintenance', 'faxineira'),
    ('home_maintenance', 'dedetizacao'),
    ('home_maintenance', 'pedreiro'),
    ('home_maintenance', 'pintor'),
    ('home_maintenance', 'marceneiro'),

    -- Beleza
    ('beauty_services', 'barbeiro'),
    ('beauty_services', 'barbearia'),
    ('beauty_services', 'corte de cabelo'),
    ('beauty_services', 'cabeleireiro'),
    ('beauty_services', 'salao de beleza'),
    ('beauty_services', 'manicure'),
    ('beauty_services', 'pedicure'),
    ('beauty_services', 'sobrancelha'),
    ('beauty_services', 'massagem'),

    -- Alimentação e Festas
    ('food_and_parties', 'bolo'),
    ('food_and_parties', 'confeitaria'),
    ('food_and_parties', 'padaria'),
    ('food_and_parties', 'salgados'),
    ('food_and_parties', 'buffet')
) AS v(slug, term)
WHERE g.slug = v.slug
ON CONFLICT (group_id, term_normalized) DO NOTHING;

COMMIT;
