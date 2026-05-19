import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

export type ProductImageSource = {
  images?: string[] | null
  video_thumbnail?: string | null
  fallback_variant_image?: string | null
}

function resolveMediaUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  return getR2ImageUrl(path)
}

/** Listing/card images: product photos first, then variant fallback, then video thumbnail, then placeholder. */
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

  const videoThumb = product.video_thumbnail
  if (videoThumb && String(videoThumb).trim()) {
    return [resolveMediaUrl(String(videoThumb))]
  }

  return [PLACEHOLDER]
}

export function getPrimaryProductDisplayImage(product: ProductImageSource): string {
  return getProductDisplayImages(product)[0]
}
