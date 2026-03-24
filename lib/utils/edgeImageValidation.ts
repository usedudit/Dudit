export type ImageValidationResult = {
  valid: boolean
  error?: string
}

const MAX_BYTES = 500_000 // 500kb
const MAX_PIXELS = 512 * 512

export function validateImagePayload(
  imageArray: number[]
): ImageValidationResult {
  if (!Array.isArray(imageArray) || imageArray.length === 0) {
    return { valid: false, error: "Imagem inválida" }
  }

  // bytes aproximados (uint8)
  if (imageArray.length > MAX_BYTES) {
    return {
      valid: false,
      error: "Imagem muito grande (tamanho em bytes)",
    }
  }

  // proteção extra: payload absurdo
  if (imageArray.length > MAX_PIXELS * 4) {
    return {
      valid: false,
      error: "Imagem excede limites permitidos",
    }
  }

  return { valid: true }
}
