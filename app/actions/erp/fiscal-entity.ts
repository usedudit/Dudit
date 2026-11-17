"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { requireStoreAccess, requireStorePermission, requireUser } from "@/lib/auth/authorization"
import { logAudit } from "@/lib/observability/audit-log"
import { validateCNPJ, validateCPF } from "@/lib/input-validator"
import { getDreReport } from "@/lib/services/dre.service"
import {
  createNotificationsForUsers,
  getPartnerTeamUserIds,
} from "@/lib/services/notification.service"
import { getNotificationRecipientRoles } from "@/lib/notifications/audience"
import { formatCurrency } from "@/lib/utils"
import { decryptCPF, encryptCPF } from "@/lib/crypto"
import {
  computeRevenueLimitSnapshot,
  detectDocumentType,
  getDefaultAnnualLimit,
  getProratedAnnualLimit,
  normalizeDocument,
  TAX_PROFILE_META,
  type RevenueLimitSnapshot,
  type TaxProfile,
} from "@/lib/fiscal-entity"

export interface FiscalEntityDto {
  id: string
  storeId: string
  partnerId: string
  documentType: "cnpj" | "cpf" | null
  document: string
  taxProfile: TaxProfile
  cnaePrimary: string | null
  cnaeSecondary: string[]
  annualRevenueLimit: number | null
  revenueLimitYear: number | null
  openingDate: string | null
  /** Lojas que compartilham esta entidade fiscal (mesmo CNPJ). */
  sharedStoreIds: string[]
}

export interface RevenueLimitStatus {
  entity: FiscalEntityDto | null
  year: number
  snapshot: RevenueLimitSnapshot
  profileLabel: string
}

type AdminClient = ReturnType<typeof createAdminClient>

function toDto(
  entity: any,
  storeId: string,
  partnerId: string,
  sharedStoreIds: string[],
  displayDocument?: string | null,
): FiscalEntityDto {
  const entityDocument = entity.document || ""
  const document = entityDocument || (displayDocument || "")
  const taxProfile = (entity.tax_profile || "nao_informado") as TaxProfile
  const year = new Date().getFullYear()
  const storedLimit =
    entity.annual_revenue_limit != null && Number(entity.revenue_limit_year) === year
      ? Number(entity.annual_revenue_limit)
      : null
  const annualRevenueLimit = storedLimit ?? getDefaultAnnualLimit(taxProfile, year)

  return {
    id: entity.id,
    storeId,
    partnerId,
    // `fiscal_entities.document` é sempre CNPJ; o CPF exibido vem da loja e
    // nunca é persistido na entidade. O documento real tem prioridade.
    documentType:
      detectDocumentType(entityDocument) ||
      entity.document_type ||
      detectDocumentType(document),
    document,
    taxProfile,
    cnaePrimary: entity.cnae_primary || null,
    cnaeSecondary: Array.isArray(entity.cnae_secondary) ? entity.cnae_secondary : [],
    annualRevenueLimit,
    revenueLimitYear: entity.revenue_limit_year != null ? Number(entity.revenue_limit_year) : null,
    openingDate: entity.opening_date || null,
    sharedStoreIds,
  }
}

async function loadStore(admin: AdminClient, storeId: string) {
  const { data, error } = await admin
    .from("stores")
    .select("id, partner_id, cnpj, cpf, person_type, crt, fiscal_entity_id")
    .eq("id", storeId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error("Loja não encontrada")
  return data as {
    id: string
    partner_id: string
    cnpj: string | null
    cpf: string | null
    person_type: string | null
    crt: string | null
    fiscal_entity_id: string | null
  }
}

/**
 * CPF nunca é gravado em `fiscal_entities` (texto puro). O documento exibido
 * para o usuário vem do CNPJ ou, na falta dele, do CPF criptografado da loja.
 */
async function resolveDisplayDocument(store: {
  cnpj: string | null
  cpf: string | null
}): Promise<string> {
  const cnpj = normalizeDocument(store.cnpj)
  if (cnpj) return cnpj

  if (store.cpf) {
    try {
      const decrypted = normalizeDocument(await decryptCPF(store.cpf))
      if (decrypted.length === 11) return decrypted
    } catch {
      // Legado em texto puro ou chave rotacionada: se o valor cru já for um
      // CPF, exibe-o para não apagar o documento ao salvar o perfil.
      const legacy = normalizeDocument(store.cpf)
      if (legacy.length === 11) return legacy
    }
  }

  return ""
}

/**
 * Vincula à entidade fiscal todas as lojas do parceiro que ainda não têm
 * entidade e cujo documento corresponde ao critério. Roda de forma
 * oportunista (ao abrir as configurações fiscais) para cobrir lojas criadas
 * depois da migração de backfill.
 */
async function linkStoresToEntity(
  admin: AdminClient,
  partnerId: string,
  entityId: string,
  matches: (store: { id: string; cnpj: string | null }) => boolean,
): Promise<void> {
  const { data } = await admin
    .from("stores")
    .select("id, cnpj")
    .eq("partner_id", partnerId)
    .is("fiscal_entity_id", null)

  const ids = (data || [])
    .filter((store: any) => matches(store))
    .map((store: any) => store.id)

  if (ids.length === 0) return

  await admin.from("stores").update({ fiscal_entity_id: entityId }).in("id", ids)
}

async function ensureEntity(admin: AdminClient, store: { id: string; partner_id: string; cnpj: string | null; crt?: string | null; fiscal_entity_id: string | null }) {
  if (store.fiscal_entity_id) {
    const { data } = await admin
      .from("fiscal_entities")
      .select("*")
      .eq("id", store.fiscal_entity_id)
      .eq("partner_id", store.partner_id)
      .maybeSingle()
    if (data) {
      // Loja legada já marcada como SIMEI (CRT 4): reconhece o MEI sem exigir
      // que o usuário reabra as configurações.
      if (store.crt === "4" && store.cnpj && data.tax_profile === "nao_informado") {
        const { data: updated } = await admin
          .from("fiscal_entities")
          .update({ tax_profile: "mei", updated_at: new Date().toISOString() })
          .eq("id", data.id)
          .select("*")
          .single()
        if (updated) return updated
      }
      return data
    }
  }

  const document = normalizeDocument(store.cnpj)

  if (document) {
    const { data: existing } = await admin
      .from("fiscal_entities")
      .select("*")
      .eq("partner_id", store.partner_id)
      .eq("document", document)
      .maybeSingle()

    if (existing) {
      await linkStoresToEntity(
        admin,
        store.partner_id,
        existing.id,
        (candidate) => normalizeDocument(candidate.cnpj) === document,
      )

      if (store.crt === "4" && existing.tax_profile === "nao_informado") {
        const { data: updated } = await admin
          .from("fiscal_entities")
          .update({ tax_profile: "mei", updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select("*")
          .single()
        if (updated) return updated
      }
      return existing
    }
  } else {
    // Pessoa física/nano: uma única entidade sem documento por parceiro.
    const { data: existing } = await admin
      .from("fiscal_entities")
      .select("*")
      .eq("partner_id", store.partner_id)
      .is("document", null)
      .maybeSingle()

    if (existing) {
      await linkStoresToEntity(
        admin,
        store.partner_id,
        existing.id,
        (candidate) => !normalizeDocument(candidate.cnpj),
      )
      return existing
    }
  }

  const { data: created, error } = await admin
    .from("fiscal_entities")
    .insert({
      partner_id: store.partner_id,
      document_type: document ? "cnpj" : null,
      document: document || null,
      tax_profile: document && store.crt === "4" ? "mei" : "nao_informado",
    })
    .select("*")
    .single()

  if (error) {
    // Corrida entre duas chamadas simultâneas (ex.: perfil + limite no mesmo
    // carregamento): a outra pode ter criado a entidade primeiro.
    let raced = admin
      .from("fiscal_entities")
      .select("*")
      .eq("partner_id", store.partner_id)

    raced = document
      ? raced.eq("document", document)
      : raced.is("document", null)

    const { data: existing } = await raced.maybeSingle()
    if (existing) {
      await linkStoresToEntity(
        admin,
        store.partner_id,
        existing.id,
        (candidate) =>
          document
            ? normalizeDocument(candidate.cnpj) === document
            : !normalizeDocument(candidate.cnpj),
      )
      return existing
    }
    throw new Error(error.message)
  }

  await linkStoresToEntity(
    admin,
    store.partner_id,
    created.id,
    (candidate) =>
      document
        ? normalizeDocument(candidate.cnpj) === document
        : !normalizeDocument(candidate.cnpj),
  )
  return created
}

async function loadSharedStoreIds(
  admin: AdminClient,
  entity: { id: string; partner_id: string; document: string | null },
): Promise<string[]> {
  // `linkStoresToEntity` garante que toda loja da mesma identidade fiscal
  // (mesmo CNPJ, ou todas sem documento no caso de PF/nano) aponte para a
  // mesma entidade. Assim o limite nunca soma faturamento de outro CNPJ.
  const { data } = await admin
    .from("stores")
    .select("id")
    .eq("partner_id", entity.partner_id)
    .eq("fiscal_entity_id", entity.id)

  return (data || []).map((s: any) => s.id)
}

export async function getFiscalProfileAction(input: { storeId: string }): Promise<{
  success: boolean
  data?: FiscalEntityDto
  error?: string
}> {
  try {
    await requireUser()
    const admin = createAdminClient()
    const store = await loadStore(admin, input.storeId)
    await requireStoreAccess(input.storeId, store.partner_id)

    const entity = await ensureEntity(admin, store)
    const sharedStoreIds = await loadSharedStoreIds(admin, entity)
    const displayDocument = await resolveDisplayDocument(store)

    return {
      success: true,
      data: toDto(entity, store.id, store.partner_id, sharedStoreIds, displayDocument),
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao carregar perfil fiscal." }
  }
}

export interface SaveFiscalProfileInput {
  storeId: string
  taxProfile: TaxProfile
  document?: string | null
  cnaePrimary?: string | null
  cnaeSecondary?: string[]
  annualRevenueLimit?: number | null
  openingDate?: string | null
}

export async function saveFiscalProfileAction(input: SaveFiscalProfileInput): Promise<{
  success: boolean
  data?: FiscalEntityDto
  error?: string
}> {
  try {
    const user = await requireUser()
    const admin = createAdminClient()
    const store = await loadStore(admin, input.storeId)
    await requireStorePermission(input.storeId, store.partner_id, "stores", "edit")

    const meta = TAX_PROFILE_META[input.taxProfile]
    if (!meta) return { success: false, error: "Perfil tributário inválido." }

    const document = normalizeDocument(input.document)
    const documentType = detectDocumentType(document)

    if (meta.requiresCnpj) {
      if (documentType !== "cnpj") {
        return { success: false, error: "Informe um CNPJ válido para este perfil." }
      }
    } else if (document && !documentType) {
      return { success: false, error: "Documento inválido." }
    }

    if (documentType === "cnpj" && !validateCNPJ(document)) {
      return { success: false, error: "CNPJ inválido. Confira os dígitos." }
    }
    if (documentType === "cpf" && !validateCPF(document)) {
      return { success: false, error: "CPF inválido. Confira os dígitos." }
    }

    if (input.taxProfile === "nano" && documentType === "cnpj") {
      return {
        success: false,
        error: "Nanoempreendedor é pessoa física e não possui CNPJ. Escolha MEI se você tem CNPJ.",
      }
    }

    // CPF não é persistido em `fiscal_entities` (evita texto puro). A entidade
    // fiscal é sempre identificada por CNPJ.
    const entityDocument = documentType === "cnpj" ? document : null

    if (input.cnaePrimary && !/^\d{4}-?\d?\/?\d{0,2}$/.test(input.cnaePrimary.trim())) {
      return { success: false, error: "CNAE inválido. Use o formato 0000-0/00." }
    }

    const entity = await ensureEntity(admin, store)

    // Resolve qual entidade fiscal recebe o perfil. Uma entidade com CNPJ pode
    // ser compartilhada por várias lojas: nunca trocamos o documento dela, pois
    // isso moveria as lojas irmãs para o CNPJ errado.
    async function countStoresOnEntity(entityId: string): Promise<number> {
      const { count } = await admin
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("fiscal_entity_id", entityId)
      return count ?? 0
    }

    async function createEntity(documentValue: string | null): Promise<string> {
      const { data, error } = await admin
        .from("fiscal_entities")
        .insert({
          partner_id: store.partner_id,
          document_type: documentValue ? "cnpj" : null,
          document: documentValue,
        })
        .select("id")
        .single()

      if (error) {
        let raced = admin
          .from("fiscal_entities")
          .select("id")
          .eq("partner_id", store.partner_id)
        raced = documentValue ? raced.eq("document", documentValue) : raced.is("document", null)
        const { data: existing } = await raced.maybeSingle()
        if (existing) {
          await admin.from("stores").update({ fiscal_entity_id: existing.id }).eq("id", store.id)
          return existing.id
        }
        throw new Error(error.message)
      }

      await admin.from("stores").update({ fiscal_entity_id: data.id }).eq("id", store.id)
      return data.id
    }

    let entityId = entity.id

    if (entityDocument) {
      if ((entity.document || "") !== entityDocument) {
        const { data: existing } = await admin
          .from("fiscal_entities")
          .select("id")
          .eq("partner_id", store.partner_id)
          .eq("document", entityDocument)
          .maybeSingle()

        if (existing) {
          entityId = existing.id
        } else if (!entity.document && (await countStoresOnEntity(entity.id)) <= 1) {
          entityId = entity.id
        } else {
          entityId = await createEntity(entityDocument)
        }

        await admin.from("stores").update({ fiscal_entity_id: entityId }).eq("id", store.id)
      }
    } else if (entity.document) {
      // Voltou para PF/nano: usa a entidade sem documento do parceiro.
      const { data: noDocument } = await admin
        .from("fiscal_entities")
        .select("id")
        .eq("partner_id", store.partner_id)
        .is("document", null)
        .maybeSingle()

      entityId = noDocument?.id ?? (await createEntity(null))
      await admin.from("stores").update({ fiscal_entity_id: entityId }).eq("id", store.id)
    }

    // Garante que toda loja da mesma identidade fiscal participe do limite.
    await linkStoresToEntity(
      admin,
      store.partner_id,
      entityId,
      (candidate) =>
        entityDocument
          ? normalizeDocument(candidate.cnpj) === entityDocument
          : !normalizeDocument(candidate.cnpj),
    )

    const year = new Date().getFullYear()
    const defaultLimit = getDefaultAnnualLimit(input.taxProfile, year)
    // Perfis sem teto legal (PF contribuinte / não informado) não guardam limite.
    const rawLimit = meta.hasRevenueLimit
      ? input.annualRevenueLimit != null
        ? Number(input.annualRevenueLimit)
        : defaultLimit
      : null

    const { data: updated, error } = await admin
      .from("fiscal_entities")
      .update({
        document_type: entityDocument ? "cnpj" : null,
        document: entityDocument,
        tax_profile: input.taxProfile,
        cnae_primary: input.cnaePrimary ? input.cnaePrimary.trim() : null,
        cnae_secondary: Array.isArray(input.cnaeSecondary)
          ? input.cnaeSecondary.map((c) => String(c).trim()).filter(Boolean)
          : [],
        annual_revenue_limit: rawLimit != null && rawLimit > 0 ? rawLimit : null,
        revenue_limit_year: rawLimit != null && rawLimit > 0 ? year : null,
        opening_date: input.openingDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entityId)
      .select("*")
      .single()

    if (error) return { success: false, error: error.message }

    // Mantém `stores` em sincronia: billing, vitrine e etiqueta leem daqui.
    const storePatch: Record<string, unknown> = {
      fiscal_entity_id: entityId,
      updated_at: new Date().toISOString(),
    }

    // CRT só existe para quem emite NF-e: MEI = 4 (SIMEI), PF contribuinte = 3
    // (regime normal). Nano/não informado não tem regime codificado. Em
    // `nao_informado` preservamos o CRT legado da loja (ex.: MEI declarado sem
    // CNPJ), para o gate de publicação continuar enxergando a declaração.
    const crt = meta.crt

    if (documentType === "cnpj") {
      storePatch.cnpj = document
      storePatch.cpf = null
      storePatch.person_type = "pj"
      if (crt) storePatch.crt = crt
    } else if (documentType === "cpf") {
      storePatch.cnpj = null
      storePatch.cpf = await encryptCPF(document)
      storePatch.person_type = "pf"
      if (input.taxProfile === "nano") storePatch.crt = null
    } else {
      storePatch.cnpj = null
      storePatch.cpf = null
      storePatch.person_type = "pf"
      if (input.taxProfile === "nano") storePatch.crt = null
    }

    await admin.from("stores").update(storePatch).eq("id", store.id)

    // Propaga o CNPJ para as demais lojas que compartilham a mesma entidade.
    if (entityDocument) {
      const siblingIds = (await loadSharedStoreIds(admin, {
        id: entityId,
        partner_id: store.partner_id,
        document: entityDocument,
      })).filter((id) => id !== store.id)

      if (siblingIds.length > 0) {
        // Em `nao_informado` não sobrescreve o CRT das irmãs: ele pode ser a
        // única evidência de um MEI declarado (ex.: MEI legado sem CNPJ).
        const siblingPatch: Record<string, unknown> = {
          cnpj: entityDocument,
          cpf: null,
          person_type: "pj",
          updated_at: new Date().toISOString(),
        }
        if (crt) siblingPatch.crt = crt
        await admin.from("stores").update(siblingPatch).in("id", siblingIds)
      }
    }

    logAudit("fiscal.profile_updated", {
      partnerId: store.partner_id,
      storeId: store.id,
      entityId,
      taxProfile: input.taxProfile,
      userId: user.id,
    })

    const sharedStoreIds = await loadSharedStoreIds(admin, updated)

    return {
      success: true,
      data: toDto(updated, store.id, store.partner_id, sharedStoreIds, document || null),
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao salvar perfil fiscal." }
  }
}

/**
 * Status do limite anual de faturamento da entidade fiscal da loja.
 * O faturamento é sempre bruto e por competência, somando todas as lojas
 * vinculadas à mesma entidade (MEI não pode ter filial: um CNPJ = um limite).
 */
export async function getRevenueLimitStatusAction(input: { storeId: string }): Promise<{
  success: boolean
  data?: RevenueLimitStatus
  error?: string
}> {
  try {
    await requireUser()
    const admin = createAdminClient()
    const store = await loadStore(admin, input.storeId)
    await requireStoreAccess(input.storeId, store.partner_id)

    const entity = await ensureEntity(admin, store)
    const sharedStoreIds = await loadSharedStoreIds(admin, entity)
    const profile = (entity.tax_profile || "nao_informado") as TaxProfile
    const year = new Date().getFullYear()

    const defaultLimit = getDefaultAnnualLimit(profile, year)
    const configuredLimit =
      entity.annual_revenue_limit != null && Number(entity.revenue_limit_year) === year
        ? Number(entity.annual_revenue_limit)
        : null
    const baseLimit = configuredLimit ?? defaultLimit
    const limit =
      baseLimit != null
        ? getProratedAnnualLimit(baseLimit, year, entity.opening_date)
        : null

    let revenue = 0
    if (limit != null && sharedStoreIds.length > 0) {
      const report = await getDreReport({
        partnerId: store.partner_id,
        allowedStoreIds: sharedStoreIds,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        regime: "competencia",
      })
      revenue = Number(report?.kpis?.grossRevenue || 0)
    }

    const snapshot = computeRevenueLimitSnapshot({
      profile,
      limit,
      revenue,
      year,
    })

    const dto = toDto(
      entity,
      store.id,
      store.partner_id,
      sharedStoreIds,
      await resolveDisplayDocument(store),
    )

    await maybeNotifyRevenueLimit({
      partnerId: store.partner_id,
      entityId: entity.id,
      year,
      snapshot,
      profile,
      profileLabel: TAX_PROFILE_META[profile].shortLabel,
    })

    return {
      success: true,
      data: {
        entity: dto,
        year,
        snapshot,
        profileLabel: TAX_PROFILE_META[profile].shortLabel,
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao calcular o limite de faturamento." }
  }
}

async function maybeNotifyRevenueLimit(params: {
  partnerId: string
  entityId: string
  year: number
  snapshot: RevenueLimitSnapshot
  profile: TaxProfile
  profileLabel: string
}) {
  const { snapshot, year, partnerId, entityId, profile, profileLabel } = params
  if (!snapshot.limit) return

  const exceeded = snapshot.status === "excedido"
  const atOrAboveLimit = snapshot.status === "limite" || snapshot.status === "tolerancia"

  // Nível do alerta serve apenas para escolher título/mensagem. A chave de
  // idempotência abaixo é anual, então o aviso não se repete a cada faixa.
  let level: 80 | 90 | 100 | 120 | "excedido" | null = null
  if (exceeded) level = profile === "mei" ? 120 : "excedido"
  else if (atOrAboveLimit) level = 100
  else if (snapshot.percentage >= 90) level = 90
  else if (snapshot.percentage >= 80) level = 80

  if (level === null) return

  const isExceeded = level === 120 || level === "excedido"
  const isAtLimit = level === 100

  try {
    const userIds = await getPartnerTeamUserIds(
      partnerId,
      getNotificationRecipientRoles("revenue_limit_alert"),
    )
    if (userIds.length === 0) return

    const limitLabel = formatCurrency(snapshot.limit)
    const revenueLabel = formatCurrency(snapshot.revenue)
    const title = isExceeded
      ? `Limite do ${profileLabel} excedido`
      : isAtLimit
        ? `Limite do ${profileLabel} atingido`
        : `${level}% do limite do ${profileLabel}`

    await createNotificationsForUsers(userIds, (userId) => ({
      userId,
      type: "revenue_limit_alert",
      title,
      message: isExceeded
        ? profile === "mei"
          ? `Faturamento de ${revenueLabel} ultrapassou a margem de 20% sobre ${limitLabel}. Há risco de desenquadramento retroativo.`
          : `Faturamento de ${revenueLabel} ultrapassou o limite de ${limitLabel}. O negócio deixa de ser nanoempreendedor e passa a exigir CNPJ técnico e documento fiscal.`
        : isAtLimit
          ? profile === "mei"
            ? `Faturamento de ${revenueLabel} atingiu o limite de ${limitLabel}. Excesso de até 20% mantém o enquadramento com DAS complementar.`
            : `Faturamento de ${revenueLabel} atingiu o limite de ${limitLabel} do nanoempreendedor. Acima dele o negócio passa a exigir CNPJ técnico e documento fiscal.`
          : `Faturamento de ${revenueLabel} já representa ${snapshot.percentage}% do limite anual de ${limitLabel}.`,
      entityType: null,
      entityId,
      data: {
        scope: "partner",
        audience: "seller",
        partner_id: partnerId,
        revenue: snapshot.revenue,
        limit: snapshot.limit,
        percentage: snapshot.percentage,
        year,
      },
      // Um alerta por entidade fiscal/ano/usuário. Antes a chave incluía o
      // nível (80/90/100/120), o que permitia o mesmo aviso reaparecer para
      // cada faixa. Agora é uma única notificação no ano.
      idempotencyKey: `revenue_limit:${entityId}:${year}:${userId}`,
      origin: "system",
    }))
  } catch (err) {
    console.error("[FISCAL] Falha ao notificar limite de faturamento", err)
  }
}
