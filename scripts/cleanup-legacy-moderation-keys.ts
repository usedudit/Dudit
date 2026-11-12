import { Redis } from "@upstash/redis"
import path from "path"
import fs from "fs"

function loadEnv() {
  const paths = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ]

  for (const envPath of paths) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8")
      envContent.split("\n").forEach((line) => {
        const trimmedLine = line.trim()
        if (!trimmedLine || trimmedLine.startsWith("#")) return
        const [key, ...valueParts] = trimmedLine.split("=")
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "")
        }
      })
    }
  }
}

loadEnv()

async function main() {
  const kvUrl = process.env.KV_REST_API_URL
  const kvToken = process.env.KV_REST_API_TOKEN

  if (!kvUrl || !kvToken) {
    console.error("Faltam variáveis de ambiente (KV_REST_API_URL, KV_REST_API_TOKEN).")
    process.exit(1)
  }

  const redis = new Redis({ url: kvUrl, token: kvToken })
  console.log("Buscando chaves legadas de moderação no Redis...")

  const patterns = [
    "moderation:image:v3:*",
    "moderation:phash:v1:*",
    "moderation:img_status:v1:*",
  ]

  let totalDeleted = 0

  for (const pattern of patterns) {
    let cursor = 0
    do {
      const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 })
      cursor = typeof nextCursor === "number" ? nextCursor : parseInt(nextCursor as any, 10)

      if (keys && keys.length > 0) {
        await redis.del(...keys)
        totalDeleted += keys.length
        console.log(`Deletadas ${keys.length} chaves no padrão ${pattern}`)
      }
    } while (cursor !== 0)
  }

  console.log(`\nLimpeza concluída! Total de chaves legadas removidas: ${totalDeleted}`)
}

main().catch(console.error)

