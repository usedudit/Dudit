import "server-only"

import { r2PublicConfig } from "./r2-public"
import { isKeyPrivate } from "./config"

/**
 * R2 server credentials - NEVER import from client code.
 * Protected by "server-only" guard.
 */
export function getR2ServerConfig() {
  const mainBucket = process.env.CLOUDFLARE_R2_BUCKET || "dudit"
  const rawPrivateBucket = process.env.CLOUDFLARE_R2_PRIVATE_BUCKET?.trim()
  // Falls back to mainBucket if private bucket is not configured
  const privateBucketName = rawPrivateBucket || mainBucket

  return {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "",
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
    bucketName: mainBucket,
    privateBucketName,
  }
}

/**
 * Select the storage bucket by data classification.
 * If privateBucketName is configured, use it.
 * Otherwise, fallback to the main bucket so operations always succeed.
 */
export function getR2BucketNameForKey(key: string): string {
  const config = getR2ServerConfig()
  if (isKeyPrivate(key)) {
    return config.privateBucketName || config.bucketName || "dudit"
  }
  return config.bucketName || "dudit"
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
