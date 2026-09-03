/**
 * Script de Backfill Seguro de cpf_lookup_hash
 *
 * Características:
 * - Execução em lotes (batch size: 50).
 * - Não carrega a base inteira em memória.
 * - Resumível: filtra apenas `WHERE cpf IS NOT NULL AND cpf_lookup_hash IS NULL`.
 * - Se interrompido, ao rodar novamente continua exatamente de onde parou.
 * - Tratamento seguro de exceções linha a linha.
 *
 * Uso:
 *   npx tsx scripts/backfill-customer-cpf-hash.ts
 */

import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"
import path from "path"
import fs from "fs"
import { decrypt } from "../lib/cryptoService"

// Carregador de variáveis de ambiente para execução standalone
function loadEnv() {
  const envFiles = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ]

  for (const envPath of envFiles) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8")
      for (const line of content.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const [key, ...parts] = trimmed.split("=")
        if (key && parts.length > 0) {
          process.env[key.trim()] = parts.join("=").trim().replace(/^["']|["']$/g, "")
        }
      }
    }
  }
}

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("[Backfill CPF] ERRO: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

const BATCH_SIZE = 50

function generateHash(cpf: string): string | null {
  const clean = cpf.replace(/\D/g, "").trim()
  if (clean.length !== 11) return null

  const secret =
    process.env.CPF_LOOKUP_SECRET ||
    process.env.MASTER_KEY_V2 ||
    process.env.MASTER_KEY_V1 ||
    "dudit-cpf-blind-index-default-pepper-v1"

  return createHmac("sha256", secret).update(`cpf:${clean}`).digest("hex")
}

async function runBackfill() {
  console.log("=========================================================")
  console.log("   INICIANDO BACKFILL DE CPF_LOOKUP_HASH (DUDIT ERP)     ")
  console.log("=========================================================")

  // 1. Contar total de registros pendentes
  const { count, error: countError } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .not("cpf", "is", null)
    .is("cpf_lookup_hash", null)

  if (countError) {
    console.error("[Backfill CPF] Erro ao contar registros pendentes:", countError.message)
    process.exit(1)
  }

  const totalPending = count ?? 0
  console.log(`[Backfill CPF] Total de clientes pendentes de hash: ${totalPending}`)

  if (totalPending === 0) {
    console.log("[Backfill CPF] Todos os clientes com CPF já possuem cpf_lookup_hash preenchido! Nada a fazer.")
    return
  }

  let processedCount = 0
  let successCount = 0
  let errorCount = 0
  let skipCount = 0

  while (true) {
    // Busca o próximo lote de clientes pendentes
    const { data: batch, error: batchError } = await supabase
      .from("customers")
      .select("id, partner_id, name, cpf")
      .not("cpf", "is", null)
      .is("cpf_lookup_hash", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE)

    if (batchError) {
      console.error("[Backfill CPF] Erro ao buscar lote:", batchError.message)
      break
    }

    if (!batch || batch.length === 0) {
      break
    }

    for (const customer of batch) {
      processedCount++
      try {
        // Descriptografa o CPF usando o serviço atual
        const decryptedCpf = decrypt(customer.cpf, "cpf")
        const hash = generateHash(decryptedCpf)

        if (!hash) {
          console.warn(`[Backfill CPF] [SKIP] Cliente ${customer.id} (${customer.name}): CPF não possui 11 dígitos após descriptografia.`)
          skipCount++
          // Atualiza para uma flag segura ou pula
          continue
        }

        const { error: updateError } = await supabase
          .from("customers")
          .update({ cpf_lookup_hash: hash })
          .eq("id", customer.id)

        if (updateError) {
          console.error(`[Backfill CPF] [ERRO] Falha ao atualizar cliente ${customer.id}:`, updateError.message)
          errorCount++
        } else {
          successCount++
        }
      } catch (err: any) {
        console.error(`[Backfill CPF] [ERRO] Falha ao descriptografar CPF do cliente ${customer.id}:`, err?.message || err)
        errorCount++
      }
    }

    const progressPct = Math.min(100, Math.round((processedCount / totalPending) * 100))
    console.log(`[Backfill CPF] Progresso: ${processedCount}/${totalPending} (${progressPct}%) | Sucessos: ${successCount} | Erros: ${errorCount} | Ignorados: ${skipCount}`)
  }

  console.log("=========================================================")
  console.log("   BACKFILL FINALIZADO COM SUCESSO                       ")
  console.log(`   Processados: ${processedCount}`)
  console.log(`   Sucessos: ${successCount}`)
  console.log(`   Erros: ${errorCount}`)
  console.log(`   Ignorados: ${skipCount}`)
  console.log("=========================================================")
}

runBackfill().catch((err) => {
  console.error("[Backfill CPF] Erro fatal no script:", err)
  process.exit(1)
})
