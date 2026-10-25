/**
 * Debug script: Run fulfillMarketplaceOrder for a specific order and capture full error.
 */
require("dotenv").config()
const { createClient } = require("@supabase/supabase-js")

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

  const supabase = createClient(supabaseUrl, supabaseKey)

  const orderId = process.argv[2]
  if (!orderId) {
    console.error("Usage: npx tsx scripts/debug-fulfill.ts <orderId>")
    process.exit(1)
  }

  // Get order - try by order_number or by id
  let orderQuery = supabase
    .from("orders")
    .select("id, order_number, partner_id, buyer_id, store_id, situation, customer_id, checkout_fulfillment, order_source, finance_account_id, customer_name, delivery_type, delivery_address, payment_method, paid_amount, amount_paid, delivery_fee, delivery_breakdown")
  orderQuery = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
    ? orderQuery.eq("id", orderId)
    : orderQuery.eq("order_number", orderId)

  const { data: order, error: orderError } = await orderQuery.single()

  if (orderError || !order) {
    console.error("Order not found:", orderError)
    process.exit(1)
  }

  console.log("Order:", order.order_number || order.id)
  console.log("Situation:", order.situation)
  console.log("Source:", order.order_source)
  console.log("Paid amount:", order.paid_amount)
  console.log("Checkout fulfillment:", JSON.stringify(order.checkout_fulfillment, null, 2))

  // Try to reproduce the fulfillment logic step by step
  const payload = order.checkout_fulfillment
  if (!payload?.lines?.length) {
    console.log("No fulfillment lines")
    return
  }

  const serviceBookingLines = payload.lines.filter(
    (line) =>
      line.itemType === "service_booking" &&
      line.bookingMetadata &&
      !line.bookingMetadata.instantPurchase &&
      line.bookingMetadata.staffId,
  )

  console.log("\nService booking lines found:", serviceBookingLines.length)

  if (serviceBookingLines.length === 0) {
    console.log("FILTERED OUT! Reasons:")
    for (const line of payload.lines) {
      if (line.itemType === "service_booking") {
        const meta = line.bookingMetadata
        console.log(`  - ${line.lineName}: bookingMetadata=${!!meta}, instantPurchase=${meta?.instantPurchase}, staffId=${meta?.staffId}`)
      }
    }
  }

  // Check capabilities
  const partnerId = order.partner_id

  const { data: partner } = await supabase
    .from("partners")
    .select("order_flow, business_info, phone")
    .eq("id", partnerId)
    .maybeSingle()
  console.log("\nPartner:", { order_flow: partner?.order_flow, business_info: partner?.business_info })

  // Check partner resources (system_resources)
  const businessInfo = typeof partner?.business_info === "string" ? JSON.parse(partner.business_info) : (partner?.business_info || {})
  const resources = businessInfo?.activeResources || businessInfo?.resources || businessInfo?.system_resources || []
  console.log("Resources:", resources)

  // Check if staff_partner_user_id exists
  for (const line of serviceBookingLines) {
    const meta = line.bookingMetadata
    const { data: staffUser } = await supabase
      .from("partner_users")
      .select("id, user_id")
      .eq("id", meta.staffId)
      .eq("partner_id", partnerId)
      .maybeSingle()

    console.log(`\nStaff user ${meta.staffId}:`, staffUser ? "exists" : "NOT FOUND or wrong partner")
  }

  // Check appointments table for any constraint issues
  console.log("\nChecking appointments for this order:...")
  const { data: existingAppts } = await supabase
    .from("appointments")
    .select("id, marketplace_order_id, staff_partner_user_id, status")
    .eq("marketplace_order_id", orderId)
  console.log("Existing appointments:", existingAppts?.length || 0)

  // Check checkout_fulfillments
  const { data: fulfillments } = await supabase
    .from("checkout_fulfillments")
    .select("id, status, error_message, result")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })

  console.log("\nFulfillments:")
  if (fulfillments && fulfillments.length > 0) {
    for (const f of fulfillments) {
      console.log(`  - ${f.status} | error: ${f.error_message} | result: ${JSON.stringify(f.result)}`)
    }
  } else {
    console.log("  None")
  }

  process.exit(0)
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
