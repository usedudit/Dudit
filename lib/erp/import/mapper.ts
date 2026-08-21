import "server-only"
import type { ColumnMapping, EntityType, FieldDef } from "./types"
import { getFieldsForEntity, getRequiredFields } from "./field-registry"

function normalize(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[-/_.:]/g, " ")
    .replace(/\s+/g, " ")
}

function levenshtein(a: string, b: string): number {
  const an = a.length
  const bn = b.length
  const matrix: number[][] = []
  for (let i = 0; i <= an; i++) {
    matrix[i] = [i]
    for (let j = 1; j <= bn; j++) {
      if (i === 0) {
        matrix[i][j] = j
      } else {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        )
      }
    }
  }
  return matrix[an][bn]
}

function similarity(a: string, b: string): number {
  const dist = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  return maxLen === 0 ? 1 : 1 - dist / maxLen
}

function looksLikeNumber(v: string): boolean {
  const clean = v.replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".")
  return !isNaN(parseFloat(clean)) && isFinite(Number(clean))
}

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

function looksLikeDoc(v: string): boolean {
  const digits = v.replace(/\D/g, "")
  return digits.length === 11 || digits.length === 14
}

function looksLikeDate(v: string): boolean {
  return /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(v.trim())
}

function checkTypeMismatch(field: FieldDef | undefined, sampleValues?: string[]): string | undefined {
  if (!field || !sampleValues || sampleValues.length === 0) return undefined

  const nonEmpties = sampleValues.filter(Boolean)
  if (nonEmpties.length === 0) return undefined

  if (field.type === "number") {
    const invalidCount = nonEmpties.filter((val) => !looksLikeNumber(val)).length
    if (invalidCount > 0) {
      return `Esta coluna contém ${invalidCount} valor(es) de texto não numérico(s).`
    }
  }

  if (field.type === "email") {
    const invalidCount = nonEmpties.filter((val) => !looksLikeEmail(val)).length
    if (invalidCount === nonEmpties.length) {
      return "Os valores de exemplo não parecem ser endereços de e-mail válidos."
    }
  }

  if (field.type === "cpf_cnpj") {
    const invalidCount = nonEmpties.filter((val) => !looksLikeDoc(val)).length
    if (invalidCount === nonEmpties.length) {
      return "Os valores de exemplo não parecem ser CPF (11 dígitos) ou CNPJ (14 dígitos)."
    }
  }

  if (field.type === "date") {
    const invalidCount = nonEmpties.filter((val) => !looksLikeDate(val)).length
    if (invalidCount === nonEmpties.length) {
      return "Os valores de exemplo não parecem estar no formato de data (DD/MM/AAAA)."
    }
  }

  if (field.type === "enum" && field.options) {
    const normalizedOptions = field.options.map((o) => normalize(o))
    const invalidCount = nonEmpties.filter((val) => {
      const norm = normalize(val)
      return !normalizedOptions.some((opt) => opt === norm || norm.includes(opt) || opt.includes(norm))
    }).length
    if (invalidCount === nonEmpties.length && nonEmpties[0].length > 30) {
      return "Texto muito longo para um campo de opções fixas."
    }
  }

  return undefined
}

export function suggestMapping(
  headers: string[],
  entityType: EntityType,
  rows?: string[][],
): ColumnMapping[] {
  const fields = getFieldsForEntity(entityType)
  const normalizedHeaders = headers.map(normalize)
  const usedFields = new Set<string>()

  const mappings = normalizedHeaders.map((header, index) => {
    let bestField: string | null = null
    let bestLabel = ""
    let bestConfidence = 0
    let isCustom = false

    // Extract up to 5 non-empty sample values from the rows for this column
    const sampleValues: string[] = []
    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (index < row.length) {
          const val = row[index]?.trim()
          if (val && !sampleValues.includes(val)) {
            sampleValues.push(val)
            if (sampleValues.length >= 5) break
          }
        }
      }
    }

    for (const field of fields) {
      for (const synonym of field.synonyms) {
        const normalizedSynonym = normalize(synonym)
        let confidence = 0

        if (header === normalizedSynonym) {
          confidence = 1.0
        } else if (header.startsWith(normalizedSynonym) || normalizedSynonym.startsWith(header)) {
          confidence = 0.9
        } else if (header.includes(normalizedSynonym) || normalizedSynonym.includes(header)) {
          const shorter = Math.min(header.length, normalizedSynonym.length)
          if (shorter > 3) {
            confidence = 0.8
          }
        }

        if (confidence === 0 && header.length > 2 && normalizedSynonym.length > 2) {
          const sim = similarity(header, normalizedSynonym)
          if (sim > 0.72) {
            confidence = Math.round(sim * 10) / 10
          }
        }

        // Penalize confidence if header text matches a numeric/enum field but sample has long text
        if (confidence > 0.6 && (field.type === "number" || field.type === "enum") && sampleValues.length > 0) {
          const firstVal = sampleValues[0]
          if (field.type === "number" && !looksLikeNumber(firstVal)) {
            confidence = 0.3
          }
          if (field.type === "enum" && firstVal.length > 40) {
            confidence = 0.2
          }
        }

        if (confidence > bestConfidence) {
          bestConfidence = confidence
          bestField = field.name
          bestLabel = field.label
        }
      }
    }

    // Heuristics based on sample content if header match was weak or ambiguous
    if (bestConfidence < 0.7 && sampleValues.length > 0) {
      const firstSample = sampleValues[0]

      // Check email
      if (looksLikeEmail(firstSample)) {
        bestField = "email"
        bestLabel = fields.find((f) => f.name === "email")?.label || "E-mail"
        bestConfidence = 0.95
      }
      // Check GTIN / Barcode (numeric 8, 12, 13, 14 digits)
      else if (entityType === "products" && /^\d{8,14}$/.test(firstSample.replace(/\D/g, "")) && firstSample.length >= 8) {
        bestField = "gtin"
        bestLabel = fields.find((f) => f.name === "gtin")?.label || "Código de Barras"
        bestConfidence = 0.9
      }
      // Check CPF
      else if (entityType === "customers" && firstSample.replace(/\D/g, "").length === 11) {
        bestField = "cpf"
        bestLabel = fields.find((f) => f.name === "cpf")?.label || "CPF"
        bestConfidence = 0.9
      }
      // Check CNPJ
      else if (entityType === "customers" && firstSample.replace(/\D/g, "").length === 14) {
        bestField = "cnpj"
        bestLabel = fields.find((f) => f.name === "cnpj")?.label || "CNPJ"
        bestConfidence = 0.9
      }
      // Check CEP
      else if (entityType === "customers" && /^\d{5}-?\d{3}$/.test(firstSample.trim())) {
        bestField = "zip_code"
        bestLabel = fields.find((f) => f.name === "zip_code")?.label || "CEP"
        bestConfidence = 0.9
      }
    }

    // Prevent duplicate mapping with lower confidence
    if (bestField && usedFields.has(bestField)) {
      bestField = null
      bestConfidence = 0
    }

    if (bestField) {
      usedFields.add(bestField)
    }

    if (bestConfidence < 0.5) {
      isCustom = true
      bestField = null
      bestLabel = ""
    }

    const matchedFieldDef = fields.find((f) => f.name === bestField)
    const typeMismatchWarning = checkTypeMismatch(matchedFieldDef, sampleValues)

    return {
      headerIndex: index,
      header: headers[index],
      field: bestField,
      fieldLabel: bestLabel,
      confidence: bestConfidence,
      isCustom,
      sampleValues: sampleValues.length > 0 ? sampleValues : undefined,
      typeMismatchWarning,
    }
  })

  return mappings
}

export function validateMappingCompatibility(
  mapping: ColumnMapping[],
  entityType: EntityType,
  rows?: string[][],
): { warnings: string[]; errors: string[]; missingRequired: string[] } {
  const fields = getFieldsForEntity(entityType)
  const requiredFields = getRequiredFields(entityType)
  const warnings: string[] = []
  const errors: string[] = []

  const mappedFieldCounts = new Map<string, number>()
  for (const m of mapping) {
    if (m.field) {
      const count = mappedFieldCounts.get(m.field) || 0
      mappedFieldCounts.set(m.field, count + 1)
    }
  }

  // Check duplicate mappings
  for (const [fieldName, count] of mappedFieldCounts.entries()) {
    if (count > 1) {
      const label = fields.find((f) => f.name === fieldName)?.label || fieldName
      errors.push(`O campo "${label}" foi vinculado a ${count} colunas diferentes da planilha. Escolha apenas uma.`)
    }
  }

  // Check missing required fields
  const mappedFieldNames = new Set(mapping.map((m) => m.field).filter(Boolean))
  const missingRequired: string[] = []
  for (const req of requiredFields) {
    if (!mappedFieldNames.has(req)) {
      const label = fields.find((f) => f.name === req)?.label || req
      missingRequired.push(label)
      errors.push(`O campo obrigatório "${label}" não foi vinculado a nenhuma coluna.`)
    }
  }

  // Check type mismatches from sample values
  for (const m of mapping) {
    if (m.field && m.sampleValues && m.sampleValues.length > 0) {
      const fieldDef = fields.find((f) => f.name === m.field)
      const warning = checkTypeMismatch(fieldDef, m.sampleValues)
      if (warning) {
        warnings.push(`Coluna "${m.header}" $\\rightarrow$ ${fieldDef?.label}: ${warning}`)
      }
    }
  }

  return { warnings, errors, missingRequired }
}
