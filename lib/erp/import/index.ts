export { readSpreadsheet, ImportReadError } from "./reader"
export { suggestMapping, validateMappingCompatibility } from "./mapper"
export { detectEntity } from "./entity-detector"
export { generatePreview } from "./preview"
export { executeImport } from "./batch-importer"
export {
  consolidateProductRows,
  detectSpreadsheetSource,
  parseProductVariants,
  parseKeyValueVariantAttributes,
  normalizePackagingType,
  normalizeProductType,
  normalizeUnit,
} from "./product-grouper"
export type {
  ParsedVariant,
  ConsolidatedProductRow,
  DetectedSpreadsheetSource,
} from "./product-grouper"
export { createImportSession, getImportSession, deleteImportSession, updateImportSession } from "./session"
export { getFieldsForEntity, getFieldByName, getRequiredFields } from "./field-registry"
export { generateImportTemplate } from "./template-generator"
export { generateFailedRowsReport } from "./error-reporter"
export type {
  EntityType,
  FieldDef,
  ColumnMapping,
  ReadResult,
  UploadResult,
  PreviewSummary,
  ImportResult,
  ImportSession,
  ImportOptions,
  FailedRow,
  SemanticFieldType,
} from "./types"
