import ExcelJS from "exceljs"
import type {
  ErpExportFormat,
  ExportColumnDef,
  ExportColumnType,
  ExportMeta,
  ExportRow,
} from "./types"

const BRAND_GREEN = "FF1E824C"
const BRAND_GREEN_DARK = "FF166534"
const WHITE = "FFFFFFFF"
const TEXT_DARK = "FF1D2939"
const TEXT_MUTED = "FF475467"
const BORDER_LIGHT = "FFE4E7EC"

const CURRENCY_FMT = 'R$ #,##0.00;[Red]-R$ #,##0.00;"R$ 0,00"'
const NUMBER_FMT = "#,##0.##"
const DATE_FMT = "dd/mm/yyyy"
const DATETIME_FMT = "dd/mm/yyyy hh:mm"
const PERCENT_FMT = "0.00%"

const DEFAULT_COLUMN_WIDTH: Record<ExportColumnType, number> = {
  text: 20,
  number: 14,
  currency: 16,
  date: 14,
  datetime: 20,
  percent: 14,
  boolean: 12,
}

function typeOf(col: ExportColumnDef): ExportColumnType {
  return col.type ?? "text"
}

function numFmtFor(type: ExportColumnType): string | undefined {
  switch (type) {
    case "currency":
      return CURRENCY_FMT
    case "number":
      return NUMBER_FMT
    case "date":
      return DATE_FMT
    case "datetime":
      return DATETIME_FMT
    case "percent":
      return PERCENT_FMT
    default:
      return undefined
  }
}

function isNumericType(type: ExportColumnType): boolean {
  return type === "number" || type === "currency" || type === "percent"
}

function alignFor(col: ExportColumnDef): "left" | "center" | "right" {
  if (col.align) return col.align
  return isNumericType(typeOf(col)) || typeOf(col) === "date" || typeOf(col) === "datetime"
    ? "right"
    : "left"
}

function defaultWidth(col: ExportColumnDef): number {
  return col.width ?? DEFAULT_COLUMN_WIDTH[typeOf(col)]
}

function colLetter(index1Based: number): string {
  let n = index1Based
  let s = ""
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function formatBrDate(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function formatBrDateTime(d: Date): string {
  return `${formatBrDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parses Brazilian (1.234,56) and plain (1234.56) numeric strings into a number. */
function coerceNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "boolean") return value ? 1 : 0
  const s = String(value).trim()
  if (!s || s === "-") return null
  const cleaned = s.replace(/[R$\s%]/gi, "")
  let normalized = cleaned
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".")
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".")
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function coercePercent(value: unknown): number | null {
  if (value == null || value === "") return null
  if (typeof value === "number") return value
  const s = String(value).trim()
  if (!s || s === "-") return null
  const hasPct = s.includes("%")
  const n = coerceNumber(s.replace("%", ""))
  if (n == null) return null
  return hasPct ? n / 100 : n
}

function coerceDate(value: unknown, withTime: boolean): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (value == null || value === "") return null
  const s = String(value).trim()
  if (!s || s === "-") return null
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/)
  if (br) {
    const [, d, mo, y, h, mi] = br
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      withTime ? Number(h || 0) : 0,
      withTime ? Number(mi || 0) : 0,
    )
  }
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toCellValue(value: unknown, col: ExportColumnDef): string | number | Date {
  switch (typeOf(col)) {
    case "currency":
    case "number": {
      const n = coerceNumber(value)
      return n ?? "-"
    }
    case "percent": {
      const n = coercePercent(value)
      return n ?? "-"
    }
    case "date":
      return coerceDate(value, false) ?? "-"
    case "datetime":
      return coerceDate(value, true) ?? "-"
    case "boolean": {
      if (typeof value === "boolean") return value ? "Sim" : "Não"
      const s = String(value ?? "").trim().toLowerCase()
      if (["sim", "true", "1", "yes"].includes(s)) return "Sim"
      if (["não", "nao", "false", "0", "no"].includes(s)) return "Não"
      return value == null || value === "" ? "-" : String(value)
    }
    default:
      return value == null || value === "" ? "-" : String(value)
  }
}

function formatCsvNumber(n: number, minDecimals = 0): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: 2,
  })
}

function formatCsvValue(value: unknown, col: ExportColumnDef): string {
  const type = typeOf(col)
  switch (type) {
    case "currency": {
      const n = coerceNumber(value)
      return n == null ? "" : formatCsvNumber(n, 2)
    }
    case "number": {
      const n = coerceNumber(value)
      return n == null ? "" : formatCsvNumber(n)
    }
    case "percent": {
      const n = coercePercent(value)
      return n == null ? "" : `${formatCsvNumber(n * 100)}%`
    }
    case "date":
    case "datetime": {
      if (typeof value === "string") return value.trim() === "-" ? "" : value.trim()
      const d = coerceDate(value, type === "datetime")
      if (!d) return ""
      return type === "datetime" ? formatBrDateTime(d) : formatBrDate(d)
    }
    default: {
      if (value == null) return ""
      const s = String(value).trim()
      return s === "-" ? "" : s
    }
  }
}

/**
 * IDs are implementation details and must never be part of a downloaded
 * report. Keep this guard at the workbook boundary so a new mapper cannot
 * accidentally leak an internal identifier into XLSX or CSV.
 */
function isInternalIdColumn(column: ExportColumnDef): boolean {
  const key = column.key.trim()
  const header = column.header.trim()
  return key === "id" || /(?:Id|_id)$/.test(key) || /(^|\s)id(?:\s|$)/i.test(header)
}

function sanitizeExportPayload(columns: ExportColumnDef[], rows: ExportRow[]) {
  const safeColumns = columns.filter((column) => !isInternalIdColumn(column))
  const safeRows = rows.map((row) => {
    const safeRow: ExportRow = {}
    for (const column of safeColumns) {
      safeRow[column.key] = row[column.key]
    }
    return safeRow
  })
  return { columns: safeColumns, rows: safeRows }
}

function csvEscape(value: string, protectFormula = false): string {
  const raw = String(value)
  const v = protectFormula && /^[\t ]*[=+\-@]/.test(raw) ? `'${raw}` : raw
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function computeTotals(columns: ExportColumnDef[], rows: ExportRow[]): Map<number, number> {
  const totals = new Map<number, number>()
  columns.forEach((col, i) => {
    if (!col.total || !isNumericType(typeOf(col))) return
    let sum = 0
    let hasValue = false
    for (const row of rows) {
      const n = typeOf(col) === "percent" ? coercePercent(row[col.key]) : coerceNumber(row[col.key])
      if (n != null) {
        sum += n
        hasValue = true
      }
    }
    if (hasValue) totals.set(i, sum)
  })
  return totals
}

function buildCsv(params: {
  columns: ExportColumnDef[]
  rows: ExportRow[]
  meta?: ExportMeta
}): { buffer: Buffer; mimeType: string; extension: string } {
  const { columns, rows, meta } = params
  const lines: string[] = []

  if (meta) {
    lines.push(csvEscape(meta.title, true))
    const info: string[] = []
    if (meta.partnerName) info.push(`Empresa: ${meta.partnerName}`)
    if (meta.documentNumber) info.push(`CNPJ/CPF: ${meta.documentNumber}`)
    if (meta.storeName) info.push(`Unidade: ${meta.storeName}`)
    if (meta.periodLabel) info.push(`Período: ${meta.periodLabel}`)
    if (info.length) lines.push(csvEscape(info.join(" | "), true))
    if (meta.filtersLabel) lines.push(csvEscape(`Filtros: ${meta.filtersLabel}`, true))
    lines.push(csvEscape(`Gerado em: ${formatBrDateTime(meta.generatedAt ?? new Date())}`, true))
    lines.push("")
  }

  lines.push(columns.map((c) => csvEscape(c.header, true)).join(";"))

  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(formatCsvValue(row[c.key], c), !isNumericType(typeOf(c)))).join(";"))
  }

  const totals = computeTotals(columns, rows)
  if (totals.size > 0) {
    lines.push(
      columns
        .map((_c, i) => {
          if (i === 0) return csvEscape("TOTAL", true)
          if (totals.has(i)) {
            const min = typeOf(columns[i]) === "currency" ? 2 : 0
            return csvEscape(formatCsvNumber(totals.get(i)!, min))
          }
          return ""
        })
        .join(";"),
    )
  }

  const csv = lines.join("\r\n")
  return {
    buffer: Buffer.from(`\uFEFF${csv}`, "utf-8"),
    mimeType: "text/csv;charset=utf-8",
    extension: "csv",
  }
}

async function buildXlsx(params: {
  sheetName: string
  columns: ExportColumnDef[]
  rows: ExportRow[]
  meta?: ExportMeta
}): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const { sheetName, columns, rows, meta } = params

  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Dudit"
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 0 }] })
  sheet.columns = columns.map((c) => ({ key: c.key, width: defaultWidth(c) }))

  const colCount = Math.max(columns.length, 1)
  let cursor = 1

  if (meta) {
    sheet.mergeCells(cursor, 1, cursor, colCount)
    const titleCell = sheet.getCell(cursor, 1)
    titleCell.value = meta.title
    titleCell.font = { bold: true, size: 13, color: { argb: BRAND_GREEN } }
    titleCell.alignment = { vertical: "middle", horizontal: "left" }
    sheet.getRow(cursor).height = 24
    cursor++

    const info: string[] = []
    if (meta.partnerName) info.push(`Empresa: ${meta.partnerName}`)
    if (meta.documentNumber) info.push(`CNPJ/CPF: ${meta.documentNumber}`)
    if (meta.storeName) info.push(`Unidade: ${meta.storeName}`)
    if (meta.periodLabel) info.push(`Período: ${meta.periodLabel}`)
    if (info.length) {
      sheet.mergeCells(cursor, 1, cursor, colCount)
      const cell = sheet.getCell(cursor, 1)
      cell.value = info.join("   |   ")
      cell.font = { size: 10, color: { argb: TEXT_DARK } }
      cursor++
    }

    if (meta.filtersLabel) {
      sheet.mergeCells(cursor, 1, cursor, colCount)
      const cell = sheet.getCell(cursor, 1)
      cell.value = `Filtros: ${meta.filtersLabel}`
      cell.font = { size: 9.5, color: { argb: TEXT_MUTED } }
      cursor++
    }

    sheet.mergeCells(cursor, 1, cursor, colCount)
    const genCell = sheet.getCell(cursor, 1)
    genCell.value = `Gerado em: ${formatBrDateTime(meta.generatedAt ?? new Date())}`
    genCell.font = { size: 9.5, color: { argb: TEXT_MUTED } }
    cursor++

    cursor++ // blank spacer row
  }

  const headerRowNumber = cursor
  const headerRow = sheet.getRow(headerRowNumber)
  headerRow.height = 22
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = col.header
    cell.font = { bold: true, color: { argb: WHITE }, size: 10.5 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.border = {
      top: { style: "thin", color: { argb: BRAND_GREEN } },
      bottom: { style: "medium", color: { argb: BRAND_GREEN_DARK } },
    }
  })
  cursor++

  const firstDataRow = cursor
  for (const row of rows) {
    const dataRow = sheet.getRow(cursor)
    columns.forEach((col, idx) => {
      const cell = dataRow.getCell(idx + 1)
      const value = toCellValue(row[col.key], col)
      cell.value = value
      const fmt = numFmtFor(typeOf(col))
      if (fmt && (typeof value === "number" || value instanceof Date)) cell.numFmt = fmt
      cell.alignment = { horizontal: alignFor(col), vertical: "middle" }
      cell.border = { bottom: { style: "hair", color: { argb: BORDER_LIGHT } } }
    })
    cursor++
  }
  const lastDataRow = cursor - 1

  const totals = computeTotals(columns, rows)
  if (totals.size > 0 && rows.length > 0) {
    const totalRow = sheet.getRow(cursor)
    totalRow.height = 22
    const labelCell = totalRow.getCell(1)
    labelCell.value = "TOTAL"
    labelCell.font = { bold: true, color: { argb: BRAND_GREEN }, size: 10.5 }
    labelCell.alignment = { horizontal: "left", vertical: "middle" }
    labelCell.border = {
      top: { style: "thin", color: { argb: BRAND_GREEN } },
      bottom: { style: "double", color: { argb: BRAND_GREEN } },
    }
    for (const [idx] of totals) {
      const letter = colLetter(idx + 1)
      const cell = totalRow.getCell(idx + 1)
      cell.value = { formula: `SUBTOTAL(109,${letter}${firstDataRow}:${letter}${lastDataRow})` }
      const fmt = numFmtFor(typeOf(columns[idx]))
      if (fmt) cell.numFmt = fmt
      cell.font = { bold: true, color: { argb: BRAND_GREEN }, size: 10.5 }
      cell.alignment = { horizontal: "right", vertical: "middle" }
      cell.border = {
        top: { style: "thin", color: { argb: BRAND_GREEN } },
        bottom: { style: "double", color: { argb: BRAND_GREEN } },
      }
    }
    cursor++
  }

  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }]
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: Math.max(headerRowNumber, lastDataRow), column: colCount },
  }

  const raw = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  return {
    buffer: Buffer.from(raw),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  }
}

export async function buildExportFile(params: {
  sheetName: string
  columns: ExportColumnDef[]
  rows: ExportRow[]
  format: ErpExportFormat
  meta?: ExportMeta
}): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const safePayload = sanitizeExportPayload(params.columns, params.rows)

  if (params.format === "csv") {
    return buildCsv({ ...safePayload, meta: params.meta })
  }
  return buildXlsx({
    sheetName: params.sheetName,
    ...safePayload,
    meta: params.meta,
  })
}
