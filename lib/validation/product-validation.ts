export interface ValidationError {
  field: string
  message: string
  tab: string
}

export function validateProduct(data: any): ValidationError[] {
  const errors: ValidationError[] = []

  // Dados Gerais
  if (!data.name?.trim()) {
    errors.push({ field: "name", message: "Nome do produto é obrigatório", tab: "general" })
  }

  if (!data.price || data.price <= 0) {
    errors.push({ field: "price", message: "Preço de venda deve ser maior que zero", tab: "general" })
  }

  if (data.stock === undefined || data.stock < 0) {
    errors.push({ field: "stock", message: "Estoque não pode ser negativo", tab: "general" })
  }

  // Informações Fiscais
  if (!data.ncm?.trim()) {
    errors.push({ field: "ncm", message: "NCM é obrigatório", tab: "fiscal" })
  }

  if (data.origin === undefined || data.origin === null) {
    errors.push({ field: "origin", message: "Origem da mercadoria é obrigatória", tab: "fiscal" })
  }

  // CEST obrigatório para produtos com ST
  if (data.product_situation === "st_retido" && !data.cest?.trim()) {
    errors.push({ field: "cest", message: "CEST é obrigatório para produtos com ST", tab: "fiscal" })
  }

  // Validar NCM (8 dígitos)
  if (data.ncm && !/^\d{8}$/.test(data.ncm)) {
    errors.push({ field: "ncm", message: "NCM deve ter 8 dígitos", tab: "fiscal" })
  }

  // Validar CEST (7 dígitos)
  if (data.cest && !/^\d{7}$/.test(data.cest)) {
    errors.push({ field: "cest", message: "CEST deve ter 7 dígitos", tab: "fiscal" })
  }

  return errors
}

export function validateProductForSave(data: any): { valid: boolean; errors: ValidationError[] } {
  const errors = validateProduct(data)
  return {
    valid: errors.length === 0,
    errors,
  }
}
