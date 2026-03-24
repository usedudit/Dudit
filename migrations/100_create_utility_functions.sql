-- ========================================
-- CREATE UTILITY FUNCTIONS FOR SECURITY
-- ========================================
-- This script creates utility functions used by the security fix script

-- Function to sanitize text input to prevent SQL injection and XSS
CREATE OR REPLACE FUNCTION public.sanitize_text(input_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF input_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Remove potentially dangerous characters and normalize whitespace
  RETURN regexp_replace(
    regexp_replace(
      trim(input_text),
      E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', -- Remove control characters
      '',
      'g'
    ),
    E'\\s+', -- Normalize multiple whitespaces
    ' ',
    'g'
  );
END;
$$;

-- Function to mask sensitive document information (CPF/CNPJ)
CREATE OR REPLACE FUNCTION public.mask_document(document text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF document IS NULL OR length(document) = 0 THEN
    RETURN NULL;
  END IF;
  
  -- Remove non-numeric characters
  document := regexp_replace(document, '[^0-9]', '', 'g');
  
  -- Mask CPF (11 digits): XXX.XXX.XXX-XX -> ***.***.XXX-XX
  IF length(document) = 11 THEN
    RETURN '***.***.***-' || substring(document, 10, 2);
  END IF;
  
  -- Mask CNPJ (14 digits): XX.XXX.XXX/XXXX-XX -> **.***.***/****-XX
  IF length(document) = 14 THEN
    RETURN '**.***.***/****-' || substring(document, 13, 2);
  END IF;
  
  -- For other lengths, mask most characters
  IF length(document) > 4 THEN
    RETURN repeat('*', length(document) - 4) || substring(document, length(document) - 3, 4);
  END IF;
  
  RETURN repeat('*', length(document));
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.sanitize_text(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.mask_document(text) TO authenticated, anon;

-- Add comments for documentation
COMMENT ON FUNCTION public.sanitize_text(text) IS 'Sanitizes text input by removing control characters and normalizing whitespace';
COMMENT ON FUNCTION public.mask_document(text) IS 'Masks CPF/CNPJ documents for privacy protection';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Utility functions created successfully!';
  RAISE NOTICE '- sanitize_text() function created';
  RAISE NOTICE '- mask_document() function created';
END $$;
