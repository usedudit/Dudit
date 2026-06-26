import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

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
}

function resolveMediaUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  return getR2ImageUrl(path)
}

function findVariantImage(variants: VariantLike[]): string | null {
  const activeVariants = variants.filter(v => v.is_active !== false)
  const withImage = activeVariants.find(v => v.variant_options?.image)
  return withImage?.variant_options?.image || null
}

/** Listing/card images: product photos first, then variant fallback, then variant images, then video thumbnail, then placeholder. */
export function getProductDisplayImages(product: ProductImageSource): string[] {
  const ownImages = (product.images || []).filter(
    (img): img is string => typeof img === "string" && img.trim().length > 0,
  )

  if (ownImages.length > 0) {
    return ownImages.map(resolveMediaUrl)
  }

  if (product.fallback_variant_image && String(product.fallback_variant_image).trim()) {
    return [resolveMediaUrl(String(product.fallback_variant_image))]
  }

  const variants = product.product_variants || product.variants
  if (variants && variants.length > 0) {
    const variantImg = findVariantImage(variants)
    if (variantImg) {
      return [resolveMediaUrl(variantImg)]
    }
  }

  const videoThumb = product.video_thumbnail
  if (videoThumb && String(videoThumb).trim()) {
    return [resolveMediaUrl(String(videoThumb))]
  }

  return [PLACEHOLDER]
}

export function getPrimaryProductDisplayImage(product: ProductImageSource): string {
  return getProductDisplayImages(product)[0]
}
