// @ts-nocheck
/**
 * Registra (ou atualiza) uma versão de documento legal em `legal_documents`,
 * calculando o SHA-256 do texto publicado em um arquivo .txt.
 *
 * Uso:
 *   npm run seed:legal -- terms 1.0 ./docs/termos-v1.txt
 *   npm run seed:legal -- privacy 1.5 ./docs/privacidade-v1.5.txt [/url/opcional]
 *
 * Regras de vigência:
 *   - terms:  entra em vigor 10 dias após a publicação.
 *   - privacy: entra em vigor imediatamente.
 *
 * IMPORTANTE: após registrar, atualize lib/legal/constants.ts com a nova versão.
 */
import { createClient } from "@supabase/supabase-js"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

// Manual .env loader (mesmo padrão de scripts/seed-explore-redis.ts)
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

const DEFAULT_URLS = {
  terms: "/institucional/termos",
  privacy: "/institucional/privacidade",
}

async function main() {
  const [tipo, versao, txtPath, url] = process.argv.slice(2)

  if (!tipo || !versao || !txtPath) {
    console.error("Uso: npm run seed:legal -- <terms|privacy> <versao> <arquivo.txt> [url]")
    process.exit(1)
  }
  if (!["terms", "privacy"].includes(tipo)) {
    console.error("tipo deve ser 'terms' ou 'privacy'")
    process.exit(1)
  }

  const filePath = path.resolve(process.cwd(), txtPath)
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`)
    process.exit(1)
  }

  const content = fs.readFileSync(filePath, "utf-8")
  const conteudoHash = createHash("sha256").update(content, "utf-8").digest("hex")

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error("Faltam variáveis de ambiente (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).")
    process.exit(1)
  }

  const admin = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const publicadoEm = new Date()
  const delayDays = tipo === "terms" ? 10 : 0
  const vigenteEm = new Date(publicadoEm.getTime() + delayDays * 24 * 60 * 60 * 1000)

  const { data, error } = await admin
    .from("legal_documents")
    .upsert(
      {
        tipo,
        versao,
        conteudo_hash: conteudoHash,
        url: url || DEFAULT_URLS[tipo],
        publicado_em: publicadoEm.toISOString(),
        vigente_em: vigenteEm.toISOString(),
      },
      { onConflict: "tipo,versao" }
    )

  if (error) {
    console.error("Erro ao registrar documento:", error)
    process.exit(1)
  }

  console.log(`Documento registrado: ${tipo} v${versao}`)
  console.log(`  url           : ${url || DEFAULT_URLS[tipo]}`)
  console.log(`  sha256        : ${conteudoHash}`)
  console.log(`  publicado_em  : ${publicadoEm.toISOString()}`)
  console.log(`  vigente_em    : ${vigenteEm.toISOString()}${delayDays ? " (10 dias)" : ""}`)
  console.log("")
  console.log("Agora atualize lib/legal/constants.ts (CURRENT_LEGAL_DOCUMENTS) com esta versão.")
}

main()