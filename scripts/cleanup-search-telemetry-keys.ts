import { Redis } from "@upstash/redis"
import path from "path"
import fs from "fs"

function loadEnv() {
    const paths = [
        path.resolve(process.cwd(), '.env.local'),
        path.resolve(process.cwd(), '.env')
    ]

    for (const envPath of paths) {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8')
            envContent.split('\n').forEach(line => {
                const trimmedLine = line.trim()
                if (!trimmedLine || trimmedLine.startsWith('#')) return

                const [key, ...valueParts] = trimmedLine.split('=')
                if (key && valueParts.length > 0) {
                    process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
                }
            })
        }
    }
}

loadEnv()

const kvUrl = process.env.KV_REST_API_URL
const kvToken = process.env.KV_REST_API_TOKEN

if (!kvUrl || !kvToken) {
    console.error("Faltam variáveis KV_REST_API_URL e KV_REST_API_TOKEN no .env.local")
    process.exit(1)
}

const redis = new Redis({ url: kvUrl, token: kvToken })

async function cleanSearchTelemetryKeys() {
    console.log("🔍 Procurando chaves ddt:search:* no Redis...")

    let cursor: string | number = 0
    let totalDeleted = 0

    do {
        // Usa SCAN para varrer com segurança sem travar o Redis
        const [nextCursor, keys] = await redis.scan(cursor, { match: "ddt:search:*", count: 100 })
        cursor = nextCursor

        if (keys && keys.length > 0) {
            console.log(`Encontradas ${keys.length} chaves no lote atual. Deletando...`)
            for (const key of keys) {
                console.log(` - Removendo: ${key}`)
            }
            // Deleta em lote via pipeline
            const p = redis.pipeline()
            for (const key of keys) {
                p.del(key)
            }
            await p.exec()
            totalDeleted += keys.length
        }
    } while (cursor !== 0 && cursor !== "0")

    console.log(`\n🎉 Concluído com sucesso! Total de chaves ddt:search:* deletadas: ${totalDeleted}`)
}

cleanSearchTelemetryKeys().catch((err) => {
    console.error("Erro ao limpar chaves:", err)
    process.exit(1)
})
