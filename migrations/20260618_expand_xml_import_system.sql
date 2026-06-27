-- ============================================================================
-- MIGRATION: Expand XML Import System - NF-e Complete Data
-- Description: Adds columns to xml_imports and xml_import_items to store
-- full NF-e data: fiscal totals, transport, duplicatas, document metadata,
-- per-item fiscal details, XML validation, and audit data.
-- All new columns are NULLABLE to avoid breaking existing imports.
-- ============================================================================

-- 1. Expand xml_imports
ALTER TABLE public.xml_imports
  ADD COLUMN IF NOT EXISTS modelo TEXT,
  ADD COLUMN IF NOT EXISTS protocolo TEXT,
  ADD COLUMN IF NOT EXISTS cstat TEXT,
  ADD COLUMN IF NOT EXISTS ambiente TEXT,
  ADD COLUMN IF NOT EXISTS finalidade TEXT,
  ADD COLUMN IF NOT EXISTS tipo_operacao TEXT,
  ADD COLUMN IF NOT EXISTS data_saida TIMESTAMPTZ,

  -- Valores fiscais agregados (JSONB para flexibilidade futura)
  ADD COLUMN IF NOT EXISTS fiscal_totals JSONB,
  -- { vProd, vFrete, vSeg, vDesc, vOutro, vBC, vICMS, vBCST, vST, vIPI, vPIS, vCOFINS }

  -- Informações complementares
  ADD COLUMN IF NOT EXISTS inf_cpl TEXT,
  ADD COLUMN IF NOT EXISTS inf_ad_fisco TEXT,

  -- Dados de transporte (JSONB)
  ADD COLUMN IF NOT EXISTS transport_data JSONB,
  -- { modalidade_frete, transportadora, cnpj, cpf, ie, rntrc, placa, placa_uf,
  --   qtd_volumes, especie, marca, peso_bruto, peso_liquido }

  -- Dados do XML para auditoria
  ADD COLUMN IF NOT EXISTS xml_hash TEXT,
  ADD COLUMN IF NOT EXISTS xml_size INTEGER,
  ADD COLUMN IF NOT EXISTS created_by_ip TEXT,

  -- Duplicatas da NF-e (JSONB)
  ADD COLUMN IF NOT EXISTS duplicatas JSONB;
  -- [{ numero, vencimento, valor }]

-- 2. Expand xml_import_items - per-item fiscal detail
ALTER TABLE public.xml_import_items
  ADD COLUMN IF NOT EXISTS raw_fiscal_detail JSONB;
  -- { icms_cst, icms_vbc, icms_vicms, icms_picms, icms_vbcst, icms_vst,
  --   ipi_cst, ipi_vbc, ipi_pipi, ipi_vipi,
  --   pis_cst, pis_vbc, pis_ppis, pis_vpis,
  --   cofins_cst, cofins_vbc, cofins_pcofins, cofins_vcofins, ... }
