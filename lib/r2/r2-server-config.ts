import "server-only"

import { r2PublicConfig } from "./r2-public"

/**
 * R2 server credentials - NEVER import from client code.
 * Protected by "server-only" guard.
 */
export function getR2ServerConfig() {
  return {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "",
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
    bucketName: process.env.CLOUDFLARE_R2_BUCKET || "",
  }
}

/**
 * Returns the best public-facing base URL for R2 assets.
 * Checks: publicDevUrl → cdnUrl → fallback to bucket .r2.dev URL.
 */
export function getR2PublicUrl(): string {
  if (r2PublicConfig.publicDevUrl) return r2PublicConfig.publicDevUrl
  if (r2PublicConfig.cdnUrl) return r2PublicConfig.cdnUrl
  const { bucketName } = getR2ServerConfig()
  return `https://${bucketName}.r2.dev`
}

/**
 * Validates that all required R2 server config is present.
 */
export function validateR2Config() {
  const config = getR2ServerConfig()
  const errors: string[] = []

  if (!config.accessKeyId) {
    errors.push("CLOUDFLARE_R2_ACCESS_KEY_ID não está configurado")
  }

  if (!config.secretAccessKey) {
    errors.push("CLOUDFLARE_R2_SECRET_ACCESS_KEY não está configurado")
  }

  if (!config.accountId) {
    errors.push("CLOUDFLARE_ACCOUNT_ID não está configurado")
  }

  if (!config.bucketName) {
    errors.push("CLOUDFLARE_R2_BUCKET não está configurado")
  }

  if (!r2PublicConfig.cdnUrl) {
    console.warn(
      "[R2] CDN não configurada. Arquivos serão acessados direto pelo R2."
    )
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
