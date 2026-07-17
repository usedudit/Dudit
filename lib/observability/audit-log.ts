/**
 * Log estruturado para operações críticas.
 * Usado por todas as Server Actions que realizam operações auditáveis.
 * Nunca logar secrets, tokens ou dados pessoais.
 */

type AuditEvent =
  | "store.switched"
  | "store.created"
  | "store.updated"
  | "store.deleted"
  | "store_member.added"
  | "store_member.removed"
  | "store_member.role_updated"
  | "stock.movement"
  | "stock.transfer"
  | "whatsapp.connection_resolved"
  | "promotion.created"
  | "promotion.updated"
  | "promotion.deleted"
  | "promotion.stores_updated"
  | "coupon.created"
  | "coupon.updated"
  | "coupon.deleted"
  | "coupon.stores_updated"

export function logAudit(event: AuditEvent, data: Record<string, unknown>): void {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  }
  console.log(JSON.stringify(payload))
}
