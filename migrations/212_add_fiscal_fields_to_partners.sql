-- Add fiscal fields to partners table
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS crt TEXT DEFAULT '1',
ADD COLUMN IF NOT EXISTS contribuinte TEXT DEFAULT '9',
ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT,
ADD COLUMN IF NOT EXISTS ie_isento BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT;

COMMENT ON COLUMN partners.crt IS 'Código de Regime Tributário do parceiro';
COMMENT ON COLUMN partners.contribuinte IS 'Tipo de contribuinte do parceiro';
COMMENT ON COLUMN partners.inscricao_estadual IS 'Inscrição Estadual do parceiro';
COMMENT ON COLUMN partners.ie_isento IS 'Indica se o parceiro é Isento de IE';
COMMENT ON COLUMN partners.inscricao_municipal IS 'Inscrição Municipal do parceiro';
