export function formatDocument(doc: string | null): string {
    if (!doc) return ""
    const cleaned = doc.replace(/\D/g, "")
    if (cleaned.length === 11) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    }
    if (cleaned.length === 14) {
        return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    }
    return doc
}

export function getPaymentMethodLabel(method: string | null): string {
    const labels: Record<string, string> = {
        pix: "PIX",
        credit_card: "Cartão de Crédito",
        debit_card: "Cartão de Débito",
        boleto: "Boleto Bancário",
        account_money: "Saldo Mercado Pago",
        cash: "Dinheiro",
        bank_transfer: "Transferência Bancária",
        other: "Outro",
    }
    return labels[method || ""] || method || "Não informado"
}

export function getGatewayLabel(gateway: string | null): string {
    const labels: Record<string, string> = {
        mercado_pago: "Mercado Pago",
        stripe: "Stripe",
        asaas: "Asaas",
        pagseguro: "PagSeguro",
        manual: "Manual",
    }
    return labels[gateway || ""] || gateway || "Não informado"
}

export function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        pending: "Pendente",
        processing: "Processando",
        approved: "Aprovado",
        rejected: "Rejeitado",
        refunded: "Reembolsado",
        cancelled: "Cancelado",
        chargeback: "Chargeback",
        completed: "Concluído",
        failed: "Falhou",
    }
    return labels[status] || status
}
