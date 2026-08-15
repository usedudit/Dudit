import fs from "node:fs"
import { createDecipheriv } from "node:crypto"
import { createGunzip } from "node:zlib"
import { spawn } from "node:child_process"
import { Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

const BACKUP_MAGIC = "DUDIT_BACKUP_V1"
const AUTH_TAG_BYTES = 16
const backupPath = process.argv[2]

if (!backupPath) {
  console.error("Uso: node scripts/restore-database.mjs <arquivo.dump.gz.enc>")
  process.exit(2)
}

function getDatabaseUrl() {
  return (
    process.env.BACKUP_RESTORE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    ""
  )
}

function parseDatabaseUrl(rawUrl) {
  const parsed = new URL(rawUrl)
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol) || !parsed.hostname || !parsed.pathname) {
    throw new Error("A URL de restauração não é uma URL PostgreSQL válida")
  }
  const password = parsed.password ? decodeURIComponent(parsed.password) : ""
  parsed.password = ""
  return {
    safeConnectionString: parsed.toString(),
    password,
    sslMode: parsed.searchParams.get("sslmode") || "require",
  }
}

function getKey() {
  const value = process.env.BACKUP_ENCRYPTION_KEY_BASE64
  if (!value) throw new Error("BACKUP_ENCRYPTION_KEY_BASE64 não está configurada")
  const key = Buffer.from(value, "base64")
  if (key.length !== 32) throw new Error("A chave de backup deve ter 32 bytes")
  return key
}

function createDecryptor(key) {
  let headerBuffer = Buffer.alloc(0)
  let decipher
  let encryptedTail = Buffer.alloc(0)

  return new Transform({
    transform(chunk, _encoding, callback) {
      try {
        let payload = chunk

        if (!decipher) {
          headerBuffer = Buffer.concat([headerBuffer, chunk])
          const firstNewline = headerBuffer.indexOf(0x0a)
          const secondNewline = firstNewline >= 0 ? headerBuffer.indexOf(0x0a, firstNewline + 1) : -1
          if (firstNewline < 0 || secondNewline < 0) return callback()

          const magic = headerBuffer.subarray(0, firstNewline).toString("utf8")
          if (magic !== BACKUP_MAGIC) throw new Error("Formato de backup desconhecido")

          const header = JSON.parse(headerBuffer.subarray(firstNewline + 1, secondNewline).toString("utf8"))
          if (header.version !== 1 || header.algorithm !== "aes-256-gcm" || header.compression !== "gzip") {
            throw new Error("Cabeçalho de backup incompatível")
          }

          const iv = Buffer.from(header.iv, "base64")
          if (iv.length !== 12) throw new Error("IV de backup inválido")
          decipher = createDecipheriv("aes-256-gcm", key, iv)
          payload = headerBuffer.subarray(secondNewline + 1)
          headerBuffer = Buffer.alloc(0)
        }

        const combined = Buffer.concat([encryptedTail, payload])
        if (combined.length > AUTH_TAG_BYTES) {
          const splitAt = combined.length - AUTH_TAG_BYTES
          encryptedTail = combined.subarray(splitAt)
          this.push(decipher.update(combined.subarray(0, splitAt)))
        } else {
          encryptedTail = combined
        }

        callback()
      } catch (error) {
        callback(error)
      }
    },
    flush(callback) {
      try {
        if (!decipher) throw new Error("Backup sem cabeçalho")
        if (encryptedTail.length !== AUTH_TAG_BYTES) throw new Error("Backup incompleto ou sem tag de autenticação")
        decipher.setAuthTag(encryptedTail)
        this.push(decipher.final())
        callback()
      } catch (error) {
        callback(error)
      }
    },
  })
}

async function main() {
  const rawUrl = getDatabaseUrl()
  if (!rawUrl) throw new Error("BACKUP_RESTORE_DATABASE_URL, DATABASE_URL ou POSTGRES_URL_NON_POOLING é obrigatório")

  const { safeConnectionString, password, sslMode } = parseDatabaseUrl(rawUrl)
  const restore = spawn(
    process.env.PG_RESTORE_BINARY || "pg_restore",
    ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", safeConnectionString],
    {
      env: {
        ...process.env,
        PGPASSWORD: password || process.env.PGPASSWORD || "",
        PGSSLMODE: sslMode,
      },
      stdio: ["pipe", "inherit", "inherit"],
    },
  )

  const exitCode = new Promise((resolve, reject) => {
    restore.once("error", reject)
    restore.once("close", (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })

  try {
    await pipeline(
      fs.createReadStream(backupPath),
      createDecryptor(getKey()),
      createGunzip(),
      restore.stdin,
    )
    const code = await exitCode
    if (code !== 0) throw new Error(`pg_restore terminou com código ${code}`)
    console.log("Restauração concluída com sucesso.")
  } catch (error) {
    if (!restore.killed) restore.kill("SIGTERM")
    throw error
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha na restauração")
  process.exit(1)
})
