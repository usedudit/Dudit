import "server-only"

type DbClient = {
  from: (table: string) => any
}

export interface OrderBuyerFiscal {
  personType: "pf" | "pj" | null
  name: string | null
  customerId: string | null
  /** CNPJ do comprador, quando pessoa jurídica. */
  document: string | null
}

function toPersonType(
  personType: string | null | undefined,
  cnpj: string | null | undefined,
): "pf" | "pj" | null {
  const digits = (cnpj || "").replace(/\D/g, "")
  if (personType === "pj" || digits.length === 14) return "pj"
  if (personType === "pf") return "pf"
  return null
}

/**
 * Resolve o comprador fiscal de um pedido.
 *
 * Pedidos do ERP gravam o cliente em `customer_id` e, por compatibilidade,
 * também em `buyer_id`. Pedidos antigos/marketplace podem ter apenas `buyer_id`
 * apontando para o usuário autenticado. Por isso tentamos as três chaves
 * (customer_id, buyer_id como cliente e buyer_id como usuário) e ficamos com a
 * primeira que existir.
 */
export async function resolveOrderBuyerFiscal(
  db: DbClient,
  order: {
    partner_id?: string | null
    customer_id?: string | null
    buyer_id?: string | null
    customer_name?: string | null
  },
): Promise<OrderBuyerFiscal> {
  const partnerId = order.partner_id || null
  const customerId = order.customer_id || null
  const buyerId = order.buyer_id || null

  const fetchCustomer = async (
    column: "id" | "user_id" | "marketplace_user_id",
    value: string,
  ) => {
    let query = db
      .from("customers")
      .select("id, person_type, cnpj, name, nome_fantasia")
      .eq(column, value)
    if (partnerId) query = query.eq("partner_id", partnerId)
    const { data } = await query.limit(1)
    return (Array.isArray(data) ? data[0] : data) || null
  }

  const lookups: Promise<any>[] = []
  if (customerId) lookups.push(fetchCustomer("id", customerId))
  if (buyerId) {
    lookups.push(fetchCustomer("id", buyerId))
    lookups.push(fetchCustomer("user_id", buyerId))
    lookups.push(fetchCustomer("marketplace_user_id", buyerId))
  }

  const results = await Promise.all(lookups)
  const customer = results.find(Boolean) || null

  if (!customer) {
    return {
      personType: null,
      name: order.customer_name || null,
      customerId,
      document: null,
    }
  }

  return {
    personType: toPersonType(customer.person_type, customer.cnpj),
    name: customer.nome_fantasia || customer.name || order.customer_name || null,
    customerId: customer.id || customerId,
    document: customer.cnpj || null,
  }
}
