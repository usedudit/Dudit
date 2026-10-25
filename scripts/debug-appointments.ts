/**
 * Debug script to check appointment creation issues.
 * Usage: npx tsx scripts/debug-appointments.ts [partnerId] [limit]
 */
import { createClient } from "@supabase/supabase-js"
import "dotenv/config"

async function main() {
  require("dotenv").config()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars")
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const partnerId = process.argv[2]
  const limit = Number(process.argv[3] || 50)

  console.log("=== Recent Orders with Service Lines ===")
  if (partnerId) {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_number, order_source, situation, paid_amount, total_amount, checkout_fulfillment")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (ordersError) {
      console.error("Orders error:", ordersError)
    } else if (orders) {
      for (const order of orders) {
        const fulfillment = order.checkout_fulfillment as any
        const hasServiceLines = fulfillment?.lines?.some((l: any) => l.itemType === "service_booking")
        const serviceLines = fulfillment?.lines?.filter((l: any) => l.itemType === "service_booking") || []

        if (hasServiceLines) {
          console.log(`\nOrder: ${order.order_number} | Source: ${order.order_source} | Situation: ${order.situation} | Paid: ${order.paid_amount}/${order.total_amount}`)
          console.log(`  Fulfillment lines: ${fulfillment?.lines?.length || 0}`)
          for (const line of serviceLines) {
            const meta = line.bookingMetadata
            console.log(`  Service: ${line.lineName} | itemType: ${line.itemType} | bookingMetadata:`, {
              hasMeta: !!meta,
              instantPurchase: meta?.instantPurchase,
              staffId: meta?.staffId,
              date: meta?.date,
              time: meta?.time,
            })
          }

          // Check for appointments
          const { data: appointments } = await supabase
            .from("appointments")
            .select("id, customer_name, service_name, start_date, start_time, staff_partner_user_id, status, payment_status, marketplace_order_id")
            .eq("marketplace_order_id", order.id)

          console.log(`  Appointments linked: ${appointments?.length || 0}`)
          for (const appt of appointments || []) {
            console.log(`   - ${appt.service_name} @ ${appt.start_date} ${appt.start_time} | status: ${appt.status} | payment: ${appt.payment_status} | staff: ${appt.staff_partner_user_id}`)
          }

          // Check fulfillment record
          const { data: fulfillmentRecord, error: fulError } = await supabase
            .from("checkout_fulfillments")
            .select("status, result, error_message, idempotency_key, created_at, completed_at")
            .eq("order_id", order.id)
            .order("created_at", { ascending: false })

          if (fulError) {
            console.log(`  Fulfillment record error: ${fulError.message}`)
          } else if (fulfillmentRecord && fulfillmentRecord.length > 0) {
            for (const fr of fulfillmentRecord) {
              console.log(`  Fulfillment: ${fr.status} | error: ${fr.error_message || "none"} | created: ${fr.created_at}`)
              if (fr.result) {
                const result = fr.result as any
                console.log(`   - result appointmentIds: ${JSON.stringify(result.appointmentIds || [])} | rescheduleRequired: ${JSON.stringify(result.rescheduleRequired || [])}`)
              }
            }
          } else {
            console.log(`  No fulfillment record found`)
          }

          // Check payment breakdown for deposit info
          console.log(`  Payment breakdown: ${JSON.stringify(order.checkout_fulfillment ? { hasPayload: true, version: (order.checkout_fulfillment as any)?.version, lineCount: (order.checkout_fulfillment as any)?.lines?.length } : 'none')}`)
        }
      }
    }
  } else {
    // Get all orders with service lines in last 20
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, partner_id, order_number, situation, paid_amount, total_amount, checkout_fulfillment, order_source")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("Error:", error)
    } else if (orders) {
      for (const order of orders) {
        const fulfillment = order.checkout_fulfillment as any
        const hasServiceLines = fulfillment?.lines?.some((l: any) => l.itemType === "service_booking")
        if (hasServiceLines) {
          console.log(`\nOrder: ${order.order_number} (partner: ${order.partner_id}) | Source: ${order.order_source} | Situation: ${order.situation}`)
          const serviceLines = fulfillment.lines.filter((l: any) => l.itemType === "service_booking")
          for (const line of serviceLines) {
            const meta = line.bookingMetadata
            console.log(`  Service: ${line.lineName} | instantPurchase: ${meta?.instantPurchase} | staffId: ${meta?.staffId || "MISSING"} | date: ${meta?.date} | time: ${meta?.time}`)
          }

          const { data: appointments } = await supabase
            .from("appointments")
            .select("id, service_name, status")
            .eq("marketplace_order_id", order.id)
          console.log(`  Appointments: ${appointments?.length || 0}`)
        }
      }
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
