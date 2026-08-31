import "server-only"
import { getRoleLabel } from "@/lib/permissions/permission-descriptions"

export interface PermissionDeniedLogParams {
  userId: string
  partnerId: string
  storeId?: string | null
  roleId?: string | null
  resource?: string
  action?: string
  permissionKey?: string
  reason?: string
  details?: Record<string, any> | string
}

export interface PolicyLimitLogParams {
  userId?: string | null
  partnerId: string
  storeId?: string | null
  policy: string
  attemptedValue: string | number
  allowedLimit: string | number
  details?: Record<string, any> | string
}

/**
 * Emite log estruturado e com alto destaque visual no console do servidor
 * quando uma permissão de acesso é negada.
 */
export function logPermissionDenied(params: PermissionDeniedLogParams): void {
  const roleName = getRoleLabel(params.roleId)
  const permKey = params.permissionKey || (params.resource && params.action ? `${params.resource}.${params.action}` : "desconhecida")
  const timestamp = new Date().toISOString()

  const lines = [
    "═══════════════════════════════════════════════════════════════════════════════",
    "🚫 [PERMISSÃO NEGADA / 403 FORBIDDEN]",
    `• Data/Hora       : ${timestamp}`,
    `• Permissão       : ${permKey}`,
    `• ID do Usuário   : ${params.userId || "N/A"}`,
    `• Cargo           : ${roleName} (${params.roleId || "N/A"})`,
    `• Empresa/Partner : ${params.partnerId || "N/A"}${params.storeId ? ` (Loja: ${params.storeId})` : ""}`,
    params.reason ? `• Motivo          : ${params.reason}` : null,
    params.details ? `• Detalhes        : ${typeof params.details === "string" ? params.details : JSON.stringify(params.details)}` : null,
    "═══════════════════════════════════════════════════════════════════════════════",
  ].filter(Boolean)

  console.warn(lines.join("\n"))
}

/**
 * Emite log estruturado quando uma regra/limite de política de negócio é violada
 * (ex: desconto acima do teto permitido configurado na empresa).
 */
export function logPolicyLimitExceeded(params: PolicyLimitLogParams): void {
  const timestamp = new Date().toISOString()

  const lines = [
    "═══════════════════════════════════════════════════════════════════════════════",
    `⚠️ [LIMITE DE POLÍTICA EXCEDIDO / ${params.policy.toUpperCase()}]`,
    `• Data/Hora       : ${timestamp}`,
    `• Política        : ${params.policy}`,
    `• Valor Tentado   : ${params.attemptedValue}`,
    `• Limite Permitido: ${params.allowedLimit}`,
    `• ID do Usuário   : ${params.userId || "N/A"}`,
    `• Empresa/Partner : ${params.partnerId || "N/A"}${params.storeId ? ` (Loja: ${params.storeId})` : ""}`,
    params.details ? `• Detalhes        : ${typeof params.details === "string" ? params.details : JSON.stringify(params.details)}` : null,
    "═══════════════════════════════════════════════════════════════════════════════",
  ].filter(Boolean)

  console.warn(lines.join("\n"))
}
