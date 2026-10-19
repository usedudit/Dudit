"use client"

export function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [
    headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(";"),
    ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")),
  ].join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportXLSX(filename: string, sheets: { name: string; headers: string[]; rows: (string | number)[][] }[]) {
  const ExcelJS = await import("exceljs")
  const workbook = new ExcelJS.default.Workbook()

  for (const sheetDef of sheets) {
    const sheet = workbook.addWorksheet(sheetDef.name)
    const headerRow = sheet.addRow(sheetDef.headers)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E824C" } }
      cell.alignment = { horizontal: "center", vertical: "middle" }
    })

    for (const rowData of sheetDef.rows) {
      sheet.addRow(rowData)
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
