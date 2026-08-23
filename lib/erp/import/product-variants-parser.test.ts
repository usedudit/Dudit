import { describe, it, expect } from "vitest"
import { parseProductVariants } from "./batch-importer"
import { getFieldsForEntity } from "./field-registry"

describe("Product Variants Import Parser", () => {
  const baseProduct = {
    sku: "CAM-BAS",
    price: 49.9,
    stock_quantity: 0,
  }

  it("parses simple semicolon-separated list of sizes", () => {
    const raw = "P; M; G; GG"
    const variants = parseProductVariants(raw, "Tamanho", baseProduct)

    expect(variants).toHaveLength(4)
    expect(variants[0]).toMatchObject({
      variant_name: "P",
      variant_type: "Tamanho",
      variant_value: "P",
      sku: "CAM-BAS-P",
      price_adjustment: 49.9,
      stock_quantity: 0,
      is_active: true,
    })
    expect(variants[1].sku).toBe("CAM-BAS-M")
    expect(variants[2].sku).toBe("CAM-BAS-G")
    expect(variants[3].sku).toBe("CAM-BAS-GG")
  })

  it("auto-detects 'Tamanho' type if type is omitted", () => {
    const raw = "P; M; G"
    const variants = parseProductVariants(raw, "", baseProduct)

    expect(variants).toHaveLength(3)
    expect(variants[0].variant_type).toBe("Tamanho")
  })

  it("auto-detects 'Cor' type if type is omitted and values are colors", () => {
    const raw = "Azul; Preto; Branco"
    const variants = parseProductVariants(raw, "", baseProduct)

    expect(variants).toHaveLength(3)
    expect(variants[0].variant_type).toBe("Cor")
    expect(variants[0].sku).toBe("CAM-BAS-AZUL")
    expect(variants[1].sku).toBe("CAM-BAS-PRETO")
    expect(variants[2].sku).toBe("CAM-BAS-BRANCO")
  })

  it("parses named key-value variants in parentheses (Estoque, Preço, SKU)", () => {
    const raw =
      "P (Estoque: 10, Preço: 49.90, SKU: CAM-P); M (Estoque: 20, Preço: 49.90, SKU: CAM-M); G (Estoque: 15, Preço: 54.90, SKU: CAM-G)"
    const variants = parseProductVariants(raw, "Tamanho", baseProduct)

    expect(variants).toHaveLength(3)
    expect(variants[0]).toMatchObject({
      variant_name: "P",
      variant_value: "P",
      sku: "CAM-P",
      stock_quantity: 10,
      price_adjustment: 49.9,
    })
    expect(variants[1]).toMatchObject({
      variant_name: "M",
      variant_value: "M",
      sku: "CAM-M",
      stock_quantity: 20,
      price_adjustment: 49.9,
    })
    expect(variants[2]).toMatchObject({
      variant_name: "G",
      variant_value: "G",
      sku: "CAM-G",
      stock_quantity: 15,
      price_adjustment: 54.9,
    })
  })

  it("parses short parentheses quantity format: P (10); M (20)", () => {
    const raw = "P (10); M (20); G (15)"
    const variants = parseProductVariants(raw, "Tamanho", baseProduct)

    expect(variants).toHaveLength(3)
    expect(variants[0].stock_quantity).toBe(10)
    expect(variants[1].stock_quantity).toBe(20)
    expect(variants[2].stock_quantity).toBe(15)
    expect(variants[0].price_adjustment).toBe(49.9)
  })

  it("parses colon format: P: 10 : 39.90", () => {
    const raw = "P: 10: 39.90; M: 20: 39.90"
    const variants = parseProductVariants(raw, "Tamanho", baseProduct)

    expect(variants).toHaveLength(2)
    expect(variants[0]).toMatchObject({
      variant_name: "P",
      stock_quantity: 10,
      price_adjustment: 39.9,
    })
    expect(variants[1]).toMatchObject({
      variant_name: "M",
      stock_quantity: 20,
      price_adjustment: 39.9,
    })
  })

  it("parses multi-attribute combined variants: Azul / P; Azul / M", () => {
    const raw =
      "Azul / P (Estoque: 5, Preço: 49.90); Azul / M (Estoque: 10, Preço: 49.90); Preto / P (Estoque: 8, Preço: 49.90)"
    const variants = parseProductVariants(raw, "Cor / Tamanho", baseProduct)

    expect(variants).toHaveLength(3)
    expect(variants[0].variant_name).toBe("Azul / P")
    expect(variants[0].variant_type).toBe("Cor / Tamanho")
    expect(variants[0].sku).toBe("CAM-BAS-AZUL-P")
    expect(variants[0].stock_quantity).toBe(5)

    expect(variants[1].variant_name).toBe("Azul / M")
    expect(variants[1].sku).toBe("CAM-BAS-AZUL-M")
    expect(variants[1].stock_quantity).toBe(10)

    expect(variants[2].variant_name).toBe("Preto / P")
    expect(variants[2].sku).toBe("CAM-BAS-PRETO-P")
    expect(variants[2].stock_quantity).toBe(8)
  })

  it("ensures duplicate SKUs inside batch receive unique suffixes", () => {
    const raw = "P; P; P"
    const variants = parseProductVariants(raw, "Tamanho", baseProduct)

    expect(variants).toHaveLength(3)
    expect(variants[0].sku).toBe("CAM-BAS-P")
    expect(variants[1].sku).toBe("CAM-BAS-P-1")
    expect(variants[2].sku).toBe("CAM-BAS-P-2")
  })

  it("handles malformed variant tokens gracefully without throwing", () => {
    const raw = "P (Estoque: abc, Preço: xyz); ; M (Estoque: -5, Preço: -10); ;; G"
    const variants = parseProductVariants(raw, "Tamanho", baseProduct)

    expect(variants).toHaveLength(3)
    expect(variants[0]).toMatchObject({
      variant_name: "P",
      stock_quantity: 0,
      price_adjustment: 49.9,
    })
    expect(variants[1]).toMatchObject({
      variant_name: "M",
      stock_quantity: 0,
      price_adjustment: 49.9,
    })
    expect(variants[2]).toMatchObject({
      variant_name: "G",
      stock_quantity: 0,
      price_adjustment: 49.9,
    })
  })

  it("trims variants exceeding 50 items", () => {
    const items = Array.from({ length: 60 }, (_, i) => `V${i + 1}`).join("; ")
    const variants = parseProductVariants(items, "Variação", baseProduct)

    expect(variants).toHaveLength(50)
  })

  it("field-registry does not include removed fields in productFields", () => {
    const fields = getFieldsForEntity("products")
    const names = fields.map((f) => f.name)

    expect(names).not.toContain("supplier")
    expect(names).not.toContain("origin")
    expect(names).not.toContain("packaging_type")
    expect(names).not.toContain("preparation_days")
    expect(names).not.toContain("tags")
    expect(names).not.toContain("category")
    expect(names).not.toContain("subcategory")

    expect(names).toContain("variant_type")
    expect(names).toContain("variants")
    expect(names).toContain("gtin")
    expect(names).toContain("description")
    expect(names).toContain("weight_net")
    expect(names).toContain("weight_gross")
  })
})

import { suggestMapping } from "./mapper"

describe("Auto-Mapper Column Suggestion", () => {
  it("accurately maps all template columns including gtin, description, weight_net and weight_gross without collisions or ignores", () => {
    const headers = [
      "Nome do Produto",
      "SKU / Código",
      "Código de Barras (GTIN/EAN)",
      "Preço de Venda",
      "Preço de Custo",
      "Preço Promocional",
      "Estoque Atual",
      "Estoque Mínimo",
      "Unidade de Medida",
      "Marca",
      "Tipo de Variação",
      "Variações (Grade)",
      "Status",
      "Visibilidade na Loja",
      "Descrição",
      "Tipo de Produto",
      "Condição",
      "NCM",
      "CEST",
      "Peso Bruto (g)",
      "Peso Líquido (g)",
      "Largura (cm)",
      "Altura (cm)",
      "Comprimento (cm)",
    ]

    const mappings = suggestMapping(headers, "products")

    const mappedByHeader = new Map(mappings.map((m) => [m.header, m.field]))

    expect(mappedByHeader.get("Nome do Produto")).toBe("name")
    expect(mappedByHeader.get("SKU / Código")).toBe("sku")
    expect(mappedByHeader.get("Código de Barras (GTIN/EAN)")).toBe("gtin")
    expect(mappedByHeader.get("Descrição")).toBe("description")
    expect(mappedByHeader.get("Peso Bruto (g)")).toBe("weight_gross")
    expect(mappedByHeader.get("Peso Líquido (g)")).toBe("weight_net")

    // Ensure none of the template columns are ignored (null field)
    for (const header of headers) {
      expect(mappedByHeader.get(header)).not.toBeNull()
    }
  })

  it("accurately maps simplified headers like 'Descrição', 'EAN', 'Peso Líquido'", () => {
    const headers = ["Nome", "SKU", "EAN", "Preço", "Estoque", "Descrição", "Peso Líquido", "Peso Bruto"]
    const mappings = suggestMapping(headers, "products")
    const mappedByHeader = new Map(mappings.map((m) => [m.header, m.field]))

    expect(mappedByHeader.get("Nome")).toBe("name")
    expect(mappedByHeader.get("SKU")).toBe("sku")
    expect(mappedByHeader.get("EAN")).toBe("gtin")
    expect(mappedByHeader.get("Descrição")).toBe("description")
    expect(mappedByHeader.get("Peso Líquido")).toBe("weight_net")
    expect(mappedByHeader.get("Peso Bruto")).toBe("weight_gross")
  })

  it("accurately maps service template headers including cost_price, service_type (Presencial / Online) and description with 1.0 confidence", () => {
    const serviceHeaders = [
      "Nome do Serviço",
      "SKU / Código",
      "Preço",
      "Preço de Custo",
      "Duração (minutos)",
      "Categoria",
      "Tipo de Atendimento",
      "Status",
      "Unidade",
      "Descrição",
    ]

    const mappings = suggestMapping(serviceHeaders, "services")
    const mappedByHeader = new Map(mappings.map((m) => [m.header, m]))

    expect(mappedByHeader.get("Preço de Custo")?.field).toBe("cost_price")
    expect(mappedByHeader.get("Preço de Custo")?.confidence).toBe(1.0)

    expect(mappedByHeader.get("Tipo de Atendimento")?.field).toBe("service_type")
    expect(mappedByHeader.get("Tipo de Atendimento")?.confidence).toBe(1.0)

    expect(mappedByHeader.get("Nome do Serviço")?.field).toBe("name")
    expect(mappedByHeader.get("Descrição")?.field).toBe("description")

    // Test alternative header variations for services
    const altServiceHeaders = ["Custo", "Presencial / Online", "Preço de Venda", "Tempo Estimado"]
    const altMappings = suggestMapping(altServiceHeaders, "services")
    const altMapped = new Map(altMappings.map((m) => [m.header, m.field]))

    expect(altMapped.get("Custo")).toBe("cost_price")
    expect(altMapped.get("Presencial / Online")).toBe("service_type")
    expect(altMapped.get("Preço de Venda")).toBe("price")
  })

  it("accurately maps customer template headers including Estado (UF) and Status without collisions", () => {
    const customerHeaders = [
      "Nome / Razão Social",
      "Tipo de Pessoa",
      "CPF",
      "CNPJ",
      "E-mail",
      "Celular / WhatsApp",
      "Telefone Fixo",
      "Data de Nascimento",
      "Status",
      "CEP",
      "Logradouro (Rua/Av)",
      "Número",
      "Complemento",
      "Bairro",
      "Cidade",
      "Estado (UF)",
      "Inscrição Estadual",
      "Observações",
    ]

    const mappings = suggestMapping(customerHeaders, "customers")
    const mappedByHeader = new Map(mappings.map((m) => [m.header, m]))

    expect(mappedByHeader.get("Estado (UF)")?.field).toBe("state")
    expect(mappedByHeader.get("Estado (UF)")?.confidence).toBe(1.0)
    expect(mappedByHeader.get("Status")?.field).toBe("status")
    expect(mappedByHeader.get("Status")?.confidence).toBe(1.0)

    // Simplified variations
    const simpleCustomerHeaders = ["Estado", "Status do Cliente", "Endereço"]
    const simpleMappings = suggestMapping(simpleCustomerHeaders, "customers")
    const simpleMapped = new Map(simpleMappings.map((m) => [m.header, m.field]))

    expect(simpleMapped.get("Estado")).toBe("state")
    expect(simpleMapped.get("Status do Cliente")).toBe("status")

    // Test UF standalone
    const ufCustomerHeaders = ["Nome", "CPF", "UF", "Cidade"]
    const ufMappings = suggestMapping(ufCustomerHeaders, "customers")
    const ufMapped = new Map(ufMappings.map((m) => [m.header, m.field]))

    expect(ufMapped.get("UF")).toBe("state")
    expect(ufMapped.get("UF")).not.toBeNull()
  })
})

import { parseDate } from "./validators"

describe("Date Parser for Database Import", () => {
  it("correctly converts Brazilian format DD/MM/YYYY to ISO YYYY-MM-DD", () => {
    expect(parseDate("15/04/1990")).toBe("1990-04-15")
    expect(parseDate("01/12/1985")).toBe("1985-12-01")
    expect(parseDate("31/01/2000")).toBe("2000-01-31")
    expect(parseDate("15-04-1990")).toBe("1990-04-15")
    expect(parseDate("15.04.1990")).toBe("1990-04-15")
  })

  it("handles ISO formats, Date objects, and invalid strings safely", () => {
    expect(parseDate("1990-04-15")).toBe("1990-04-15")
    expect(parseDate("1990-04-15T00:00:00.000Z")).toBe("1990-04-15")
    expect(parseDate(new Date(1990, 3, 15))).toBe("1990-04-15")
    expect(parseDate("")).toBeNull()
    expect(parseDate(null)).toBeNull()
    expect(parseDate(undefined)).toBeNull()
    expect(parseDate("data invalida")).toBeNull()
  })
})


