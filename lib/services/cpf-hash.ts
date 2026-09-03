import "server-only"
import { createHmac } from "crypto"

/**
 * Normaliza o CPF removendo qualquer caractere não numérico.
 * Retorna uma string de 11 dígitos ou null caso seja inválido.
 */
export function normalizeCpf(cpf: string | null | undefined): string | null {
  if (!cpf || typeof cpf !== "string") return null
  const digits = cpf.replace(/\D/g, "").trim()
  return digits.length === 11 ? digits : null
}

/**
 * Retorna o segredo criptográfico do servidor para a geração do Blind Index HMAC.
 */
function getCpfHashSecret(): string {
  const secret =
    process.env.CPF_LOOKUP_SECRET ||
    process.env.MASTER_KEY_V2 ||
    process.env.MASTER_KEY_V1 ||
    "dudit-cpf-blind-index-default-pepper-v1"

  return secret
}

/**
 * Gera um Blind Index HMAC-SHA256 unidirecional e determinístico para o CPF.
 *
 * Propriedades:
 * - Determinístico: o mesmo CPF sempre produz o mesmo hash sob a mesma chave.
 * - Unidirecional: impossível reverter o hash para o CPF original sem a chave secreta.
 * - Seguro contra colisões: utiliza SHA-256 com prefixo de domínio 'cpf:'.
 * - Retorna 64 caracteres hexadecimais ou null caso o CPF seja inválido/vazio.
 */
export function generateCpfLookupHash(cpf: string | null | undefined): string | null {
  const cleanCpf = normalizeCpf(cpf)
  if (!cleanCpf) return null

  const secret = getCpfHashSecret()
  return createHmac("sha256", secret).update(`cpf:${cleanCpf}`).digest("hex")
}
