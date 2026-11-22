import { describe, it, expect } from "vitest"
import { extractSpecifications } from "./specifications"

describe("extractSpecifications", () => {
  it("deve extrair especificações de um produto com technical_specs no formato ERP (objeto com attributes)", () => {
    const product = {
      id: "prod-1",
      name: "Camisa Polo",
      technical_specs: {
        attributes: [
          { id: 1, name: "Material", value: "Algodão" },
          { id: 2, name: "Cor", value: "Azul" },
        ],
        addon_groups: [],
        accepts_offers: false,
      },
    }

    const specs = extractSpecifications(product)
    expect(specs).toEqual([
      { name: "Material", value: "Algodão" },
      { name: "Cor", value: "Azul" },
    ])
  })

  it("deve extrair especificações quando technical_specs for um array direto", () => {
    const product = {
      id: "prod-2",
      name: "Tênis Esportivo",
      technical_specs: [
        { label: "Tamanho", value: "42" },
        { name: "Gênero", value: "Unissex" },
      ],
    }

    const specs = extractSpecifications(product)
    expect(specs).toEqual([
      { name: "Tamanho", value: "42" },
      { name: "Gênero", value: "Unissex" },
    ])
  })

  it("deve extrair especificações de serviços com technical_details no formato ERP (array)", () => {
    const service = {
      id: "serv-1",
      name: "Troca de Tela",
      technical_details: [
        { id: 10, name: "Peça", value: "Original" },
        { id: 11, name: "Garantia da peça", value: "6 meses" },
      ],
    }

    const specs = extractSpecifications(service)
    expect(specs).toEqual([
      { name: "Peça", value: "Original" },
      { name: "Garantia da peça", value: "6 meses" },
    ])
  })

  it("deve extrair quando technical_details for string JSON", () => {
    const service = {
      id: "serv-2",
      name: "Formatação de PC",
      technical_details: JSON.stringify([
        { name: "Backup incluso", value: "Sim" },
        { name: "Sistema", value: "Windows 11" },
      ]),
    }

    const specs = extractSpecifications(service)
    expect(specs).toEqual([
      { name: "Backup incluso", value: "Sim" },
      { name: "Sistema", value: "Windows 11" },
    ])
  })

  it("deve extrair quando technical_specs for string JSON com attributes", () => {
    const product = {
      id: "prod-3",
      technical_specs: JSON.stringify({
        attributes: [{ name: "Voltagem", value: "220V" }],
      }),
    }

    const specs = extractSpecifications(product)
    expect(specs).toEqual([{ name: "Voltagem", value: "220V" }])
  })

  it("deve extrair de product.attributes diretamente", () => {
    const product = {
      id: "prod-4",
      attributes: [{ name: "Marca", value: "Dell" }],
    }

    const specs = extractSpecifications(product)
    expect(specs).toEqual([{ name: "Marca", value: "Dell" }])
  })

  it("deve extrair de um dicionário chave-valor e ignorar chaves reservadas", () => {
    const raw = {
      id: "ignore-me",
      name: "ignore-me",
      addon_groups: [],
      "Memória RAM": "16 GB",
      "Processador": "Intel Core i7",
    }

    const specs = extractSpecifications(raw)
    expect(specs).toEqual([
      { name: "Memória RAM", value: "16 GB" },
      { name: "Processador", value: "Intel Core i7" },
    ])
  })

  it("deve filtrar itens vazios e converter booleans/números adequadamente", () => {
    const product = {
      technical_specs: [
        { name: "  ", value: "vazio" },
        { name: "Sem valor", value: "" },
        { name: "Pronta Entrega", value: true },
        { name: "Garantia estendida", value: false },
        { name: "Garantia meses", value: 12 },
      ],
    }

    const specs = extractSpecifications(product)
    expect(specs).toEqual([
      { name: "Pronta Entrega", value: "Sim" },
      { name: "Garantia estendida", value: "Não" },
      { name: "Garantia meses", value: "12" },
    ])
  })

  it("deve retornar array vazio se não houver especificações", () => {
    expect(extractSpecifications(null)).toEqual([])
    expect(extractSpecifications(undefined)).toEqual([])
    expect(extractSpecifications({})).toEqual([])
    expect(extractSpecifications({ id: "1", name: "Sem specs" })).toEqual([])
  })

  it("nunca deve vazar colunas do banco do produto quando attributes estiver vazio", () => {
    const erpProduct = {
      id: "855679cb-4ef3-43a1-9b95-56d0ad2703d3",
      product_id: "855679cb-4ef3-43a1-9b95-56d0ad2703d3",
      name: "Produto Tiny",
      costPrice: 0,
      stock: 30,
      minStock: 0,
      maxStock: 0,
      unidade: "UN",
      unit: "UN",
      productType: "Físico",
      primary_image_index: 0,
      allow_sell_without_stock: false,
      ncm: "00000000",
      origin: 0,
      item_type: "00",
      cfop_internal: "5102",
      cfop_external: "6102",
      csosn: "102",
      pis_cst: "99",
      pis_rate: 0,
      cofins_cst: "99",
      cofins_rate: 0,
      ipi_cst: "99",
      product_situation: "revenda",
      is_on_promotion: false,
      mp_store_name: "Dudit",
      fts: "'-335764096':4B 'dudit':2 'test':1A 'tiny':3B",
      total_sales: 4,
      sales_last_30_days: 4,
      sales_last_7_days: 4,
      views_count: 18,
      views_last_30_days: 18,
      favorites_count: 0,
      last_sale_at: "2026-11-21T16:45:40.445813+00:00",
      marketplace_score: 0.337,
      external_id: "335764096",
      external_provider: "tiny",
      last_external_sync_at: "2026-11-21T16:43:42.207+00:00",
      attributes: [],
      technical_specs: {
        attributes: [],
        addon_groups: [],
        accepts_offers: false,
        accepts_trades: false,
      },
    }

    expect(extractSpecifications(erpProduct)).toEqual([])
  })

  it("não deve vazar colunas do serviço quando technical_details estiver vazio", () => {
    const erpService = {
      id: "srv-1",
      partner_id: "p-1",
      store_id: "s-1",
      name: "Instalação",
      price: 150,
      fts: "'instal':1A",
      total_sales: 2,
      views_count: 10,
      technical_details: [],
    }

    expect(extractSpecifications(erpService)).toEqual([])
  })
})
