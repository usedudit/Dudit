import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { Order, OrderInput, OrderWithDetails } from "@/lib/types/order"

export class OrderService {
  private getSupabase = async () => await getSupabaseServerClient()

  async findById(orderId: string): Promise<OrderWithDetails | null> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        items:order_items(*),
        customer:customers(*)
      `)
      .eq("id", orderId)
      .single()

    if (error) {
      console.error("Error fetching order:", error)
      return null
    }

    return data
  }

  async findByPartnerId(partnerId: string): Promise<Order[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching orders:", error)
      return []
    }

    return data || []
  }

  async create(input: OrderInput): Promise<{ success: boolean; order?: Order; error?: string }> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase.from("orders").insert(input).select().single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, order: data }
  }

  async updateStatus(orderId: string, partnerId: string, status: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async delete(orderId: string, partnerId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { error } = await supabase.from("orders").delete().eq("id", orderId).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }
}

export const orderService = new OrderService()
