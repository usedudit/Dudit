import { describe, expect, it, vi } from "vitest"
import { validateCouponRow } from "./coupons"

function createMockSupabase(dbData: Record<string, any> = {}) {
  return {
    from: vi.fn((table: string) => {
      let selectedData: any = dbData[table] || []
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, val: any) => {
          if (Array.isArray(selectedData)) {
            selectedData = selectedData.filter((row: any) => row[col] === val)
          }
          return chain
        }),
        in: vi.fn((col: string, vals: any[]) => {
          if (Array.isArray(selectedData)) {
            selectedData = selectedData.filter((row: any) => vals.includes(row[col]))
          }
          return chain
        }),
        or: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(() => {
          const row = Array.isArray(selectedData) ? selectedData[0] || null : null
          return Promise.resolve({ data: row, error: null })
        }),
        then: (resolve: any) => resolve({
          data: selectedData,
          count: Array.isArray(selectedData) ? selectedData.length : 0,
          error: null,
        }),
      }
      return chain
    }),
  }
}

describe("validateCouponRow", () => {
  const baseCoupon = {
    id: "coupon-1",
    partner_id: "partner-1",
    code: "PROMO10",
    discount_type: "percentage",
    discount_value: 10,
    max_discount_value: null,
    min_cart_value: null,
    is_active: true,
    show_in_marketplace: true,
    apply_scope: "all",
    customer_scope: "all",
    allow_combination: true,
    starts_at: null,
    ends_at: null,
    usage_limit: null,
    usage_per_customer: null,
    first_purchase_only: false,
  }

  it("successfully validates coupon with apply_scope='all' and items in cart", async () => {
    const supabase = createMockSupabase({
      products: [
        { id: "p1", category_id: "cat1", price: 100, promotional_price: null },
      ],
    })

    const result = await validateCouponRow(supabase, baseCoupon, {
      partnerId: "partner-1",
      subtotal: 100,
      items: [{ productId: "p1", quantity: 1, price: 100 }],
    })

    expect(result.valid).toBe(true)
    expect(result.discountAmount).toBe(10)
    expect(result.couponCode).toBe("PROMO10")
    expect(result.errorMessage).toBeUndefined()
  })

  it("does NOT error with 'Nenhum item da sacola é elegível para este cupom' when allow_combination=false and product has promotional price", async () => {
    const couponNonComb = {
      ...baseCoupon,
      allow_combination: false,
    }

    const supabase = createMockSupabase({
      products: [
        { id: "p1", category_id: "cat1", price: 100, promotional_price: 90 },
      ],
    })

    const result = await validateCouponRow(supabase, couponNonComb, {
      partnerId: "partner-1",
      subtotal: 90,
      items: [{ productId: "p1", quantity: 1, price: 90 }],
    })

    expect(result.valid).toBe(true)
    expect(result.discountAmount).toBe(9)
    expect(result.errorMessage).toBeUndefined()
  })

  it("validates product-specific coupon when cart has matching product", async () => {
    const couponProducts = {
      ...baseCoupon,
      apply_scope: "products",
    }

    const supabase = createMockSupabase({
      coupon_products: [{ coupon_id: "coupon-1", product_id: "p1" }],
      products: [{ id: "p1", category_id: "cat1", price: 50, promotional_price: null }],
    })

    const result = await validateCouponRow(supabase, couponProducts, {
      partnerId: "partner-1",
      subtotal: 50,
      items: [{ productId: "p1", quantity: 1, price: 50 }],
    })

    expect(result.valid).toBe(true)
    expect(result.discountAmount).toBe(5)
  })

  it("returns 'Nenhum item da sacola é elegível para este cupom.' only when items are truly outside scope", async () => {
    const couponProducts = {
      ...baseCoupon,
      apply_scope: "products",
    }

    const supabase = createMockSupabase({
      coupon_products: [{ coupon_id: "coupon-1", product_id: "p1" }],
      products: [{ id: "p2", category_id: "cat1", price: 50, promotional_price: null }],
    })

    const result = await validateCouponRow(supabase, couponProducts, {
      partnerId: "partner-1",
      subtotal: 50,
      items: [{ productId: "p2", quantity: 1, price: 50 }],
    })

    expect(result.valid).toBe(false)
    expect(result.errorMessage).toBe("Nenhum item da sacola é elegível para este cupom.")
  })

  it("returns 'Valor mínimo da sacola não atingido.' when subtotal is below min_cart_value", async () => {
    const couponMin = {
      ...baseCoupon,
      min_cart_value: 150,
    }

    const supabase = createMockSupabase()

    const result = await validateCouponRow(supabase, couponMin, {
      partnerId: "partner-1",
      subtotal: 100,
      items: [{ productId: "p1", quantity: 1, price: 100 }],
    })

    expect(result.valid).toBe(false)
    expect(result.errorMessage).toBe("Valor mínimo da sacola não atingido.")
  })

  it("rejects coupon on online storefront when show_in_marketplace is false", async () => {
    const couponInternalOnly = {
      ...baseCoupon,
      show_in_marketplace: false,
    }

    const supabase = createMockSupabase()

    const result = await validateCouponRow(supabase, couponInternalOnly, {
      partnerId: "partner-1",
      subtotal: 100,
      items: [{ productId: "p1", quantity: 1, price: 100 }],
      marketplaceOnly: true,
    })

    expect(result.valid).toBe(false)
    expect(result.errorMessage).toBe("Este cupom não está disponível na vitrine online.")
  })

  it("allows coupon in ERP/PDV (marketplaceOnly omitted) even when show_in_marketplace is false", async () => {
    const couponInternalOnly = {
      ...baseCoupon,
      show_in_marketplace: false,
    }

    const supabase = createMockSupabase({
      products: [{ id: "p1", category_id: "cat1", price: 100, promotional_price: null }],
    })

    const result = await validateCouponRow(supabase, couponInternalOnly, {
      partnerId: "partner-1",
      subtotal: 100,
      items: [{ productId: "p1", quantity: 1, price: 100 }],
    })

    expect(result.valid).toBe(true)
    expect(result.discountAmount).toBe(10)
  })
})
