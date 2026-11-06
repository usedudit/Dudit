import type { ReturnRequest } from "@/components/erp/returns/types"

function toNumber(value: unknown) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Normaliza uma linha crua de `return_requests` (com joins do painel admin)
 * para o formato `ReturnRequest` usado pela listagem/grid do ERP.
 *
 * Usado por `getAdminReturnRequests` e `getAdminReturnRequestDetail` para que
 * o painel admin reutilize exatamente os mesmos componentes do ERP.
 */
export function normalizeAdminReturnRow(row: any): ReturnRequest & Record<string, any> {
  const items = (row.return_items || []).map((item: any) => ({
    id: item.id,
    orderItemId: item.order_item_id,
    productId: item.product_id,
    variantId: item.variant_id,
    productName: item.product_name_snapshot,
    sku: item.sku_snapshot || item.order_items?.services?.sku || null,
    image: null,
    price: toNumber(item.unit_price_snapshot),
    netItemValue: toNumber(item.net_item_value_snapshot),
    quantity: Number(item.quantity || 0),
    orderedQuantity: Number(item.ordered_quantity || 0),
    reason: item.reason,
    condition: item.condition,
    evidence: [],
  }))

  const evidenceImages = (row.return_evidence || []).map((e: any) => e.file_url).filter(Boolean)
  if (items.length > 0 && evidenceImages.length > 0) {
    items[0].evidence = evidenceImages
  }

  const refundValue = toNumber(row.refund_amount)
  const storeCreditValue = toNumber(row.store_credit_amount)
  const orderPaid = toNumber(
    row.order_total_snapshot || row.orders?.amount_paid || row.orders?.paid_amount || row.orders?.total_amount,
  )

  const refundType = refundValue > 0
    ? (orderPaid > 0 && Math.abs(refundValue - orderPaid) < 0.01 ? "full" : "partial")
    : undefined

  const storeName = row.stores?.name || row.stores?.trade_name || null

  return {
    id: row.id,
    partnerId: row.partner_id,
    orderId: row.order_id,
    orderNumber: row.order_number_snapshot || row.orders?.order_number || String(row.order_id || "").slice(0, 8),
    customerId: row.customer_id || row.customer_user_id || "",
    customerName: row.customer_name_snapshot || row.orders?.customer_name || "Cliente",
    customerEmail: row.customer_email_snapshot || undefined,
    customerPhone: row.customer_phone_snapshot || undefined,
    customerAddress: row.orders?.delivery_address || undefined,
    orderStatus: row.orders?.situation || undefined,
    deliveryStatus: row.orders?.delivery_status || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    source: row.source || "marketplace",
    requestType: row.request_type || undefined,
    desiredResolution: row.desired_resolution || "none",
    approvedResolution: row.approved_resolution || null,
    reason: row.reason || row.customer_reason || "",
    status: row.status,
    refundValue,
    refundType,
    storeCreditValue,
    evidenceImages: (row.return_evidence || []).map((e: any) => e.file_url).filter(Boolean),    observations: row.customer_details || row.customer_message || row.seller_notes || row.internal_notes || "",
    customerMessage: row.customer_message || row.customer_details || "",
    sellerNotes: row.seller_notes || "",
    expiresAt: row.expires_at || null,
    eligibilityStatus: row.eligibility_status || null,
    eligibilityDetails: row.eligibility_details || null,
    policySnapshot: row.policy_snapshot || null,
    slaDueAt: row.sla_due_at || null,
    slaStatus: row.sla_status || null,
    slaExpiredAt: row.sla_expired_at || null,
    reportedToDuditAt: row.reported_to_dudit_at || null,
    duditReportId: row.dudit_report_id || null,
    paymentProvider: row.orders?.payment_provider || undefined,
    mpPaymentId: row.orders?.mp_payment_id || null,
    orderTotal: toNumber(row.order_total_snapshot || row.orders?.total_amount),
    orderPaidAmount: orderPaid,
    refundPaymentMethod: row.refund_payment_method || undefined,
    exchangeOrderId: row.exchange_order_id || null,
    exchangeSubstatus: row.exchange_substatus || null,
    exchangeShortfallAmount: toNumber(row.exchange_shortfall_amount),
    exchangeSurplusAmount: toNumber(row.exchange_surplus_amount),
    exchangeItemsSnapshot: Array.isArray(row.exchange_items_snapshot) ? row.exchange_items_snapshot : null,
    exchangeBalanceResolution: row.exchange_balance_resolution || null,
    items,
    storeName,
  }
}
