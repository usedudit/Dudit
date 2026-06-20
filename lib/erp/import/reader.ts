import "server-only"
import ExcelJS from "exceljs"
import type { ReadResult } from "./types"

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_ROWS = 2000

export class ImportReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImportReadError"
  }
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

  const workbook = new ExcelJS.Workbook()

  if (ext === "csv") {
    const buf = Buffer.from(buffer)
    await workbook.csv.read(buf as any, {
      parserOptions: { delimiter: "auto" },
    })
  } else {
    await workbook.xlsx.load(buffer)
  }

  const worksheet = workbook.worksheets[0]

  if (!worksheet) {
    throw new ImportReadError("Planilha vazia ou sem abas.")
  }

  const rows: string[][] = []
  let headers: string[] = []

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: string[] = []
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value
      if (v === null || v === undefined) {
        values.push("")
      } else if (typeof v === "object" && "text" in v) {
        values.push((v as any).text?.toString().trim() ?? "")
      } else {
        values.push(v.toString().trim())
      }
    })
    if (rowNumber === 1) {
      headers = values.filter((h) => h.length > 0)
    } else {
      const nonEmpty = values.some((v) => v.length > 0)
      if (nonEmpty) rows.push(values)
    }
  })

  if (headers.length === 0) {
    throw new ImportReadError("Nenhum cabeçalho encontrado na primeira linha.")
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
