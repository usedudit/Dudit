import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { Customer, CustomerInput } from "@/lib/types/customer"

export class CustomerService {
  private getSupabase = async () => await getSupabaseServerClient()

  async findById(customerId: string): Promise<Customer | null> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).single()

    if (error) {
      console.error("Error fetching customer:", error)
      return null
    }

    return data
  }

  async findByPartnerId(partnerId: string): Promise<Customer[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching customers:", error)
      return []
    }

    return data || []
  }

  async create(input: CustomerInput): Promise<{ success: boolean; customer?: Customer; error?: string }> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase.from("customers").insert(input).select().single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, customer: data }
  }

  async update(customerId: string, partnerId: string, input: Partial<CustomerInput>): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { error } = await supabase.from("customers").update(input).eq("id", customerId).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async delete(customerId: string, partnerId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { error } = await supabase.from("customers").delete().eq("id", customerId).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async searchByName(partnerId: string, searchTerm: string): Promise<Customer[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("partner_id", partnerId)
      .ilike("name", `%${searchTerm}%`)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error searching customers:", error)
      return []
    }

    return data || []
  }
}

export const customerService = new CustomerService()
