import "server-only"

import { isKeyPrivate } from "./config"
import { generateSignedDownloadUrl } from "./server"

export async function resolveRecordImage<T extends { image_url?: string | null }>(
  row: T,
): Promise<T & { image_key: string | null }> {
  const value = typeof row.image_url === "string" ? row.image_url : ""
  if (!value || value.startsWith("http://") || value.startsWith("https://") || !isKeyPrivate(value)) {
    return { ...row, image_key: null }
  }

  return {
    ...row,
    image_key: value,
    image_url: await generateSignedDownloadUrl(value),
  }
}

export function validatePrivateRecordImageKey(
  value: string | null | undefined,
  userId: string,
  folder: "customers" | "suppliers",
  existingValue?: string | null,
): string | null {
  if (!value) return null
  if (existingValue && value === existingValue) return value

  const expectedPrefix = `users/${userId}/${folder}/`
  if (!value.startsWith(expectedPrefix) || value.includes("..") || value.startsWith("/")) {
    throw new Error("Imagem inválida ou não pertence a este usuário.")
  }
  return value
}
