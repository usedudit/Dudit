"use client"

export interface ExportTableSection {
  name: string
  headers: string[]
  rows: (string | number)[][]
}

function escapeCsvCell(value: string | number): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`
}

function sanitizeSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw
    .replace(/[:\\/?*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const base = (cleaned || "Planilha").slice(0, 31)
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let suffix = 2
  while (true) {
    const tag = ` (${suffix})`
    const candidate = `${base.slice(0, 31 - tag.length)}${tag}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
    suffix += 1
  }
}

export function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [
    headers.map(h => escapeCsvCell(h)).join(";"),
    ...rows.map(r => r.map(v => escapeCsvCell(v)).join(";")),
  ].join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportMultiSectionCSV(filename: string, sections: ExportTableSection[]) {
  const lines: string[] = []

  sections.forEach((section, index) => {
    if (index > 0) lines.push("")
    lines.push(escapeCsvCell(section.name))
    lines.push(section.headers.map(h => escapeCsvCell(h)).join(";"))
    if (section.rows.length > 0) {
      for (const row of section.rows) {
        lines.push(row.map(v => escapeCsvCell(v)).join(";"))
      }
    } else {
      lines.push(escapeCsvCell("Sem dados no período"))
    }
  })

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportXLSX(filename: string, sheets: ExportTableSection[]) {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.default.Workbook()
  const usedNames = new Set<string>()

  for (const sheetDef of sheets) {
    const sheet = workbook.addWorksheet(sanitizeSheetName(sheetDef.name, usedNames))
    const headerRow = sheet.addRow(sheetDef.headers)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E824C" } }
      cell.alignment = { horizontal: "center", vertical: "middle" }
    })

    if (sheetDef.rows.length > 0) {
      for (const rowData of sheetDef.rows) {
        sheet.addRow(rowData)
      }
    } else {
      sheet.addRow(["Sem dados no período"])
    }

    sheet.columns.forEach(col => {
      let maxLen = 0
      if (col.values) {
        col.values.forEach(v => {
          if (v) maxLen = Math.max(maxLen, String(v).length)
        })
      }
      col.width = Math.min(Math.max(maxLen + 3, 12), 50)
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportStatisticReport(
  format: "csv" | "xlsx",
  filename: string,
  sections: ExportTableSection[],
) {
  if (format === "csv") {
    exportMultiSectionCSV(filename, sections)
  } else {
    await exportXLSX(filename, sections)
  }
}
