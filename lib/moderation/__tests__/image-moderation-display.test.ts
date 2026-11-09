import { describe, it, expect, vi } from "vitest"
import {
  normalizeImageKey,
  extractFlaggedImages,
  isImageFlagged,
  filterUnflaggedImages,
  getProductDisplayImages,
  getPrimaryProductDisplayImage,
  PLACEHOLDER,
} from "@/lib/utils/product-display-images"

// Mock getR2ImageUrl
vi.mock("@/lib/utils/get-r2-image-url", () => ({
  getR2ImageUrl: (input: string, size?: string) => {
    if (!input) return "https://img.dudit.com.br/static/Placeholder.png"
    if (input.startsWith("http")) return input
    return `https://img.dudit.com.br/${input}${size ? `?size=${size}` : ""}`
  },
}))

describe("Image Moderation Display & Filtering", () => {
  describe("normalizeImageKey", () => {
    it("normalizes full CDN URL with query parameters", () => {
      expect(
        normalizeImageKey("https://img.dudit.com.br/products/abc-123/foto.webp?w=800&q=75#tag")
      ).toBe("products/abc-123/foto.webp")
    })

    it("normalizes relative path with leading slash", () => {
      expect(normalizeImageKey("/products/abc-123/foto.webp")).toBe("products/abc-123/foto.webp")
    })

    it("normalizes simple relative key", () => {
      expect(normalizeImageKey("products/ABC-123/Foto.WebP")).toBe("products/abc-123/foto.webp")
    })

    it("handles empty or invalid inputs", () => {
      expect(normalizeImageKey("")).toBe("")
      expect(normalizeImageKey(null as any)).toBe("")
    })
  })

  describe("extractFlaggedImages", () => {
    it("extracts from JSON structured moderation_reason", () => {
      const reason = JSON.stringify({
        reason: "Imagem imprópria detectada",
        flagged_images: ["products/p1/bad.jpg", "products/p1/bad2.jpg"],
      })
      expect(extractFlaggedImages(reason)).toEqual([
        "products/p1/bad.jpg",
        "products/p1/bad2.jpg",
      ])
    })

    it("extracts from plain text with [FLAGGED_IMAGES]: prefix", () => {
      const reason = "Sinalizado pelo Sightengine. [FLAGGED_IMAGES]: products/p1/bad.jpg, products/p1/bad2.jpg"
      expect(extractFlaggedImages(reason)).toEqual([
        "products/p1/bad.jpg",
        "products/p1/bad2.jpg",
      ])
    })

    it("returns empty array when no flagged images are present", () => {
      expect(extractFlaggedImages("Texto impróprio detectado")).toEqual([])
      expect(extractFlaggedImages(null)).toEqual([])
      expect(extractFlaggedImages("")).toEqual([])
    })
  })

  describe("isImageFlagged", () => {
    it("matches relative path with full URL in flagged list", () => {
      const flaggedList = ["https://img.dudit.com.br/products/p1/armas.jpg"]
      expect(isImageFlagged("products/p1/armas.jpg", flaggedList)).toBe(true)
    })

    it("matches full URL with relative path in flagged list", () => {
      const flaggedList = ["products/p1/armas.jpg"]
      expect(isImageFlagged("https://img.dudit.com.br/products/p1/armas.jpg?w=400", flaggedList)).toBe(true)
    })

    it("returns false for clean image not in flagged list", () => {
      const flaggedList = ["products/p1/armas.jpg"]
      expect(isImageFlagged("products/p1/camiseta_branca.jpg", flaggedList)).toBe(false)
    })
  })

  describe("filterUnflaggedImages", () => {
    const images = [
      "products/p1/foto_limpa_1.jpg",
      "products/p1/foto_ofensiva.jpg",
      "products/p1/foto_limpa_2.jpg",
    ]

    it("returns all images when product is approved", () => {
      const result = filterUnflaggedImages(images, "approved", null)
      expect(result).toEqual(images)
    })

    it("filters out only the flagged image when product is flagged", () => {
      const reason = JSON.stringify({
        reason: "Conteúdo impróprio",
        flagged_images: ["products/p1/foto_ofensiva.jpg"],
      })
      const result = filterUnflaggedImages(images, "flagged", reason)
      expect(result).toEqual([
        "products/p1/foto_limpa_1.jpg",
        "products/p1/foto_limpa_2.jpg",
      ])
    })

    it("returns empty array when all images are flagged", () => {
      const onlyBad = ["products/p1/foto_ofensiva.jpg"]
      const reason = JSON.stringify({
        reason: "Conteúdo impróprio",
        flagged_images: ["products/p1/foto_ofensiva.jpg"],
      })
      const result = filterUnflaggedImages(onlyBad, "flagged", reason)
      expect(result).toEqual([])
    })

    it("returns empty array for flagged product with no specific reason (safe fallback)", () => {
      const result = filterUnflaggedImages(images, "flagged", null)
      expect(result).toEqual([])
    })
  })

  describe("getProductDisplayImages", () => {
    it("displays clean images when 1 is flagged out of 2", () => {
      const product = {
        images: ["products/p1/limpa.jpg", "products/p1/ofensiva.jpg"],
        moderation_status: "flagged",
        moderation_reason: JSON.stringify({
          flagged_images: ["products/p1/ofensiva.jpg"],
        }),
      }

      const display = getProductDisplayImages(product)
      expect(display).toHaveLength(1)
      expect(display[0]).toContain("limpa.jpg")
      expect(display[0]).not.toContain("ofensiva.jpg")
    })

    it("falls back to PLACEHOLDER when the only image is flagged", () => {
      const product = {
        images: ["products/p1/ofensiva.jpg"],
        moderation_status: "flagged",
        moderation_reason: JSON.stringify({
          flagged_images: ["products/p1/ofensiva.jpg"],
        }),
      }

      const display = getProductDisplayImages(product)
      expect(display).toEqual([PLACEHOLDER])
      expect(getPrimaryProductDisplayImage(product)).toBe(PLACEHOLDER)
    })

    it("displays all images normally when product is approved", () => {
      const product = {
        images: ["products/p1/foto1.jpg", "products/p1/foto2.jpg"],
        moderation_status: "approved",
      }

      const display = getProductDisplayImages(product)
      expect(display).toHaveLength(2)
      expect(display[0]).toContain("foto1.jpg")
      expect(display[1]).toContain("foto2.jpg")
    })
  })
})
