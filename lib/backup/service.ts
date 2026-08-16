import "server-only"

import { spawn } from "node:child_process"
import { createCipheriv, randomBytes } from "node:crypto"
import { createGzip } from "node:zlib"
import { PassThrough, Writable } from "node:stream"
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import { BACKUP_ALGORITHM, BACKUP_AUTH_TAG_BYTES, createBackupFileName, createBackupHeader, parseBackupTimestamp } from "./format"

const DEFAULT_RETENTION_DAILY = 30
const DEFAULT_RETENTION_WEEKLY = 4
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

export type DatabaseBackupConfig = {
  databaseUrl: string
  r2AccountId: string
  backupR2AccessKeyId: string
  backupR2SecretAccessKey: string
  r2Bucket: string
  encryptionKey: Buffer
  prefix: string
  retentionDaily: number
  retentionWeekly: number
  pgDumpBinary: string
  timeoutMs: number
}

export type DatabaseBackupResult = {
  key: string
  fileName: string
  sizeBytes: number
  durationMs: number
  retentionDeleted: number
  retentionRetained: number
}

type ParsedDatabaseUrl = {
  safeConnectionString: string
  password: string
  sslMode: string
}

function positiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function getDatabaseUrl(): string {
  return (
    process.env.BACKUP_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    ""
  )
}

export function parseDatabaseUrl(rawUrl: string): ParsedDatabaseUrl {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error("Backup database URL is invalid")
  }

  if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || !parsed.hostname || !parsed.pathname) {
    throw new Error("Backup database URL must be a PostgreSQL connection URL")
  }

  const password = parsed.password ? decodeURIComponent(parsed.password) : ""
  parsed.password = ""

  return {
    safeConnectionString: parsed.toString(),
    password,
    sslMode: parsed.searchParams.get("sslmode") || "require",
  }
}

function parseEncryptionKey(raw: string): Buffer {
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes")
  }
  return key
}

function normalizePrefix(raw: string | undefined): string {
  const prefix = (raw || "backups/").trim()
  if (prefix.includes("..") || prefix.startsWith("/")) {
    throw new Error("BACKUP_R2_PREFIX is invalid")
  }
  return prefix ? `${prefix.replace(/\/+$/, "")}/` : ""
}

export function getDatabaseBackupConfig(): DatabaseBackupConfig {
  const databaseUrl = getDatabaseUrl()
  if (!databaseUrl) {
    throw new Error("BACKUP_DATABASE_URL, DATABASE_URL or POSTGRES_URL_NON_POOLING is not configured")
  }

  const encryptionKey = parseEncryptionKey(requiredEnv("BACKUP_ENCRYPTION_KEY_BASE64"))

  return {
    databaseUrl,
    r2AccountId: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
    backupR2AccessKeyId: requiredEnv("CLOUDFLARE_BACKUP_R2_ACCESS_KEY_ID"),
    backupR2SecretAccessKey: requiredEnv("CLOUDFLARE_BACKUP_R2_SECRET_ACCESS_KEY"),
    r2Bucket: requiredEnv("CLOUDFLARE_BACKUP_BUCKET"),
    encryptionKey,
    prefix: normalizePrefix(process.env.BACKUP_R2_PREFIX),
    retentionDaily: positiveInteger("BACKUP_RETENTION_DAILY", process.env.BACKUP_RETENTION_DAILY, DEFAULT_RETENTION_DAILY),
    retentionWeekly: positiveInteger("BACKUP_RETENTION_WEEKLY", process.env.BACKUP_RETENTION_WEEKLY, DEFAULT_RETENTION_WEEKLY),
    pgDumpBinary: process.env.PG_DUMP_BINARY?.trim() || "pg_dump",
    timeoutMs: positiveInteger("BACKUP_TIMEOUT_MS", process.env.BACKUP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  }
}

function createR2BackupClient(config: DatabaseBackupConfig): S3Client {
  return new S3Client({
    region: "auto",
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: config.backupR2AccessKeyId,
      secretAccessKey: config.backupR2SecretAccessKey,
    },
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
  })
}

type EncryptedDumpStream = {
  stream: PassThrough
  getSizeBytes: () => number
}

function createEncryptedDumpStream(config: DatabaseBackupConfig, createdAt: Date): EncryptedDumpStream {
  const output = new PassThrough()
  let sizeBytes = 0
  const iv = randomBytes(12)
  const header = createBackupHeader(iv, createdAt)
  const { safeConnectionString, password, sslMode } = parseDatabaseUrl(config.databaseUrl)
  const cipher = createCipheriv(BACKUP_ALGORITHM, config.encryptionKey, iv)
  const gzip = createGzip({ level: 9 })
  const child = spawn(
    config.pgDumpBinary,
    ["--format=custom", "--no-owner", "--no-acl", "--no-password", "--file=-", "--dbname", safeConnectionString],
    {
      env: {
        ...process.env,
        PGPASSWORD: password || process.env.PGPASSWORD || "",
        PGSSLMODE: sslMode,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )

  let childExitCode: number | null = null
  let cipherFinished = false
  let finalized = false
  let dumpBytes = 0

  sizeBytes += header.length
  output.write(header)

  // pg_dump can emit relation names and other database details on stderr.
  // Drain it to avoid blocking, but never forward it to application logs.
  child.stderr?.on("data", () => undefined)

  const fail = (error: Error) => {
    if (finalized) return
    finalized = true
    output.destroy(error)
    if (!child.killed) child.kill("SIGKILL")
  }

  const finalize = () => {
    if (finalized || !cipherFinished || childExitCode === null) return
    finalized = true
    if (childExitCode !== 0) {
      output.destroy(new Error(`pg_dump failed with exit code ${childExitCode}`))
      return
    }
    if (dumpBytes === 0) {
      output.destroy(new Error("pg_dump produced an empty dump"))
      return
    }
    const authTag = cipher.getAuthTag()
    sizeBytes += authTag.length
    output.end(authTag)
  }

  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (output.destroyed) {
        callback(new Error("Backup output stream was closed"))
        return
      }
      dumpBytes += chunk.length
      sizeBytes += chunk.length
      if (output.write(chunk)) {
        callback()
      } else {
        output.once("drain", callback)
      }
    },
    final(callback) {
      cipherFinished = true
      finalize()
      callback()
    },
  })

  child.on("error", (error: NodeJS.ErrnoException) => {
    const code = error.code || error.name
    const message = error.message ? `: ${error.message}` : ""
    fail(new Error(`Unable to start pg_dump: ${code}${message}`))
  })
  child.on("close", (code) => {
    childExitCode = code
    finalize()
  })
  gzip.on("error", () => fail(new Error("Database backup compression failed")))
  cipher.on("error", () => fail(new Error("Database backup encryption failed")))
  sink.on("error", () => fail(new Error("Database backup stream failed")))

  child.stdout?.pipe(gzip).pipe(cipher).pipe(sink)

  const timeout = setTimeout(() => fail(new Error("Database backup timed out")), config.timeoutMs)
  timeout.unref?.()
  output.once("close", () => {
    clearTimeout(timeout)
    if (childExitCode === null && !child.killed) child.kill("SIGKILL")
  })

  return {
    stream: output,
    getSizeBytes: () => sizeBytes,
  }
}

async function listBackupObjects(client: S3Client, config: DatabaseBackupConfig): Promise<_Object[]> {
  const objects: _Object[] = []
  let continuationToken: string | undefined

  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: config.r2Bucket,
      Prefix: config.prefix,
      ContinuationToken: continuationToken,
    }))
    objects.push(...(page.Contents || []))
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (continuationToken)

  return objects
}

function isoWeekKey(date: Date): string {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${value.getUTCFullYear()}-${String(week).padStart(2, "0")}`
}

async function applyRetention(client: S3Client, config: DatabaseBackupConfig): Promise<{ deleted: number; retained: number }> {
  const objects = await listBackupObjects(client, config)
  const candidates = objects
    .map((object) => ({ object, date: object.Key ? parseBackupTimestamp(object.Key) : null }))
    .filter((entry): entry is { object: _Object & { Key: string }; date: Date } => !!entry.object.Key && !!entry.date)
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  const keep = new Set<string>()
  candidates.slice(0, config.retentionDaily).forEach(({ object }) => keep.add(object.Key))

  const weekly = new Set<string>()
  for (const { object, date } of candidates.slice(config.retentionDaily)) {
    const week = isoWeekKey(date)
    if (weekly.size >= config.retentionWeekly) break
    if (!weekly.has(week)) {
      weekly.add(week)
      keep.add(object.Key)
    }
  }

  const toDelete = candidates.map(({ object }) => object.Key).filter((key) => !keep.has(key))
  for (let index = 0; index < toDelete.length; index += 1000) {
    await client.send(new DeleteObjectsCommand({
      Bucket: config.r2Bucket,
      Delete: { Objects: toDelete.slice(index, index + 1000).map((Key) => ({ Key })), Quiet: true },
    }))
  }

  return { deleted: toDelete.length, retained: keep.size }
}

export async function runDatabaseBackup(): Promise<DatabaseBackupResult> {
  const startedAt = Date.now()
  const config = getDatabaseBackupConfig()
  const createdAt = new Date()
  const fileName = createBackupFileName(createdAt)
  const key = `${config.prefix}${fileName}`
  const client = createR2BackupClient(config)
  const encryptedDump = createEncryptedDumpStream(config, createdAt)
  const stream = encryptedDump.stream

  try {
    await new Upload({
      client,
      queueSize: 1,
      partSize: 8 * 1024 * 1024,
      leavePartsOnError: false,
      params: {
        Bucket: config.r2Bucket,
        Key: key,
        Body: stream,
        ContentType: "application/octet-stream",
        ContentDisposition: `attachment; filename="${fileName}"`,
        Metadata: {
          purpose: "dudit-postgresql-backup",
          encryption: BACKUP_ALGORITHM,
        },
      },
    }).done()

    const retention = await applyRetention(client, config)
    return {
      key,
      fileName,
      sizeBytes: encryptedDump.getSizeBytes(),
      durationMs: Date.now() - startedAt,
      retentionDeleted: retention.deleted,
      retentionRetained: retention.retained,
    }
  } catch (error) {
    stream.destroy()
    throw error
  } finally {
    client.destroy()
  }
}
