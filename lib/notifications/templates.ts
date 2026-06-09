import type { NotificationAudience, NotificationType } from "./types"

interface TemplateContext {
  orderNumber?: string
  storeName?: string
  serviceName?: string
  customerName?: string
  amount?: string
  date?: string
  time?: string
  reminderLabel?: string
}

export function buildNotificationContent(
  type: NotificationType,
  audience: NotificationAudience,
  ctx: TemplateContext = {},
): { title: string; message: string } {
  const orderRef = ctx.orderNumber ? `#${ctx.orderNumber}` : "seu pedido"
  const store = ctx.storeName || "a loja"
  const service = ctx.serviceName || "serviço"
  const customer = ctx.customerName || "cliente"
  const when = [ctx.date, ctx.time].filter(Boolean).join(" às ")

  switch (type) {
    case "order_created":
      return {
        title: "Novo pedido",
        message: `Pedido ${orderRef} de ${customer} aguardando pagamento.`,
      }
    case "order_paid":
      if (audience === "seller") {
        return {
          title: "Pagamento recebido",
          message: `Pagamento confirmado no pedido ${orderRef}${ctx.amount ? ` (${ctx.amount})` : ""}.`,
        }
      }
      return {
        title: "Pedido pago",
        message: `Seu pedido ${orderRef} em ${store} foi pago com sucesso.`,
      }
    case "order_shipped":
      return {
        title: "Pedido enviado",
        message: `Seu pedido ${orderRef} em ${store} foi enviado.`,
      }
    case "order_delivered":
      return {
        title: "Pedido entregue",
        message: `Seu pedido ${orderRef} em ${store} foi entregue.`,
      }
    case "appointment_created":
      return {
        title: "Novo agendamento",
        message: `${customer} agendou ${service}${when ? ` para ${when}` : ""}.`,
      }
    case "appointment_confirmed":
      return {
        title: "Agendamento confirmado",
        message: `Seu agendamento de ${service} em ${store}${when ? ` (${when})` : ""} foi confirmado.`,
      }
    case "appointment_reminder":
      return {
        title: ctx.reminderLabel || "Lembrete de agendamento",
        message: `Você tem ${service} em ${store}${when ? ` às ${when}` : ""}.`,
      }
    case "appointment_cancelled":
      return {
        title: "Agendamento cancelado",
        message:
          audience === "seller"
            ? `O agendamento de ${service} com ${customer} foi cancelado.`
            : `Seu agendamento de ${service} em ${store} foi cancelado.`,
      }
    case "subscription_created":
      return {
        title: audience === "seller" ? "Nova assinatura" : "Assinatura ativa",
        message:
          audience === "seller"
            ? `${customer} assinou um plano recorrente.`
            : `Sua assinatura em ${store} foi criada com sucesso.`,
      }
    case "subscription_renewed":
      return {
        title: "Assinatura renovada",
        message:
          audience === "seller"
            ? `Assinatura de ${customer} foi renovada.`
            : `Sua assinatura em ${store} foi renovada.`,
      }
    case "message_received":
      return {
        title: "Nova mensagem",
        message: `Você recebeu uma nova mensagem${ctx.customerName ? ` de ${ctx.customerName}` : ""}.`,
      }
    case "admin_announcement":
      return {
        title: ctx.storeName || "Comunicado Dudit",
        message: ctx.customerName || "Confira o comunicado da plataforma.",
      }
    default:
      return { title: "Notificação", message: "Você tem uma nova notificação." }
  }
}
