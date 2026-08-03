import "server-only"
import type { ColumnMapping, EntityType } from "./types"
import { getFieldsForEntity } from "./field-registry"

function normalize(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[-/_]/g, " ")
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

export function suggestMapping(
  headers: string[],
  entityType: EntityType,
  rows?: string[][],
): ColumnMapping[] {
  const fields = getFieldsForEntity(entityType)
  const normalizedHeaders = headers.map(normalize)

  return normalizedHeaders.map((header, index) => {
    let bestField: string | null = null
    let bestLabel = ""
    let bestConfidence = 0
    let isCustom = false

    // Extract up to 3 non-empty sample values from the rows for this column
    const sampleValues: string[] = []
    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (index < row.length) {
          const val = row[index]?.trim()
          if (val && !sampleValues.includes(val)) {
            sampleValues.push(val)
            if (sampleValues.length >= 3) break
          }
        }
      }
    }

    for (const field of fields) {
      if (field.name === "technical_specs") continue

      for (const synonym of field.synonyms) {
        const normalizedSynonym = normalize(synonym)
        let confidence = 0

        if (header === normalizedSynonym) {
          confidence = 1.0
        } else if (header.includes(normalizedSynonym) || normalizedSynonym.includes(header)) {
          const shorter = Math.min(header.length, normalizedSynonym.length)
          if (shorter > 3) {
            confidence = 0.85
          }
        }

        if (confidence === 0 && header.length > 2 && normalizedSynonym.length > 2) {
          const sim = similarity(header, normalizedSynonym)
          if (sim > 0.7) {
            confidence = Math.round(sim * 10) / 10
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
      const sampleText = sampleValues.join(" ")

      // Check email
      if (entityType === "customers" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sampleValues[0])) {
        bestField = "email"
        bestLabel = fields.find((f) => f.name === "email")?.label || "E-mail"
        bestConfidence = 0.9
      }
      // Check GTIN / Barcode (numeric 8, 12, 13, 14 digits)
      else if (entityType === "products" && /^\d{8,14}$/.test(sampleValues[0].replace(/\D/g, "")) && sampleValues[0].length >= 8) {
        bestField = "gtin"
        bestLabel = fields.find((f) => f.name === "gtin")?.label || "Código Barras"
        bestConfidence = 0.85
      }
      // Check CPF
      else if (entityType === "customers" && sampleValues[0].replace(/\D/g, "").length === 11) {
        bestField = "cpf"
        bestLabel = fields.find((f) => f.name === "cpf")?.label || "CPF"
        bestConfidence = 0.85
      }
      // Check CNPJ
      else if (entityType === "customers" && sampleValues[0].replace(/\D/g, "").length === 14) {
        bestField = "cnpj"
        bestLabel = fields.find((f) => f.name === "cnpj")?.label || "CNPJ"
        bestConfidence = 0.85
      }
    }

    if (bestConfidence < 0.5) {
      isCustom = true
      bestField = null
      bestLabel = "Especificação"
    }

    return {
      headerIndex: index,
      header: headers[index],
      field: bestField,
      fieldLabel: bestLabel,
      confidence: bestConfidence,
      isCustom,
      sampleValues: sampleValues.length > 0 ? sampleValues : undefined,
    }
  })
}
