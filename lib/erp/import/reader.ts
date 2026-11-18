import "server-only"
import { Readable } from "node:stream"
import ExcelJS from "exceljs"
import * as XLSX from "xlsx"
import type { ReadResult } from "./types"
import { fieldRegistry } from "./field-registry"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_ROWS = 2000
/** How many rows from the top are inspected while looking for the real header row. */
const HEADER_SCAN_LIMIT = 30

export class ImportReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImportReadError"
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Terms that identify a header row. Built from every importable entity so the
 * reader does not need to know beforehand which entity is being imported.
 */
const HEADER_TERMS = (() => {
  const terms = new Set<string>()
  const add = (value: string | undefined) => {
    if (!value) return
    const normalized = normalizeText(value)
    if (normalized) terms.add(normalized)
  }

  for (const fields of Object.values(fieldRegistry)) {
    for (const field of fields) {
      add(field.label)
      add(field.name)
      for (const synonym of field.synonyms) add(synonym)
    }
  }

  return terms
})()

const METADATA_PREFIXES = [
  "relatorio",
  "gerado em",
  "emitido em",
  "impresso em",
  "empresa:",
  "empresa ",
  "cnpj/cpf",
  "cpf/cnpj",
  "cnpj:",
  "cpf:",
  "filtros:",
  "filtro:",
  "periodo:",
  "periodo ",
  "unidade:",
  "loja:",
  "pagina ",
]

function isMetadataText(value: string): boolean {
  const normalized = normalizeText(value)
  if (!normalized) return false
  return METADATA_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function countNonEmpty(values: string[]): number {
  return values.reduce((total, value) => (value ? total + 1 : total), 0)
}

function lastNonEmptyIndex(values: string[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i]) return i
  }
  return -1
}

/**
 * A row made only of title/metadata cells ("Relatório de Produtos",
 * "Gerado em: ...", "CNPJ/CPF: ..."). Data rows are never treated as metadata.
 */
function isMetadataRow(values: string[]): boolean {
  const nonEmpty = values.filter(Boolean)
  if (nonEmpty.length === 0) return true
  const metadataCells = nonEmpty.filter(isMetadataText).length
  return metadataCells > 0 && metadataCells >= Math.ceil(nonEmpty.length / 2)
}

function isTotalRow(values: string[]): boolean {
  const first = values.find(Boolean)
  return first ? normalizeText(first) === "total" : false
}

function countHeaderMatches(values: string[]): number {
  return values.reduce(
    (total, value) => (HEADER_TERMS.has(normalizeText(value)) ? total + 1 : total),
    0,
  )
}

function looksLikeHeader(values: string[]): boolean {
  const nonEmpty = values.filter(Boolean)
  if (nonEmpty.length < 2) return false

  const headerish = nonEmpty.filter((value) => {
    if (value.length > 80) return false
    const digits = value.replace(/\D/g, "")
    return digits.length < value.length / 2
  }).length

  return headerish >= Math.ceil(nonEmpty.length * 0.6)
}

/**
 * Finds the real header row. Spreadsheet exports often start with a title
 * (e.g. "Relatório de Produtos"), company/filter metadata, a "Gerado em"
 * line and a blank spacer row before the actual column headers.
 */
function findHeaderRowIndex(rows: string[][]): number {
  const scanLimit = Math.min(rows.length, HEADER_SCAN_LIMIT)

  // 1) Prefer the row that best matches known field labels/synonyms.
  let bestIndex = -1
  let bestMatches = 0
  for (let i = 0; i < scanLimit; i++) {
    const values = rows[i]
    if (countNonEmpty(values) < 2) continue
    if (isMetadataRow(values)) continue

    const matches = countHeaderMatches(values)
    if (matches > bestMatches) {
      bestMatches = matches
      bestIndex = i
    }
  }
  if (bestIndex >= 0 && bestMatches >= 2) return bestIndex

  // 2) Otherwise use the first plausible (non-metadata, multi-column) row.
  for (let i = 0; i < scanLimit; i++) {
    const values = rows[i]
    if (countNonEmpty(values) < 2) continue
    if (isMetadataRow(values)) continue
    if (looksLikeHeader(values)) return i
  }

  // 3) Last resort: best match even with a single recognized column, or the
  // first non-metadata row (legacy behaviour for simple one-column sheets).
  if (bestIndex >= 0) return bestIndex

  const firstNonMetadata = rows.findIndex(
    (values) => countNonEmpty(values) > 0 && !isMetadataRow(values),
  )
  if (firstNonMetadata >= 0) return firstNonMetadata

  return rows.findIndex((values) => countNonEmpty(values) > 0)
}

function formatDateCell(value: Date): string {
  if (Number.isNaN(value.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`
  const hasTime = value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0
  return hasTime ? `${date} ${pad(value.getHours())}:${pad(value.getMinutes())}` : date
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ""

  if (value instanceof Date) return formatDateCell(value)

  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("").trim()
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim()
    }
    if ("result" in value) {
      return cellToString(value.result as ExcelJS.CellValue)
    }
    if ("error" in value) return ""
    return ""
  }

  if (typeof value === "boolean") return value ? "Sim" : "Não"

  const text = String(value).replace(/^\uFEFF/, "").trim()
  // The exporter writes "-" for empty values; treat it as blank on import.
  if (text === "-" || text === "—" || text === "–") return ""
  return text
}

function rowToValues(row: ExcelJS.Row): string[] {
  const values: string[] = []
  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    values[columnNumber - 1] = cellToString(cell.value)
  })
  for (let i = 0; i < values.length; i++) {
    if (values[i] === undefined) values[i] = ""
  }
  return values
}

function trimTrailingEmpty(values: string[]): string[] {
  const last = lastNonEmptyIndex(values)
  return last >= 0 ? values.slice(0, last + 1) : []
}

function padRow(values: string[], length: number): string[] {
  if (values.length >= length) return values.slice(0, length)
  return [...values, ...Array(length - values.length).fill("")]
}

/**
 * Counts candidate delimiters outside quoted fields so values like
 * "R$ 49,90" do not make a semicolon-separated export look comma-separated.
 */
function countDelimiter(line: string, delimiter: string): number {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (!inQuotes && char === delimiter) {
      count++
    }
  }
  return count
}

function detectCsvDelimiter(text: string): string {
  const candidates = [";", ",", "\t"]

  // Skip the report title/metadata lines and inspect the table area when possible.
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 40)

  let best = ";"
  let bestCount = -1
  for (const delimiter of candidates) {
    const count = lines.reduce((total, line) => total + countDelimiter(line, delimiter), 0)
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }

  return best
}

function readWithSheetJS(buffer: ArrayBuffer): string[][] {
  const wb = XLSX.read(Buffer.from(buffer), {
    type: "buffer",
    cellDates: true,
    raw: false,
    dateNF: "dd/mm/yyyy",
  })

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return []
  }

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue

    const sheetRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    })

    const rawRows: string[][] = []
    for (const row of sheetRows) {
      const rowValues = (Array.isArray(row) ? row : []).map((c) => {
        if (c == null) return ""
        const s = String(c).trim()
        if (s === "-" || s === "—" || s === "–") return ""
        return s
      })
      rawRows.push(trimTrailingEmpty(rowValues))
    }

    if (rawRows.some((r) => countNonEmpty(r) > 0)) {
      return rawRows
    }
  }

  return []
}

export async function readSpreadsheet(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<ReadResult> {
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new ImportReadError(
      `Arquivo muito grande (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). O limite é 10 MB.`,
    )
  }

  const ext = fileName.split(".").pop()?.toLowerCase()

  if (!["xlsx", "xls", "csv"].includes(ext || "")) {
    throw new ImportReadError(
      `Formato não suportado: .${ext}. Use .xlsx, .xls ou .csv.`,
    )
  }

  let rawRows: string[][] = []

  if (ext === "xls") {
    rawRows = readWithSheetJS(buffer)
  } else if (ext === "csv") {
    try {
      const workbook = new ExcelJS.Workbook()
      const buf = Buffer.from(buffer)
      await workbook.csv.read(Readable.from([buf]) as any, {
        parserOptions: { delimiter: detectCsvDelimiter(buf.toString("utf-8")) },
      })
      const worksheet = workbook.worksheets[0]
      if (worksheet) {
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          rawRows.push(trimTrailingEmpty(rowToValues(row)))
        })
      }
    } catch {
      // Fallback to SheetJS if ExcelJS fails
    }
    if (rawRows.length === 0) {
      rawRows = readWithSheetJS(buffer)
    }
  } else {
    // ext === "xlsx"
    try {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)
      const worksheet = workbook.worksheets[0]
      if (worksheet) {
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          rawRows.push(trimTrailingEmpty(rowToValues(row)))
        })
      }
    } catch {
      // Fallback to SheetJS if ExcelJS fails
    }
    if (rawRows.length === 0) {
      rawRows = readWithSheetJS(buffer)
    }
  }

  if (rawRows.length === 0) {
    throw new ImportReadError("Planilha vazia ou sem abas.")
  }

  const headerRowIndex = findHeaderRowIndex(rawRows)

  if (headerRowIndex < 0) {
    throw new ImportReadError("Nenhum cabeçalho encontrado na planilha.")
  }

  // Keep blank header columns so data columns stay aligned with their headers.
  const headerValues = rawRows[headerRowIndex].map((value) =>
    value.replace(/\s+/g, " ").trim(),
  )
  const headerLastIndex = lastNonEmptyIndex(headerValues)
  const headers = headerValues.slice(0, headerLastIndex + 1)

  if (headers.length === 0) {
    throw new ImportReadError("Nenhum cabeçalho encontrado na primeira linha.")
  }

  const headerSignature = headers.map(normalizeText).join("|")
  const rows: string[][] = []

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const values = padRow(rawRows[i], headers.length)
    if (countNonEmpty(values) === 0) continue
    // Totals/footers produced by the exporter ("TOTAL", subtotal formulas).
    if (isTotalRow(values)) continue
    // Repeated metadata/footer lines below the table.
    if (isMetadataRow(values)) continue
    // Repeated header row (common in paged/spreadsheet reports).
    if (values.map(normalizeText).join("|") === headerSignature) continue

    rows.push(values)
  }

  if (rows.length === 0) {
    throw new ImportReadError("Nenhuma linha de dados encontrada.")
  }

  if (rows.length > MAX_ROWS) {
    throw new ImportReadError(
      `Muitas linhas (${rows.length}). O limite é ${MAX_ROWS} linhas por importação.`,
    )
  }

  return { headers, rows, totalRows: rows.length, fileName }
}
