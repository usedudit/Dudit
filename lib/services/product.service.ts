import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { Product, ProductInput, ProductWithDetails } from "@/lib/types/product"

export class ProductService {
  private async getSupabase() {
    return await getSupabaseServerClient()
  }

  async findById(productId: string): Promise<ProductWithDetails | null> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from("products")
      .select(`
        *,
        variants:product_variants(*),
        product_fiscal_profiles(*),
        product_logistics(*)
      `)
      .eq("id", productId)
      .single()

    if (error) {
      console.error("Error fetching product:", error)
      return null
    }

    if (data) {
      const fiscal = Array.isArray(data.product_fiscal_profiles) ? data.product_fiscal_profiles[0] : data.product_fiscal_profiles
      const logistics = Array.isArray(data.product_logistics) ? data.product_logistics[0] : data.product_logistics

      if (fiscal) {
        Object.assign(data, fiscal)
      }
      if (logistics) {
        Object.assign(data, logistics)
      }

      delete data.product_fiscal_profiles
      delete data.product_logistics
    }

    return data
  }

  async findByPartnerId(partnerId: string): Promise<Product[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching products:", error)
      return []
    }

    return data || []
  }

  async create(input: ProductInput): Promise<{ success: boolean; product?: Product; error?: string }> {
    const supabase = await this.getSupabase()

    // No checking needed on create since partner_id is part of input, 
    // but the caller must ensure partner_id belongs to the current user.
    const { data, error } = await supabase.from("products").insert(input).select().single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, product: data }
  }

  // To prevent IDOR, we should require partnerId
  async update(productId: string, partnerId: string, input: Partial<ProductInput>): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { error } = await supabase.from("products").update(input).eq("id", productId).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async delete(productId: string, partnerId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { error } = await supabase.from("products").delete().eq("id", productId).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async batchDelete(productIds: string[], partnerId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { error } = await supabase.from("products").delete().in("id", productIds).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async duplicate(productId: string, partnerId: string): Promise<{ success: boolean; product?: Product; error?: string }> {
    const original = await this.findById(productId)

    if (!original || original.partner_id !== partnerId) {
      return { success: false, error: "Produto não encontrado" }
    }

    const { id, created_at, updated_at, sku, ...productData } = original as any

    const newProduct = {
      ...productData,
      store_id: productData.store_id || '00000000-0000-0000-0000-000000000000', // required
      name: `${productData.name} (Cópia)`,
      sku: `${sku}-COPY-${Date.now().toString().slice(-6)}`,
    }

    return this.create(newProduct)
  }

  async updateStock(productId: string, partnerId: string, quantity: number): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { error } = await supabase.from("products").update({ stock_quantity: quantity }).eq("id", productId).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async searchByName(partnerId: string, searchTerm: string): Promise<Product[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("partner_id", partnerId)
      .ilike("name", `%${searchTerm}%`)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error searching products:", error)
      return []
    }

    return data || []
  }
}

export const productService = new ProductService()
