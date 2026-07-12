import { R2_PREFIXES } from "./config"

export { R2_PREFIXES } from "./config"

export function buildR2ImageUrl(
  key?: string,
  publicUrl?: string,
  cdnUrl?: string
): string {
  if (publicUrl) return publicUrl
  if (!key || !cdnUrl) {
    throw new Error("key ou publicUrl deve ser fornecido")
  }
  return `${cdnUrl}/${key}`
}

export function extractKeyFromUrl(publicUrl: string): string {
  const url = new URL(publicUrl)
  return url.pathname.substring(1)
}

export function isR2Url(url: string, cdnUrl?: string): boolean {
  try {
    const u = new URL(url)
    if (u.hostname.includes(".r2.cloudflarestorage.com")) return true
    if (cdnUrl) return u.hostname === new URL(cdnUrl).hostname
    return false
  } catch {
    return false
  }
}

export type R2Prefix = (typeof R2_PREFIXES)[keyof typeof R2_PREFIXES]
