/**
 * Centralized error handling utility for Supabase and Next.js errors.
 * Primarily handles translations to Brazilian Portuguese and user-friendly formatting.
 */

/** Next.js omits real RSC error text in production; `error.message` is this placeholder. */
const NEXT_RSC_PRODUCTION_PLACEHOLDER =
  "An error occurred in the Server Components render"

export function getErrorMessage(error: any): string {
  if (!error) return "Ocorreu um erro inesperado."

  const rawMessage = typeof error === "string" ? error : error?.message
  const message = typeof rawMessage === "string" && rawMessage.length > 0 ? rawMessage : "Erro desconhecido"
  const code = error?.code || error?.status

  // Next.js App Router: production Server Components use a generic English message + digest
  if (typeof message === "string" && message.includes(NEXT_RSC_PRODUCTION_PLACEHOLDER)) {
    return "Não foi possível carregar esta parte da página. Tente novamente em instantes."
  }

  // 1. Handle Supabase Rate Limiting (dynamic messages)
  // Example: "For security purposes, you can only request this after 54 seconds."
  const rateLimitMatch = message.match(/request this after (\d+) seconds/i)
  if (rateLimitMatch) {
    const seconds = rateLimitMatch[1]
    return `Por segurança, você só pode solicitar isso novamente após ${seconds} segundos.`
  }

  // 2. Map known code-based errors
  const errorMap: Record<string, string> = {
    // Auth Errors
    "invalid_credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "Por favor, confirme seu e-mail antes de entrar.",
    "User already registered": "Este e-mail já está cadastrado.",
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Too many requests": "Muitas tentativas. Tente novamente em breve.",
    "Network request failed": "Erro de conexão. Verifique sua internet.",
    "Signup is disabled": "O cadastro de novos usuários está temporariamente desativado.",
    "Provider not enabled": "Este método de login não está disponível no momento.",
    "User not found": "Usuário não encontrado.",
    "Password is too short": "A senha deve ter pelo menos 8 caracteres.",
    "New password should be different from the old password": "A nova senha deve ser diferente da atual.",
    "Database error saving new user": "Erro inesperado ao salvar usuário.",
    "Error sending confirmation email": "Erro ao enviar e-mail de confirmação",
    "Email link is invalid or has expired": "Este link de e-mail é inválido ou expirou.",

    // Database/PostgREST Errors
    "PGRST116": "Registro não encontrado.",
    "23505": "Este registro já existe.", // Unique violation
    "42501": "Você não tem permissão para realizar esta ação.", // Permission denied

    // Check constraint violations (substring-matched below)
    "coupons_discount_value_valid": "O valor do desconto deve ser maior que zero para cupons percentuais ou de valor fixo.",
    "coupons_percentage_max": "O percentual de desconto não pode ultrapassar 100%.",
    "coupons_dates_valid": "A data de início deve ser anterior ou igual à data de fim.",
    "coupons_partner_code_unique": "Já existe um cupom com este código. Escolha um código diferente.",

    // Generic API Errors
    "429": "Muitas tentativas. Tente novamente em breve.",
    "500": "Erro interno no servidor. Tente novamente mais tarde.",
    "403": "Acesso negado.",
    "401": "Não autorizado. Por favor, faça login.",
  }

  // Exact match search
  if (errorMap[message]) return errorMap[message]
  if (code && errorMap[String(code)]) return errorMap[String(code)]

  // Substring search for common patterns
  if (message.includes("credentials")) return "E-mail ou senha incorretos."
  if (message.includes("already registered") || message.includes("already exists")) return "Este e-mail já está cadastrado."
  if (message.includes("rate limit") || message.includes("too many requests")) return "Muitas tentativas. Tente novamente em breve."
  if (message.includes("confirm your email")) return "Por favor, confirme seu e-mail antes de entrar."
  if (message.includes("NetworkError") || message.includes("Failed to fetch")) return "Erro de conexão. Verifique sua internet."

  // Coupon/discount constraint violations
  if (message.includes("coupons_discount_value_valid")) return "O valor do desconto deve ser maior que zero para cupons percentuais ou de valor fixo."
  if (message.includes("coupons_percentage_max")) return "O percentual de desconto não pode ultrapassar 100%."
  if (message.includes("coupons_dates_valid")) return "A data de início deve ser anterior ou igual à data de fim."
  if (message.includes("coupons_partner_code_unique")) return "Já existe um cupom com este código. Escolha um código diferente."

  // Return original message if no mapping found (fallback to something readable if possible)
  return message
}
