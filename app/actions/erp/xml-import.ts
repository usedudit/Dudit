"use server"

import crypto from "crypto"
import { headers } from "next/headers"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { parseNFeFull, type NFMetadata, type ProductFromXML, type DuplicataFromXML } from "@/lib/xml-parser"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { decryptCPF, encryptCPF, generateCpfLookupHash } from "@/lib/crypto"
import { encrypt as encryptSensitiveValue, decrypt as decryptSensitiveValue } from "@/lib/cryptoService"
import { validateCPF, validateCNPJ, sanitizeInput } from "@/lib/input-validator"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { getPartnerCapabilities } from "@/lib/services/partner-capabilities"
import { checkLimit, canUseFeature, getPartnerPlan, increment_usage_counter } from "@/lib/services/subscription.service"
import { enrichAddressData } from "@/lib/services/location.service"
import { getTrustedClientIP } from "@/lib/security/client-ip"
import { uploadBufferToR2, generateSignedDownloadUrl } from "@/lib/r2/server"
import { R2_PREFIXES } from "@/lib/r2/config"
import { revalidatePath } from "next/cache"
import { revalidateTransactions, revalidateStockMovements, revalidateProducts } from "@/lib/utils/revalidation"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { cleanAndFormatPhone, sanitizeAddressComplement } from "@/lib/utils/phone-utils"

interface ImportPreview {
  xml_import_id: string
  status: string
  supplier: {
    id: string | null
    name: string
    document: string
    documentType: "cpf" | "cnpj"
    isNew: boolean
  }
  invoice: {
    chave: string
    numero: string
    serie: string
    data_emissao: string
    valor_total: number
    modelo?: string
    protocolo?: string
    ambiente?: string
    finalidade?: string
    data_saida?: string
  }
  items: ImportItemPreview[]
  file_key?: string | null
  file_name?: string | null
  errors?: any[] | null
  created_at?: string
  duplicatas?: DuplicataFromXML[]
  fiscal_totals?: Record<string, number>
  transport_data?: Record<string, any>
  inf_cpl?: string
  inf_ad_fisco?: string
  reversed_at?: string
  reversal_reason?: string
  supplier_names?: Record<string, string>
}

interface ImportItemPreview {
  id: string
  raw_sku: string
  raw_name: string
  raw_ean: string | null
  raw_ncm: string | null
  raw_cest: string | null
  raw_unit: string
  raw_quantity: number
  raw_unit_cost: number
  raw_weight_gross: number | null
  raw_weight_net: number | null
  raw_width: number | null
  raw_height: number | null
  raw_length: number | null
  match_status: string
  matched_product_id: string | null
  matched_product_name: string | null
  match_method: string | null
  match_confidence: number | null
  conflicts: any[] | null
}

async function findOrCreateSupplier(
  supabase: any,
  partnerId: string,
  emitente: NFMetadata["emitente"],
): Promise<{ id: string | null; isNew: boolean; document: string; documentType: "cpf" | "cnpj" }> {
  const docType: "cpf" | "cnpj" = emitente.cnpj ? "cnpj" : "cpf"
  const doc = (emitente.cnpj || emitente.cpf || "").replace(/\D/g, "")

  if (!doc) return { id: null, isNew: false, document: doc, documentType: docType }

  if (docType === "cnpj" && !validateCNPJ(doc)) return { id: null, isNew: false, document: doc, documentType: docType }
  if (docType === "cpf" && !validateCPF(doc)) return { id: null, isNew: false, document: doc, documentType: docType }

  const lookup = docType === "cnpj"
    ? supabase.from("suppliers").select("id, name").eq("partner_id", partnerId).eq("cnpj", doc)
    : supabase.from("suppliers").select("id, name").eq("partner_id", partnerId).eq("cpf_lookup_hash", await generateCpfLookupHash(doc))
  const { data: existing } = await lookup.maybeSingle()

  if (existing) {
    return { id: existing.id, isNew: false, document: doc, documentType: docType }
  }

  return { id: null, isNew: true, document: doc, documentType: docType }
}

async function loadProductDetails(supabase: any, productId: string, xmlSupplierId?: string): Promise<{
  fiscal?: { ncm?: string; cest?: string }
  logistics?: { weight_gross?: number; weight_net?: number; width?: number; height?: number; length?: number }
  existingSuppliers?: { supplier_id: string; name?: string }[]
}> {
  const [fiscalRes, logisticsRes, suppliersRes] = await Promise.all([
    supabase.from("product_fiscal_profiles").select("ncm, cest").eq("product_id", productId).maybeSingle(),
    supabase.from("product_logistics").select("weight_gross, weight_net, width, height, length").eq("product_id", productId).maybeSingle(),
    xmlSupplierId
      ? supabase.from("product_suppliers").select("supplier_id").eq("product_id", productId).neq("supplier_id", xmlSupplierId).limit(1)
      : Promise.resolve({ data: [] }),
  ])
  return {
    fiscal: fiscalRes.data || undefined,
    logistics: logisticsRes.data || undefined,
    existingSuppliers: suppliersRes?.data || [],
  }
}

async function matchProduct(
  supabase: any,
  partnerId: string,
  product: ProductFromXML,
  xmlSupplierId?: string,
): Promise<{
  productId: string | null
  productName: string | null
  method: string | null
  confidence: number | null
  matchStatus: string
  conflicts: any[] | null
}> {
  const order = ["ean", "sku_internal", "sku_supplier", "ncm_gtin", "similarity"] as const

  const cleanGtin = product.gtin?.replace(/\D/g, "") || null

  // Produtos arquivados/excluídos nunca são usados como match - sempre criar novo
  const EXCLUDED_STATUSES = "(archived,arquivado,deleted,excluido)"

  for (const method of order) {
    if (method === "ean" && cleanGtin && cleanGtin.length >= 8) {
      const { data } = await supabase
        .from("products")
        .select("id, name, gtin, stock_quantity, cost_price, unit")
        .eq("partner_id", partnerId)
        .eq("gtin", cleanGtin)
        .not("status", "in", EXCLUDED_STATUSES)
        .maybeSingle()

      if (data) {
        const details = await loadProductDetails(supabase, data.id, xmlSupplierId)
        const conflicts = detectConflicts(product, data, details, xmlSupplierId)
        return {
          productId: data.id,
          productName: data.name,
          method: "ean",
          confidence: 1.0,
          matchStatus: conflicts.length > 0 ? "similar" : "matched",
          conflicts,
        }
      }
    }

    if (method === "sku_internal" && product.codigo) {
      const { data } = await supabase
        .from("products")
        .select("id, name, gtin, sku, stock_quantity, cost_price, unit")
        .eq("partner_id", partnerId)
        .eq("sku", product.codigo)
        .not("status", "in", EXCLUDED_STATUSES)
        .maybeSingle()

      if (data) {
        const details = await loadProductDetails(supabase, data.id, xmlSupplierId)
        const conflicts = detectConflicts(product, data, details, xmlSupplierId)
        return {
          productId: data.id,
          productName: data.name,
          method: "sku_internal",
          confidence: 0.95,
          matchStatus: conflicts.length > 0 ? "similar" : "matched",
          conflicts,
        }
      }
    }

    if (method === "sku_supplier" && product.codigo) {
      const { data } = await supabase
        .from("product_suppliers")
        .select("product_id, products!inner(id, name, gtin, stock_quantity, cost_price, unit)")
        .eq("supplier_sku", product.codigo)
        .not("products.status", "in", EXCLUDED_STATUSES)
        .maybeSingle()

      if (data) {
        const prod = data.products as any
        const details = await loadProductDetails(supabase, prod.id, xmlSupplierId)
        const conflicts = detectConflicts(product, prod, details, xmlSupplierId)
        return {
          productId: prod.id,
          productName: prod.name,
          method: "sku_supplier",
          confidence: 0.9,
          matchStatus: conflicts.length > 0 ? "similar" : "matched",
          conflicts,
        }
      }
    }

    if (method === "ncm_gtin" && cleanGtin && product.ncm) {
      const { data } = await supabase
        .from("products")
        .select("id, name, gtin, stock_quantity, cost_price, unit")
        .eq("partner_id", partnerId)
        .eq("gtin", cleanGtin)
        .not("status", "in", EXCLUDED_STATUSES)
        .maybeSingle()

      if (data) {
        const { data: fiscal } = await supabase
          .from("product_fiscal_profiles")
          .select("ncm")
          .eq("product_id", data.id)
          .eq("ncm", product.ncm)
          .maybeSingle()

        if (fiscal) {
          const details = await loadProductDetails(supabase, data.id, xmlSupplierId)
          const conflicts = detectConflicts(product, data, details, xmlSupplierId)
          return {
            productId: data.id,
            productName: data.name,
            method: "ncm_gtin",
            confidence: 0.85,
            matchStatus: conflicts.length > 0 ? "similar" : "matched",
            conflicts,
          }
        }
      }
    }

    if (method === "similarity" && product.nome && product.ncm) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, gtin, stock_quantity, cost_price, unit")
        .eq("partner_id", partnerId)
        .not("status", "in", EXCLUDED_STATUSES)
        .limit(50)

      if (products && products.length > 0) {
        for (const prod of products) {
          const { data: fiscal } = await supabase
            .from("product_fiscal_profiles")
            .select("ncm")
            .eq("product_id", prod.id)
            .eq("ncm", product.ncm)
            .maybeSingle()

          if (fiscal) {
            const sim = similarity(product.nome, prod.name)
            if (sim > 0.6) {
              const details = await loadProductDetails(supabase, prod.id, xmlSupplierId)
              const conflicts = detectConflicts(product, prod, details, xmlSupplierId)
              return {
                productId: prod.id,
                productName: prod.name,
                method: "similarity",
                confidence: Math.round(sim * 100) / 100,
                matchStatus: conflicts.length > 0 ? "similar" : "matched",
                conflicts,
              }
            }
          }
        }
      }
    }
  }

  // Fallback: broader name similarity without NCM restriction
  if (product.nome) {
    const { data: allProducts } = await supabase
      .from("products")
      .select("id, name, gtin, stock_quantity, cost_price, unit")
      .eq("partner_id", partnerId)
      .not("status", "in", EXCLUDED_STATUSES)
      .limit(100)

    if (allProducts && allProducts.length > 0) {
      const MAX_DIST = Math.max(3, Math.floor(product.nome.length * 0.4))
      let best: any = null
      let bestSim = 0

      for (const prod of allProducts) {
        const dist = levenshtein(product.nome.toLowerCase(), prod.name.toLowerCase())
        const sim = 1 - dist / Math.max(product.nome.length, prod.name.length)
        if (sim > bestSim && sim > 0.5) {
          // Require at least some word overlap to avoid false positives
          const xmlWords = new Set(product.nome.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2))
          const prodWords = new Set(prod.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2))
          const overlap = [...xmlWords].filter((w: string) => prodWords.has(w)).length
          if (overlap > 0 || sim > 0.7) {
            best = prod
            bestSim = sim
          }
        }
      }

      if (best) {
        const details = await loadProductDetails(supabase, best.id, xmlSupplierId)
        const conflicts = detectConflicts(product, best, details, xmlSupplierId)
        return {
          productId: best.id,
          productName: best.name,
          method: "similarity_broad",
          confidence: Math.round(bestSim * 100) / 100,
          matchStatus: "similar",
          conflicts,
        }
      }
    }
  }

  return { productId: null, productName: null, method: null, confidence: null, matchStatus: "new", conflicts: null }
}

function detectConflicts(product: ProductFromXML, dbProduct: any, details?: { fiscal?: { ncm?: string; cest?: string }; logistics?: { weight_gross?: number; weight_net?: number; width?: number; height?: number; length?: number }; existingSuppliers?: { supplier_id: string }[] }, xmlSupplierId?: string): any[] {
  const conflicts: any[] = []

  if (product.nome && dbProduct.name) {
    const sim = similarity(product.nome, dbProduct.name)
    if (sim < 0.7) {
      conflicts.push({ campo: "nome", valor_xml: product.nome, valor_atual: dbProduct.name })
    }
  }

  if (product.ncm && dbProduct.ncm) {
    const xmlNcm = product.ncm.replace(/\D/g, "")
    const dbNcm = String(dbProduct.ncm).replace(/\D/g, "")
    if (xmlNcm !== dbNcm) {
      conflicts.push({ campo: "ncm", valor_xml: product.ncm, valor_atual: dbProduct.ncm })
    }
  }

  if (product.gtin && dbProduct.gtin) {
    const xmlGtin = product.gtin.replace(/\D/g, "")
    const dbGtin = String(dbProduct.gtin).replace(/\D/g, "")
    if (xmlGtin !== dbGtin) {
      conflicts.push({ campo: "gtin", valor_xml: product.gtin, valor_atual: dbProduct.gtin })
    }
  }

  if (product.unidade && dbProduct.unit && product.unidade !== dbProduct.unit) {
    conflicts.push({ campo: "unidade", valor_xml: product.unidade, valor_atual: dbProduct.unit })
  }

  // CEST conflict (from fiscal_profiles)
  const dbCest = details?.fiscal?.cest
  if (product.cest && dbCest) {
    const xmlCest = product.cest.replace(/\D/g, "")
    const dbCestClean = String(dbCest).replace(/\D/g, "")
    if (xmlCest !== dbCestClean) {
      conflicts.push({ campo: "cest", valor_xml: product.cest, valor_atual: dbCest })
    }
  }

  // Weight conflicts (from logistics)
  const log = details?.logistics
  if (product.peso_bruto != null && log?.weight_gross != null) {
    if (Math.abs(product.peso_bruto - log.weight_gross) > 0.01) {
      conflicts.push({ campo: "peso_bruto", valor_xml: product.peso_bruto, valor_atual: log.weight_gross })
    }
  }
  if (product.peso_liquido != null && log?.weight_net != null) {
    if (Math.abs(product.peso_liquido - log.weight_net) > 0.01) {
      conflicts.push({ campo: "peso_liquido", valor_xml: product.peso_liquido, valor_atual: log.weight_net })
    }
  }

  // Dimension conflicts
  if (product.largura != null && log?.width != null) {
    if (Math.abs(product.largura - log.width) > 0.1) {
      conflicts.push({ campo: "largura", valor_xml: product.largura, valor_atual: log.width })
    }
  }
  if (product.altura != null && log?.height != null) {
    if (Math.abs(product.altura - log.height) > 0.1) {
      conflicts.push({ campo: "altura", valor_xml: product.altura, valor_atual: log.height })
    }
  }
  if (product.comprimento != null && log?.length != null) {
    if (Math.abs(product.comprimento - log.length) > 0.1) {
      conflicts.push({ campo: "comprimento", valor_xml: product.comprimento, valor_atual: log.length })
    }
  }

  // Fornecedor diferente: produto já vinculado a outro fornecedor
  if (xmlSupplierId && details?.existingSuppliers && details.existingSuppliers.length > 0) {
    conflicts.push({
      campo: "fornecedor_diferente",
      valor_xml: xmlSupplierId,
      valor_atual: details.existingSuppliers[0].supplier_id,
      tipo: "supplier_conflict",
    })
  }

  return conflicts
}

function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim()
  const s2 = b.toLowerCase().trim()

  if (s1 === s2) return 1.0
  if (s1.length < 3 || s2.length < 3) return 0.0

  const longer = s1.length > s2.length ? s1 : s2
  const shorter = s1.length > s2.length ? s2 : s1

  const longerLen = longer.length
  if (longerLen === 0) return 0.0

  const editDist = levenshtein(longer, shorter)
  return (longerLen - editDist) / longerLen
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return dp[m][n]
}

function friendlyError(msg: string): string {
  if (!msg) return "Erro desconhecido"
  const m = msg.toLowerCase()
  if (m.includes("duplicate key") && m.includes("uq_xml_imports_access_key")) return "Esta NF-e já foi importada anteriormente"
  if (m.includes("duplicate key") && m.includes("uq_")) return "Registro duplicado"
  if (m.includes("foreign key constraint") || m.includes("violates foreign key")) return "Referência inválida: o registro relacionado não existe"
  if (m.includes("null value in column") || m.includes("not-null constraint")) return "Campo obrigatório não preenchido"
  if (m.includes("value too long") || m.includes("exceeds maximum length")) return "Valor muito longo para um dos campos"
  if (m.includes("invalid input syntax")) return "Formato inválido para um dos campos"
  if (m.includes("permission denied") || m.includes("42501")) return "Você não tem permissão para executar esta ação"
  if (m.includes("could not find")) return "Registro não encontrado"
  return msg
}

export async function uploadXMLAction(
  xmlContent: string,
  partnerId: string,
  storeId: string,
): Promise<{ success: boolean; preview?: ImportPreview; error?: string; validation?: any; existingImportId?: string; reimported?: boolean }> {
  try {
    await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)
    await requirePermission(partnerId, "products", "create")

    const allowedFeature = await canUseFeature(partnerId, "xml_import")
    if (!allowedFeature) {
      return { success: false, error: "A importação de XML requer o plano Crescer ou superior." }
    }

    // Check monthly XML import limit (Crescer: 20/month, Escalar: unlimited)
    const plan = await getPartnerPlan(partnerId)
    if (plan.slug.toLowerCase() !== "escalar") {
      const xmlLimitCheck = await checkLimit(partnerId, "monthly_xml_imports")
      if (!xmlLimitCheck.allowed) {
        return {
          success: false,
          error: `Limite de importações XML atingido (${xmlLimitCheck.limit}/mês). Faça upgrade para o plano Escalar para importações ilimitadas.`,
        }
      }
    }

    const capabilities = await getPartnerCapabilities(partnerId, { storeId })
    if (!capabilities.hasProducts) {
      return { success: false, error: "O catálogo de produtos não está ativo nas configurações." }
    }

    const supabase = await getSupabaseServerClient()
    const user = await requireUser()

    // 1. Parse total do XML
    let metadata: NFMetadata
    try {
      metadata = parseNFeFull(xmlContent)
    } catch {
      return { success: false, error: "XML inválido ou corrompido" }
    }

    if (metadata.produtos.length === 0) {
      return { success: false, error: "Nenhum produto encontrado no XML" }
    }

    const limitCheck = await checkLimit(partnerId, "items", metadata.produtos.length)
    if (!limitCheck.allowed) {
      return { success: false, error: limitCheck.message || "Limite de itens do catálogo atingido para o seu plano." }
    }

    if (!metadata.invoice.chave) {
      return { success: false, error: "Chave da NF-e não encontrada no XML" }
    }

    // 2. Warnings e bloqueios fiscais
    const warnings: string[] = []

    if (metadata.invoice.modelo === "65") {
      return { success: false, error: "NFC-e (modelo 65) não é suportada. Aceitamos apenas NF-e modelo 55." }
    }

    if (metadata.invoice.tipo_operacao === "1") {
      warnings.push("NF-e de saída (tpNF=1) - o emissor registrou como saída, mas como você é o destinatário, será tratada como entrada normalmente.")
    }

    // 3. Validar autorização SEFAZ
    if (!metadata.invoice.protocolo) {
      return { success: false, error: "NF-e sem protocolo de autorização (nProt). A nota precisa estar autorizada pela SEFAZ." }
    }

    if (metadata.invoice.cstat && metadata.invoice.cstat !== "100") {
      const situacoes: Record<string, string> = {
        "101": "NF-e cancelada",
        "102": "NF-e denegada",
        "103": "NF-e denegada",
        "150": "NF-e denegada",
        "151": "NF-e denegada",
        "107": "NF-e denegada",
      }
      const motivo = situacoes[metadata.invoice.cstat] || `NF-e com situação não autorizada (cStat=${metadata.invoice.cstat})`
      return { success: false, error: motivo }
    }

    // 4. Validar situação da NF-e (warnings adicionais)

    // Warning para NF emitida há mais de 180 dias
    if (metadata.invoice.data_emissao) {
      try {
        const emissao = new Date(metadata.invoice.data_emissao)
        const diffMs = Date.now() - emissao.getTime()
        const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        if (diffDias > 180) {
          warnings.push(`Esta NF foi emitida há mais de 180 dias (${diffDias} dias). Verifique se os dados ainda são válidos antes de importar.`)
        }
      } catch { /* ignore invalid date */ }
    }

    if (metadata.invoice.finalidade) {
      const fin = metadata.invoice.finalidade
      if (fin === "2") warnings.push("NF-e complementar - verifique se os valores estão corretos")
      if (fin === "3") warnings.push("NF-e de ajuste - verifique se deseja importar")
      if (fin === "4") warnings.push("NF-e de devolução - verifique os valores")
    }

    // 5. Validar destinatário da NF
    const { data: partner } = await supabase
      .from("partners")
      .select("id")
      .eq("id", partnerId)
      .single()

    if (!partner) {
      return { success: false, error: "Parceiro não encontrado" }
    }

    let storeQuery = supabase
      .from("stores")
      .select("id, name, cpf, cnpj, person_type")
      .eq("partner_id", partnerId)

    if (storeId) {
      storeQuery = storeQuery.eq("id", storeId)
    } else {
      storeQuery = storeQuery.order("is_headquarters", { ascending: false }).limit(1)
    }
    const { data: storeDoc } = await storeQuery.maybeSingle()

    if (storeDoc?.id && !storeId) {
      storeId = storeDoc.id
    }

    let partnerDoc = ""
    if (storeDoc?.person_type === "pj" && storeDoc?.cnpj) {
      partnerDoc = storeDoc.cnpj.replace(/\D/g, "")
    } else if (storeDoc?.cpf) {
      try {
        partnerDoc = (await decryptCPF(storeDoc.cpf)).replace(/\D/g, "")
      } catch {
        return { success: false, error: "Erro ao descriptografar CPF da loja" }
      }
    }

    const xmlDocDest = (metadata.destinatario.cnpj || metadata.destinatario.cpf || "").replace(/\D/g, "")

    if (!partnerDoc || !xmlDocDest) {
      return { success: false, error: "Não foi possível identificar o CNPJ/CPF do destinatário na NF-e ou da loja atual." }
    }

    if (partnerDoc !== xmlDocDest) {
      return {
        success: false,
        error: `Esta NF-e não pertence à sua empresa. O destinatário na nota é CNPJ/CPF ${xmlDocDest}, mas seu cadastro possui CNPJ/CPF ${partnerDoc}.`,
      }
    }

    const docsMatch = true

    // 6. Calcular hash do XML antes de inserir
    const xmlHash = crypto.createHash("sha256").update(xmlContent).digest("hex")

    // 7. Verificar idempotência + hash divergente
    let isReimport = false
    let reimportId: string | null = null
    const { data: existingImport } = await supabase
      .from("xml_imports")
      .select("id, status, xml_hash, created_at")
      .eq("partner_id", partnerId)
      .eq("access_key", metadata.invoice.chave)
      .maybeSingle()

    if (existingImport) {
      if (existingImport.xml_hash && existingImport.xml_hash !== xmlHash) {
        return {
          success: false,
          error: "CONFLITO CRÍTICO: Já existe uma importação registrada para esta chave NF-e, mas com conteúdo XML diferente. Reprocessamento divergente bloqueado por segurança.",
        }
      }
      if (existingImport.status === "completed") {
        return {
          success: false,
          error: `Nota já importada em ${new Date(existingImport.created_at).toLocaleString("pt-BR")}`,
        }
      }
      if (existingImport.status === "preview") {
        return {
          success: false,
          error: "Esta nota já possui um preview pendente. Finalize ou cancele a importação anterior.",
          existingImportId: existingImport.id,
        }
      }
      // Failed ou Reversed - permite reimportar: atualiza o registro existente
      // Só marca como reimport (mensagem "já foi importada e revertida") quando
      // a importação anterior foi de fato revertida. Falhas não geram essa mensagem.
      if (existingImport.status === "reversed") {
        isReimport = true
        reimportId = existingImport.id
      } else if (existingImport.status === "failed") {
        reimportId = existingImport.id
      }
    }

    // 8. Validar consistência fiscal (soma dos itens vs vNF)
    const ft = metadata.fiscal_totals
    const vNF = metadata.invoice.valor_total
    if (ft && ft.vProd != null && vNF != null && vNF > 0) {
      const somaCalculada = (ft.vProd || 0) + (ft.vFrete || 0) + (ft.vSeg || 0) + (ft.vOutro || 0) - (ft.vDesc || 0)
      const diferenca = Math.abs(somaCalculada - vNF)
      if (diferenca > 0.01) {
        warnings.push(
          `Divergência nos totais fiscais: a soma dos valores (R$ ${somaCalculada.toFixed(2)}) difere do valor total da NF (R$ ${vNF.toFixed(2)}) em R$ ${diferenca.toFixed(2)}. Verifique se os dados estão corretos.`
        )
      }
    }

    // 9. Capturar IP
    let ip: string | null = null
    try {
      const h = await headers()
      ip = getTrustedClientIP(h)
    } catch {
      // headers() pode falhar em alguns ambientes
    }

    // 10. Buscar ou preparar fornecedor
    const supplier = await findOrCreateSupplier(supabase, partnerId, metadata.emitente)
    const formattedPhone = cleanAndFormatPhone(metadata.emitente.fone) || null

    // 5. Se fornecedor não existe, precisamos criar
    let supplierId = supplier.id
    if (supplier.isNew) {
      const { data: newSupplier, error: createErr } = await supabase
        .from("suppliers")
        .insert({
          partner_id: partnerId,
          name: sanitizeInput(metadata.emitente.nome, 150),
          nome_fantasia: sanitizeInput(metadata.emitente.nome_fantasia || metadata.emitente.nome, 150),
          cnpj: supplier.documentType === "cnpj" ? supplier.document : null,
          cpf: supplier.documentType === "cpf" ? await encryptCPF(supplier.document) : null,
          cpf_lookup_hash: supplier.documentType === "cpf" ? await generateCpfLookupHash(supplier.document) : null,
          person_type: supplier.documentType === "cnpj" ? "pj" : "pf",
          inscricao_estadual: metadata.emitente.ie || null,
          crt: metadata.emitente.crt || null,
          email: metadata.emitente.email || null,
          phone: formattedPhone,
        })
        .select("id")
        .single()

      if (createErr) {
        return { success: false, error: friendlyError(createErr.message) }
      }

      supplierId = newSupplier.id

      // Criar endereço do fornecedor a partir do XML
      if (metadata.emitente.endereco) {
        const addr = metadata.emitente.endereco
        const cleanCep = addr.cep ? addr.cep.replace(/\D/g, "").padStart(8, "0") : null
        const cleanComplement = sanitizeAddressComplement(addr.complemento)

        const enrichedXmlAddr = await enrichAddressData({
          supplier_id: newSupplier.id,
          user_id: user.id,
          zip_code: cleanCep,
          street: addr.logradouro || null,
          number: addr.numero || "S/N",
          complement: cleanComplement,
          neighborhood: addr.bairro || null,
          city: addr.cidade || null,
          state: addr.uf || null,
          country: addr.pais || "BR",
          municipio_codigo_ibge: addr.codigo_municipio || null,
          is_default: true,
          address_type: "primary",
        })
        await supabase.from("addresses").insert(enrichedXmlAddr)
      }
    } else if (supplier.id) {
      // Fornecedor já existente: enriquecer dados faltantes ou corrigir telefone bugado
      try {
        const { data: existingSupp } = await supabase
          .from("suppliers")
          .select("phone, email, inscricao_estadual, crt")
          .eq("id", supplier.id)
          .single()

        if (existingSupp) {
          const suppUpdates: Record<string, any> = {}
          const existingPhoneDigits = existingSupp.phone ? existingSupp.phone.replace(/\D/g, "") : ""
          const isPhoneInvalid = !existingSupp.phone || existingSupp.phone.startsWith("(00)") || /^0+$/.test(existingPhoneDigits)

          if (isPhoneInvalid && formattedPhone) {
            suppUpdates.phone = formattedPhone
          }
          if (!existingSupp.email && metadata.emitente.email) {
            suppUpdates.email = metadata.emitente.email
          }
          if (!existingSupp.inscricao_estadual && metadata.emitente.ie) {
            suppUpdates.inscricao_estadual = metadata.emitente.ie
          }
          if (!existingSupp.crt && metadata.emitente.crt) {
            suppUpdates.crt = metadata.emitente.crt
          }

          if (Object.keys(suppUpdates).length > 0) {
            await supabase.from("suppliers").update(suppUpdates).eq("id", supplier.id)
          }

          // Verificar se fornecedor já possui endereço cadastrado
          if (metadata.emitente.endereco) {
            const { data: existingAddrs } = await supabase
              .from("addresses")
              .select("id")
              .eq("supplier_id", supplier.id)
              .limit(1)

            if (!existingAddrs || existingAddrs.length === 0) {
              const addr = metadata.emitente.endereco
              const cleanCep = addr.cep ? addr.cep.replace(/\D/g, "").padStart(8, "0") : null
              const cleanComplement = sanitizeAddressComplement(addr.complemento)

              const enrichedXmlAddr = await enrichAddressData({
                supplier_id: supplier.id,
                user_id: user.id,
                zip_code: cleanCep,
                street: addr.logradouro || null,
                number: addr.numero || "S/N",
                complement: cleanComplement,
                neighborhood: addr.bairro || null,
                city: addr.cidade || null,
                state: addr.uf || null,
                country: addr.pais || "BR",
                municipio_codigo_ibge: addr.codigo_municipio || null,
                is_default: true,
                address_type: "primary",
              })
              await supabase.from("addresses").insert(enrichedXmlAddr)
            }
          }
        }
      } catch (enrichErr) {
        console.error("Erro ao enriquecer dados do fornecedor existente:", enrichErr)
      }
    }

    // 10.5. Upload do XML para o Cloudflare R2
    const fileKey = `users/${user.id}/${R2_PREFIXES.erpInvoices}${metadata.invoice.chave}.xml`
    const fileName = `NFe-${metadata.invoice.numero || metadata.invoice.chave}.xml`
    try {
      await uploadBufferToR2({
        buffer: xmlContent,
        key: fileKey,
        contentType: "application/xml",
      })
    } catch (r2Err) {
      console.error("Erro ao salvar XML da NF-e no Cloudflare R2:", r2Err)
    }

    // 11. Criar ou reabrir xml_imports
    let xmlImport: { id: string } | null = null

    if (reimportId) {
      // Reimportação: limpa dados de reversão e volta para preview
      // Usa admin client porque xml_import_items não tem política de DELETE via RLS
      const admin = getAdminClient()
      const { error: delErr } = await admin.from("xml_import_items").delete().eq("xml_import_id", reimportId)
      if (delErr) console.error("Erro ao limpar items antigos:", delErr)

      const { data: updated, error: updateErr } = await supabase
        .from("xml_imports")
        .update({
          supplier_id: supplierId,
          store_id: storeId,
          invoice_number: metadata.invoice.numero,
          invoice_series: metadata.invoice.serie,
          invoice_date: metadata.invoice.data_emissao || null,
          data_saida: metadata.invoice.data_saida || null,
          modelo: metadata.invoice.modelo || null,
          protocolo: metadata.invoice.protocolo || null,
          cstat: metadata.invoice.cstat || null,
          ambiente: metadata.invoice.ambiente || null,
          finalidade: metadata.invoice.finalidade || null,
          tipo_operacao: metadata.invoice.tipo_operacao || null,
          total_value: metadata.invoice.valor_total,
          supplier_name: metadata.emitente.nome,
          supplier_document: supplier.documentType === "cpf" ? await encryptSensitiveValue(supplier.document, "cpf") : supplier.document,
          supplier_document_type: supplier.documentType,
          supplier_ie: metadata.emitente.ie || null,
          status: "preview",
          raw_xml: await encryptSensitiveValue(xmlContent, "nfe_xml"),
          file_key: fileKey,
          file_name: fileName,
          xml_hash: xmlHash,
          xml_size: Buffer.byteLength(xmlContent, "utf-8"),
          fiscal_totals: metadata.fiscal_totals || null,
          transport_data: metadata.transporte || null,
          inf_cpl: metadata.inf_cpl || null,
          inf_ad_fisco: metadata.inf_ad_fisco || null,
          duplicatas: metadata.duplicatas?.length ? metadata.duplicatas : null,
          items_count: metadata.produtos.length,
          created_by: user.id,
          created_by_ip: ip,
          reversal_movement_id: null,
          reversal_reason: null,
          reversed_at: null,
          reversed_by: null,
          errors: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", reimportId)
        .select("id")
        .single()

      if (updateErr) return { success: false, error: friendlyError(updateErr.message) }
      xmlImport = updated
    } else {
      const { data: created, error: importErr } = await supabase
        .from("xml_imports")
        .insert({
          partner_id: partnerId,
          supplier_id: supplierId,
          store_id: storeId,
          access_key: metadata.invoice.chave,
          invoice_number: metadata.invoice.numero,
          invoice_series: metadata.invoice.serie,
          invoice_date: metadata.invoice.data_emissao || null,
          data_saida: metadata.invoice.data_saida || null,
          modelo: metadata.invoice.modelo || null,
          protocolo: metadata.invoice.protocolo || null,
          cstat: metadata.invoice.cstat || null,
          ambiente: metadata.invoice.ambiente || null,
          finalidade: metadata.invoice.finalidade || null,
          tipo_operacao: metadata.invoice.tipo_operacao || null,
          total_value: metadata.invoice.valor_total,
          supplier_name: metadata.emitente.nome,
          supplier_document: supplier.documentType === "cpf" ? await encryptSensitiveValue(supplier.document, "cpf") : supplier.document,
          supplier_document_type: supplier.documentType,
          supplier_ie: metadata.emitente.ie || null,
          status: "preview",
          raw_xml: await encryptSensitiveValue(xmlContent, "nfe_xml"),
          file_key: fileKey,
          file_name: fileName,
          xml_hash: xmlHash,
          xml_size: Buffer.byteLength(xmlContent, "utf-8"),
          fiscal_totals: metadata.fiscal_totals || null,
          transport_data: metadata.transporte || null,
          inf_cpl: metadata.inf_cpl || null,
          inf_ad_fisco: metadata.inf_ad_fisco || null,
          duplicatas: metadata.duplicatas?.length ? metadata.duplicatas : null,
          items_count: metadata.produtos.length,
          created_by: user.id,
          created_by_ip: ip,
        })
        .select("id")
        .single()

      if (importErr) return { success: false, error: friendlyError(importErr.message) }
      xmlImport = created
    }

    if (!xmlImport) return { success: false, error: "Erro interno ao criar registro de importação" }

    // 7. Processar matching para cada produto e criar xml_import_items
    const items: ImportItemPreview[] = []

    for (const prod of metadata.produtos) {
      const match = await matchProduct(supabase, partnerId, prod, supplierId ?? undefined)

      const { data: item, error: itemErr } = await supabase
        .from("xml_import_items")
        .insert({
          xml_import_id: xmlImport.id,
          store_id: storeId,
          raw_sku: prod.codigo || null,
          raw_name: prod.nome,
          raw_ean: prod.gtin || null,
          raw_ncm: prod.ncm || null,
          raw_cest: prod.cest || null,
          raw_cfop: prod.cfop || null,
          raw_cst: prod.cst || null,
          raw_csosn: prod.csosn || null,
          raw_pis_cst: prod.pis_cst || null,
          raw_cofins_cst: prod.cofins_cst || null,
          raw_ipi_code: prod.ipi_code || null,
          raw_fiscal_detail: prod.fiscal_detail || null,
          raw_fiscal_data: (prod.ncm || prod.cest || prod.cfop || prod.cst || prod.csosn || prod.origem || prod.pis_cst || prod.cofins_cst || prod.ipi_code)
            ? { ncm: prod.ncm, cest: prod.cest, cfop: prod.cfop, cst: prod.cst, csosn: prod.csosn, origem: prod.origem, pis_cst: prod.pis_cst, cofins_cst: prod.cofins_cst, ipi_code: prod.ipi_code }
            : null,
          raw_logistics_data: (prod.peso_bruto != null || prod.peso_liquido != null || prod.largura != null || prod.altura != null || prod.comprimento != null)
            ? { peso_bruto: prod.peso_bruto, peso_liquido: prod.peso_liquido, largura: prod.largura, altura: prod.altura, comprimento: prod.comprimento }
            : null,
          raw_unit: prod.unidade || "UN",
          raw_quantity: prod.estoque_entrada,
          raw_unit_cost: prod.preco_custo,
          raw_total_cost: prod.preco_custo * prod.estoque_entrada,
          raw_weight_gross: prod.peso_bruto || null,
          raw_weight_net: prod.peso_liquido || null,
          raw_width: prod.largura || null,
          raw_height: prod.altura || null,
          raw_length: prod.comprimento || null,
          raw_origin: prod.origem || null,
          match_status: match.matchStatus,
          matched_product_id: match.productId,
          matched_product_name: match.productName,
          match_method: match.method,
          conflicts: match.conflicts || null,
        })
        .select("id")
        .single()

      if (itemErr) {
        console.error("Erro ao criar item:", itemErr)
        continue
      }

      items.push({
        id: item.id,
        raw_sku: prod.codigo || "",
        raw_name: prod.nome,
        raw_ean: prod.gtin || null,
        raw_ncm: prod.ncm || null,
        raw_cest: prod.cest || null,
        raw_unit: prod.unidade || "UN",
        raw_quantity: prod.estoque_entrada,
        raw_unit_cost: prod.preco_custo,
        raw_weight_gross: prod.peso_bruto || null,
        raw_weight_net: prod.peso_liquido || null,
        raw_width: prod.largura || null,
        raw_height: prod.altura || null,
        raw_length: prod.comprimento || null,
        match_status: match.matchStatus,
        matched_product_id: match.productId,
        matched_product_name: match.productName,
        match_method: match.method,
        match_confidence: match.confidence,
        conflicts: match.conflicts,
      })
    }

    // 8. Atualizar contagem
    await supabase
      .from("xml_imports")
      .update({ items_count: items.length })
      .eq("id", xmlImport.id)

    const preview: ImportPreview = {
      xml_import_id: xmlImport.id,
      status: "preview",
      file_key: fileKey,
      file_name: fileName,
      supplier: {
        id: supplierId,
        name: metadata.emitente.nome,
        document: supplier.document,
        documentType: supplier.documentType,
        isNew: false,
      },
      invoice: {
        chave: metadata.invoice.chave,
        numero: metadata.invoice.numero,
        serie: metadata.invoice.serie,
        data_emissao: metadata.invoice.data_emissao,
        valor_total: metadata.invoice.valor_total,
        modelo: metadata.invoice.modelo,
        protocolo: metadata.invoice.protocolo,
        ambiente: metadata.invoice.ambiente,
        finalidade: metadata.invoice.finalidade,
        data_saida: metadata.invoice.data_saida,
      },
      items,
      duplicatas: metadata.duplicatas,
      fiscal_totals: metadata.fiscal_totals,
      transport_data: metadata.transporte,
      inf_cpl: metadata.inf_cpl,
      inf_ad_fisco: metadata.inf_ad_fisco,
    }

    logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "xml_imports",
      entityId: xmlImport.id,
      actionType: "xml_uploaded",
      changeLines: [
        `Upload de NF-e ${metadata.invoice.numero || ""} - ${metadata.produtos.length} produto(s) - ${metadata.emitente.nome}`,
      ],
      source: "manual",
    }).catch(() => { })

    return { success: true, preview, reimported: isReimport, validation: { docsMatch, warnings } }
  } catch (error: any) {
    console.error("Erro no upload XML:", error)
    return { success: false, error: friendlyError(error.message) }
  }
}

export async function confirmImportAction(
  xmlImportId: string,
  partnerId: string,
  storeId: string,
  decisions: Array<{
    item_id: string
    decision: "keep_product" | "update_fields" | "create_product" | "ignore"
    product_id?: string
    stock_action: "add" | "weighted_average" | "ignore"
    cost_action: "update" | "weighted_average" | "ignore"
    decision_data?: {
      update_fields?: string[]
      keep_fields?: string[]
    }
    supplier_action?: "add" | "keep"
  }>,
  createPayables = true,
): Promise<{ success: boolean; imported?: number; skipped?: number; errors?: string[]; error?: string }> {
  try {
    await requirePermission(partnerId, "products", "create")

    const supabase = await getSupabaseServerClient()
    const user = await requireUser()
    const capabilities = await getPartnerCapabilities(partnerId, { storeId })

    const allowedFeature = await canUseFeature(partnerId, "xml_import")
    if (!allowedFeature) {
      return { success: false, error: "A importação de XML requer o plano Crescer ou superior." }
    }

    // Check monthly XML import limit (Crescer: 20/month, Escalar: unlimited)
    const plan = await getPartnerPlan(partnerId)
    if (plan.slug.toLowerCase() !== "escalar") {
      const xmlLimitCheck = await checkLimit(partnerId, "monthly_xml_imports")
      if (!xmlLimitCheck.allowed) {
        return {
          success: false,
          error: `Limite de importações XML atingido (${xmlLimitCheck.limit}/mês). Faça upgrade para o plano Escalar para importações ilimitadas.`,
        }
      }
    }

    if (!capabilities.hasProducts) {
      return { success: false, error: "O catálogo de produtos não está ativo nas configurações." }
    }

    const newProductsCount = decisions.filter((d) => d.decision === "create_product").length
    if (newProductsCount > 0) {
      const limitCheck = await checkLimit(partnerId, "items", newProductsCount)
      if (!limitCheck.allowed) {
        return { success: false, error: limitCheck.message || "Limite de itens do catálogo atingido para o seu plano." }
      }
    }

    const { data: xmlImport, error: fetchErr } = await supabase
      .from("xml_imports")
      .select("id, status, total_value, supplier_id, duplicatas, partner_id, invoice_number, access_key, raw_xml, xml_hash, xml_size, file_key, file_name")
      .eq("id", xmlImportId)
      .eq("partner_id", partnerId)
      .single()

    if (fetchErr || !xmlImport) {
      return { success: false, error: "Importação não encontrada" }
    }

    if (xmlImport.status !== "preview" && xmlImport.status !== "failed") {
      return { success: false, error: "Importação já foi processada" }
    }

    // Garante que o arquivo XML esteja no R2
    let finalFileKey = xmlImport.file_key
    const finalFileName = xmlImport.file_name || `NFe-${xmlImport.invoice_number || xmlImport.access_key}.xml`
    const rawXml = xmlImport.raw_xml
      ? (/^v\d+:/.test(xmlImport.raw_xml) ? await decryptSensitiveValue(xmlImport.raw_xml, "nfe_xml") : xmlImport.raw_xml)
      : null
    const finalFileSize = xmlImport.xml_size || (rawXml ? Buffer.byteLength(rawXml, "utf-8") : 0)
    const finalFileHash = xmlImport.xml_hash || (rawXml ? crypto.createHash("sha256").update(rawXml).digest("hex") : "")

    if (!finalFileKey && rawXml) {
      try {
        finalFileKey = `users/${user.id}/${R2_PREFIXES.erpInvoices}${xmlImport.access_key}.xml`
        await uploadBufferToR2({
          buffer: rawXml,
          key: finalFileKey,
          contentType: "application/xml",
        })
        await supabase.from("xml_imports").update({ file_key: finalFileKey, file_name: finalFileName }).eq("id", xmlImportId)
      } catch (r2Err) {
        console.error("Erro ao subir XML pendente para R2:", r2Err)
      }
    }

    // Build supplier_actions map for RPC
    const supplierActions: Record<string, string> = {}
    for (const d of decisions) {
      if (d.supplier_action) {
        supplierActions[d.item_id] = d.supplier_action
      }
    }

    const { data: result, error: rpcErr } = await supabase.rpc("execute_xml_import", {
      p_xml_import_id: xmlImportId,
      p_partner_id: partnerId,
      p_store_id: storeId,
      p_items: decisions,
      p_supplier_actions: Object.keys(supplierActions).length > 0 ? supplierActions : null,
      p_created_by: user.id,
    })

    if (rpcErr) {
      console.error("Erro RPC execute_xml_import:", rpcErr)
      return { success: false, error: friendlyError(rpcErr.message) }
    }

    if (!result.success) {
      console.error("execute_xml_import retornou erro:", JSON.stringify(result))
      const errorMessages = result.error
        ? String(result.error)
        : result.errors?.length > 0
          ? result.errors.map((e: any) => e.error).filter(Boolean).join("; ")
          : "Erro desconhecido na importação"
      return {
        success: false,
        error: friendlyError(errorMessages),
        imported: result.imported || 0,
        skipped: result.skipped || 0,
        errors: result.errors?.length > 0 ? result.errors.map((e: any) => e.error) : undefined,
      }
    }

    // Vincular XML como anexo nas movimentações de estoque geradas
    if (finalFileKey) {
      try {
        const { data: itemsWithMovements } = await supabase
          .from("xml_import_items")
          .select("stock_movement_id")
          .eq("xml_import_id", xmlImportId)
          .not("stock_movement_id", "is", null)

        const movementIds = [...new Set((itemsWithMovements || []).map((i: any) => i.stock_movement_id).filter(Boolean))]
        if (movementIds.length > 0) {
          const admin = getAdminClient()
          for (const movId of movementIds) {
            const { data: existingAtt } = await admin
              .from("stock_movement_attachments")
              .select("id")
              .eq("stock_movement_id", movId)
              .eq("file_key", finalFileKey)
              .maybeSingle()

            if (!existingAtt) {
              await admin.from("stock_movement_attachments").insert({
                stock_movement_id: movId,
                file_key: finalFileKey,
                file_name: finalFileName,
                file_type: "application/xml",
                file_size: finalFileSize,
                uploaded_by: user.id,
                file_hash: finalFileHash,
              })
            }
          }
        }
      } catch (attErr) {
        console.error("Erro ao vincular anexo às movimentações de estoque:", attErr)
      }
    }

    // Criar contas a pagar apenas se o financeiro estiver ativo e a importação realmente deu certo (sem erros)
    if (capabilities.hasFinancial && createPayables && !(result.errors?.length > 0) && xmlImport.total_value && xmlImport.supplier_id) {
      // Busca supplier para obter nome
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("name, person_type")
        .eq("id", xmlImport.supplier_id)
        .single()

      if (supplier) {
        const supplierLabel = supplier.name || "Fornecedor"
        const duplicatas: any[] = (xmlImport.duplicatas as any[]) || []
        const hasParcelas = duplicatas.length > 1
        const baseDescription = (prefix: string) => `${supplierLabel} - NF ${xmlImport.invoice_number || ""} - ${prefix}`

        const transactions = hasParcelas
          ? duplicatas.map((d: any) => ({
              partner_id: partnerId,
              store_id: storeId,
              contact_id: null,
              contact_type: "supplier" as const,
              transaction_type: "expense" as const,
              category: "Compras",
              amount: d.valor,
              description: baseDescription(`Parcela ${d.numero || "1"}`),
              due_date: d.vencimento || new Date(Date.now() + 30 * 86400000).toISOString(),
              status: "pending",
              origin: "xml_import",
              reference_note: `xml_import:${xmlImportId}`,
              created_by_user_id: user.id,
            }))
          : [{
              partner_id: partnerId,
              store_id: storeId,
              contact_id: null,
              contact_type: "supplier" as const,
              transaction_type: "expense" as const,
              category: "Compras",
              amount: duplicatas.length === 1 ? duplicatas[0].valor : xmlImport.total_value,
              description: baseDescription("À vista"),
              due_date: duplicatas.length === 1
                ? (duplicatas[0].vencimento || new Date(Date.now() + 30 * 86400000).toISOString())
                : new Date(Date.now() + 30 * 86400000).toISOString(),
              status: "pending",
              origin: "xml_import",
              reference_note: `xml_import:${xmlImportId}`,
              created_by_user_id: user.id,
            }]

        const { data: createdTxs, error: txErr } = await supabase.from("transactions").insert(transactions).select("id")
        if (txErr) {
          console.error("Erro ao criar contas a pagar:", txErr)
        } else {
          console.log(`Contas a pagar criadas: ${transactions.length} transacão(ões)`)
          if (finalFileKey && createdTxs && createdTxs.length > 0) {
            try {
              const admin = getAdminClient()
              const txAttachments = createdTxs.map((t: any) => ({
                transaction_id: t.id,
                file_key: finalFileKey,
                file_name: finalFileName,
                file_type: "application/xml",
                file_size: finalFileSize,
                uploaded_by: user.id,
                file_hash: finalFileHash,
              }))
              await admin.from("transaction_attachments").insert(txAttachments)
            } catch (attErr) {
              console.error("Erro ao vincular anexo às contas a pagar:", attErr)
            }
          }
          await revalidateTransactions(partnerId)
          revalidatePath("/erp/contas-a-pagar")
          revalidatePath("/erp/transacoes")
          revalidatePath("/erp/importacao-xml")
        }
      }
    }

    logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "xml_imports",
      entityId: xmlImportId,
      actionType: "xml_imported",
      changeLines: [
        `Importação confirmada - NF-e ${xmlImport.invoice_number || ""} - ${result.imported || 0} produto(s) importados`,
      ],
      metadata: { imported: result.imported, skipped: result.skipped },
      source: "manual",
    }).catch(() => { })

    // Increment monthly XML import counter (only for non-Escalar plans)
    if (plan.slug.toLowerCase() !== "escalar") {
      increment_usage_counter(partnerId, "xml_imports_month_count").catch(() => { })
    }

    await revalidateStockMovements(partnerId)
    await revalidateProducts(partnerId)
    revalidatePath("/erp/produtos")
    revalidatePath("/erp/movimentacao-estoque")
    revalidatePath("/erp/importacao-xml")

    return {
      success: true,
      imported: result.imported || 0,
      skipped: result.skipped || 0,
      errors: result.errors?.length > 0 ? result.errors.map((e: any) => e.error) : undefined,
    }
  } catch (error: any) {
    console.error("Erro ao confirmar importação:", error)
    return { success: false, error: friendlyError(error.message) }
  }
}

export async function getImportPreviewAction(
  xmlImportId: string,
  partnerId: string,
  storeId?: string
): Promise<{
  success: boolean
  preview?: ImportPreview
  error?: string
}> {
  try {
    await requireUser()
    const supabase = await getSupabaseServerClient()

    let query = supabase
      .from("xml_imports")
      .select("*")
      .eq("id", xmlImportId)
      .eq("partner_id", partnerId)

    if (storeId) {
      query = query.eq("store_id", storeId)
    }

    const { data: xmlImport, error: impErr } = await query.single()

    if (impErr || !xmlImport) {
      return { success: false, error: "Importação não encontrada" }
    }

    const { data: items, error: itemsErr } = await supabase
      .from("xml_import_items")
      .select("*")
      .eq("xml_import_id", xmlImportId)
      .order("id")

    if (itemsErr) {
      return { success: false, error: "Erro ao carregar itens" }
    }

    // Resolve supplier names for fornecedor_diferente conflicts
    const supplierIds = new Set<string>()
    for (const item of items) {
      const conflicts = typeof item.conflicts === "string" ? JSON.parse(item.conflicts) : (item.conflicts || [])
      for (const c of conflicts) {
        if (c.campo === "fornecedor_diferente") {
          if (c.valor_xml) supplierIds.add(c.valor_xml)
          if (c.valor_atual) supplierIds.add(c.valor_atual)
        }
      }
    }
    const supplierNameMap: Record<string, string> = {}
    if (supplierIds.size > 0) {
      const { data: supplierRows } = await supabase
        .from("suppliers")
        .select("id, name")
        .in("id", [...supplierIds])
      if (supplierRows) {
        for (const s of supplierRows) {
          supplierNameMap[s.id] = s.name
        }
      }
    }

    const preview: ImportPreview & { errors?: any[]; created_at?: string; supplier_names?: Record<string, string> } = {
      xml_import_id: xmlImport.id,
      status: xmlImport.status,
      file_key: xmlImport.file_key,
      file_name: xmlImport.file_name,
      supplier: {
        id: xmlImport.supplier_id,
        name: xmlImport.supplier_name || "",
        document: xmlImport.supplier_document
          ? (xmlImport.supplier_document_type === "cpf" && /^v\d+:/.test(xmlImport.supplier_document)
            ? await decryptSensitiveValue(xmlImport.supplier_document, "cpf")
            : xmlImport.supplier_document)
          : "",
        documentType: xmlImport.supplier_document_type || "cnpj",
        isNew: false,
      },
      invoice: {
        chave: xmlImport.access_key,
        numero: xmlImport.invoice_number || "",
        serie: xmlImport.invoice_series || "",
        data_emissao: xmlImport.invoice_date || "",
        valor_total: xmlImport.total_value || 0,
        modelo: xmlImport.modelo || undefined,
        protocolo: xmlImport.protocolo || undefined,
        ambiente: xmlImport.ambiente || undefined,
        finalidade: xmlImport.finalidade || undefined,
        data_saida: xmlImport.data_saida || undefined,
      },
      items: items.map((item: any) => {
        const conflicts = typeof item.conflicts === "string" ? JSON.parse(item.conflicts) : (item.conflicts || [])
        // Enrich fornecedor_diferente conflicts with supplier names
        for (const c of conflicts) {
          if (c.campo === "fornecedor_diferente") {
            c.valor_xml_name = supplierNameMap[c.valor_xml] || c.valor_xml
            c.valor_atual_name = supplierNameMap[c.valor_atual] || c.valor_atual
          }
        }
        return {
          id: item.id,
          raw_sku: item.raw_sku || "",
          raw_name: item.raw_name,
          raw_ean: item.raw_ean,
          raw_ncm: item.raw_ncm,
          raw_cest: item.raw_cest,
          raw_unit: item.raw_unit || "UN",
          raw_quantity: item.raw_quantity || 0,
          raw_unit_cost: item.raw_unit_cost || 0,
          raw_weight_gross: item.raw_weight_gross,
          raw_weight_net: item.raw_weight_net,
          raw_width: item.raw_width || null,
          raw_height: item.raw_height || null,
          raw_length: item.raw_length || null,
          match_status: item.match_status,
          matched_product_id: item.matched_product_id,
          matched_product_name: item.matched_product_name || null,
          match_method: item.match_method,
          match_confidence: item.match_confidence,
          conflicts,
        }
      }),
      errors: xmlImport.errors,
      created_at: xmlImport.created_at,
      duplicatas: xmlImport.duplicatas,
      fiscal_totals: xmlImport.fiscal_totals,
      transport_data: xmlImport.transport_data,
      inf_cpl: xmlImport.inf_cpl,
      inf_ad_fisco: xmlImport.inf_ad_fisco,
      reversed_at: xmlImport.reversed_at,
      reversal_reason: xmlImport.reversal_reason,
      supplier_names: supplierNameMap,
    }

    return { success: true, preview }
  } catch (error: any) {
    return { success: false, error: friendlyError(error.message) }
  }
}

export async function listImportsAction(
  partnerId: string,
  options?: {
    limit?: number
    offset?: number
    startDate?: string
    endDate?: string
    supplierId?: string
    status?: string
    invoiceNumber?: string
    accessKey?: string
    storeId?: string
  },
): Promise<{ success: boolean; imports?: any[]; total?: number; error?: string }> {
  try {
    await requireUser()
    const supabase = await getSupabaseServerClient()

    let query = supabase
      .from("xml_imports")
      .select(`
        id, access_key, invoice_number, invoice_series, total_value,
        supplier_name, supplier_document, supplier_document_type, status,
        items_count, imported_items, skipped_items,
        xml_hash, created_by_ip,
        created_at, updated_at, reversed_at, reversal_reason
      `, { count: "exact" })
      .eq("partner_id", partnerId)

    if (options?.storeId) {
      query = query.eq("store_id", options.storeId)
    }

    if (options?.startDate) {
      query = query.gte("created_at", options.startDate)
    }
    if (options?.endDate) {
      query = query.lte("created_at", options.endDate)
    }
    if (options?.supplierId) {
      query = query.eq("supplier_id", options.supplierId)
    }
    if (options?.status) {
      query = query.eq("status", options.status)
    }
    if (options?.invoiceNumber) {
      query = query.ilike("invoice_number", `%${options.invoiceNumber}%`)
    }
    if (options?.accessKey) {
      query = query.ilike("access_key", `%${options.accessKey}%`)
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .limit(options?.limit || 20)
      .range(options?.offset || 0, (options?.offset || 0) + (options?.limit || 20) - 1)

    if (error) {
      return { success: false, error: error.message }
    }

    const imports = await Promise.all((data || []).map(async (row: any) => ({
      ...row,
      supplier_document: row.supplier_document && row.supplier_document_type === "cpf" && /^v\d+:/.test(row.supplier_document)
        ? await decryptSensitiveValue(row.supplier_document, "cpf")
        : row.supplier_document,
    })))
    return { success: true, imports, total: count || undefined }
  } catch (error: any) {
    return { success: false, error: friendlyError(error.message) }
  }
}

export async function revertImportAction(
  xmlImportId: string,
  partnerId: string,
  reason?: string,
  storeId?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    await requirePermission(partnerId, "products", "create")

    const supabase = await getSupabaseServerClient()
    const user = await requireUser()

    const { data: result, error: rpcErr } = await supabase.rpc("revert_xml_import", {
      p_xml_import_id: xmlImportId,
      p_reason: reason || null,
      p_created_by: user.id,
      p_store_id: storeId || null,
    })

    if (rpcErr) {
      return { success: false, error: friendlyError(rpcErr.message) }
    }

    if (!result.success) {
      return { success: false, error: result.error || "Erro ao reverter importação" }
    }

    logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "xml_imports",
      entityId: xmlImportId,
      actionType: "xml_reverted",
      changeLines: [
        `Importação revertida${reason ? ` - Motivo: ${reason}` : ""}`,
      ],
      source: "manual",
    }).catch(() => { })

    // Revalidar financeiro, estoque e produtos
    await revalidateTransactions(partnerId)
    await revalidateStockMovements(partnerId)
    await revalidateProducts(partnerId)
    revalidatePath("/erp/contas-a-pagar")
    revalidatePath("/erp/contas-a-receber")
    revalidatePath("/erp/transacoes")
    revalidatePath("/erp/importacao-xml")
    revalidatePath("/erp/produtos")
    revalidatePath("/erp/movimentacao-estoque")

    // Invalida cache de todos os produtos do XML
    try {
      const { data: xmlItems } = await supabase
        .from("xml_import_items")
        .select("matched_product_id, created_product_id")
        .eq("xml_import_id", xmlImportId)

      for (const item of (xmlItems || [])) {
        const prodId = item.created_product_id || item.matched_product_id
        if (prodId) {
          await invalidateProductCache(prodId, partnerId, 'update', { silent: true })
        }
      }
    } catch (cacheErr) {
      console.error("Erro ao invalidar cache dos produtos revertidos:", cacheErr)
    }

    return { success: true, message: result.message || "Importação revertida com sucesso" }
  } catch (error: any) {
    return { success: false, error: friendlyError(error.message) }
  }
}

export async function getImportFinanceAction(
  xmlImportId: string,
  partnerId: string,
): Promise<{ success: boolean; transactions?: any[]; error?: string }> {
  try {
    await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: xmlImport } = await supabase
      .from("xml_imports")
      .select("supplier_id, invoice_number")
      .eq("id", xmlImportId)
      .eq("partner_id", partnerId)
      .single()

    if (!xmlImport) return { success: false, error: "Importação não encontrada" }

    const invNum = xmlImport.invoice_number?.trim() || ""
    let query = supabase
      .from("transactions")
      .select("*")
      .eq("partner_id", partnerId)

    if (invNum) {
      query = query.or(`reference_note.eq.xml_import:${xmlImportId},reference_note.ilike.xml_import_refund:${xmlImportId}:%,description.ilike.NF ${invNum} - %,description.ilike.Estorno: NF ${invNum}%`)
    } else {
      query = query.or(`reference_note.eq.xml_import:${xmlImportId},reference_note.ilike.xml_import_refund:${xmlImportId}:%`)
    }

    const { data: transactions, error } = await query
      .order("created_at", { ascending: true })
      .order("due_date", { ascending: true })

    if (error) {
      console.error("Erro ao buscar finanças da importação:", error)
      return { success: false, error: error.message }
    }

    return { success: true, transactions: transactions || [] }
  } catch (error: any) {
    return { success: false, error: friendlyError(error.message) }
  }
}

export async function getImportStockMovementsAction(
  xmlImportId: string,
  partnerId: string,
): Promise<{ success: boolean; movements?: any[]; error?: string }> {
  try {
    await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: items } = await supabase
      .from("xml_import_items")
      .select("stock_movement_id, match_status, matched_product_id, created_product_id, raw_name, raw_quantity, raw_unit_cost")
      .eq("xml_import_id", xmlImportId)

    if (!items) return { success: true, movements: [] }

    const movementIds = items
      .map((i: any) => i.stock_movement_id)
      .filter(Boolean)

    const { data: movements } = await supabase
      .from("stock_movements")
      .select("*, stock_movement_items(*)")
      .in("id", movementIds)

    return { success: true, movements: movements || [] }
  } catch (error: any) {
    return { success: false, error: friendlyError(error.message) }
  }
}

export async function getXmlImportTimelineAction(
  xmlImportId: string,
  partnerId: string,
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    await requireUser()
    await requirePermission(partnerId, "products", "view")

    const supabase = await getSupabaseServerClient()

    const { data: entries, error } = await supabase
      .from("audit_logs")
      .select("id, actor_user_id, action_type, change_lines, metadata, created_at")
      .eq("partner_id", partnerId)
      .eq("entity_type", "xml_imports")
      .eq("entity_id", xmlImportId)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) return { success: false, error: "Erro ao carregar histórico" }

    const actorIds = [...new Set((entries || []).map((e: any) => e.actor_user_id).filter(Boolean))]
    const namesMap = new Map<string, string>()

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, full_name")
        .in("user_id", actorIds)

      if (profiles) {
        for (const p of profiles) {
          namesMap.set(p.user_id, p.full_name?.trim() || "Usuário")
        }
      }
    }

    const data = (entries || []).map((e: any) => ({
      id: e.id,
      actor_name: e.actor_user_id ? (namesMap.get(e.actor_user_id) || "Usuário") : "Sistema",
      change_lines: Array.isArray(e.change_lines) ? e.change_lines : [String(e.change_lines || "")],
      created_at: e.created_at,
      metadata: e.metadata || null,
      entry_type: e.action_type || "",
    }))

    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: friendlyError(error.message) }
  }
}

export async function getXmlImportDownloadUrlAction(
  xmlImportId: string,
  partnerId: string
): Promise<{ success: true; downloadUrl: string; fileName: string } | { success: false; error: string }> {
  try {
    const user = await requireUser()
    await requirePermission(partnerId, "products", "view")

    const supabase = await getSupabaseServerClient()
    const { data: xmlImport, error } = await supabase
      .from("xml_imports")
      .select("file_key, file_name, access_key, invoice_number, raw_xml")
      .eq("id", xmlImportId)
      .eq("partner_id", partnerId)
      .single()

    if (error || !xmlImport) {
      return { success: false, error: "Importação não encontrada" }
    }

    const fileName = xmlImport.file_name || `NFe-${xmlImport.invoice_number || xmlImport.access_key}.xml`

    let fileKey = xmlImport.file_key
    const rawXml = xmlImport.raw_xml
      ? (/^v\d+:/.test(xmlImport.raw_xml) ? await decryptSensitiveValue(xmlImport.raw_xml, "nfe_xml") : xmlImport.raw_xml)
      : null
    if (!fileKey && rawXml) {
      fileKey = `users/${user.id}/${R2_PREFIXES.erpInvoices}${xmlImport.access_key}.xml`
      try {
        await uploadBufferToR2({
          buffer: rawXml,
          key: fileKey,
          contentType: "application/xml",
        })
        await supabase.from("xml_imports").update({ file_key: fileKey, file_name: fileName }).eq("id", xmlImportId)
      } catch (err) {
        console.error("Erro ao subir XML tardio para R2:", err)
      }
    }

    if (!fileKey) {
      return { success: false, error: "Arquivo XML não disponível no R2" }
    }

    const downloadUrl = await generateSignedDownloadUrl(fileKey)
    return { success: true, downloadUrl, fileName }
  } catch (err: any) {
    return { success: false, error: friendlyError(err.message) }
  }
}
