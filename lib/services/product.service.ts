import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { Product, ProductInput, ProductWithDetails } from "@/lib/types/product"
import { buildSoftDeletePayload, scopeActiveOnly } from "@/lib/supabase/query-helpers"

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
        category:product_categories!category_id(name),
        subcategory:product_categories!subcategory_id(name),
        brand:brands!brand_id(name),
        location:storage_locations!location_id(name),
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
      const mapped = {
        ...data,
        category: (data.category as any)?.name || null,
        subcategory: (data.subcategory as any)?.name || null,
        brand: (data.brand as any)?.name || null,
        location: (data.location as any)?.name || null,
      }

      const fiscal = Array.isArray(mapped.product_fiscal_profiles) ? mapped.product_fiscal_profiles[0] : mapped.product_fiscal_profiles
      const logistics = Array.isArray(mapped.product_logistics) ? mapped.product_logistics[0] : mapped.product_logistics

      if (fiscal) {
        Object.assign(mapped, fiscal)
      }
      if (logistics) {
        Object.assign(mapped, logistics)
      }

      delete mapped.product_fiscal_profiles
      delete mapped.product_logistics
      return mapped
    }

    return null
  }

  async findByPartnerId(partnerId: string): Promise<Product[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await scopeActiveOnly(supabase
      .from("products")
      .select(`
        *,
        category:product_categories!category_id(name),
        subcategory:product_categories!subcategory_id(name),
        brand:brands!brand_id(name),
        location:storage_locations!location_id(name)
      `)
      .eq("partner_id", partnerId))
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching products:", error)
      return []
    }

    return (data || []).map((p: any) => ({
      ...p,
      category: p.category?.name || null,
      subcategory: p.subcategory?.name || null,
      brand: p.brand?.name || null,
      location: p.location?.name || null,
    }))
  }

  async create(input: ProductInput): Promise<{ success: boolean; product?: Product; error?: string }> {
    const supabase = await this.getSupabase()

    // No checking needed on create since partner_id is part of input, 
    // but the caller must ensure partner_id belongs to the current user.
    const { is_active, ...cleanInput } = input
    const { data, error } = await supabase.from("products").insert(cleanInput).select().single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, product: data }
  }

  // To prevent IDOR, we should require partnerId
  async update(productId: string, partnerId: string, input: Partial<ProductInput>): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { is_active, ...cleanInput } = input
    const { error } = await supabase.from("products").update(cleanInput).eq("id", productId).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async delete(productId: string, partnerId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || "00000000-0000-0000-0000-000000000000"
    const payload = buildSoftDeletePayload(userId)
    const { error } = await supabase.from("products").update(payload).eq("id", productId).eq("partner_id", partnerId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async batchDelete(productIds: string[], partnerId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await this.getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || "00000000-0000-0000-0000-000000000000"
    const payload = buildSoftDeletePayload(userId)
    const { error } = await supabase.from("products").update(payload).in("id", productIds).eq("partner_id", partnerId)

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
      name: `${productData.name} (Cópia)`,
      sku: `${sku}-COPY-${Date.now().toString().slice(-6)}`,
    }

    const result = await this.create(newProduct)

    return result
  }

  async updateStock(productId: string, partnerId: string, quantity: number, _storeId?: string): Promise<{ success: boolean; error?: string }> {
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
      .select(`
        *,
        category:product_categories!category_id(name),
        subcategory:product_categories!subcategory_id(name),
        brand:brands!brand_id(name),
        location:storage_locations!location_id(name)
      `)
      .eq("partner_id", partnerId)
      .ilike("name", `%${searchTerm}%`)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error searching products:", error)
      return []
    }

    return (data || []).map((p: any) => ({
      ...p,
      category: p.category?.name || null,
      subcategory: p.subcategory?.name || null,
      brand: p.brand?.name || null,
      location: p.location?.name || null,
    }))
  }
}

export const productService = new ProductService()
