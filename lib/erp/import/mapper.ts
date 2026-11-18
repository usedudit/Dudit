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

  // Step 1: Pre-extract sample values per column
  const columnSamples: string[][] = normalizedHeaders.map((_, index) => {
    const samples: string[] = []
    if (rows && rows.length > 0) {
      for (const row of rows) {
        if (index < row.length) {
          const val = row[index]?.trim()
          if (val && !samples.includes(val)) {
            samples.push(val)
            if (samples.length >= 5) break
          }
        }
      }
    }
    return samples
  })

  const hasExplicitNameHeader = normalizedHeaders.some(
    (h) =>
      h === "nome" ||
      h === "nome do produto" ||
      h === "nome produto" ||
      h === "produto nome" ||
      h === "nome do servico" ||
      h === "nome servico" ||
      h.startsWith("nome ") ||
      h.endsWith(" nome"),
  )

  // Step 2: Score each (column, field) pair
  interface CandidateMatch {
    colIndex: number
    fieldName: string
    fieldLabel: string
    confidence: number
    exactness: number
  }

  const allCandidates: CandidateMatch[] = []

  normalizedHeaders.forEach((header, colIndex) => {
    const sampleValues = columnSamples[colIndex]

    for (const field of fields) {
      // SEO headers (e.g. "Título SEO", "Descrição SEO") should not map to product name or description
      if (header.includes("seo") && (field.name === "name" || field.name === "description")) {
        continue
      }

      const searchTerms = [
        field.label,
        field.name,
        ...field.synonyms,
      ]

      let maxConfidence = 0
      let maxExactness = 0

      for (const term of searchTerms) {
        const normalizedTerm = normalize(term)
        if (!normalizedTerm) continue

        let confidence = 0
        let exactness = 0

        const isCanonical = term === field.label || term === field.name
        let canonicalBonus = isCanonical ? 1000 : 0

        // In Brazil, if there is no explicit "Nome" column, "Descrição" is the product/service name
        if (
          !hasExplicitNameHeader &&
          (entityType === "products" || entityType === "services") &&
          header === "descricao" &&
          (normalizedTerm === "descricao" || normalizedTerm === "descrição")
        ) {
          if (field.name === "name") {
            canonicalBonus = 2000
          } else if (field.name === "description") {
            canonicalBonus = 0
          }
        }

        if (header === normalizedTerm) {
          confidence = 1.0
          exactness = 1000 + canonicalBonus + normalizedTerm.length
        } else if (header.startsWith(normalizedTerm)) {
          const ratio = normalizedTerm.length / header.length
          confidence = ratio > 0.6 ? 0.95 : 0.9
          exactness = 500 + canonicalBonus + normalizedTerm.length
        } else if (normalizedTerm.startsWith(header)) {
          const ratio = header.length / normalizedTerm.length
          confidence = ratio > 0.6 ? 0.92 : 0.88
          exactness = 400 + canonicalBonus + header.length
        } else if (header.includes(normalizedTerm)) {
          if (normalizedTerm.length > 3) {
            confidence = 0.82
            exactness = 200 + canonicalBonus + normalizedTerm.length
          }
        } else if (normalizedTerm.includes(header)) {
          if (header.length > 3) {
            confidence = 0.8
            exactness = 100 + canonicalBonus + header.length
          }
        }

        if (confidence === 0 && header.length > 2 && normalizedTerm.length > 2) {
          const sim = similarity(header, normalizedTerm)
          if (sim > 0.72) {
            confidence = Math.round(sim * 10) / 10
            exactness = Math.round(sim * 100)
          }
        }

        // Penalize confidence if header text matches a numeric/enum field but sample has long text
        if (confidence > 0.6 && (field.type === "number" || field.type === "enum") && sampleValues.length > 0) {
          const firstVal = sampleValues[0]
          if (field.type === "number" && !looksLikeNumber(firstVal)) {
            confidence = 0.3
            exactness = 0
          }
          if (field.type === "enum" && firstVal.length > 40) {
            confidence = 0.2
            exactness = 0
          }
        }

        if (confidence > maxConfidence || (confidence === maxConfidence && exactness > maxExactness)) {
          maxConfidence = confidence
          maxExactness = exactness
        }
      }

      // Sample heuristic fallback
      if (maxConfidence < 0.7 && sampleValues.length > 0) {
        const firstSample = sampleValues[0]
        if (field.name === "email" && looksLikeEmail(firstSample)) {
          maxConfidence = 0.95
          maxExactness = 800
        } else if (field.name === "gtin" && entityType === "products" && /^\d{8,14}$/.test(firstSample.replace(/\D/g, "")) && firstSample.length >= 8) {
          maxConfidence = 0.9
          maxExactness = 700
        } else if (field.name === "cpf" && entityType === "customers" && firstSample.replace(/\D/g, "").length === 11) {
          maxConfidence = 0.9
          maxExactness = 700
        } else if (field.name === "cnpj" && entityType === "customers" && firstSample.replace(/\D/g, "").length === 14) {
          maxConfidence = 0.9
          maxExactness = 700
        } else if (field.name === "zip_code" && entityType === "customers" && /^\d{5}-?\d{3}$/.test(firstSample.trim())) {
          maxConfidence = 0.9
          maxExactness = 700
        }
      }

      if (maxConfidence >= 0.5) {
        allCandidates.push({
          colIndex,
          fieldName: field.name,
          fieldLabel: field.label,
          confidence: maxConfidence,
          exactness: maxExactness,
        })
      }
    }
  })

  // Step 3: Optimal global assignment - sort candidates by highest confidence & exactness
  allCandidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    if (b.exactness !== a.exactness) return b.exactness - a.exactness
    const aField = fields.find((f) => f.name === a.fieldName)
    const bField = fields.find((f) => f.name === b.fieldName)
    if (aField?.required && !bField?.required) return -1
    if (!aField?.required && bField?.required) return 1
    return 0
  })

  const assignedFields = new Set<string>()
  const columnAssignments = new Map<number, CandidateMatch>()

  for (const cand of allCandidates) {
    if (columnAssignments.has(cand.colIndex)) continue
    if (assignedFields.has(cand.fieldName)) continue

    columnAssignments.set(cand.colIndex, cand)
    assignedFields.add(cand.fieldName)
  }

  // Step 4: Construct final mapping array
  return normalizedHeaders.map((_, index) => {
    const assigned = columnAssignments.get(index)
    const sampleValues = columnSamples[index]

    if (assigned && assigned.confidence >= 0.5) {
      const matchedFieldDef = fields.find((f) => f.name === assigned.fieldName)
      const typeMismatchWarning = checkTypeMismatch(matchedFieldDef, sampleValues)

      return {
        headerIndex: index,
        header: headers[index],
        field: assigned.fieldName,
        fieldLabel: assigned.fieldLabel,
        confidence: assigned.confidence,
        isCustom: false,
        sampleValues: sampleValues.length > 0 ? sampleValues : undefined,
        typeMismatchWarning,
      }
    }

    return {
      headerIndex: index,
      header: headers[index],
      field: null,
      fieldLabel: "",
      confidence: 0,
      isCustom: true,
      sampleValues: sampleValues.length > 0 ? sampleValues : undefined,
      typeMismatchWarning: undefined,
    }
  })
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
