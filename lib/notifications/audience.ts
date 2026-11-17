import type { NotificationType } from "./types"
import type { PartnerRole } from "@/lib/permissions/types"

/**
 * Quem recebe cada tipo de notificação da loja.
 *
 * A ideia é simples: eventos do dia a dia (pedido novo, pagamento, envio,
 * agenda) vão para todo mundo que opera a loja. Já eventos financeiros,
 * fiscais, de moderação e de assinatura ficam com a gestão. O entregador só
 * recebe o que é atribuído diretamente a ele (entregas), não o fluxo da loja.
 */

/** Gestão da operação: enxerga o dia a dia e também as decisões. */
export const OPERATIONAL_ROLES: PartnerRole[] = ["OWNER", "ADMIN", "MANAGER", "OPERATOR"]

/** Gestão: dinheiro, fiscal, moderação, devoluções e políticas da loja. */
export const MANAGEMENT_ROLES: PartnerRole[] = ["OWNER", "ADMIN", "MANAGER"]

/** Dono da conta: assinatura, faturamento da plataforma e dados fiscais. */
export const OWNERSHIP_ROLES: PartnerRole[] = ["OWNER", "ADMIN"]

/** Todo o time, incluindo entregadores (comunicados da plataforma). */
export const ALL_SELLER_ROLES: PartnerRole[] = ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "DELIVERY"]

/**
 * Mapa padrão tipo de notificação -> papéis do time que recebem.
 *
 * `admin_announcement` é o tipo genérico usado por comunicados da plataforma,
 * por isso o padrão é "todo o time". Chamadas de moderação/enforcement passam
 * `MANAGEMENT_ROLES` explicitamente.
 */
export const NOTIFICATION_RECIPIENT_ROLES: Record<NotificationType, PartnerRole[]> = {
  // Fluxo operacional de pedidos: quem toca a loja precisa saber.
  order_created: OPERATIONAL_ROLES,
  order_paid: OPERATIONAL_ROLES,
  order_shipped: OPERATIONAL_ROLES,
  order_delivered: OPERATIONAL_ROLES,

  // Cancelamento, reembolso e devolução envolvem dinheiro e política:
  // operadores não têm permissão de cancelar/reembolsar.
  order_cancelled: MANAGEMENT_ROLES,
  order_refunded: MANAGEMENT_ROLES,

  // Agenda: a operação precisa ver; o profissional atribuído é somado à parte.
  appointment_created: OPERATIONAL_ROLES,
  appointment_confirmed: OPERATIONAL_ROLES,
  appointment_reminder: OPERATIONAL_ROLES,
  appointment_cancelled: OPERATIONAL_ROLES,
  appointment_rescheduled: OPERATIONAL_ROLES,

  // Assinatura da plataforma é assunto de dono/admin.
  subscription_created: OWNERSHIP_ROLES,
  subscription_renewed: OWNERSHIP_ROLES,
  subscription_price_change: OWNERSHIP_ROLES,
  subscription_price_change_expired: OWNERSHIP_ROLES,

  message_received: OPERATIONAL_ROLES,

  // Comunicado genérico: padrão é todos os vendedores. Chamadas específicas
  // (moderação, enforcement, denúncias) passam MANAGEMENT_ROLES na mão.
  admin_announcement: ALL_SELLER_ROLES,

  // Estoque baixo é operacional; reposição é decisão de compra da gestão.
  low_stock: OPERATIONAL_ROLES,
  replenishment_suggested: MANAGEMENT_ROLES,

  service_return_reminder: OPERATIONAL_ROLES,

  // Só existe para o cliente; nunca deve ser disparado para o time.
  cart_abandoned: [],

  // Limite fiscal (MEI/nano) é risco do negócio: gestão.
  revenue_limit_alert: MANAGEMENT_ROLES,
}

/**
 * Papéis que devem receber um tipo de notificação.
 * `override` permite que um ponto de chamada estreite/ajuste o padrão
 * (ex.: admin_announcement de moderação -> MANAGEMENT_ROLES).
 */
export function getNotificationRecipientRoles(
  type: NotificationType,
  override?: PartnerRole[] | null,
): PartnerRole[] {
  if (override != null) return override
  return NOTIFICATION_RECIPIENT_ROLES[type] ?? OPERATIONAL_ROLES
}

/** Normaliza `role`/`role_id` do banco (maiúsculo/minúsculo) para PartnerRole. */
export function normalizePartnerRole(value: string | null | undefined): PartnerRole | null {
  if (!value) return null
  const upper = value.trim().toUpperCase()
  if (upper === "OWNER") return "OWNER"
  if (upper === "ADMIN") return "ADMIN"
  if (upper === "MANAGER") return "MANAGER"
  if (upper === "OPERATOR" || upper === "EDITOR") return "OPERATOR"
  if (upper === "DELIVERY" || upper === "VIEWER") return "DELIVERY"
  return null
}
