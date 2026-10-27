/**
 * Backfill separado para valores secretos legados que ainda estão em texto puro.
 * Simula por padrão; use --apply para gravar. A rotação de payloads vN: fica
 * em scripts/rotate-encryption-keys.ts.
 */
import { createHmac } from "crypto"
import { createClient } from "@supabase/supabase-js"
import {
  decryptWithSupportedVersion,
  encryptWithFreshIv,
  getMasterKey,
  getPayloadVersion,
  loadEnv,
  readCryptoConfig,
  type CryptoContext,
  type KeyVersion,
} from "./crypto-rotation-utils"

type PlaintextMigration = {
  table: string
  column: string
  context: CryptoContext
  filters?: Record<string, string>
  cpf?: boolean
  hashColumn?: string
  label: string
}

const MIGRATIONS: PlaintextMigration[] = [
  { table: "stores", column: "cpf", context: "cpf", cpf: true, label: "CPF de lojas" },
  { table: "customers", column: "cpf", context: "cpf", cpf: true, label: "CPF de clientes" },
  { table: "suppliers", column: "cpf", context: "cpf", cpf: true, hashColumn: "cpf_lookup_hash", label: "CPF de fornecedores" },
  { table: "user_profiles", column: "cpf", context: "cpf", cpf: true, hashColumn: "cpf_lookup_hash", label: "CPF de perfis" },
  { table: "xml_imports", column: "raw_xml", context: "nfe_xml", label: "XMLs fiscais" },
  { table: "xml_imports", column: "supplier_document", context: "cpf", filters: { supplier_document_type: "cpf" }, cpf: true, label: "CPF fiscal do fornecedor na NF-e" },
  {
    table: "payment_methods",
    column: "pix_key",
    context: "cpf",
    filters: { pix_key_type: "cpf" },
    cpf: true,
    label: "Chaves PIX de CPF",
  },
  { table: "partner_whatsapp_connections", column: "webhook_verify_token", context: "whatsapp", label: "Token de verificação WhatsApp" },
  { table: "partner_whatsapp_connections", column: "webhook_secret", context: "whatsapp", label: "Segredo de webhook WhatsApp" },
  { table: "partner_whatsapp_connections", column: "evolution_webhook_secret", context: "whatsapp", label: "Segredo de webhook Evolution" },
]

const PAGE_SIZE = 250
type Row = Record<string, any> & { id: string }
type PreparedRow = { id: string; oldValue: string; newValue: string; newHash?: string }

function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "")
}

function cpfLookupHash(cpf: string): string {
  const secret = process.env.CPF_LOOKUP_SECRET || process.env.MASTER_KEY_V2 || process.env.MASTER_KEY_V1 || "dudit-cpf-blind-index-default-pepper-v1"
  return createHmac("sha256", secret).update(`cpf:${cpf}`).digest("hex")
}

function queryPage(supabase: any, migration: PlaintextMigration, afterId?: string) {
  const select = `id, ${migration.column}${migration.hashColumn ? `, ${migration.hashColumn}` : ""}`
  let query = supabase.from(migration.table).select(select).not(migration.column, "is", null)
  for (const [key, value] of Object.entries(migration.filters || {})) query = query.eq(key, value)
  if (afterId) query = query.gt("id", afterId)
  return query.order("id", { ascending: true }).limit(PAGE_SIZE)
}

async function scanPlaintext(supabase: any, migration: PlaintextMigration, activeVersion: KeyVersion, supported: KeyVersion[], apply: boolean) {
  let afterId: string | undefined
  let candidates = 0
  let migrated = 0
  let conflicts = 0
  let errors = 0

  // Full validation pass before this column is allowed to write.
  while (true) {
    const { data, error } = await queryPage(supabase, migration, afterId)
    if (error) throw new Error(`${migration.table}.${migration.column}: ${error.message}`)
    const rows = (data || []) as Row[]
    if (!rows.length) break
    for (const row of rows) {
      const value = row[migration.column]
      if (typeof value !== "string" || !value) continue
      const version = getPayloadVersion(value)
      if (version) {
        if (!supported.includes(version)) throw new Error(`${migration.label}: há payload em versão não suportada ${version}`)
        if (!migration.hashColumn || row[migration.hashColumn]) continue
        const digits = normalizeCpf(decryptWithSupportedVersion(value, migration.context, supported))
        if (!digits || digits.length !== 11) throw new Error(`${migration.label}: payload descriptografado não contém CPF de 11 dígitos`)
        candidates++
        continue
      }
      if (migration.cpf) {
        const digits = normalizeCpf(value)
        if (digits.length !== 11) throw new Error(`${migration.label}: há valor legado que não parece CPF de 11 dígitos; nenhuma gravação foi feita nesta coluna`)
      }
      candidates++
    }
    afterId = rows[rows.length - 1].id
    if (rows.length < PAGE_SIZE) break
  }

  if (!apply || candidates === 0) return { candidates, migrated, conflicts, errors }

  // Second pass: compare-and-swap protects a concurrent application update.
  afterId = undefined
  while (true) {
    const { data, error } = await queryPage(supabase, migration, afterId)
    if (error) throw new Error(`${migration.table}.${migration.column}: ${error.message}`)
    const rows = (data || []) as Row[]
    if (!rows.length) break
    const prepared: PreparedRow[] = []
    for (const row of rows) {
      const value = row[migration.column]
      if (typeof value !== "string" || !value) continue
      const version = getPayloadVersion(value)
      if (version) {
        if (!migration.hashColumn || row[migration.hashColumn]) continue
        const plaintext = normalizeCpf(decryptWithSupportedVersion(value, migration.context, supported))
        if (!plaintext || plaintext.length !== 11) {
          errors++
          console.error(`  CPF descriptografado inválido em ${migration.table}.${migration.column} (registro omitido)`)
          continue
        }
        prepared.push({ id: row.id, oldValue: value, newValue: value, newHash: cpfLookupHash(plaintext) })
        continue
      }
      const plaintext = migration.cpf ? normalizeCpf(value) : value
      prepared.push({
        id: row.id,
        oldValue: value,
        newValue: encryptWithFreshIv(plaintext, migration.context, activeVersion),
        ...(migration.hashColumn ? { newHash: cpfLookupHash(plaintext) } : {}),
      })
    }
    for (const item of prepared) {
      let updateQuery = supabase.from(migration.table)
        .update({ [migration.column]: item.newValue, ...(migration.hashColumn ? { [migration.hashColumn]: item.newHash } : {}) })
        .eq("id", item.id)
        .eq(migration.column, item.oldValue)
      for (const [key, value] of Object.entries(migration.filters || {})) updateQuery = updateQuery.eq(key, value)
      const { data: changed, error: updateError } = await updateQuery.select("id")
      if (updateError) {
        errors++
        console.error(`  Falha ao atualizar ${migration.table}.${migration.column}: ${updateError.message}`)
      } else if (!changed?.length) {
        conflicts++
      } else {
        migrated++
      }
    }
    afterId = rows[rows.length - 1].id
    if (rows.length < PAGE_SIZE) break
  }
  return { candidates, migrated, conflicts, errors }
}

async function main() {
  loadEnv()
  const apply = process.argv.includes("--apply")
  const invalidArgs = process.argv.slice(2).filter((arg) => !["--apply", "--dry-run"].includes(arg))
  if (invalidArgs.length) throw new Error(`Argumento desconhecido: ${invalidArgs[0]}`)
  const { activeVersion, supportedVersions } = readCryptoConfig()
  getMasterKey(activeVersion)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias")
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log(`Criptografando dados legados para ${activeVersion}; suportadas: ${supportedVersions.join(", ")}`)
  console.log(apply ? "MODO APPLY: alterações serão gravadas." : "SIMULAÇÃO: nenhuma alteração será gravada. Use --apply para executar.")
  let totalCandidates = 0
  let totalMigrated = 0
  let totalConflicts = 0
  let totalErrors = 0
  // Validate every table before the first write so malformed legacy data cannot
  // leave a partially migrated database.
  for (const migration of MIGRATIONS) {
    const result = await scanPlaintext(supabase, migration, activeVersion, supportedVersions, false)
    console.log(`  preflight ${migration.label}: ${result.candidates} registros`)
  }

  for (const migration of MIGRATIONS) {
    const result = apply
      ? await scanPlaintext(supabase, migration, activeVersion, supportedVersions, true)
      : await scanPlaintext(supabase, migration, activeVersion, supportedVersions, false)
    totalCandidates += result.candidates
    totalMigrated += result.migrated
    totalConflicts += result.conflicts
    totalErrors += result.errors
    console.log(`  ${migration.label}: ${result.candidates} em texto puro${apply ? `; ${result.migrated} migrados, ${result.conflicts} conflitos, ${result.errors} erros` : ""}`)
  }

  if (apply) {
    let plaintextRemaining = 0
    let verificationFailures = 0
    console.log("Verificação de valores não versionados:")
    for (const migration of MIGRATIONS) {
      let afterId: string | undefined
      while (true) {
        const { data, error } = await queryPage(supabase, migration, afterId)
        if (error) throw new Error(`${migration.table}.${migration.column}: ${error.message}`)
        const rows = (data || []) as Row[]
        if (!rows.length) break
        for (const row of rows) {
          const value = row[migration.column]
          if (typeof value !== "string" || !value) continue
          const version = getPayloadVersion(value)
          if (!version) {
            plaintextRemaining++
            continue
          }
          try {
            if (!supportedVersions.includes(version)) throw new Error("unsupported version")
            const plaintext = decryptWithSupportedVersion(value, migration.context, supportedVersions)
            const normalized = migration.cpf ? normalizeCpf(plaintext) : plaintext
            if (migration.cpf && normalized.length !== 11) throw new Error("invalid CPF")
            if (migration.hashColumn && row[migration.hashColumn] !== cpfLookupHash(normalized)) throw new Error("missing or inconsistent CPF lookup hash")
          } catch {
            verificationFailures++
            console.error(`  verificação falhou em ${migration.table}.${migration.column} (registro omitido)`)
          }
        }
        afterId = rows[rows.length - 1].id
        if (rows.length < PAGE_SIZE) break
      }
    }
    console.log(`  valores não versionados restantes: ${plaintextRemaining}`)
    console.log(`  falhas de verificação: ${verificationFailures}`)
    console.log(`Resumo: ${totalMigrated}/${totalCandidates} migrados; ${totalConflicts} conflitos; ${totalErrors} erros.`)
    if (totalErrors || totalConflicts || plaintextRemaining || verificationFailures) process.exitCode = 1
  } else {
    console.log(`Resumo da simulação: ${totalCandidates} valores seriam criptografados.`)
  }
}

main().catch((error) => {
  console.error(`Migração de texto puro interrompida: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
