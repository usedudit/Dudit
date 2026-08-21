import { resizeImage } from "./image-resize"

/**
 * Comprime e otimiza uma imagem no cliente antes de enviá-la para a API.
 * - Limita dimensões máximas a 1200x1200px (ideal para zoom e e-commerce).
 * - Converte imagens JPEG/PNG grandes em WebP (ou JPEG) com qualidade 0.85.
 * - Mantém arquivos pequenos ou já otimizados se forem menores que 100KB.
 */
export async function optimizeImageForUpload(
  file: File,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    preferredFormat?: "image/webp" | "image/jpeg"
  } = {}
): Promise<File> {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.85,
    preferredFormat = "image/webp",
  } = options

  // Não processar arquivos que não sejam imagens comuns
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return file
  }

  // Se o arquivo já for muito leve (< 100KB) e formato webp/jpeg, mantém como está
  if (file.size < 100 * 1024 && (file.type === "image/webp" || file.type === "image/jpeg")) {
    return file
  }

  try {
    const resizedBlob = await resizeImage(file, {
      maxWidth,
      maxHeight,
      quality,
      mimeType: preferredFormat,
    })

    const extension = preferredFormat === "image/webp" ? "webp" : "jpg"
    const originalBaseName = file.name.replace(/\.[^/.]+$/, "") || "variant-image"
    const newFileName = `${originalBaseName}.${extension}`

    return new File([resizedBlob], newFileName, {
      type: preferredFormat,
      lastModified: Date.now(),
    })
  } catch (error) {
    console.warn("[ImageOptimizer] Falha ao comprimir imagem, usando original:", error)
    return file
  }
}
