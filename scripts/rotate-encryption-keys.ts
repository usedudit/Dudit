/**
 * Rotação de payloads que já estão criptografados pelo cryptoService.
 * Simula por padrão; use --apply para gravar. A conversão de texto puro é feita
 * separadamente por scripts/migrate-plaintext-sensitive-data.ts.
 */
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

type ColumnMigration = {
  table: string
  column: string
  context?: CryptoContext
  contextColumn?: string
  jsonbKey?: string
  filters?: Record<string, string>
  label: string
}

const MIGRATIONS: ColumnMigration[] = [
  { table: "stores", column: "cpf", context: "cpf", label: "CPF de lojas" },
  { table: "customers", column: "cpf", context: "cpf", label: "CPF de clientes" },
  { table: "suppliers", column: "cpf", context: "cpf", label: "CPF de fornecedores" },
  { table: "user_profiles", column: "cpf", context: "cpf", label: "CPF de perfis" },
  { table: "xml_imports", column: "raw_xml", context: "nfe_xml", label: "XMLs fiscais" },
  { table: "xml_imports", column: "supplier_document", context: "cpf", filters: { supplier_document_type: "cpf" }, label: "CPF fiscal do fornecedor na NF-e" },
  {
    table: "payment_methods",
    column: "pix_key",
    context: "cpf",
    filters: { pix_key_type: "cpf" },
    label: "Chaves PIX do tipo CPF",
  },
  {
    table: "partner_integrations",
    column: "access_token_encrypted",
    contextColumn: "provider_slug",
    label: "Tokens de acesso das integrações",
  },
  {
    table: "partner_integrations",
    column: "webhook_secret_encrypted",
    contextColumn: "provider_slug",
    label: "Segredos de webhook das integrações",
  },
  {
    table: "partner_integrations",
    column: "credentials",
    jsonbKey: "refresh_token_encrypted",
    contextColumn: "provider_slug",
    label: "Refresh token do Mercado Pago",
  },
  { table: "partner_whatsapp_connections", column: "access_token_encrypted", context: "whatsapp", label: "Token WhatsApp" },
  { table: "partner_whatsapp_connections", column: "api_key_encrypted", context: "whatsapp", label: "API key WhatsApp" },
  { table: "partner_whatsapp_connections", column: "webhook_verify_token", context: "whatsapp", label: "Token de verificação WhatsApp" },
  { table: "partner_whatsapp_connections", column: "webhook_secret", context: "whatsapp", label: "Segredo de webhook WhatsApp" },
  { table: "partner_whatsapp_connections", column: "evolution_webhook_secret", context: "whatsapp", label: "Segredo de webhook Evolution" },
]

const PAGE_SIZE = 250
type Row = Record<string, any> & { id: string }
type ScanResult = { byVersion: Map<KeyVersion, number>; malformed: number; rows: number }

function getFilterColumn(migration: ColumnMigration): string {
  return migration.jsonbKey ? `${migration.column}->>${migration.jsonbKey}` : migration.column
}

function getValue(row: Row, migration: ColumnMigration): string | null {
  const value = migration.jsonbKey ? row[migration.column]?.[migration.jsonbKey] : row[migration.column]
  return typeof value === "string" && value.length ? value : null
}

function getQuery(supabase: any, migration: ColumnMigration, afterId?: string) {
  const selected = `id, ${migration.column}${migration.contextColumn ? `, ${migration.contextColumn}` : ""}`
  let query = supabase.from(migration.table).select(selected).like(getFilterColumn(migration), "v%")
  for (const [key, value] of Object.entries(migration.filters || {})) query = query.eq(key, value)
  if (afterId) query = query.gt("id", afterId)
  return query.order("id", { ascending: true }).limit(PAGE_SIZE)
}

async function scanMigration(supabase: any, migration: ColumnMigration): Promise<ScanResult> {
  const result: ScanResult = { byVersion: new Map(), malformed: 0, rows: 0 }
  let afterId: string | undefined
  while (true) {
    const { data, error } = await getQuery(supabase, migration, afterId)
    if (error) throw new Error(`${migration.table}.${migration.column}: ${error.message}`)
    const rows = (data || []) as Row[]
    if (!rows.length) break
    for (const row of rows) {
      result.rows++
      const value = getValue(row, migration)
      if (!value) continue
      const version = getPayloadVersion(value)
      if (!version) result.malformed++
      else result.byVersion.set(version, (result.byVersion.get(version) || 0) + 1)
    }
    afterId = rows[rows.length - 1].id
    if (rows.length < PAGE_SIZE) break
  }
  return result
}

function printScan(migration: ColumnMigration, scan: ScanResult, activeVersion: KeyVersion) {
  const pending = Array.from(scan.byVersion.entries())
    .filter(([version]) => version !== activeVersion)
    .sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
  const description = pending.length ? pending.map(([version, count]) => `${version}: ${count}`).join(", ") : "nenhum"
  console.log(`  ${migration.label}: ${description}${scan.malformed ? `; prefixos inválidos: ${scan.malformed}` : ""}`)
}

async function migrateOne(supabase: any, migration: ColumnMigration, supported: KeyVersion[], activeVersion: KeyVersion) {
  let afterId: string | undefined
  let migrated = 0
  let conflicts = 0
  let errors = 0

  while (true) {
    const { data, error } = await getQuery(supabase, migration, afterId)
    if (error) throw new Error(`${migration.table}.${migration.column}: ${error.message}`)
    const rows = (data || []) as Row[]
    if (!rows.length) break

    for (const row of rows) {
      const oldValue = getValue(row, migration)
      const sourceVersion = getPayloadVersion(oldValue)
      if (!oldValue || !sourceVersion || sourceVersion === activeVersion) continue
      const rowContext = migration.contextColumn ? row[migration.contextColumn] : migration.context
      if (!rowContext) {
        errors++
        console.error(`  Contexto ausente em ${migration.table} (registro omitido)`)
        continue
      }

      try {
        const plaintext = decryptWithSupportedVersion(oldValue, rowContext as CryptoContext, supported)
        const nextValue = encryptWithFreshIv(plaintext, rowContext as CryptoContext, activeVersion)
        const update: Record<string, unknown> = migration.jsonbKey
          ? { [migration.column]: { ...(row[migration.column] || {}), [migration.jsonbKey]: nextValue } }
          : { [migration.column]: nextValue }
        let updateQuery = supabase.from(migration.table).update(update).eq("id", row.id)
        for (const [key, value] of Object.entries(migration.filters || {})) updateQuery = updateQuery.eq(key, value)
        // Compare-and-swap: never overwrite a value changed after the read.
        updateQuery = updateQuery.eq(migration.column, row[migration.column])
        const { data: changed, error: updateError } = await updateQuery.select("id")
        if (updateError) {
          errors++
          console.error(`  Falha ao atualizar ${migration.table}.${migration.column}: ${updateError.message}`)
        } else if (!changed?.length) {
          conflicts++
        } else {
          migrated++
        }
      } catch (err) {
        errors++
        console.error(`  Falha de descriptografia em ${migration.table}.${migration.column}: ${err instanceof Error ? err.message : "erro desconhecido"}`)
      }
    }
    afterId = rows[rows.length - 1].id
    if (rows.length < PAGE_SIZE) break
  }
  return { migrated, conflicts, errors }
}

async function main() {
  loadEnv()
  const apply = process.argv.includes("--apply")
  const invalidArgs = process.argv.slice(2).filter((arg) => !["--apply", "--dry-run"].includes(arg))
  if (invalidArgs.length) throw new Error(`Argumento desconhecido: ${invalidArgs[0]}`)

  const { activeVersion, supportedVersions } = readCryptoConfig()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias")
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  console.log(`Versão ativa: ${activeVersion}; versões suportadas: ${supportedVersions.join(", ")}`)
  console.log(apply ? "MODO APPLY: alterações serão gravadas." : "SIMULAÇÃO: nenhuma alteração será gravada. Use --apply para executar.")
  console.log("\nPré-verificação das colunas registradas:")

  const scans = new Map<ColumnMigration, ScanResult>()
  for (const migration of MIGRATIONS) {
    const scan = await scanMigration(supabase, migration)
    scans.set(migration, scan)
    printScan(migration, scan, activeVersion)
  }

  const unsupported = new Set<string>()
  const requiredKeys = new Set<KeyVersion>([activeVersion])
  for (const scan of scans.values()) {
    if (scan.malformed) throw new Error("Há valores com prefixo inválido. Corrija-os antes de iniciar qualquer gravação.")
    for (const [version, count] of scan.byVersion) {
      if (!supportedVersions.includes(version)) unsupported.add(version)
      else if (count > 0 && version !== activeVersion) requiredKeys.add(version)
    }
  }
  if (unsupported.size) throw new Error(`Há payloads em versões não declaradas em SUPPORTED_VERSIONS: ${Array.from(unsupported).join(", ")}`)
  for (const version of requiredKeys) getMasterKey(version)

  const pending = Array.from(scans.values()).some((scan) =>
    Array.from(scan.byVersion.entries()).some(([version, count]) => version !== activeVersion && count > 0),
  )
  if (!pending) {
    console.log("\nTudo já está na versão ativa; nenhuma rotação necessária.")
    return
  }
  if (!apply) {
    console.log("\nSimulação concluída. Revise as contagens; para executar, rode novamente com --apply.")
    return
  }

  console.log("\nExecutando rotação com comparação condicional por registro...")
  let totalMigrated = 0
  let totalConflicts = 0
  let totalErrors = 0
  for (const migration of MIGRATIONS) {
    const result = await migrateOne(supabase, migration, supportedVersions, activeVersion)
    totalMigrated += result.migrated
    totalConflicts += result.conflicts
    totalErrors += result.errors
    console.log(`  ${migration.label}: ${result.migrated} migrados, ${result.conflicts} alterados concorrentemente, ${result.errors} erros`)
  }

  console.log("\nVerificação após a rotação:")
  let remaining = 0
  for (const migration of MIGRATIONS) {
    const scan = await scanMigration(supabase, migration)
    const oldCount = Array.from(scan.byVersion.entries()).reduce((sum, [version, count]) => sum + (version === activeVersion ? 0 : count), 0)
    remaining += oldCount + scan.malformed
    console.log(`  ${migration.label}: ${oldCount} payloads antigos; ${scan.malformed} prefixos inválidos`)
  }
  console.log(`\nResumo: ${totalMigrated} migrados; ${totalConflicts} conflitos concorrentes; ${totalErrors} erros; ${remaining} pendentes.`)
  if (totalErrors || remaining) process.exitCode = 1
}

main().catch((error) => {
  console.error(`Rotação interrompida sem confirmar sucesso: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
