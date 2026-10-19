import { describe, it, expect } from "vitest"
import ExcelJS from "exceljs"
import { buildExportFile } from "./workbook"
import type { ExportColumnDef, ExportRow } from "./types"

const columns: ExportColumnDef[] = [
  { header: "Produto", key: "name", type: "text" },
  { header: "Valor", key: "amount", type: "currency", total: true },
  { header: "Qtd", key: "qty", type: "number", total: true },
  { header: "Data", key: "date", type: "date" },
]

const rows: ExportRow[] = [
  { name: "Camiseta", amount: "R$ 1.234,56", qty: 2, date: "28/08/2026" },
  { name: "Tênis", amount: "R$ 299,90", qty: 3, date: "29/08/2026" },
]

describe("buildExportFile", () => {
  it("gera CSV pt-BR com BOM, ponto e vírgula e decimal vírgula", async () => {
    const file = await buildExportFile({ sheetName: "Produtos", columns, rows, format: "csv" })
    expect(file.extension).toBe("csv")

    const text = file.buffer.toString("utf-8")
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text).toContain("Produto;Valor;Qtd;Data")
    expect(text).toContain("Camiseta;1.234,56;2;28/08/2026")
    expect(text).toContain("TOTAL;1.534,46;5")
  })

  it("gera XLSX com números reais, formatos, totais, freeze e autofilter", async () => {
    const file = await buildExportFile({ sheetName: "Produtos", columns, rows, format: "xlsx" })
    expect(file.extension).toBe("xlsx")

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer)
    const ws = wb.getWorksheet("Produtos")!

    expect(ws.getCell("A1").value).toBe("Produto")
    expect(ws.getCell("B2").value).toBe(1234.56)
    expect(ws.getCell("B2").numFmt).toContain("R$")
    expect(ws.getCell("C2").value).toBe(2)

    const totalCell = ws.getCell("B4")
    expect((totalCell.value as { formula?: string }).formula).toContain("SUBTOTAL(109")

    expect(ws.views?.[0]).toMatchObject({ state: "frozen", ySplit: 1 })
    expect(ws.autoFilter).toBeTruthy()
  })

  it("adiciona cabeçalho de metadados quando informado", async () => {
    const file = await buildExportFile({
      sheetName: "Produtos",
      columns,
      rows,
      format: "xlsx",
      meta: {
        title: "Relatório de Produtos",
        partnerName: "Loja Teste",
        periodLabel: "08/2026",
        generatedAt: new Date(2026, 7, 28, 14, 30),
      },
    })

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer)
    const ws = wb.getWorksheet("Produtos")!

    expect(ws.getCell("A1").value).toBe("Relatório de Produtos")
    expect(String(ws.getCell("A2").value)).toContain("Loja Teste")
    expect(String(ws.getCell("A3").value)).toContain("08/2026")
  })
})
