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
})
