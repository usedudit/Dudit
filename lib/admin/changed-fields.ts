/**
 * Diff simples entre o estado original de uma entidade e o payload enviado
 * pelo form do ERP. Usado para mostrar ao admin o resumo de alterações no
 * AdminActionModal e para montar a notificação enviada ao vendedor.
 *
 * Módulo puro (sem dependências de server/client) - importável dos dois lados.
 */

const FIELD_LABELS: Record<string, string> = {
    // geral
    name: "nome",
    description: "descrição",
    price: "preço",
    sku: "sku",
    gtin: "código de barras",
    images: "imagens",
    tags: "tags",
    status: "status",
    isActive: "status",
    is_active: "status",
    category: "categoria",
    category_id: "categoria",
    categoryId: "categoria",
    subcategory: "subcategoria",
    subcategory_id: "subcategoria",
    subcategoryId: "subcategoria",
    brand: "marca",
    brand_id: "marca",
    brandId: "marca",
    condition: "estado",
    unit: "unidade",
    location: "localização",
    // estoque
    stock_quantity: "estoque",
    stock: "estoque",
    stockQuantity: "estoque",
    min_stock: "estoque mínimo",
    minStock: "estoque mínimo",
    max_stock: "estoque máximo",
    maxStock: "estoque máximo",
    allow_sell_without_stock: "venda sem estoque",
    // preço/promoção
    cost_price: "custo",
    costPrice: "custo",
    promotional_price: "preço promocional",
    promotionalPrice: "preço promocional",
    is_on_promotion: "promoção",
    isOnPromotion: "promoção",
    show_price_in_store: "exibição do preço",
    showInMarketplace: "marketplace",
    show_in_marketplace: "marketplace",
    // fiscal/logística
    ncm: "NCM",
    cest: "CEST",
    weight_gross: "peso bruto",
    weight_net: "peso líquido",
    width: "largura",
    height: "altura",
    length: "comprimento",
    // vídeo
    video_url: "vídeo",
    videoUrl: "vídeo",
    video_type: "vídeo",
    videoType: "vídeo",
    // serviço
    duration_minutes: "duração",
    durationMinutes: "duração",
    billing_unit: "unidade de cobrança",
    billingUnit: "unidade de cobrança",
    price_type: "tipo de preço",
    priceType: "tipo de preço",
    resources: "recursos",
    assigned_staff: "equipe",
    technical_details: "detalhes técnicos",
    // plano recorrente
    frequencyType: "frequência",
    frequency_type: "frequência",
    frequencyInterval: "intervalo da frequência",
    startDate: "data de início",
    start_date: "data de início",
    endDate: "data de término",
    end_date: "data de término",
    items: "itens",
    shippingMode: "frete",
    shipping_mode: "frete",
    shippingFlatAmount: "valor do frete",
    billingMode: "faturamento",
    // pedido
    discount: "desconto",
    discountValue: "desconto",
    discount_value: "desconto",
    shippingFee: "frete",
    shipping_fee: "frete",
    notes: "observações",
    customer: "cliente",
    customerId: "cliente",
    customer_id: "cliente",
    deliveryMethod: "tipo de entrega",
    delivery_method: "tipo de entrega",
    salesChannel: "canal de venda",
    sales_channel: "canal de venda",
    sellerPartnerUserId: "responsável",
    seller_partner_user_id: "responsável",
    situation: "situação",
    paymentStatus: "status de pagamento",
    deliveryStatus: "status de entrega",
    payment_status: "status de pagamento",
    delivery_status: "status de entrega",
    totalAmount: "valor total",
    total_amount: "valor total",
    street: "endereço",
    number: "número",
    neighborhood: "bairro",
    city: "cidade",
    uf: "UF",
    zipcode: "CEP",
    zip_code: "CEP",
}

const SKIP_KEYS = new Set([
    "csrf_token",
    "updated_at",
    "createdAt",
    "created_at",
    "id",
    "partnerId",
    "partner_id",
    "storeId",
    "store_id",
])

function normalize(value: unknown): string {
    if (value === undefined || value === null) return ""
    if (typeof value === "boolean") return value ? "true" : ""
    if (value instanceof File) return `file:${value.name}`
    if (typeof value === "object") {
        try {
            return JSON.stringify(value)
        } catch {
            return String(value)
        }
    }
    return String(value).trim().toLowerCase()
}

/** Retorna os rótulos (pt-BR) dos campos que mudaram entre original e payload. */
export function diffChangedFields(
    original: Record<string, any> | null | undefined,
    payload: Record<string, any> | null | undefined,
): string[] {
    if (!original || !payload) return []
    const changed: string[] = []
    const seen = new Set<string>()

    for (const [key, value] of Object.entries(payload)) {
        if (value === undefined) continue
        if (SKIP_KEYS.has(key)) continue
        if (key.startsWith("pending_")) continue

        const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
        const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
        const origKey = key in original ? key : camelKey in original ? camelKey : snakeKey in original ? snakeKey : null
        // Campos que o form envia por padrão mas que não existem no registro
        // original (internos do form) nunca são reportados como "alterados".
        if (origKey === null) continue
        // Só reporta campos com rótulo conhecido - evita poluir o resumo e a
        // notificação com chaves internas do form.
        const label = FIELD_LABELS[key]
        if (!label) continue

        const before = normalize(original[origKey as string])
        const after = normalize(value)
        if (before === after) continue

        if (seen.has(label)) continue
        seen.add(label)
        changed.push(label)
    }

    return changed
}
