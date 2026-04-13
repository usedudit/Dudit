ALTER TABLE public.financial_categories
    ADD COLUMN IF NOT EXISTS category_type TEXT;

UPDATE public.financial_categories
SET category_type = CASE
    WHEN LOWER(COALESCE(name, '')) IN ('vendas', 'outras receitas') THEN 'income'
    ELSE 'expense'
END
WHERE category_type IS NULL;

ALTER TABLE public.financial_categories
    ADD CONSTRAINT financial_categories_category_type_check
    CHECK (category_type IN ('income', 'expense'));

ALTER TABLE public.finance_accounts
    ADD COLUMN IF NOT EXISTS is_system_managed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS integration_source TEXT;
