import "server-only"
import type { EntityType, RowValidation, RowWarning } from "./types"
import { getFieldsForEntity, getRequiredFields } from "./field-registry"

function validateEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function validateCPF(v: string): boolean {
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

function validateCNPJ(v: string): boolean {
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

function toNumber(v: string): number | null {
  const clean = v.replace(",", ".").replace(/[^0-9.\-]/g, "")
  const n = parseFloat(clean)
  return isNaN(n) ? null : n
}

function validateRow(
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
    if (value === undefined || value === null) continue

    const trimmed = value.trim()

    if (required.includes(field.name) && !trimmed) {
      errors.push({
        row: rowIndex + 1,
        field: field.label,
        message: `${field.label} é obrigatório`,
      })
    }

    if (field.type === "number" && trimmed) {
      const num = toNumber(trimmed)
      if (num === null) {
        errors.push({
          row: rowIndex + 1,
          field: field.label,
          message: `${field.label} deve ser um número`,
        })
      }
    }
  }

  // Length & Truncation warnings
  const nameVal = rowData["name"]?.trim()
  if (nameVal && nameVal.length > 255) {
    warnings.push({
      row: rowIndex + 1,
      field: "Nome",
      message: `Nome muito longo (${nameVal.length} caracteres). Será truncado para 255 caracteres.`,
    })
  }

  const skuVal = rowData["sku"]?.trim()
  if (skuVal && skuVal.length > 100) {
    warnings.push({
      row: rowIndex + 1,
      field: "SKU",
      message: `SKU muito longo. Será truncado para 100 caracteres.`,
    })
  }

  if (entityType === "customers") {
    const email = rowData["email"]
    if (email && !validateEmail(email)) {
      errors.push({ row: rowIndex + 1, field: "E-mail", message: "E-mail inválido" })
    }

    const cpf = rowData["cpf"]
    if (cpf && cpf.replace(/\D/g, "").length === 11 && !validateCPF(cpf)) {
      errors.push({ row: rowIndex + 1, field: "CPF", message: "CPF inválido" })
    }

    const cnpj = rowData["cnpj"]
    if (cnpj && cnpj.replace(/\D/g, "").length === 14 && !validateCNPJ(cnpj)) {
      errors.push({ row: rowIndex + 1, field: "CNPJ", message: "CNPJ inválido" })
    }
  }

  if (entityType === "products") {
    const price = rowData["price"]
    if (price) {
      const num = toNumber(price)
      if (num !== null && num <= 0) {
        warnings.push({
          row: rowIndex + 1,
          field: "Preço Venda",
          message: "Preço igual ou abaixo de zero",
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
