/**
 * Centralized error handling utility for Supabase and Next.js errors.
 * Primarily handles translations to Brazilian Portuguese and user-friendly formatting.
 */

export function getErrorMessage(error: any): string {
  if (!error) return "Ocorreu um erro inesperado."

  const message = typeof error === "string" ? error : error.message || "Erro desconhecido"
  const code = error?.code || error?.status

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

  // Return original message if no mapping found (fallback to something readable if possible)
  return message
}
