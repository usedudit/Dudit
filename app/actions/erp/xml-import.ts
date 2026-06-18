"use server"

import crypto from "crypto"
import { headers } from "next/headers"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { parseNFeFull, type NFMetadata, type ProductFromXML, type DuplicataFromXML } from "@/lib/xml-parser"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { decryptCPF } from "@/lib/crypto"
import { validateCPF, validateCNPJ } from "@/lib/input-validator"

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

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id, name, cnpj, cpf")
    .eq("partner_id", partnerId)
    .or(`cnpj.eq.${doc},cpf.eq.${doc}`)
    .maybeSingle()

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

  for (const method of order) {
    if (method === "ean" && cleanGtin && cleanGtin.length >= 8) {
      const { data } = await supabase
        .from("products")
        .select("id, name, gtin, stock_quantity, cost_price, unit")
        .eq("partner_id", partnerId)
        .eq("gtin", cleanGtin)
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
): Promise<{ success: boolean; preview?: ImportPreview; error?: string; validation?: any; existingImportId?: string }> {
  try {
    await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)
    await requirePartnerAccessWithPermission(partnerId, "products", "create")

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

    if (!metadata.invoice.chave) {
      return { success: false, error: "Chave da NF-e não encontrada no XML" }
    }

    // 2. Bloqueios fiscais obrigatórios
    if (metadata.invoice.modelo === "65") {
      return { success: false, error: "NFC-e (modelo 65) não é suportada. Aceitamos apenas NF-e modelo 55." }
    }

    if (metadata.invoice.tipo_operacao === "1") {
      return { success: false, error: "NF-e de saída (tpNF=1) não pode ser importada como nota de entrada." }
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

    // 4. Validar situação da NF-e (warnings)
    const warnings: string[] = []

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
      if (fin === "2") warnings.push("NF-e complementar — verifique se os valores estão corretos")
      if (fin === "3") warnings.push("NF-e de ajuste — verifique se deseja importar")
      if (fin === "4") warnings.push("NF-e de devolução — verifique os valores")
    }

    // 5. Validar destinatário da NF
    const { data: partner } = await supabase
      .from("partners")
      .select("id, cpf, cnpj, business_type")
      .eq("id", partnerId)
      .single()

    if (!partner) {
      return { success: false, error: "Parceiro não encontrado" }
    }

    let partnerDoc = ""
    if (partner.business_type === "pj" && partner.cnpj) {
      partnerDoc = partner.cnpj.replace(/\D/g, "")
    } else if (partner.cpf) {
      try {
        partnerDoc = (await decryptCPF(partner.cpf)).replace(/\D/g, "")
      } catch {
        return { success: false, error: "Erro ao descriptografar CPF do parceiro" }
      }
    }

    const xmlDocDest = (metadata.destinatario.cnpj || metadata.destinatario.cpf || "").replace(/\D/g, "")

    if (!partnerDoc || !xmlDocDest) {
      return { success: false, error: "Não foi possível identificar o CNPJ/CPF do destinatário na NF-e ou do parceiro logado." }
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
      ip = h.get("x-forwarded-for") || h.get("x-real-ip") || null
    } catch {
      // headers() pode falhar em alguns ambientes
    }

    // 10. Buscar ou preparar fornecedor
    const supplier = await findOrCreateSupplier(supabase, partnerId, metadata.emitente)

    // 5. Se fornecedor não existe, precisamos criar
    let supplierId = supplier.id
    if (supplier.isNew) {
      const { data: newSupplier, error: createErr } = await supabase
        .from("suppliers")
        .insert({
          partner_id: partnerId,
          name: metadata.emitente.nome,
          nome_fantasia: metadata.emitente.nome_fantasia || metadata.emitente.nome,
          cnpj: supplier.documentType === "cnpj" ? supplier.document : null,
          cpf: supplier.documentType === "cpf" ? supplier.document : null,
          person_type: supplier.documentType === "cnpj" ? "pj" : "pf",
          inscricao_estadual: metadata.emitente.ie || null,
          regime_tributario: metadata.emitente.crt || null,
          email: metadata.emitente.email || null,
          phone: metadata.emitente.fone || null,
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
        await supabase.from("addresses").insert({
          supplier_id: newSupplier.id,
          zip_code: addr.cep || null,
          street: addr.logradouro || null,
          number: addr.numero || null,
          neighborhood: addr.bairro || null,
          city: addr.cidade || null,
          state: addr.uf || null,
          country: addr.pais || "BR",
          municipio_codigo_ibge: addr.codigo_municipio || null,
          is_default: true,
        }).maybeSingle()
      }
    }

    // 11. Criar xml_imports
    const { data: xmlImport, error: importErr } = await supabase
      .from("xml_imports")
      .insert({
        partner_id: partnerId,
        supplier_id: supplierId,
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
        supplier_document: supplier.document,
        supplier_document_type: supplier.documentType,
        supplier_ie: metadata.emitente.ie || null,
        status: "preview",
        raw_xml: xmlContent,
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

    if (importErr) {
      return { success: false, error: friendlyError(importErr.message) }
    }

    // 7. Processar matching para cada produto e criar xml_import_items
    const items: ImportItemPreview[] = []

    for (const prod of metadata.produtos) {
      const match = await matchProduct(supabase, partnerId, prod, supplierId ?? undefined)

      const { data: item, error: itemErr } = await supabase
        .from("xml_import_items")
        .insert({
          xml_import_id: xmlImport.id,
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

    return { success: true, preview, validation: { docsMatch, warnings } }
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
    await requirePartnerAccessWithPermission(partnerId, "products", "create")

    const supabase = await getSupabaseServerClient()
    const user = await requireUser()

    const { data: xmlImport, error: fetchErr } = await supabase
      .from("xml_imports")
      .select("id, status, total_value, supplier_id, duplicatas, partner_id, invoice_number")
      .eq("id", xmlImportId)
      .eq("partner_id", partnerId)
      .single()

    if (fetchErr || !xmlImport) {
      return { success: false, error: "Importação não encontrada" }
    }

    if (xmlImport.status !== "preview") {
      return { success: false, error: "Importação já foi processada" }
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
      const errorMessages = result.errors?.length > 0
        ? result.errors.map((e: any) => e.error).filter(Boolean).join("; ")
        : "Erro desconhecido na importação"
      return {
        success: false,
        error: errorMessages,
        imported: result.imported || 0,
        skipped: result.skipped || 0,
        errors: result.errors?.length > 0 ? result.errors.map((e: any) => e.error) : undefined,
      }
    }

    // Criar contas a pagar se solicitado
    if (createPayables && xmlImport.total_value && xmlImport.supplier_id) {
      const duplicatas: any[] = (xmlImport.duplicatas as any[]) || []
      const transactions = duplicatas.length > 0
        ? duplicatas.map((d: any) => ({
            partner_id: partnerId,
            supplier_id: xmlImport.supplier_id,
            transaction_type: "expense" as const,
            category: "purchasing",
            amount: d.valor,
            description: `NF ${xmlImport.invoice_number || ""} - Parcela ${d.numero || "1"}`,
            due_date: d.vencimento || new Date(Date.now() + 30 * 86400000).toISOString(),
            status: "pending",
            created_by_user_id: user.id,
          }))
        : [{
            partner_id: partnerId,
            supplier_id: xmlImport.supplier_id,
            transaction_type: "expense" as const,
            category: "purchasing",
            amount: xmlImport.total_value,
            description: `NF ${xmlImport.invoice_number || ""}`,
            due_date: new Date(Date.now() + 30 * 86400000).toISOString(),
            status: "pending",
            created_by_user_id: user.id,
          }]

      const { error: txErr } = await supabase.from("transactions").insert(transactions)
      if (txErr) {
        console.error("Erro ao criar contas a pagar:", txErr)
      }
    }

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

export async function getImportPreviewAction(xmlImportId: string, partnerId: string): Promise<{
  success: boolean
  preview?: ImportPreview
  error?: string
}> {
  try {
    const supabase = await getSupabaseServerClient()

    const { data: xmlImport, error: impErr } = await supabase
      .from("xml_imports")
      .select("*")
      .eq("id", xmlImportId)
      .eq("partner_id", partnerId)
      .single()

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
      supplier: {
        id: xmlImport.supplier_id,
        name: xmlImport.supplier_name || "",
        document: xmlImport.supplier_document || "",
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
  },
): Promise<{ success: boolean; imports?: any[]; total?: number; error?: string }> {
  try {
    const supabase = await getSupabaseServerClient()

    let query = supabase
      .from("xml_imports")
      .select(`
        id, access_key, invoice_number, invoice_series, total_value,
        supplier_name, supplier_document, status,
        items_count, imported_items, skipped_items,
        xml_hash, created_by_ip,
        created_at, updated_at, reversed_at, reversal_reason
      `, { count: "exact" })
      .eq("partner_id", partnerId)

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

    return { success: true, imports: data, total: count || undefined }
  } catch (error: any) {
    return { success: false, error: friendlyError(error.message) }
  }
}

export async function revertImportAction(
  xmlImportId: string,
  partnerId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    await requirePartnerAccessWithPermission(partnerId, "products", "create")

    const supabase = await getSupabaseServerClient()
    const user = await requireUser()

    const { data: result, error: rpcErr } = await supabase.rpc("revert_xml_import", {
      p_xml_import_id: xmlImportId,
      p_reason: reason || null,
      p_created_by: user.id,
    })

    if (rpcErr) {
      return { success: false, error: friendlyError(rpcErr.message) }
    }

    if (!result.success) {
      return { success: false, error: result.error || "Erro ao reverter importação" }
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
    const supabase = await getSupabaseServerClient()

    const { data: xmlImport } = await supabase
      .from("xml_imports")
      .select("supplier_id, invoice_number")
      .eq("id", xmlImportId)
      .eq("partner_id", partnerId)
      .single()

    if (!xmlImport) return { success: false, error: "Importação não encontrada" }

    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("supplier_id", xmlImport.supplier_id)
      .ilike("description", `%${xmlImport.invoice_number || ""}%`)
      .order("due_date")

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
