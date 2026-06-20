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
): ColumnMapping[] {
  const fields = getFieldsForEntity(entityType)
  const normalizedHeaders = headers.map(normalize)

  return normalizedHeaders.map((header, index) => {
    let bestField: string | null = null
    let bestLabel = ""
    let bestConfidence = 0
    let isCustom = false

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
    }
  })
}
