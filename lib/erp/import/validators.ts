import "server-only"
import type { EntityType, RowValidation, RowWarning } from "./types"
import { getFieldsForEntity, getRequiredFields } from "./field-registry"

export function validateEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

export function validateCPF(v: string): boolean {
  const digits = v.replace(/\D/g, "")
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i)
  let r = 11 - (sum % 11)
  if (r >= 10) r = 0
  if (r !== parseInt(digits[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i)
  r = 11 - (sum % 11)
  if (r >= 10) r = 0
  return r === parseInt(digits[10])
}

export function validateCNPJ(v: string): boolean {
  const chars = v.replace(/[^0-9A-Z]/gi, "").toUpperCase()
  if (chars.length !== 14) return false
  if (/^([0-9A-Z])\1{13}$/.test(chars)) return false
  const val = (c: string) => c.charCodeAt(0) - 48
  let sum = 0
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  for (let i = 0; i < 12; i++) sum += val(chars[i]) * w1[i]
  let r = sum % 11
  if (r < 2) r = 0; else r = 11 - r
  if (r !== parseInt(chars[12])) return false
  sum = 0
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  for (let i = 0; i < 13; i++) sum += val(chars[i]) * w2[i]
  r = sum % 11
  if (r < 2) r = 0; else r = 11 - r
  return r === parseInt(chars[13])
}

export function parseNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return isNaN(v) ? null : v

  let str = String(v).trim().replace(/R\$/gi, "").trim()
  if (!str) return null

  // Check if Brazilian format with dot thousand and comma decimal: "1.500,50"
  if (str.includes(",") && str.includes(".")) {
    const lastComma = str.lastIndexOf(",")
    const lastDot = str.lastIndexOf(".")
    if (lastComma > lastDot) {
      // 1.500,50 -> 1500.50
      str = str.replace(/\./g, "").replace(",", ".")
    } else {
      // 1,500.50 -> 1500.50
      str = str.replace(/,/g, "")
    }
  } else if (str.includes(",")) {
    // 50,00 -> 50.00
    str = str.replace(",", ".")
  }

  const clean = str.replace(/[^0-9.\-]/g, "")
  const n = parseFloat(clean)
  return isNaN(n) ? null : n
}

export function validateRow(
  rowData: Record<string, string>,
  rowIndex: number,
  entityType: EntityType,
): { errors: RowValidation[]; warnings: RowWarning[] } {
  const errors: RowValidation[] = []
  const warnings: RowWarning[] = []
  const fields = getFieldsForEntity(entityType)
  const required = getRequiredFields(entityType)

  for (const field of fields) {
    const value = rowData[field.name]
    const trimmed = value ? String(value).trim() : ""

    if (required.includes(field.name) && !trimmed) {
      errors.push({
        row: rowIndex + 1,
        field: field.label,
        message: `${field.label} é obrigatório`,
      })
    }

    if (field.type === "number" && trimmed) {
      const num = parseNumber(trimmed)
      if (num === null) {
        errors.push({
          row: rowIndex + 1,
          field: field.label,
          message: `${field.label} deve ser um número válido`,
        })
      }
    }
  }

  // Length & format specific checks
  const nameVal = rowData["name"]?.trim()
  if (nameVal && nameVal.length > 150) {
    warnings.push({
      row: rowIndex + 1,
      field: "Nome",
      message: `Nome muito longo (${nameVal.length} caracteres). Será ajustado para 150 caracteres.`,
    })
  }

  const skuVal = rowData["sku"]?.trim()
  if (skuVal && skuVal.length > 100) {
    warnings.push({
      row: rowIndex + 1,
      field: "SKU",
      message: `SKU muito longo (${skuVal.length} caracteres). Será ajustado para 100 caracteres.`,
    })
  }

  if (entityType === "customers") {
    const email = rowData["email"]?.trim()
    if (email && !validateEmail(email)) {
      errors.push({ row: rowIndex + 1, field: "E-mail", message: "E-mail com formato inválido" })
    }

    const cpf = rowData["cpf"]?.trim()
    if (cpf) {
      const digits = cpf.replace(/\D/g, "")
      if (digits.length > 0 && !validateCPF(digits)) {
        errors.push({ row: rowIndex + 1, field: "CPF", message: "CPF inválido" })
      }
    }

    const cnpj = rowData["cnpj"]?.trim()
    if (cnpj) {
      const digits = cnpj.replace(/[^0-9A-Z]/gi, "")
      if (digits.length > 0 && !validateCNPJ(digits)) {
        errors.push({ row: rowIndex + 1, field: "CNPJ", message: "CNPJ inválido" })
      }
    }

    const cep = rowData["zip_code"]?.trim()
    if (cep) {
      const cleanCep = cep.replace(/\D/g, "")
      if (cleanCep.length > 0 && cleanCep.length !== 8) {
        warnings.push({ row: rowIndex + 1, field: "CEP", message: "CEP deve conter 8 dígitos" })
      }
    }
  }

  if (entityType === "products") {
    const price = rowData["price"]
    if (price) {
      const num = parseNumber(price)
      if (num !== null && num <= 0) {
        warnings.push({
          row: rowIndex + 1,
          field: "Preço de Venda",
          message: "Preço igual ou menor que zero",
        })
      }
    }

    const gtin = rowData["gtin"]?.trim()
    if (gtin) {
      const cleanGtin = gtin.replace(/\D/g, "")
      if (cleanGtin.length > 0 && ![8, 12, 13, 14].includes(cleanGtin.length)) {
        warnings.push({
          row: rowIndex + 1,
          field: "Código de Barras",
          message: "GTIN/EAN geralmente possui 8, 12, 13 ou 14 dígitos",
        })
      }
    }
  }

  if (entityType === "services") {
    const price = rowData["price"]
    if (price) {
      const num = parseNumber(price)
      if (num !== null && num <= 0) {
        warnings.push({
          row: rowIndex + 1,
          field: "Preço",
          message: "Preço igual ou menor que zero",
        })
      }
    }
  }

  return { errors, warnings }
}

export function validateRows(
  rows: Record<string, string>[],
  entityType: EntityType,
): { errors: RowValidation[]; warnings: RowWarning[] } {
  const allErrors: RowValidation[] = []
  const allWarnings: RowWarning[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i], i, entityType)
    allErrors.push(...result.errors)
    allWarnings.push(...result.warnings)
  }

  return { errors: allErrors, warnings: allWarnings }
}
