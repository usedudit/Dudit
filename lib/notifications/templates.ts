import type { NotificationAudience, NotificationType } from "./types"
import type { WhatsappAutomationTrigger } from "@/lib/whatsapp/types"

interface TemplateContext {
    orderNumber?: string
    storeName?: string
    serviceName?: string
    customerName?: string
    amount?: string
    date?: string
    time?: string
    reminderLabel?: string
    mixType?: "service" | "both"
    productName?: string
    stock?: string
    minStock?: string
    count?: string
    supplierName?: string
}

// ─── WhatsApp Message Builder ─────────────────────────────────────────────────

interface WhatsappMessageContext {
    customer_name?: string
    service_name?: string
    date?: string
    time?: string
    order_number?: string
    amount?: string
    store_name?: string
    quote_number?: string
    tracking_code?: string
    delivery_address?: string
}

function fmtDate(dateStr?: string): string {
    if (!dateStr) return ""
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return `${match[3]}/${match[2]}/${match[1]}`
    return dateStr
}

function fmtTime(timeStr?: string): string {
    if (!timeStr) return ""
    return timeStr.slice(0, 5)
}

function fmtWhen(date?: string, time?: string): string {
    const parts = [fmtDate(date), fmtTime(time)].filter(Boolean)
    if (parts.length === 2) return `${parts[0]} às ${parts[1]}`
    return parts[0] || ""
}

export function buildWhatsappMessage(
    trigger: WhatsappAutomationTrigger,
    ctx: WhatsappMessageContext = {},
): string {
    const customer = ctx.customer_name || "cliente"
    const service = ctx.service_name || "serviço"
    const store = ctx.store_name || "vendedor"
    const when = fmtWhen(ctx.date, ctx.time)
    const orderRef = ctx.order_number ? `#${ctx.order_number}` : "seu pedido"
    const amount = ctx.amount || ""

    switch (trigger) {
        // ── Agendamentos ──
        case "appointment_created":
            return [
                `📅 *Novo agendamento!*`,
                ``,
                ``,
                `Olá, ${customer}! Seu agendamento foi registrado com sucesso.`,
                ``,
                ``,
                `*Serviço:* ${service}`,
                when ? `*Data:* ${when}` : "",
                `*Local:* ${store}`,
                ``,
                ``,
                `Qualquer dúvida, é só responder esta mensagem. Até lá! 😊`,
            ].filter(Boolean).join("\n")

        case "appointment_confirmed":
            return [
                `✅ *Agendamento confirmado!*`,
                ``,
                ``,
                `Tudo certo, ${customer}! Seu agendamento está confirmado.`,
                ``,
                ``,
                `*Serviço:* ${service}`,
                when ? `*Data:* ${when}` : "",
                `*Local:* ${store}`,
                ``,
                ``,
                `Esperamos você! 🤗`,
            ].filter(Boolean).join("\n")

        case "appointment_cancelled":
            return [
                `❌ *Agendamento cancelado*`,
                ``,
                ``,
                `Olá, ${customer}. Infelizmente seu agendamento foi cancelado.`,
                ``,
                ``,
                `*Serviço:* ${service}`,
                when ? `*Data:* ${when}` : "",
                ``,
                ``,
                `Se precisar reagendar, é só nos chamar aqui. Estamos à disposição! 💬`,
            ].filter(Boolean).join("\n")

        case "appointment_rescheduled":
            return [
                `📅 *Agendamento remarcado!*`,
                ``,
                ``,
                `Olá, ${customer}! Seu agendamento foi remarcado com sucesso.`,
                ``,
                ``,
                `*Serviço:* ${service}`,
                when ? `*Novo Horário:* ${when}` : "",
                `*Local:* ${store}`,
                ``,
                ``,
                `Qualquer dúvida, é só nos chamar aqui. Até lá! 😊`,
            ].filter(Boolean).join("\n")

        case "appointment_reminder_24h":
            return [
                `⏰ *Lembrete: seu agendamento é amanhã!*`,
                ``,
                ``,
                `Olá, ${customer}! Passando pra lembrar que você tem um compromisso marcado.`,
                ``,
                ``,
                `*Serviço:* ${service}`,
                when ? `*Data:* ${when}` : "",
                `*Local:* ${store}`,
                ``,
                `Nos vemos amanhã! 👋`,
            ].filter(Boolean).join("\n")

        case "appointment_reminder_2h":
            return [
                `⏰ *Lembrete: seu agendamento é daqui a pouco!*`,
                ``,
                ``,
                `Olá, ${customer}! Seu horário está se aproximando.`,
                ``,
                ``,
                `*Serviço:* ${service}`,
                when ? `*Horário:* ${when}` : "",
                `*Local:* ${store}`,
                ``,
                `Estamos te esperando! 😊`,
            ].filter(Boolean).join("\n")

        // ── Pedidos ──
        case "order_created":
            return [
                `🛒 *Pedido recebido!*`,
                ``,
                ``,
                `Olá, ${customer}! Recebemos o pedido ${orderRef} com sucesso.`,
                ``,
                ``,
                amount ? `*Valor:* ${amount}` : "",
                `*Vendedor:* ${store}`,
                ``,
                ``,
                `Assim que o pagamento for confirmado, te avisamos por aqui. 📲`,
            ].filter(Boolean).join("\n")

        case "order_payment_approved":
            return [
                `✅ *Pagamento confirmado!*`,
                ``,
                `Oba, ${customer}! O pagamento do pedido ${orderRef} foi aprovado. 🎉`,
                ``,
                ``,
                amount ? `*Valor:* ${amount}` : "",
                `*Vendedor:* ${store}`,
                ``,
                ``,
                `Já estamos providenciando tudo. Te manteremos atualizado! 📦`,
            ].filter(Boolean).join("\n")

        case "order_preparing":
            return [
                `📦*Pedido em preparação!*`,
                ``,
                ``,
                `Olá, ${customer}! O pedido ${orderRef} já está sendo preparado.`,
                ``,
                ``,
                `*Vendedor:* ${store}`,
                ``,
                ``,
                `Logo logo ele estará pronto! ⏳`,
            ].filter(Boolean).join("\n")

        case "order_ready_pickup":
            return [
                `📦 *Pedido pronto para retirada!*`,
                ``,
                ``,
                `Olá, ${customer}! Seu pedido ${orderRef} está pronto e te esperando.`,
                `*Local de retirada:* ${store}`,
                ``,
                ``,
                `Pode vir buscar quando quiser! 🏃‍♂️`,
            ].filter(Boolean).join("\n")

        case "order_shipped":
            return [
                `🚚 *Pedido enviado!*`,
                ``,
                ``,
                `Boas notícias, ${customer}! Seu pedido ${orderRef} acabou de ser despachado.`,
                ctx.tracking_code ? `*Código de rastreio:* ${ctx.tracking_code}` : "",
                `*Vendedor:* ${store}`,
                ``,
                ``,
                `Agora é só aguardar a entrega. Prepare o coração! 📦💨`,
            ].filter(Boolean).join("\n")

        case "order_out_for_delivery":
            return [
                `🏍️ *Pedido saiu para entrega!*`,
                ``,
                ``,
                `Quase lá, ${customer}! O pedido ${orderRef} está a caminho do seu endereço.`,
                `*Vendedor:* ${store}`,
                ``,
                ``,
                `Fique de olho, ele chega rapidinho! 🚀`,
            ].filter(Boolean).join("\n")

        case "order_delivered":
            return [
                `🎁 *Pedido entregue!*`,
                ``,
                ``,
                `Tudo certo, ${customer}! O pedido ${orderRef} foi entregue com sucesso.`,
                `*Vendedor:* ${store}`,
                ``,
                ``,
                `Esperamos que você goste! Se precisar de algo, estamos por aqui. 😁`,
            ].filter(Boolean).join("\n")

        // ── Entregas ──
        case "delivery_route_started":
            return [
                `🗺️ *Rota de entrega iniciada!*`,
                ``,
                ``,
                `Olá, ${customer}! A rota de entrega do seu pedido foi iniciada.`,
                `Em breve ele chega até você! 🚚`,
            ].join("\n")

        case "delivery_in_progress":
            return [
                `🏍️ *Entrega em andamento!*`,
                ``,
                `Olá, ${customer}! Sua entrega está a caminho.`,
                `Fique atento, está quase chegando! 📍`,
            ].join("\n")

        case "delivery_delivered":
            return [
                `✅ *Entrega realizada!*`,
                ``,
                ``,
                `${customer}, sua entrega foi concluída com sucesso!`,
                `Obrigado pela preferência! 🙏🎉`,
            ].join("\n")

        case "delivery_failed":
            return [
                `⚠️ *Tentativa de entrega sem sucesso*`,
                ``,
                ``,
                `Olá, ${customer}. Infelizmente não conseguimos realizar a entrega.`,
                ``,
                ``,
                `Por favor, entre em contato conosco para combinar uma nova tentativa. 📞`,
            ].join("\n")

        // ── Orçamentos ──
        case "quote_shared":
            return [
                `📋 *Novo orçamento disponível!*`,
                ``,
                ``,
                `Olá, ${customer}! Preparamos um orçamento especialmente para você.`,
                ctx.quote_number ? `*Orçamento:* #${ctx.quote_number}` : "",
                `*Vendedor:* ${store}`,
                ``,
                ``,
                `Dá uma olhada e nos diga o que acha! 😉`,
            ].filter(Boolean).join("\n")

        case "quote_reminder":
            return [
                `🔔 *Lembrete de orçamento*`,
                ``,
                ``,
                `Olá, ${customer}! Seu orçamento${ctx.quote_number ? ` #${ctx.quote_number}` : ""} está próximo do vencimento.`,
                `*Vendedor:* ${store}`,
                ``,
                ``,
                `Aproveite antes que expire! Se tiver dúvidas, fale com a gente. 💬`,
            ].filter(Boolean).join("\n")

        case "payment_reminder":
            return [
                `💳 *Lembrete de pagamento*`,
                ``,
                ``,
                `Olá, ${customer}! Identificamos um pagamento pendente do pedido ${orderRef}.`,
                amount ? `*Valor:* ${amount}` : "",
                `*Vendedor:* ${store}`,
                ``,
                ``,
                `Regularize para garantir o processamento. Qualquer dúvida, estamos aqui! 🤝`,
            ].filter(Boolean).join("\n")

        case "test_message":
            return [
                `🧪 *Mensagem de teste*`,
                ``,
                `Se você recebeu isso, sua integração com WhatsApp está funcionando perfeitamente! ✅`,
                ``,
                `- ${store}`,
            ].join("\n")

        default:
            return `🔔 Você tem uma nova atualização de ${store}. Confira no app ou no site!`
    }
}

function formatBrazilianDate(dateStr?: string): string | undefined {
    if (!dateStr) return undefined
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) {
        return `${match[3]}/${match[2]}/${match[1]}`
    }
    return dateStr
}

export function buildNotificationContent(
    type: NotificationType,
    audience: NotificationAudience,
    ctx: TemplateContext = {},
): { title: string; message: string } {
    const orderRef = ctx.orderNumber ? `#${ctx.orderNumber}` : "seu pedido"
    const store = ctx.storeName || "vendedor"
    const service = ctx.serviceName || "serviço"
    const customer = ctx.customerName || "cliente"
    const formattedDate = formatBrazilianDate(ctx.date)
    const when = [formattedDate, ctx.time].filter(Boolean).join(" às ")

    switch (type) {
        case "order_created":
            if (ctx.mixType === "service") {
                return {
                    title: "📅 Novo agendamento!",
                    message: `Oba! ${customer} agendou o serviço "${service}"${when ? ` para ${when}` : ""}.`,
                }
            }
            if (ctx.mixType === "both") {
                return {
                    title: "🛍️ Novo pedido (produto + serviço)!",
                    message: `O cliente ${customer} fez o pedido ${orderRef} contendo produtos e serviços agendados.`,
                }
            }
            return {
                title: "🛒 Novo pedido pendente",
                message: `O pedido ${orderRef} foi realizado por ${customer} e está aguardando pagamento.`,
            }
        case "order_paid":
            if (audience === "seller") {
                return {
                    title: "💰 Pagamento confirmado!",
                    message: `Sucesso! O pagamento do pedido ${orderRef} de ${customer} foi confirmado${ctx.amount ? ` no valor de ${ctx.amount}` : ""}.`,
                }
            }
            return {
                title: "✅ Pedido pago com sucesso!",
                message: `Tudo certo! O pagamento do seu pedido ${orderRef} em ${store} foi confirmado. Obrigado! 🎉`,
            }
        case "order_shipped":
            if (audience === "seller") {
                return {
                    title: "🚚 Pedido enviado",
                    message: `O pedido ${orderRef} de ${customer} foi enviado.`,
                }
            }
            return {
                title: "🚚 Seu pedido foi enviado!",
                message: `Boas notícias! Seu pedido ${orderRef} em ${store} já está a caminho. Prepare o coração! 📦`,
            }
        case "order_delivered":
            if (audience === "seller") {
                return {
                    title: "🎁 Pedido entregue",
                    message: `O pedido ${orderRef} de ${customer} foi entregue com sucesso.`,
                }
            }
            return {
                title: "🎁 Pedido entregue!",
                message: `Oba! Seu pedido ${orderRef} em ${store} foi entregue. Esperamos que você goste! 😁`,
            }
        case "order_cancelled":
            if (audience === "seller") {
                return {
                    title: "❌ Pedido cancelado",
                    message: `O pedido ${orderRef} de ${customer} foi cancelado.`,
                }
            }
            return {
                title: "💔 Pedido cancelado",
                message: `Seu pedido ${orderRef} em ${store} foi cancelado. Se tiver dúvidas, fale conosco. 🥺`,
            }
        case "order_refunded":
            if (audience === "seller") {
                return {
                    title: "💸 Reembolso realizado",
                    message: `O pagamento do pedido ${orderRef} de ${customer} foi reembolsado.`,
                }
            }
            return {
                title: "💸 Reembolso realizado",
                message: `O reembolso do seu pedido ${orderRef} em ${store} foi processado com sucesso.`,
            }
        case "appointment_created":
            return {
                title: "📅 Novo agendamento!",
                message: `Oba! ${customer} agendou o serviço "${service}"${when ? ` para ${when}` : ""}.`,
            }
        case "appointment_confirmed":
            return {
                title: "✅ Agendamento confirmado!",
                message: `Tudo pronto! Seu agendamento de "${service}" em ${store}${when ? ` para ${when}` : ""} foi confirmado. Esperamos você! 😊`,
            }
        case "appointment_reminder":
            return {
                title: ctx.reminderLabel || "⏰ Lembrete de agendamento",
                message: `Não se esqueça: você tem "${service}" em ${store}${when ? ` às ${when}` : ""}. Até logo! 👋`,
            }
        case "appointment_cancelled":
            if (audience === "seller") {
                return {
                    title: "❌ Agendamento cancelado",
                    message: `O agendamento de "${service}" com ${customer}${when ? ` para ${when}` : ""} foi cancelado.`,
                }
            }
            return {
                title: "❌ Agendamento cancelado",
                message: `Atenção: seu agendamento de "${service}" em ${store}${when ? ` para ${when}` : ""} foi cancelado.`,
            }
        case "appointment_rescheduled":
            if (audience === "seller") {
                return {
                    title: "📅 Agendamento remarcado",
                    message: `O agendamento de "${service}" com ${customer}${when ? ` para ${when}` : ""} foi remarcado.`,
                }
            }
            return {
                title: "📅 Agendamento remarcado!",
                message: `Tudo pronto! Seu agendamento de "${service}" em ${store}${when ? ` para ${when}` : ""} foi remarcado. Esperamos você! 😊`,
            }
        case "subscription_created":
            if (audience === "seller") {
                return {
                    title: "💳 Nova assinatura ativa!",
                    message: `Sensacional! O cliente ${customer} acabou de assinar um plano recorrente.`,
                }
            }
            return {
                title: "🎉 Assinatura ativa!",
                message: `Seja muito bem-vindo! Sua assinatura em ${store} foi ativada com sucesso. Aproveite! 🚀`,
            }
        case "subscription_renewed":
            if (audience === "seller") {
                return {
                    title: "🔄 Assinatura renovada",
                    message: `A assinatura de ${customer} foi renovada para o próximo período.`,
                }
            }
            return {
                title: "🔄 Assinatura renovada!",
                message: `Tudo certo! Sua assinatura em ${store} foi renovada com sucesso para mais um período.`,
            }
        case "message_received":
            return {
                title: "💬 Nova mensagem",
                message: `Você recebeu uma nova mensagem${ctx.customerName ? ` de ${ctx.customerName}` : ""}. Clique para responder! ✉️`,
            }
        case "low_stock":
            return {
                title: "⚠️ Alerta: Estoque baixo!",
                message: ctx.productName
                    ? `Atenção! O produto "${ctx.productName}" está com estoque baixo (${ctx.stock || "0"} un.) - mínimo ${ctx.minStock || "0"} un. 📉`
                    : "Alguns produtos estão com estoque abaixo do mínimo.",
            }
        case "replenishment_suggested":
            return {
                title: "📋 Sugestão de reposição",
                message: ctx.count
                    ? `Temos sugestões! ${ctx.count} produto(s) precisam de reposição de estoque. Clique para conferir. 📦`
                    : "Há produtos que precisam de reposição.",
            }
        case "admin_announcement":
            return {
                title: ctx.storeName || "📢 Comunicado Importante",
                message: ctx.customerName || "Confira o novo comunicado da plataforma.",
            }
        default:
            return { title: "🔔 Notificação", message: "Você tem uma nova notificação." }
    }
}
