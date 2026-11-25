import { describe, it, expect } from "vitest"
import { normalizeCatalogSpecs, normalizeCatalogTags, buildProductSeo, buildServiceSeo } from "../catalog-seo"

describe("catalog-seo", () => {
  it("normalizes array specs", () => {
    const raw = [
      { name: "Cor", value: "Azul" },
      { label: "Tamanho", value: "M" },
      { name: "Vazio", value: "" },
    ]
    const result = normalizeCatalogSpecs(raw)
    expect(result).toEqual([
      { name: "Cor", value: "Azul" },
      { name: "Tamanho", value: "M" },
    ])
  })

  it("normalizes object specs and ignores system keys", () => {
    const raw = {
      armazenamento: "128GB",
      ram: "8GB",
      addon_groups: [{ id: 1 }],
      condition: "new",
    }
    const result = normalizeCatalogSpecs(raw)
    expect(result).toEqual([
      { name: "Armazenamento", value: "128GB" },
      { name: "Ram", value: "8GB" },
    ])
  })

  it("normalizes ERP technical_specs wrapper with attributes array", () => {
    const raw = {
      attributes: [
        { id: 1, name: "Marca", value: "Coca-Cola" },
        { id: 2, name: "Volume", value: "2 Litros" },
      ],
      addon_groups: [],
      accepts_offers: false,
      accepts_trades: false,
    }
    expect(normalizeCatalogSpecs(raw)).toEqual([
      { name: "Marca", value: "Coca-Cola" },
      { name: "Volume", value: "2 Litros" },
    ])
    expect(normalizeCatalogSpecs({ attributes: [], addon_groups: [], accepts_offers: false })).toEqual([])
  })

  it("normalizes tags from array and string", () => {
    expect(normalizeCatalogTags(["Celular", " Apple "])).toEqual(["celular", "apple"])
    expect(normalizeCatalogTags("smartphone, android, 5g")).toEqual(["smartphone", "android", "5g"])
    expect(normalizeCatalogTags(null)).toEqual([])
  })

  it("builds product SEO with keywords, specs and schema", () => {
    const product = {
      id: "prod-123",
      short_id: "abc",
      name: "iPhone 13 128GB",
      price: 3999,
      tags: ["celular", "apple", "ios"],
      technical_specs: [{ name: "Memória", value: "128 GB" }],
      images: ["https://img.dudit.com.br/iphone.jpg"],
      brand: "Apple",
    }

    const { metadata, schemaJsonLd, keywords } = buildProductSeo({
      product,
      city: "São Paulo",
      productUrl: "https://dudit.com.br/saopaulo-sp/iphone-13/p/abc",
    })

    expect(metadata.title).toContain("iPhone 13 128GB")
    expect(metadata.description).toContain("Apple")
    expect(keywords).toContain("apple")
    expect(keywords).toContain("Memória: 128 GB")
    expect(schemaJsonLd["@type"]).toBe("Product")
    expect(schemaJsonLd.additionalProperty).toEqual([{ "@type": "PropertyValue", name: "Memória", value: "128 GB" }])
    expect(schemaJsonLd.brand.name).toBe("Apple")
  })

  it("builds service SEO with details and provider", () => {
    const service = {
      id: "srv-123",
      short_id: "xyz",
      name: "Corte Masculino Degradê",
      price: 50,
      tags: ["barbearia", "corte"],
      technical_details: [{ name: "Duração", value: "45 min" }],
      images: ["https://img.dudit.com.br/corte.jpg"],
    }

    const { metadata, schemaJsonLd, keywords } = buildServiceSeo({
      service,
      city: "Curitiba",
      serviceUrl: "https://dudit.com.br/curitiba-pr/corte-masculino/s/xyz",
    })

    expect(metadata.title).toContain("Corte Masculino Degradê")
    expect(keywords).toContain("barbearia")
    expect(schemaJsonLd["@type"]).toBe("Service")
    expect(schemaJsonLd.additionalProperty).toEqual([{ "@type": "PropertyValue", name: "Duração", value: "45 min" }])
  })

  it("exposes national shipping vs local-only fulfillment in Product JSON-LD", () => {
    const national = buildProductSeo({
      product: {
        id: "p-nat",
        name: "Pneu Aro 15",
        price: 350,
        fulfillment_modes: ["pickup", "delivery", "shipping"],
      },
      city: "Franca",
      productUrl: "https://dudit.com.br/franca-sp/pneu-aro-15/p/nat",
    })
    expect(national.schemaJsonLd.offers.areaServed).toEqual({ "@type": "Country", name: "Brasil" })
    expect(national.schemaJsonLd.offers.shippingDetails).toBeDefined()
    expect(national.schemaJsonLd.offers.availableDeliveryMethod).toContain("http://purl.org/goodrelations/v1#ParcelService")
    expect(national.keywords).toContain("envio para todo o Brasil")

    const localOnly = buildProductSeo({
      product: {
        id: "p-loc",
        name: "Bolo Caseiro",
        price: 60,
        fulfillment_modes: ["pickup", "delivery"],
      },
      city: "Franca",
      productUrl: "https://dudit.com.br/franca-sp/bolo-caseiro/p/loc",
    })
    expect(localOnly.schemaJsonLd.offers.areaServed).toEqual({ "@type": "City", name: "Franca" })
    expect(localOnly.schemaJsonLd.offers.shippingDetails).toBeUndefined()
  })

  it("exposes GeoCircle areaServed for home-visit services with max radius", () => {
    const { schemaJsonLd, keywords } = buildServiceSeo({
      service: {
        id: "s-elec",
        name: "Eletricista Residencial",
        price: 120,
        fulfillment_modes: ["customer_location"],
        service_max_km: 25,
        partners: {
          store_name: "Silva Elétrica",
          addresses: [{ city: "Franca", state: "SP", latitude: -20.538, longitude: -47.401 }],
        },
      },
      city: "Franca",
      serviceUrl: "https://dudit.com.br/franca-sp/eletricista/s/elec",
    })
    expect(keywords).toContain("atendimento a domicílio")
    expect(schemaJsonLd.areaServed).toEqual({
      "@type": "GeoCircle",
      geoMidpoint: { "@type": "GeoCoordinates", latitude: -20.538, longitude: -47.401 },
      geoRadius: 25000,
    })
  })

  it("includes Tiny ERP integration article in help-data and institutional FAQ", async () => {
    const { getArticleBySlug } = await import("@/lib/help-data")
    const { INSTITUTIONAL_FAQ } = await import("@/lib/constants/institutional-faq")

    const article = getArticleBySlug("como-integrar-tiny-erp-dudit")
    expect(article).toBeDefined()
    expect(article?.title).toContain("Tiny ERP")
    expect(article?.category).toBe("integracoes")

    const faqEntry = INSTITUTIONAL_FAQ.find((item) => item.question.includes("Tiny ERP"))
    expect(faqEntry).toBeDefined()
    expect(faqEntry?.answer).toContain("integração nativa com o Tiny ERP")
  })
})
