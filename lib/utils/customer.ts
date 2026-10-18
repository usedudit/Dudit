// Helpers compartilhados para normalizar dados de cliente entre Pedidos e Ordens de Serviço.

/**
 * Normaliza o objeto de cliente para o formato esperado por `CustomerCard`,
 * garantindo que `addresses` (com primary/billing) esteja sempre presente.
 *
 * Aceita tanto o shape cru do banco (snake_case, `addresses(*)`) quanto o
 * retorno de `getPOSCustomerDetailsAction` (que expõe `address`/`addresses`).
 */
export function normalizeCustomerForCard(customer: any) {
  if (!customer) return null

  const primaryAddress =
    customer.address ||
    customer.addresses?.find((address: any) => address?.address_type === "primary" || address?.is_default) ||
    customer.addresses?.[0] ||
    null

  const billingAddress = customer.addresses?.find((address: any) => address?.address_type === "billing") || null

  const mapAddress = (address: any) => ({
    address_type: address.address_type || "primary",
    is_default: !!address.is_default,
    zipCode: address.zipCode || address.zip_code || "",
    street: address.street || "",
    number: address.number || "",
    complement: address.complement || "",
    neighborhood: address.neighborhood || "",
    city: address.city || "",
    state: address.state || address.uf || "",
    country: address.country || "BR",
  })

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email || null,
    phone: customer.phone || null,
    image_url: customer.image_url || customer.avatar_url || customer.avatar || customer.imageUrl || null,
    addresses: [primaryAddress, billingAddress].filter(Boolean).map(mapAddress),
  }
}
