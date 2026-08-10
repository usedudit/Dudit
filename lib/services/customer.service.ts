import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { Customer, CustomerInput } from "@/lib/types/customer"

const CUSTOMER_LIST_SELECT = "id, partner_id, name, email, phone, marketplace_user_id, razao_social, crt, status, is_active, created_at"
const CUSTOMER_DETAIL_SELECT = "id, partner_id, name, email, phone, notes, created_at, updated_at, person_type, cpf, contribuinte, cnpj, nome_fantasia, inscricao_estadual, store_credit, status, phone_fixed, website, birth_date, mother_name, father_name, user_id, marketplace_user_id, image_url, ie_isento, inscricao_municipal, razao_social, crt, is_active, deleted_at, deleted_by, deleted_reason"

export class CustomerService {
  private getSupabase = async () => await getSupabaseServerClient()

  async findById(customerId: string): Promise<Customer | null> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase.from("customers").select(CUSTOMER_DETAIL_SELECT).eq("id", customerId).single()

    if (error) {
      console.error("Error fetching customer:", error)
      return null
    }

    return data as unknown as Customer
  }

  async findByPartnerId(partnerId: string): Promise<Customer[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from("customers")
      .select(CUSTOMER_LIST_SELECT)
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching customers:", error)
      return []
    }

    return (data || []) as Customer[]
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
      .select(CUSTOMER_LIST_SELECT)
      .eq("partner_id", partnerId)
      .ilike("name", `%${searchTerm}%`)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error searching customers:", error)
      return []
    }

    return (data || []) as Customer[]
  }
}

export const customerService = new CustomerService()
