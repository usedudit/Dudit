export type EntityType = "products" | "customers" | "services" | "appointments"

export type SemanticFieldType =
  | "string"
  | "number"
  | "boolean"
  | "email"
  | "cpf_cnpj"
  | "phone"
  | "date"
  | "enum"

export interface FieldDef {
  name: string
  label: string
  type: SemanticFieldType
  required?: boolean
  synonyms: string[]
  options?: string[]
  example?: string
  description?: string
  isIdentifier?: boolean
}

export interface ColumnMapping {
  headerIndex: number
  header: string
  field: string | null
  fieldLabel?: string
  confidence: number
  isCustom: boolean
  sampleValues?: string[]
  typeMismatchWarning?: string
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

export interface FailedRow {
  rowIndex: number
  data: Record<string, string>
  errorMessage: string
}

export interface ImportOptions {
  duplicateStrategy?: "skip" | "update"
  skipDuplicates?: boolean
  skipErrors?: boolean
  autoCreateCategories?: boolean
  autoCreateBrands?: boolean
  autoCreateSuppliers?: boolean
}

export interface ImportResult {
  importId: string
  successRows: number
  createdRows: number
  updatedRows: number
  errorRows: number
  duplicateRows: number
  warningRows: number
  durationMs: number
  errorMessage?: string
  failedRows?: FailedRow[]
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
