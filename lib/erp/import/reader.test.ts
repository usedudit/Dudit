import { describe, it, expect, vi } from "vitest"
import ExcelJS from "exceljs"
import { readSpreadsheet } from "./reader"
import { suggestMapping } from "./mapper"
import { buildExportFile } from "../export/workbook"
import type { ExportColumnDef, ExportRow } from "../export/types"

vi.mock("server-only", () => ({}))

const columns: ExportColumnDef[] = [
  { header: "Nome do Produto", key: "name", type: "text" },
  { header: "SKU / Código", key: "sku", type: "text" },
  { header: "Código de Barras (GTIN/EAN)", key: "gtin", type: "text" },
  { header: "Preço de Venda", key: "price", type: "currency" },
  { header: "Estoque Atual", key: "stock", type: "number", total: true },
  { header: "Status", key: "status", type: "text" },
]

const rows: ExportRow[] = [
  { name: "Camiseta", sku: "CAM-1", gtin: "-", price: "R$ 49,90", stock: 7, status: "Ativo" },
  { name: "Tênis", sku: "TEN-2", gtin: "7891234567890", price: "R$ 299,90", stock: 3, status: "Inativo" },
]

const meta = {
  title: "Relatório de Produtos",
  partnerName: "Loja Teste",
  documentNumber: "12.345.678/0001-90",
  storeName: "Matriz",
  periodLabel: "01/10/2026 a 25/10/2026",
  filtersLabel: "Status: Ativo",
  generatedAt: new Date(2026, 9, 25, 17, 11),
}

async function exportFile(format: "xlsx" | "csv") {
  return buildExportFile({
    sheetName: "Produtos",
    columns,
    rows,
    format,
    meta,
  })
}

function asArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer as unknown as ArrayBuffer
}

describe("readSpreadsheet", () => {
  it("detecta o cabeçalho real em XLSX exportado com título, metadados e linha TOTAL", async () => {
    const file = await exportFile("xlsx")
    const result = await readSpreadsheet(asArrayBuffer(file.buffer), "produtos.xlsx")

    expect(result.headers).toEqual([
      "Nome do Produto",
      "SKU / Código",
      "Código de Barras (GTIN/EAN)",
      "Preço de Venda",
      "Estoque Atual",
      "Status",
    ])
    expect(result.totalRows).toBe(2)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual(["Camiseta", "CAM-1", "", "49.9", "7", "Ativo"])
    expect(result.rows[1]).toEqual(["Tênis", "TEN-2", "7891234567890", "299.9", "3", "Inativo"])
  })

  it("detecta o cabeçalho real em CSV exportado e ignora o rodapé TOTAL", async () => {
    const file = await exportFile("csv")
    const result = await readSpreadsheet(asArrayBuffer(file.buffer), "produtos.csv")

    expect(result.headers[0]).toBe("Nome do Produto")
    expect(result.headers).toContain("Estoque Atual")
    expect(result.totalRows).toBe(2)
    expect(result.rows.some((row) => row[0] === "TOTAL")).toBe(false)
  })

  it("continua aceitando planilhas simples com cabeçalho na primeira linha", async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Clientes")
    sheet.addRow(["Nome / Razão Social", "CPF", "E-mail", "Status"])
    sheet.addRow(["Maria Silva", "123.456.789-00", "maria@email.com", "Ativo"])
    sheet.addRow(["João Souza", "", "joao@email.com", "Inativo"])

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await readSpreadsheet(buffer as ArrayBuffer, "clientes.xlsx")

    expect(result.headers).toEqual(["Nome / Razão Social", "CPF", "E-mail", "Status"])
    expect(result.totalRows).toBe(2)
    expect(result.rows[0]).toEqual(["Maria Silva", "123.456.789-00", "maria@email.com", "Ativo"])
  })

  it("preserva colunas vazias internas para não desalinhar o mapeamento", async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Serviços")
    sheet.addRow(["Nome do Serviço", "", "Preço", "Status"])
    sheet.addRow(["Corte", "ignorar", "50", "Ativo"])

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await readSpreadsheet(buffer as ArrayBuffer, "servicos.xlsx")

    expect(result.headers).toEqual(["Nome do Serviço", "", "Preço", "Status"])
    expect(result.rows[0]).toEqual(["Corte", "ignorar", "50", "Ativo"])
  })

  it("formata células de data como DD/MM/AAAA", async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Clientes")
    sheet.addRow(["Nome / Razão Social", "Data de Nascimento"])
    const dateRow = sheet.addRow(["Maria Silva", new Date(1988, 3, 15)])
    dateRow.getCell(2).numFmt = "dd/mm/yyyy"

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await readSpreadsheet(buffer as ArrayBuffer, "clientes.xlsx")

    expect(result.rows[0][1]).toBe("15/04/1988")
  })

  it("lê com sucesso planilha no formato .xls (BIFF8 / Excel 97-2004) como a do Tiny ERP", async () => {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()
    const data = [
      ["Código (SKU)", "Descrição", "Unidade", "Preço", "Estoque", "Descrição complementar", "Título SEO"],
      ["JOG-IA", "Jogo Imagem & Ação", "Un", "79.99", "10", "Jogo clássico infantil", ""],
      ["CAM-01", "Camiseta Algodão", "Un", "129.90", "20", "Camiseta 100% algodão", "Camiseta SEO"],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, "Planilha 1")
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xls" })

    const res = await readSpreadsheet(asArrayBuffer(buffer), "produtos.xls")
    expect(res.headers).toEqual([
      "Código (SKU)",
      "Descrição",
      "Unidade",
      "Preço",
      "Estoque",
      "Descrição complementar",
      "Título SEO",
    ])
    expect(res.totalRows).toBe(2)
    expect(res.rows[0][0]).toBe("JOG-IA")
    expect(res.rows[0][1]).toBe("Jogo Imagem & Ação")

    const mapping = suggestMapping(res.headers, "products", res.rows)
    const mapped = new Map(mapping.map((m) => [m.header, m.field]))
    expect(mapped.get("Código (SKU)")).toBe("sku")
    expect(mapped.get("Descrição")).toBe("name")
    expect(mapped.get("Descrição complementar")).toBe("description")
    expect(mapped.get("Preço")).toBe("price")
    expect(mapped.get("Estoque")).toBe("stock_quantity")
  })

  it("mapeia automaticamente os campos obrigatórios de produtos, clientes e serviços exportados", async () => {
    const cases = [
      {
        entity: "products" as const,
        headers: [
          "Nome do Produto",
          "SKU / Código",
          "Código de Barras (GTIN/EAN)",
          "Preço de Venda",
          "Preço de Custo",
          "Preço Promocional",
          "Estoque Atual",
          "Status",
          "Visibilidade na Loja",
        ],
        row: {
          "Nome do Produto": "Camiseta",
          "SKU / Código": "CAM-1",
          "Código de Barras (GTIN/EAN)": "7891234567890",
          "Preço de Venda": "R$ 49,90",
          "Preço de Custo": "R$ 20,00",
          "Preço Promocional": "-",
          "Estoque Atual": "7",
          "Visibilidade na Loja": "Sim",
        },
        required: ["name", "price"],
      },
      {
        entity: "customers" as const,
        headers: [
          "Nome / Razão Social",
          "Tipo de Pessoa",
          "CPF",
          "CNPJ",
          "E-mail",
          "Celular / WhatsApp",
          "Status",
          "Cidade",
          "Estado (UF)",
        ],
        row: {
          "Nome / Razão Social": "Maria Silva",
          "Tipo de Pessoa": "Física",
          CPF: "123.456.789-00",
          CNPJ: "-",
          "E-mail": "maria@email.com",
          "Celular / WhatsApp": "(11) 98765-4321",
          Cidade: "São Paulo",
          "Estado (UF)": "SP",
        },
        required: ["name"],
      },
      {
        entity: "services" as const,
        headers: [
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
        ],
        row: {
          "Nome do Serviço": "Corte",
          "SKU / Código": "SERV-1",
          Preço: "R$ 50,00",
          "Preço de Custo": "R$ 10,00",
          "Duração (minutos)": "60",
          Categoria: "Beleza",
          "Tipo de Atendimento": "Presencial",
          Unidade: "Serviço",
        },
        required: ["name", "price"],
      },
    ]

    for (const testCase of cases) {
      const exportColumns: ExportColumnDef[] = testCase.headers.map((header) => ({
        header,
        key: header,
        type: "text",
      }))
      const exportRows: ExportRow[] = [
        Object.fromEntries(
          testCase.headers.map((header) => [header, String(Reflect.get(testCase.row, header) ?? "-")]),
        ),
      ]

      const file = await buildExportFile({
        sheetName: testCase.entity,
        columns: exportColumns,
        rows: exportRows,
        format: "xlsx",
        meta,
      })
      const result = await readSpreadsheet(asArrayBuffer(file.buffer), `${testCase.entity}.xlsx`)
      const mapping = suggestMapping(result.headers, testCase.entity, result.rows)
      const mappedFields = new Set(mapping.map((item) => item.field).filter(Boolean))

      for (const field of testCase.required) {
        expect(mappedFields, `${testCase.entity} should map "${field}"`).toContain(field)
      }
    }
  })
})
