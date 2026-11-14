import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

export const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

export type VariantLike = {
  variant_options?: { image?: string | null } | null
  is_active?: boolean
  [key: string]: any
}

export type ProductImageSource = {
  images?: string[] | null
  video_thumbnail?: string | null
  fallback_variant_image?: string | null
  product_variants?: VariantLike[] | null
  variants?: VariantLike[] | null
  moderation_status?: string | null
  moderation_reason?: string | null
  flagged_images?: string[] | null
}

function resolveMediaUrl(path: string, size?: "thumb" | "thumbnail" | "medium" | "large"): string {
  return getR2ImageUrl(path, size)
}

function findVariantImage(variants: VariantLike[]): string | null {
  const activeVariants = variants.filter(v => v.is_active !== false)
  const withImage = activeVariants.find(v => v.variant_options?.image)
  return withImage?.variant_options?.image || null
}

/**
 * Normaliza o identificador/caminho da imagem removendo protocolo, host, barras iniciais e query parameters.
 * Garante comparação consistente entre "products/a/b.jpg" e "https://img.dudit.com.br/products/a/b.jpg?w=500".
 */
export function normalizeImageKey(input: string): string {
  if (!input || typeof input !== "string") return ""
  let clean = input.trim()
  // Remove protocolo e domínio caso presentes (ex: https://img.dudit.com.br/)
  clean = clean.replace(/^https?:\/\/[^\/]+\//i, "")
  // Remove barras iniciais
  clean = clean.replace(/^\/+/, "")
  // Remove query string e hash
  clean = clean.split("?")[0].split("#")[0]
  return clean.toLowerCase()
}

/**
 * Extrai a lista de imagens sinalizadas a partir do campo moderation_reason.
 * Suporta JSON estruturado `{ flagged_images: [...] }` ou texto com prefixo `[FLAGGED_IMAGES]:`.
 */
export function extractFlaggedImages(reason?: string | null): string[] {
  if (!reason || typeof reason !== "string") return []
  try {
    const parsed = JSON.parse(reason)
    if (Array.isArray(parsed?.flagged_images)) {
      return parsed.flagged_images.filter((img: any): img is string => typeof img === "string" && img.trim().length > 0)
    }
  } catch {
    // Formato alternativo em texto puro
    const match = reason.match(/\[FLAGGED_IMAGES\]:\s*(.+)/i)
    if (match && match[1]) {
      return match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return []
}

/**
 * Verifica se uma imagem específica está na lista de imagens sinalizadas/bloqueadas.
 */
export function isImageFlagged(img: string, flaggedList: string[]): boolean {
  if (!flaggedList || flaggedList.length === 0) return false
  const norm = normalizeImageKey(img)
  if (!norm) return false

  return flaggedList.some((flagged) => {
    const normFlagged = normalizeImageKey(flagged)
    if (!normFlagged) return false
    return norm === normFlagged || norm.endsWith(normFlagged) || normFlagged.endsWith(norm)
  })
}

/**
 * Filtra imagens inapropriadas de um produto/serviço caso esteja com status 'flagged'.
 * - Se o status for diferente de 'flagged', retorna todas as imagens originais.
 * - Se for 'flagged' e houver lista de imagens inapropriadas, remove apenas as sinalizadas,
 *   mantendo as imagens limpas visíveis aos compradores.
 * - Se for 'flagged' mas não houver lista específica, oculta todas por segurança (retorna []).
 */
export function filterUnflaggedImages(
  images: Array<string | null | undefined> | null | undefined,
  moderationStatus?: string | null,
  moderationReason?: string | null,
  flaggedImagesList?: string[] | null,
): string[] {
  const validImages = (images || []).filter(
    (img): img is string => typeof img === "string" && img.trim().length > 0,
  )

  if (validImages.length === 0) return []

  // Se não estiver sinalizado para moderação, todas as imagens são seguras para exibição
  if (moderationStatus !== "flagged") {
    return validImages
  }

  const flagged = flaggedImagesList && flaggedImagesList.length > 0
    ? flaggedImagesList
    : extractFlaggedImages(moderationReason)

  if (flagged.length > 0) {
    return validImages.filter((img) => !isImageFlagged(img, flagged))
  }

  // Se o item foi sinalizado mas não temos a lista de URLs específicas,
  // por segurança ocular não exibimos nenhuma imagem aos compradores até revisão.
  return []
}

/** Listing/card images: product photos first, then variant fallback, then variant images, then video thumbnail, then placeholder. */
export function getProductDisplayImages(
  product: ProductImageSource,
  size?: "thumb" | "thumbnail" | "medium" | "large",
  options?: { allowFlagged?: boolean },
): string[] {
  const ownImages = options?.allowFlagged
    ? (product.images || []).filter((img): img is string => typeof img === "string" && img.trim().length > 0)
    : filterUnflaggedImages(
        product.images,
        product.moderation_status,
        product.moderation_reason,
        product.flagged_images,
      )

  if (ownImages.length > 0) {
    return ownImages.map((img) => resolveMediaUrl(img, size))
  }

  // Se as imagens do produto foram ocultadas por moderação ('flagged'),
  // não mostramos imagens de variante ou thumbnail de vídeo que também possam conter conteúdo sensível.
  if (options?.allowFlagged || product.moderation_status !== "flagged") {
    if (product.fallback_variant_image && String(product.fallback_variant_image).trim()) {
      return [resolveMediaUrl(String(product.fallback_variant_image), size)]
    }

    const variants = product.product_variants || product.variants
    if (Array.isArray(variants) && variants.length > 0) {
      const variantImg = findVariantImage(variants)
      if (variantImg) {
        return [resolveMediaUrl(variantImg, size)]
      }
    }

    const videoThumb = product.video_thumbnail
    if (videoThumb && String(videoThumb).trim()) {
      return [resolveMediaUrl(String(videoThumb), size)]
    }
  }

  return [PLACEHOLDER]
}

export function getPrimaryProductDisplayImage(
  product: ProductImageSource,
  size?: "thumb" | "thumbnail" | "medium" | "large",
  options?: { allowFlagged?: boolean },
): string {
  return getProductDisplayImages(product, size, options)[0]
}
