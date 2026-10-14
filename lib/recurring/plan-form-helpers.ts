/**
 * Funções puras de validação/normalização de planos recorrentes.
 *
 * Foram extraídas de app/actions/erp/recurring-plans.ts ("use server") porque
 * arquivos com "use server" só podem exportar server actions — e estas funções
 * síncronas também são necessárias nas actions administrativas de catálogo
 * (app/actions/admin/catalog.ts), que rodam com o service-role client.
 */

import { sanitizeInput } from "@/lib/input-validator"
import type {
    RecurringPlanItem,
    RecurringFrequencyType,
    RecurringShippingMode,
} from "@/lib/types/recurring"
import type { FulfillmentMode } from "@/lib/commerce/capabilities"

export function validatePlanInput(input: {
    name: string
    frequencyType: RecurringFrequencyType
    frequencyInterval?: number
    startDate: string
    items: RecurringPlanItem[]
}) {
    const name = sanitizeInput(String(input.name || ""), 150).trim()
    if (!name) throw new Error("Nome do plano é obrigatório.")
    if (name.length > 150) throw new Error("Nome deve ter no máximo 150 caracteres.")

    const allowed: RecurringFrequencyType[] = ["daily", "weekly", "monthly", "yearly", "custom"]
    if (!allowed.includes(input.frequencyType)) throw new Error("Frequência inválida.")

    const interval = Math.max(Number(input.frequencyInterval || 1), 1)
    if (!input.startDate) throw new Error("Data de início é obrigatória.")
    if (!Array.isArray(input.items) || input.items.length === 0) {
        throw new Error("Adicione ao menos um produto ou serviço ao plano.")
    }

    for (const item of input.items) {
        if (item.itemType === "product" && !item.productId) throw new Error("Produto inválido no plano.")
        if (item.itemType === "service") {
            if (!item.serviceId) throw new Error("Serviço inválido no plano.")
            if (!item.staffPartnerUserId) throw new Error("Selecione o profissional para cada serviço.")
        }
    }

    return { name, interval }
}

const SHIPPING_MODES: RecurringShippingMode[] = ["included", "flat", "quote"]

/**
 * Normaliza a politica de frete do plano. O valor fixo so' existe quando o
 * modo e' "flat"; nos demais modos ele' e' zerado para nao vazar lixo.
 */
export function normalizeShippingInput(input: {
    shippingMode?: RecurringShippingMode
    shippingFlatAmount?: number
}): { mode: RecurringShippingMode; flatAmount: number } {
    const mode: RecurringShippingMode = input.shippingMode || "included"
    if (!SHIPPING_MODES.includes(mode)) throw new Error("Modo de frete inválido.")

    const raw = Number(input.shippingFlatAmount ?? 0)
    if (!Number.isFinite(raw) || raw < 0) throw new Error("Valor de frete inválido.")
    if (mode === "flat" && raw <= 0) throw new Error("Informe o valor do frete fixo.")

    return { mode, flatAmount: mode === "flat" ? Math.round(raw * 100) / 100 : 0 }
}

const PLAN_FULFILLMENT_MODES: FulfillmentMode[] = ["delivery", "pickup"]

/**
 * Modalidades aceitas pelo plano (entrega e/ou retirada). A coluna e' NOT NULL
 * e aceita no minimo uma modalidade; valores desconhecidos sao descartados e a
 * lista vazia e' um erro de validacao.
 */
export function normalizePlanFulfillmentModes(
    input: FulfillmentMode[] | string[] | null | undefined,
): FulfillmentMode[] {
    if (input == null) return [...PLAN_FULFILLMENT_MODES]
    const valid = (Array.isArray(input) ? input : []).filter((mode): mode is FulfillmentMode =>
        PLAN_FULFILLMENT_MODES.includes(mode as FulfillmentMode),
    )
    if (valid.length === 0) throw new Error("Selecione ao menos uma modalidade: entrega ou retirada.")
    return [...new Set(valid)]
}

export function mapItemsToDb(items: RecurringPlanItem[]) {
    return items.map((item, index) => ({
        item_type: item.itemType,
        product_id: item.itemType === "product" ? item.productId : null,
        variant_id: item.itemType === "product" ? item.variantId || null : null,
        service_id: item.itemType === "service" ? item.serviceId : null,
        quantity: Math.max(Number(item.quantity || 1), 0.001),
        unit_price: item.unitPrice != null ? Number(item.unitPrice) : null,
        staff_partner_user_id: item.itemType === "service" ? item.staffPartnerUserId : null,
        preferred_time: item.itemType === "service" ? item.preferredTime || null : null,
        duration_minutes: item.itemType === "service" ? item.durationMinutes || null : null,
        sort_order: item.sortOrder ?? index,
    }))
}
