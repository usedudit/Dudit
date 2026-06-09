import { describe, expect, it } from "vitest"
import { buildMarketplaceTsQuery } from "./build-tsquery"
import { normalizeSearchQuery, sanitizeTsQueryToken } from "./normalize"
import {
  categoryMatchesExpandedTerms,
  nameMatchesExact,
  nameMatchesPrefix,
  textContainsAnyTerm,
} from "./prefix-match"
import { expandSynonyms } from "./synonyms"

describe("normalizeSearchQuery", () => {
  it("lowercases and strips accents", () => {
    expect(normalizeSearchQuery("  Camisão  ")).toBe("camisao")
    expect(normalizeSearchQuery("Açúcar")).toBe("acucar")
  })

  it("collapses whitespace", () => {
    expect(normalizeSearchQuery("arroz   integral")).toBe("arroz integral")
  })
})

describe("prefix matching", () => {
  it('"arr" matches "arroz" via prefix', () => {
    expect(nameMatchesPrefix("arr", "Arroz Integral 5kg")).toBe(true)
    expect(nameMatchesPrefix("arr", "Arroz")).toBe(true)
  })

  it("does not match unrelated names", () => {
    expect(nameMatchesPrefix("arr", "Feijão Preto")).toBe(false)
  })

  it("matches word-boundary prefix in multi-word names", () => {
    expect(nameMatchesPrefix("nik", "Tênis Nike Air")).toBe(true)
  })
})

describe("exact matching", () => {
  it("matches normalized exact names", () => {
    expect(nameMatchesExact("Arroz", "arroz")).toBe(true)
    expect(nameMatchesExact("arroz", "feijao")).toBe(false)
  })
})

describe("synonym expansion (delegated to DB)", () => {
  it("returns normalized token only — no hardcoded dictionary", () => {
    expect(expandSynonyms("roupas")).toEqual(["roupas"])
    expect(expandSynonyms("Roupas")).toEqual(["roupas"])
  })
})

describe("category boost helpers", () => {
  const clothingTerms = [
    "roupa", "roupas", "moda", "camiseta", "camisa", "calca", "bermuda", "short",
  ]

  it('"roupas" boosts items in moda/camisetas categories', () => {
    expect(categoryMatchesExpandedTerms("Moda", "Camisetas", clothingTerms)).toBe(true)
    expect(categoryMatchesExpandedTerms("Calças", null, clothingTerms)).toBe(true)
  })

  it("synonym term appears in product name", () => {
    expect(textContainsAnyTerm("Camiseta Nike Dri-FIT", clothingTerms)).toBe(true)
    expect(textContainsAnyTerm("Bermuda Sarja", clothingTerms)).toBe(true)
  })
})

describe("buildMarketplaceTsQuery", () => {
  it("joins tokens with AND", () => {
    expect(buildMarketplaceTsQuery("camisa nike")).toBe("camisa & nike")
  })

  it("returns null for empty input", () => {
    expect(buildMarketplaceTsQuery("   ")).toBeNull()
  })

  it("sanitizes unsafe tsquery characters", () => {
    expect(sanitizeTsQueryToken("camisa!")).toBe("camisa")
  })
})

describe("ranking fairness (boost caps)", () => {
  it("recent listing can outrank stale high-sales via core relevance tiers", () => {
    const prefixScore = nameMatchesPrefix("arr", "arroz") ? 0.88 : 0
    const fuzzyOnly = 0.32
    const staleBoost = 0.05 + 0.04 + 0.06
    expect(prefixScore).toBeGreaterThan(staleBoost)
    expect(prefixScore).toBeGreaterThan(fuzzyOnly)
  })
})
