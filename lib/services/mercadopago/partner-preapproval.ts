import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { createCheckoutFulfillmentToken } from "@/lib/security/checkout-fulfillment-token"

interface PreapprovalConfig {
  partnerId: string
  payerEmail: string
  planName: string
  amount: number
  frequency: number
  frequencyType: "days" | "weeks" | "months" | "years"
  externalReference: string
  /** Data da primeira cobranca recorrente (auto_recurring.start_date). */
  startDate?: string | null
}

/**
 * Call Mercado Pago Preapproval API using the partner's access token
 */
export async function createMpPreapproval({
  partnerId,
  payerEmail,
  planName,
  amount,
  frequency,
  frequencyType,
  externalReference,
  startDate,
}: PreapprovalConfig) {
  const token = await getValidMercadoPagoAccessToken(partnerId)

  const checkoutToken = createCheckoutFulfillmentToken(externalReference)
  if (!checkoutToken) {
    throw new Error("CHECKOUT_FULFILLMENT_SECRET não configurado")
  }

  const payload = {
    payer_email: payerEmail,
    back_url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://dudit.com.br"}/checkout/fulfillment?subscription_id=${encodeURIComponent(externalReference)}&checkout_token=${encodeURIComponent(checkoutToken)}`,
    reason: `Assinatura: ${planName}`,
    external_reference: externalReference,
    auto_recurring: {
      frequency,
      frequency_type: frequencyType,
      transaction_amount: Number(amount.toFixed(2)),
      currency_id: "BRL",
      ...(startDate ? { start_date: startDate } : {}),
    },
    status: "authorized",
  }

  const response = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Mercado Pago Preapproval API error:", errorData)
    throw new Error(
      errorData?.message || `MP Preapproval API failed with status ${response.status}`
    )
  }

  const data = await response.json()
  return {
    id: data.id,
    initPoint: data.init_point,
    status: data.status,
  }
}

/**
 * Cancel a subscription in Mercado Pago
 */
export async function cancelMpPreapproval(partnerId: string, preapprovalId: string) {
  const token = await getValidMercadoPagoAccessToken(partnerId)

  const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "cancelled",
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Mercado Pago Preapproval cancel error:", errorData)
    throw new Error(
      errorData?.message || `MP Preapproval cancel failed with status ${response.status}`
    )
  }

  return response.json()
}

/**
 * Pause a subscription in Mercado Pago
 */
export async function pauseMpPreapproval(partnerId: string, preapprovalId: string) {
  const token = await getValidMercadoPagoAccessToken(partnerId)

  const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "paused",
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Mercado Pago Preapproval pause error:", errorData)
    throw new Error(
      errorData?.message || `MP Preapproval pause failed with status ${response.status}`
    )
  }

  return response.json()
}

/**
 * Resume/reactive a subscription in Mercado Pago
 */
export async function resumeMpPreapproval(partnerId: string, preapprovalId: string) {
  const token = await getValidMercadoPagoAccessToken(partnerId)

  const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "authorized",
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Mercado Pago Preapproval resume error:", errorData)
    throw new Error(
      errorData?.message || `MP Preapproval resume failed with status ${response.status}`
    )
  }

  return response.json()
}

/**
 * Get status of a subscription from Mercado Pago
 */
export async function getMpPreapprovalDetails(partnerId: string, preapprovalId: string) {
  const token = await getValidMercadoPagoAccessToken(partnerId)

  const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Mercado Pago Preapproval fetch error:", errorData)
    throw new Error(
      errorData?.message || `MP Preapproval details failed with status ${response.status}`
    )
  }

  return response.json()
}

/**
 * Update the start/next payment date of a subscription preapproval in Mercado Pago
 */
export async function updateMpPreapprovalNextPaymentDate(
  partnerId: string,
  preapprovalId: string,
  dateStr: string
) {
  const token = await getValidMercadoPagoAccessToken(partnerId)

  const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auto_recurring: {
        start_date: dateStr,
      },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Mercado Pago Preapproval reschedule error:", errorData)
    throw new Error(
      errorData?.message || `MP Preapproval reschedule failed with status ${response.status}`
    )
  }

  return response.json()
}

/**
 * Update the recurring amount of a subscription preapproval in Mercado Pago.
 *
 * Used when the recurring plan's price or freight changes; the caller is
 * responsible for only doing so with the customer's consent.
 */
export async function updateMpPreapprovalAmount(
  partnerId: string,
  preapprovalId: string,
  amount: number
) {
  const token = await getValidMercadoPagoAccessToken(partnerId)

  const response = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auto_recurring: {
        transaction_amount: amount,
      },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    console.error("Mercado Pago Preapproval amount update error:", errorData)
    throw new Error(
      errorData?.message || `MP Preapproval amount update failed with status ${response.status}`
    )
  }

  return response.json()
}
