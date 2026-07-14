import ExcelJS from "exceljs"
import type { ErpExportFormat } from "./types"
import type { ExportColumnDef, ExportRow } from "./types"

export async function buildExportFile(params: {
  sheetName: string
  columns: ExportColumnDef[]
  rows: ExportRow[]
  format: ErpExportFormat
}): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  if (params.format === "csv") {
    const header = params.columns.map((c) => escapeCsv(c.header)).join(",")
    const lines = params.rows.map((row) =>
      params.columns.map((c) => escapeCsv(String(row[c.key] ?? ""))).join(","),
    )
    const csv = [header, ...lines].join("\n")
    return {
      buffer: Buffer.from(`\uFEFF${csv}`, "utf-8"),
      mimeType: "text/csv;charset=utf-8",
      extension: "csv",
    }
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Dudit ERP"
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(params.sheetName)
  sheet.columns = params.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 18,
  }))
  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E824C" } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
  })

  for (const row of params.rows) {
    sheet.addRow(row)
  }

  const raw = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  return {
    buffer: Buffer.from(raw),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  }
}

function escapeCsv(value: string): string {
  const v = value.replace(/"/g, '""')
  return /[",\n\r]/.test(v) ? `"${v}"` : v
}
