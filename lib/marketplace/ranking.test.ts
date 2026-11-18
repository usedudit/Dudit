import { describe, it, expect } from "vitest"
import {
  calcCategoryBrowseScore,
  calcTrendingScore,
  calcVendorItemScore,
  sortByVendorRelevance,
  applySellerDiversity,
} from "./ranking"

describe("Marketplace Ranking System", () => {
  describe("calcCategoryBrowseScore", () => {
    it("should calculate browse score combining popularity, relevance, freshness, rating, and seller reputation", () => {
      const item = {
        id: "p1",
        marketplace_score: 0.8,
        marketplace_reputation: 0.9,
      }
      const score = calcCategoryBrowseScore(item)
      // popularity: 0.5 * 0.8 = 0.40
      // relevance placeholder: 0.2 * 0.5 = 0.10
      // freshness (no date => 0.5): 0.15 * 0.5 = 0.075
      // rating: 0
      // seller rep: 0.05 * 0.9 = 0.045
      // fresh multiplier = 1.0
      // total = 0.40 + 0.10 + 0.075 + 0.045 = 0.62
      expect(score).toBeCloseTo(0.62, 4)
    })

    it("should read reputation from nested partners or stores object", () => {
      const itemWithPartner = {
        id: "p2",
        marketplace_score: 0.5,
        partners: { marketplace_reputation: 0.8 },
      }
      // popularity: 0.5 * 0.5 = 0.25
      // relevance: 0.10
      // freshness: 0.075
      // seller rep: 0.05 * 0.8 = 0.04
      // total = 0.465
      expect(calcCategoryBrowseScore(itemWithPartner)).toBeCloseTo(0.465, 4)

      const itemWithStore = {
        id: "p3",
        marketplace_score: 0.6,
        stores: { marketplace_reputation: 0.7 },
      }
      // popularity: 0.5 * 0.6 = 0.30
      // relevance: 0.10
      // freshness: 0.075
      // seller rep: 0.05 * 0.7 = 0.035
      // total = 0.510
      expect(calcCategoryBrowseScore(itemWithStore)).toBeCloseTo(0.510, 4)
    })

    it("should fallback to calcTrendingScore when marketplace_score is 0 or null", () => {
      const item = {
        id: "p4",
        marketplace_score: 0,
        views_last_30_days: 500,
        sales_last_30_days: 50,
        marketplace_reputation: 0.5,
      }
      const score = calcCategoryBrowseScore(item)
      expect(score).toBeGreaterThan(0)
    })
  })

  describe("calcVendorItemScore & sortByVendorRelevance", () => {
    it("should give promotional boost to items on promotion", () => {
      const itemNormal = { marketplace_score: 0.5 }
      const itemPromo = { marketplace_score: 0.5, promotional_price: 19.9 }
      const itemCampaign = { marketplace_score: 0.5, _promotions: [{ id: "promo-1" }] }

      expect(calcVendorItemScore(itemPromo)).toBeGreaterThan(calcVendorItemScore(itemNormal))
      expect(calcVendorItemScore(itemCampaign)).toBeGreaterThan(calcVendorItemScore(itemNormal))
    })

    it("should correctly sort vendor items by score and tie-break by date", () => {
      const olderHigh = { id: "1", marketplace_score: 0.9, created_at: "2026-01-01" }
      const newerLow = { id: "2", marketplace_score: 0.2, created_at: "2026-06-01" }
      const newerTie = { id: "3", marketplace_score: 0.9, created_at: "2026-05-01" }

      const sorted = sortByVendorRelevance([olderHigh, newerLow, newerTie])
      expect(sorted[0].id).toBe("3") // tie-break: newer date
      expect(sorted[1].id).toBe("1")
      expect(sorted[2].id).toBe("2")
    })
  })

  describe("applySellerDiversity", () => {
    it("should prevent more than maxConsecutive items from the same store consecutively", () => {
      const items = [
        { id: "1", store_id: "storeA" },
        { id: "2", store_id: "storeA" },
        { id: "3", store_id: "storeA" },
        { id: "4", store_id: "storeB" },
        { id: "5", store_id: "storeA" },
      ]

      const diversified = applySellerDiversity(items, 2)
      // With maxConsecutive = 2:
      // [1] (storeA, consec=1)
      // [2] (storeA, consec=2)
      // [3] (storeA, consec=3 -> deferred)
      // [4] (storeB, consec=1)
      // [5] (storeA, consec=1)
      // [3] (deferred storeA, consec=2)
      expect(diversified.map(i => i.id)).toEqual(["1", "2", "4", "5", "3"])
    })
  })
})
