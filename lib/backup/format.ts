export const BACKUP_MAGIC = "DUDIT_BACKUP_V1"
export const BACKUP_ALGORITHM = "aes-256-gcm"
export const BACKUP_AUTH_TAG_BYTES = 16

export type BackupHeader = {
  version: 1
  algorithm: typeof BACKUP_ALGORITHM
  compression: "gzip"
  createdAt: string
  iv: string
}

export function createBackupHeader(iv: Buffer, createdAt: Date): Buffer {
  const header: BackupHeader = {
    version: 1,
    algorithm: BACKUP_ALGORITHM,
    compression: "gzip",
    createdAt: createdAt.toISOString(),
    iv: iv.toString("base64"),
  }

  return Buffer.from(`${BACKUP_MAGIC}\n${JSON.stringify(header)}\n`, "utf8")
}

export function createBackupFileName(createdAt: Date): string {
  const timestamp = createdAt.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z")
  return `dudit-db-backup-${timestamp}.dump.gz.enc`
}

export function parseBackupTimestamp(key: string): Date | null {
  const match = key.match(
    /dudit-db-backup-(\d{4}-\d{2}-\d{2})(?:T(\d{2})-(\d{2})-(\d{2})Z)?\.dump\.gz\.enc$/,
  )
  if (!match) return null

  const [, date, hour = "00", minute = "00", second = "00"] = match
  const parsed = new Date(`${date}T${hour}:${minute}:${second}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
