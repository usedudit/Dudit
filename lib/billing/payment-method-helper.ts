export interface ResolvedPaymentMethod {
    name: string
    type: "pix" | "credit_card" | "debit_card" | "boleto" | "other"
    iconUrl: string
    brand?: string
    last4?: string
    detailsText?: string
}

export function resolvePaymentMethodDetails(payment?: any, purchase?: any): ResolvedPaymentMethod {
    const rawType = String(payment?.payment_method_type || purchase?.payment_method_type || "").toLowerCase().trim()
    const details = payment?.payment_method_details || payment?.gateway_response || purchase?.gateway_response || {}
    const methodId = String(details.payment_method_id || details.payment_type_id || "").toLowerCase().trim()
    const desc = String(purchase?.description || "").toLowerCase()

    // 1. PIX
    if (
        rawType === "pix" ||
        rawType.includes("pix") ||
        methodId.includes("pix") ||
        desc.includes("pix")
    ) {
        return {
            name: "PIX",
            type: "pix",
            iconUrl: "https://img.dudit.com.br/static/icons/payments/Pix.png",
            detailsText: "Pagamento instantâneo",
        }
    }

    // 2. Boleto Bancário
    if (
        rawType === "boleto" ||
        rawType.includes("boleto") ||
        methodId.includes("ticket") ||
        methodId.includes("bolbradesco") ||
        methodId.includes("boleto") ||
        desc.includes("boleto")
    ) {
        return {
            name: "Boleto Bancário",
            type: "boleto",
            iconUrl: "https://img.dudit.com.br/static/icons/payments/Boleto.png",
            detailsText: "Compensação bancária",
        }
    }

    // 3. Cartão de Débito
    if (
        rawType === "debit_card" ||
        rawType.includes("debit") ||
        methodId.includes("debit_card")
    ) {
        return {
            name: "Cartão de Débito",
            type: "debit_card",
            iconUrl: "https://img.dudit.com.br/static/icons/payments/CreditCard.png",
            detailsText: "Débito à vista",
        }
    }

    // 4. Cartão de Crédito
    const brand = details.payment_method_id || details.card?.brand || details.cardholder?.name || ""
    const last4 = details.last_four_digits || details.card?.last_four_digits || details.last4

    if (
        rawType === "credit_card" ||
        rawType.includes("credit") ||
        methodId.includes("credit_card") ||
        details.card ||
        last4 ||
        desc.includes("cartão") ||
        desc.includes("cartao")
    ) {
        let cardName = "Cartão de Crédito"
        if (brand && last4) {
            cardName = `Cartão de Crédito (${String(brand).toUpperCase()} •••• ${last4})`
        } else if (last4) {
            cardName = `Cartão de Crédito (•••• ${last4})`
        } else if (brand && !brand.includes("credit")) {
            cardName = `Cartão de Crédito (${String(brand).toUpperCase()})`
        }

        return {
            name: cardName,
            type: "credit_card",
            iconUrl: "https://img.dudit.com.br/static/icons/payments/CreditCard.png",
            brand: brand ? String(brand).toUpperCase() : undefined,
            last4: last4 ? String(last4) : undefined,
            detailsText: last4 ? `Final ${last4}` : "Cobrança no cartão",
        }
    }

    // 5. Default fallback for subscription payments (Mercado Pago subscriptions are card-based)
    if (payment?.gateway_payment_id || purchase?.gateway_payment_id || purchase?.gateway === "mercado_pago") {
        return {
            name: "Cartão de Crédito",
            type: "credit_card",
            iconUrl: "https://img.dudit.com.br/static/icons/payments/CreditCard.png",
            detailsText: "Assinatura Mercado Pago",
        }
    }

    return {
        name: "Não informado",
        type: "other",
        iconUrl: "https://img.dudit.com.br/static/icons/payments/CreditCard.png",
        detailsText: "Forma de pagamento direta",
    }
}
