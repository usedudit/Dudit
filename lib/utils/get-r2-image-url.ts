/**
 * Utilitário para construir URLs de imagem R2
 * Mantém compatibilidade com getProductImageUrl
 */

import { r2PublicConfig } from "@/lib/r2/r2-public"

export function getR2ImageUrl(
  imageInput: any,
  size?: "thumb" | "thumbnail" | "medium" | "large" | "raw" | "original",
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

  // Se for nulo, indefinido, vazio ou string inválida
  if (
    !imagePath ||
    typeof imagePath !== "string" ||
    imagePath.trim() === "" ||
    imagePath === "null" ||
    imagePath === "undefined" ||
    imagePath === "/null" ||
    imagePath === "/undefined" ||
    imagePath === "[object Object]"
  ) {
    return "https://img.dudit.com.br/static/Placeholder.png" // Fallback seguro
  }

  // Se for data:// (base64)
  if (imagePath.startsWith("data:")) {
    return imagePath
  }

  // Fallback seguro usando CDN ou domain correto (client-safe, sem secrets)
  const baseUrl =
    r2PublicConfig.cdnUrl ||
    r2PublicConfig.publicDevUrl ||
    "https://img.dudit.com.br"

  const finalBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  let targetPath = imagePath
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    if (imagePath.startsWith(finalBaseUrl)) {
      targetPath = imagePath.slice(finalBaseUrl.length)
    } else if (imagePath.startsWith("https://img.dudit.com.br")) {
      targetPath = imagePath.slice("https://img.dudit.com.br".length)
    } else {
      return imagePath
    }
  }

  const cleanPath = targetPath.startsWith('/') ? targetPath.substring(1) : targetPath;

  if (
    !cleanPath ||
    cleanPath === "null" ||
    cleanPath === "undefined" ||
    cleanPath === "[object Object]"
  ) {
    return "https://img.dudit.com.br/static/Placeholder.png"
  }

  if (cleanPath.startsWith("cdn-cgi/image/")) {
    return `${finalBaseUrl}/${cleanPath}`
  }

  // Documentos, vetores e chamadas explicitamente raw não passam por image resizing
  const isVectorOrDoc = /\.(svg|pdf|doc|docx|xls|xlsx|csv|zip|rar)$/i.test(cleanPath)
  if (isVectorOrDoc || size === "raw" || size === "original") {
    return `${finalBaseUrl}/${cleanPath}`
  }

  // Se a otimização da Cloudflare estiver explicitamente desativada por env
  const isOptimizationDisabled = process.env.NEXT_PUBLIC_ENABLE_IMAGE_OPTIMIZATION === "false"
  if (isOptimizationDisabled) {
    return `${finalBaseUrl}/${cleanPath}`
  }

  let options = ""
  if (size === "thumb" || size === "thumbnail") {
    options = "width=150,height=150,fit=cover,format=auto,quality=80"
  } else if (size === "medium") {
    options = "width=400,height=400,fit=cover,format=auto,quality=85"
  } else if (size === "large") {
    options = "width=900,fit=contain,format=auto,quality=85"
  } else {
    // Default seguro para imagens sem tamanho explícito: limita a 1200px e converte para WebP/AVIF
    options = "width=1200,fit=contain,format=auto,quality=85"
  }

  if (options) {
    return `${finalBaseUrl}/cdn-cgi/image/${options}/${cleanPath}`
  }

  return `${finalBaseUrl}/${cleanPath}`
}
