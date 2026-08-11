/**
 * Script de migração de chave mestra de criptografia (v1 → v2, v2 → v3, etc.)
 *
 * COMO USAR:
 *   1. Gere a nova chave:     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *   2. Adicione MASTER_KEY_V2 (ou V3, V4...) no .env (mantendo a MASTER_KEY_V1)
 *   3. No arquivo lib/cryptoService.ts, mude:
 *         ACTIVE_KEY_VERSION: KeyVersion = "v1"  →  "v2"
 *         SUPPORTED_VERSIONS: ["v1", "v2"]  →  adicione a nova versão se necessário
 *         type KeyVersion = "v1" | "v2"     →  adicione a nova versão se necessário
 *   4. Rode o script:
 *         npx jiti scripts/rotate-encryption-keys.ts
 *   5. Verifique os logs - nenhum erro = migração concluída
 *   6. Após confirmar que tudo está em v2, pode remover MASTER_KEY_V1 do .env
 *
 * SEGURANÇA:
 *   - O script NUNCA apaga dados, apenas lê e atualiza
 *   - Se algo falhar no meio, é seguro rodar de novo (idempotente)
 *   - As chaves antigas permanecem no .env até vc removê-las manualmente
 */

// ────────────────────────────────────────────────────────────
// 1. Load .env (sem dependência externa)
// ────────────────────────────────────────────────────────────
import { hkdfSync, createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto"
import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env")
  if (!fs.existsSync(envPath)) {
    console.error("Arquivo .env não encontrado em", envPath)
    process.exit(1)
  }
  const content = fs.readFileSync(envPath, "utf-8")
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

loadEnv()

// ────────────────────────────────────────────────────────────
// 2. Crypto helpers (inline para evitar import "server-only")
// ────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm" as const
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32
const MIN_MASTER_KEY_LENGTH = 32

const HKDF_SALT = createHash("sha256")
  .update("dudit-crypto-service-hkdf-salt-v1")
  .digest()

const CONTEXT_INFO: Record<string, string> = {
  cpf: "cpf-encryption",
  mercadopago: "mercadopago-token-encryption",
  whatsapp: "whatsapp-token-encryption",
}

type KeyVersion = "v1" | "v2"

function getMasterKey(version: KeyVersion): Buffer {
  const envVarName = `MASTER_KEY_${version.toUpperCase()}`
  const masterKeyBase64 = process.env[envVarName]
  if (!masterKeyBase64) {
    throw new Error(`[MIGRAÇÃO] ${envVarName} não está definida no .env`)
  }
  const masterKey = Buffer.from(masterKeyBase64, "base64")
  if (masterKey.length < MIN_MASTER_KEY_LENGTH) {
    throw new Error(`[MIGRAÇÃO] ${envVarName} precisa ter no mínimo 32 bytes após decode base64`)
  }
  return masterKey
}

const derivedKeyCache = new Map<string, Buffer>()

function deriveKey(version: KeyVersion, context: string): Buffer {
  const cacheKey = `${version}:${context}`
  const cached = derivedKeyCache.get(cacheKey)
  if (cached) return cached

  const masterKey = getMasterKey(version)
  const info = CONTEXT_INFO[context]
  if (!info) throw new Error(`Contexto desconhecido: ${context}`)

  const derived = Buffer.from(hkdfSync("sha256", masterKey, HKDF_SALT, info, KEY_LENGTH))
  derivedKeyCache.set(cacheKey, derived)
  return derived
}

function parseVersionedPayload(data: string): { version: string; body: string } {
  const colonIdx = data.indexOf(":")
  if (colonIdx === -1) {
    throw new Error("Payload inválido: sem prefixo de versão")
  }
  const version = data.slice(0, colonIdx)
  const body = data.slice(colonIdx + 1)
  if (!body) throw new Error("Payload inválido: corpo vazio após prefixo")
  return { version, body }
}

function decrypt(data: string, context: string): string {
  if (!data) throw new Error("Cannot decrypt empty data")
  const { version, body } = parseVersionedPayload(data)
  const key = deriveKey(version as KeyVersion, context)
  const packed = Buffer.from(body, "base64")

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Dados criptografados inválidos: payload muito curto")
  }

  const iv = packed.subarray(0, IV_LENGTH)
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString("utf8")
}

function reEncryptWithActiveVersion(data: string, context: string, activeVersion: KeyVersion): string {
  const plaintext = decrypt(data, context)
  return encrypt(plaintext, context, activeVersion)
}

function encrypt(data: string, context: string, activeVersion: KeyVersion): string {
  if (!data) throw new Error("Cannot encrypt empty data")
  const key = deriveKey(activeVersion, context)
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const ciphertext = Buffer.concat([cipher.update(data, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  const packed = Buffer.concat([iv, authTag, ciphertext])
  return `${activeVersion}:${packed.toString("base64")}`
}

// ────────────────────────────────────────────────────────────
// 3. Detecta qual versão está ativa agora
// ────────────────────────────────────────────────────────────

function detectActiveVersion(): KeyVersion {
  const cryptoServicePath = path.resolve(process.cwd(), "lib", "cryptoService.ts")
  const content = fs.readFileSync(cryptoServicePath, "utf-8")

  // Procura o ACTIVE_KEY_VERSION no código
  const match = content.match(/ACTIVE_KEY_VERSION:\s*KeyVersion\s*=\s*"(v\d+)"/)
  if (!match) {
    console.warn("⚠  Não foi possível detectar ACTIVE_KEY_VERSION. Usando 'v2' como fallback.")
    return "v2"
  }

  const version = match[1] as KeyVersion
  console.log(`ℹ  ACTIVE_KEY_VERSION detectado: ${version}`)
  return version
}

// ────────────────────────────────────────────────────────────
// 4. Configuração do Supabase
// ────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no .env")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ────────────────────────────────────────────────────────────
// 5. Definição das migrações
// ────────────────────────────────────────────────────────────

interface ColumnMigration {
  table: string
  column: string
  context: string
  /** Filtros extras (ex: { pix_key_type: "cpf" }) */
  filters?: Record<string, string>
  /** Nome amigável para exibição */
  label: string
}

const MIGRATIONS: ColumnMigration[] = [
  // CPF
  { table: "stores", column: "cpf", context: "cpf", label: "CPF de lojas" },
  { table: "customers", column: "cpf", context: "cpf", label: "CPF de clientes" },
  { table: "suppliers", column: "cpf", context: "cpf", label: "CPF de fornecedores" },
  { table: "user_profiles", column: "cpf", context: "cpf", label: "CPF de usuarios" },

  // TOTP secrets (pode não existir em todas as instâncias)
  { table: "user_2fa_secrets", column: "secret", context: "cpf", label: "Segredos 2FA" },

  // PIX key (só quando for CPF)
  {
    table: "payment_methods",
    column: "pix_key",
    context: "cpf",
    filters: { pix_key_type: "cpf" },
    label: "Chaves PIX (tipo CPF)",
  },

  // Mercado Pago
  { table: "partners", column: "mp_access_token_encrypted", context: "mercadopago", label: "Access Token MP" },
  { table: "partners", column: "mp_refresh_token_encrypted", context: "mercadopago", label: "Refresh Token MP" },

  // WhatsApp
  { table: "partner_whatsapp_connections", column: "access_token_encrypted", context: "whatsapp", label: "Access Token WhatsApp" },
  { table: "partner_whatsapp_connections", column: "api_key_encrypted", context: "whatsapp", label: "API Key WhatsApp" },
]

// ────────────────────────────────────────────────────────────
// 6. Estatísticas
// ────────────────────────────────────────────────────────────

interface Stats {
  total: number
  migrated: number
  skipped: number
  errors: number
}

// ────────────────────────────────────────────────────────────
// 7. Lógica principal
// ────────────────────────────────────────────────────────────

async function migrateColumn(migration: ColumnMigration, activeVersion: KeyVersion): Promise<Stats> {
  const { table, column, context, filters, label } = migration
  const stats: Stats = { total: 0, migrated: 0, skipped: 0, errors: 0 }

  // Descobre qual prefixo é "antigo" (dados que PRECISAM ser migrados)
  const versionNum = parseInt(activeVersion[1])
  const oldPrefix = versionNum > 1 ? `v${versionNum - 1}:` : null

  process.stdout.write(`\n📦 ${label} (${table}.${column})... `)

  try {
    // Se a versão ativa é v1, não há o que migrar
    if (!oldPrefix) {
      console.log(`já está na versão ativa ✔`)
      return stats
    }

    // Busca registros com dados na versão antiga
    let query = supabase
      .from(table)
      .select(`id, ${column}`)

    // Filtros adicionais (ex: pix_key_type = 'cpf')
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value)
      }
    }

    // Filtra apenas registros com prefixo da versão ANTERIOR
    query = query.like(column, `${oldPrefix}%`)

    const { data: records, error } = await query

    if (error) {
      // Tabela pode não existir - não é erro fatal
      if (error.code === "PGRST116" || error.message?.includes("Could not find the table")) {
        console.log(`tabela não encontrada, pulando ✔`)
        return stats
      }
      console.error(`\n❌ Erro na consulta: ${error.message}`)
      stats.errors++
      return stats
    }

    if (!records || records.length === 0) {
      console.log(`0 pendentes ✔`)
      return stats
    }

    stats.total = records.length
    console.log(`${stats.total} encontrados`)

    // Processa em lotes de 50
    const BATCH_SIZE = 50
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      const updates: { id: string;[key: string]: any }[] = []

      for (const record of batch) {
        const oldValue = (record as any)[column]
        if (!oldValue) {
          stats.skipped++
          continue
        }

        // Verifica se já está na versão ativa
        if (oldValue.startsWith(`${activeVersion}:`)) {
          stats.skipped++
          continue
        }

        try {
          const newValue = reEncryptWithActiveVersion(oldValue, context, activeVersion)
          updates.push({ id: record.id, [column]: newValue })
        } catch (err) {
          stats.errors++
          console.error(`\n⚠  Erro ao re-criptografar ${table}.${column} id=${record.id}: ${err}`)
        }
      }

      // Executa as atualizações
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from(table)
          .update({ [column]: update[column] })
          .eq("id", update.id)

        if (updateError) {
          stats.errors++
          console.error(`\n⚠  Erro ao atualizar ${table} id=${update.id}: ${updateError.message}`)
        } else {
          stats.migrated++
        }
      }

      // Progresso
      const progress = Math.min(i + BATCH_SIZE, stats.total)
      process.stdout.write(`\r  ↳ ${progress}/${stats.total} processados (${stats.errors} erros)`)
    }

    console.log(`\r  ↳ ${stats.total}/${stats.total} - ✅ ${stats.migrated} migrados, ${stats.skipped} ignorados, ${stats.errors} erros`)
  } catch (err) {
    console.error(`\n❌ Erro fatal em ${label}: ${err}`)
    stats.errors++
  }

  return stats
}

async function main() {
  console.log("══════════════════════════════════════════════")
  console.log("  Migração de Chave Mestra de Criptografia")
  console.log("══════════════════════════════════════════════")
  console.log()

  const activeVersion = detectActiveVersion()
  console.log(`🔑 Versão ativa: ${activeVersion}`)

  // Verifica se a chave da versão ativa existe
  try {
    getMasterKey(activeVersion)
    console.log(`✅ MASTER_KEY_${activeVersion.toUpperCase()} encontrada no .env`)
  } catch (e) {
    console.error(`❌ ${e}`)
    console.error(`   Adicione MASTER_KEY_${activeVersion.toUpperCase()} no .env antes de rodar o script.`)
    process.exit(1)
  }

  // Verifica se a chave anterior existe (necessária pra descriptografar dados existentes)
  let oldVersion: string | null = null
  if (activeVersion !== "v1") {
    const oldVersionNum = parseInt(activeVersion[1]) - 1
    oldVersion = `v${oldVersionNum}`
    try {
      getMasterKey(oldVersion as KeyVersion)
      console.log(`✅ MASTER_KEY_${oldVersion.toUpperCase()} encontrada no .env (usada pra descriptografar dados antigos)`)
    } catch (e) {
      console.error(`❌ ${e}`)
      console.error(`   MASTER_KEY_${oldVersion.toUpperCase()} é necessária para descriptografar dados existentes.`)
      process.exit(1)
    }
  }

  console.log()
  console.log("📋 Colunas que serão migradas:")
  console.log("─".repeat(60))
  for (const m of MIGRATIONS) {
    console.log(`   ${m.table}.${m.column} → contexto "${m.context}"`)
  }
  console.log("─".repeat(60))
  console.log()

  // Confirmação
  console.log("⚠  Tem certeza que deseja prosseguir com a migração?")
  console.log("   Os dados serão re-criptografados com a chave", activeVersion)
  console.log("   Pressione Ctrl+C para cancelar ou aguarde 5 segundos para continuar...")
  await new Promise((resolve) => setTimeout(resolve, 5000))

  console.log()
  console.log("🚀 Iniciando migração...")
  console.log()

  const startTime = Date.now()
  const totals: Stats = { total: 0, migrated: 0, skipped: 0, errors: 0 }

  for (const migration of MIGRATIONS) {
    const stats = await migrateColumn(migration, activeVersion)
    totals.total += stats.total
    totals.migrated += stats.migrated
    totals.skipped += stats.skipped
    totals.errors += stats.errors
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log()
  console.log("══════════════════════════════════════════════")
  console.log("  RESUMO DA MIGRAÇÃO")
  console.log("══════════════════════════════════════════════")
  console.log(`  Duração:     ${elapsed}s`)
  console.log(`  Total lidos: ${totals.total}`)
  console.log(`  Migrados:    ${totals.migrated}`)
  console.log(`  Ignorados:   ${totals.skipped}`)
  console.log(`  Erros:       ${totals.errors}`)
  console.log()
  if (totals.errors === 0) {
    console.log("✅ Migração concluída com sucesso!")
    console.log()
    console.log("Próximos passos:")
    console.log(`  1. Verifique se todos os dados foram migrados rodando o script novamente`)
    console.log("     (deve mostrar 0 pendentes)")
    if (oldVersion) {
      console.log(`  2. Remova a MASTER_KEY_${oldVersion.toUpperCase()} do .env com segurança`)
    }
  } else {
    console.log(`⚠  Migração finalizada com ${totals.errors} erro(s).`)
    console.log("   Revise os logs acima e rode o script novamente (é idempotente).")
  }
  console.log()
}

main().catch((err) => {
  console.error("Erro fatal:", err)
  process.exit(1)
})
