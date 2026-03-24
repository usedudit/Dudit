-- Add fiscal fields to stores table
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS crt TEXT DEFAULT '1',
ADD COLUMN IF NOT EXISTS contribuinte TEXT DEFAULT '9',
ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT,
ADD COLUMN IF NOT EXISTS ie_isento BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT;

COMMENT ON COLUMN stores.crt IS 'Código de Regime Tributário: 1=Simples Nacional, 3=Regime Normal, MEI, etc';
COMMENT ON COLUMN stores.contribuinte IS '1=Contribuinte ICMS, 2=Isento, 9=Não Contribuinte';
COMMENT ON COLUMN stores.inscricao_estadual IS 'Inscrição Estadual do estabelecimento';
COMMENT ON COLUMN stores.ie_isento IS 'Indica se é Isento de Inscrição Estadual';
COMMENT ON COLUMN stores.inscricao_municipal IS 'Inscrição Municipal do estabelecimento';
