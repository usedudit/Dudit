/**
 * Utilitário para construir URLs de imagem R2
 * Mantém compatibilidade com getProductImageUrl
 */

import { r2PublicConfig } from "@/lib/r2/r2-public"

export function getR2ImageUrl(
  imageInput: any,
  size?: "thumb" | "thumbnail" | "medium" | "large",
): string {
  let imagePath = imageInput;

  if (Array.isArray(imagePath) && imagePath.length > 0) {
    imagePath = imagePath[0];
  }

  if (typeof imagePath === 'string' && (imagePath.startsWith('[') || imagePath.startsWith('{'))) {
    try {
      const parsed = JSON.parse(imagePath);
      if (Array.isArray(parsed) && parsed.length > 0) {
        imagePath = parsed[0];
      } else if (parsed && typeof parsed === 'object' && parsed.url) {
        imagePath = parsed.url;
      }
    } catch (e) {
      // fallback
    }
  }

  if (Array.isArray(imagePath) && imagePath.length > 0) {
    imagePath = imagePath[0];
  }

  if (!imagePath || (typeof imagePath === "string" && imagePath.trim() === "")) {
    return "https://img.dudit.com.br/static/Placeholder.png" // Fallback seguro
  }

  if (typeof imagePath !== "string") {
    return "https://img.dudit.com.br/static/Placeholder.png"
  }

  // Se for data:// (base64)
  if (imagePath.startsWith("data:")) {
    return "https://img.dudit.com.br/static/Placeholder.png"
  }

  // URL completa
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath
  }

  const cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;

  // Fallback seguro usando CDN ou domain correto (client-safe, sem secrets)
  const baseUrl =
    r2PublicConfig.publicDevUrl ||
    r2PublicConfig.cdnUrl ||
    "https://img.dudit.com.br"

  const finalBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return `${finalBaseUrl}/${cleanPath}`
}
