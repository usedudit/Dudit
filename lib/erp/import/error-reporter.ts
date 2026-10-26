import "server-only"
import ExcelJS from "exceljs"
import type { EntityType, FailedRow } from "./types"

export async function generateFailedRowsReport(
  entityType: EntityType,
  headers: string[],
  failedRows: FailedRow[],
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Dudit"
  workbook.created = new Date()

  const sheet = workbook.addWorksheet("Linhas com Falhas", {
    views: [{ state: "frozen", ySplit: 1 }],
  })

  // Internal identifiers must not be propagated even when the uploaded file
  // came from an older export that still contained an ID column.
  const safeHeaders = headers.filter((header) => {
    const value = header.trim()
    return !/(^|\s)id(?:\s|$)/i.test(value)
  })

  // Columns: Linha Original, Motivo do Erro, followed by safe original headers
  const columns = [
    { header: "Linha Planilha", key: "_row_num", width: 14 },
    { header: "Motivo da Falha / Correção Necessária", key: "_error_reason", width: 45 },
    ...safeHeaders.map((h) => ({
      header: h,
      key: h,
      width: Math.max(h.length + 4, 18),
    })),
  ]

  sheet.columns = columns

  // Style Header Row
  const headerRow = sheet.getRow(1)
  headerRow.height = 28
  headerRow.eachCell((cell, colNum) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Segoe UI" }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colNum === 2 ? "FFEA580C" : "FF059669" },
    }
    cell.alignment = { horizontal: "center", vertical: "middle" }
  })

  for (const failed of failedRows) {
    const rowValues: Record<string, any> = {
      _row_num: failed.rowIndex,
      _error_reason: failed.errorMessage,
    }
    for (const h of safeHeaders) {
      rowValues[h] = failed.data[h] ?? ""
    }

    const addedRow = sheet.addRow(rowValues)
    addedRow.height = 22
    addedRow.eachCell((cell, colNum) => {
      cell.font = {
        size: 10,
        name: "Segoe UI",
        color: colNum === 2 ? { argb: "FFC0392B" } : { argb: "FF333333" },
        bold: colNum === 2,
      }
      cell.alignment = { vertical: "middle" }
      cell.border = {
        top: { style: "thin", color: { argb: "FFE0E0E0" } },
        bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
        left: { style: "thin", color: { argb: "FFE0E0E0" } },
        right: { style: "thin", color: { argb: "FFE0E0E0" } },
      }
    })
  }

  const raw = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  const buffer = Buffer.from(raw)
  const entitySlug =
    entityType === "products"
      ? "produtos"
      : entityType === "services"
        ? "servicos"
        : entityType === "appointments"
          ? "agendamentos"
          : "clientes"
  const filename = `falhas-importacao-${entitySlug}-${Date.now().toString().slice(-6)}.xlsx`

  return {
    buffer,
    filename,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }
}
