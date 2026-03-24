/**
 * R2 public configuration — SAFE for client-side import.
 * Only uses NEXT_PUBLIC_ environment variables.
 */
export const r2PublicConfig = {
  cdnUrl: process.env.NEXT_PUBLIC_R2_CDN_URL || "",
  publicDevUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_DEV_URL || "",
}
