import { describe, expect, it } from "vitest"
import {
  isExploreProductPublic,
  isExploreServicePublic,
  serializeExploreItem,
} from "./redis-explore-serializer"

describe("Redis explore public projection", () => {
  const base = {
    id: "item-1",
    name: "Item",
    status: "ativo",
    is_active: true,
    moderation_status: "approved",
    deleted_at: null,
    show_in_marketplace: true,
    price: 10,
    cost_price: 2,
    stock_reserved: 4,
    internal_notes: "private",
  }

  it("requires all product publication predicates", () => {
    expect(isExploreProductPublic(base)).toBe(true)
    expect(isExploreProductPublic({ ...base, moderation_status: "pending" })).toBe(true)
    expect(isExploreProductPublic({ ...base, moderation_status: "rejected" })).toBe(false)
    expect(isExploreProductPublic({ ...base, deleted_at: new Date().toISOString() })).toBe(false)
    expect(isExploreProductPublic({ ...base, show_in_marketplace: false })).toBe(false)
  })

  it("applies the same publication predicates to services", () => {
    expect(isExploreServicePublic(base)).toBe(true)
    expect(isExploreServicePublic({ ...base, status: "arquivado" })).toBe(false)
  })

  it("never serializes operational or sensitive fields", () => {
    const serialized = serializeExploreItem({ ...base, itemType: "produto" }, "produto")
    expect(serialized).toMatchObject({ id: "item-1", name: "Item", price: 10, itemType: "produto" })
    expect(serialized).not.toHaveProperty("cost_price")
    expect(serialized).not.toHaveProperty("stock_reserved")
    expect(serialized).not.toHaveProperty("deleted_at")
    expect(serialized).not.toHaveProperty("internal_notes")
    expect(serialized).not.toHaveProperty("status")
    expect(serialized).not.toHaveProperty("moderation_status")
  })
})
