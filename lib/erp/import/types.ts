export type EntityType = "products" | "customers" | "services"

export interface FieldDef {
  name: string
  label: string
  type: "string" | "number" | "boolean"
  required?: boolean
  synonyms: string[]
}

export interface ColumnMapping {
  headerIndex: number
  header: string
  field: string | null
  fieldLabel?: string
  confidence: number
  isCustom: boolean
}

export interface ReadResult {
  headers: string[]
  rows: string[][]
  totalRows: number
  fileName: string
}

export interface UploadResult {
  sessionId: string
  entityType: EntityType
  headers: string[]
  totalRows: number
  fileName: string
  suggestedMapping: ColumnMapping[]
}

export interface RowValidation {
  row: number
  field: string
  message: string
}

export interface RowWarning {
  row: number
  field: string
  message: string
}

export interface RowDuplicate {
  row: number
  field: string
  value: string
}

export interface PreviewSummary {
  totalRows: number
  validRows: number
  errorRows: number
  warningRows: number
  duplicateRows: number
  errors: RowValidation[]
  warnings: RowWarning[]
  duplicates: RowDuplicate[]
  unknownCategories: string[]
  unknownSuppliers: { name: string; rows: number[] }[]
  sampleRows: Record<string, string>[]
}

export interface ImportResult {
  importId: string
  successRows: number
  errorRows: number
  duplicateRows: number
  warningRows: number
  durationMs: number
  errorMessage?: string
}

export interface ImportSession {
  entityType: EntityType
  headers: string[]
  rows: string[][]
  totalRows: number
  fileName: string
  partnerId: string
  storeId: string
  createdAt: string
}
