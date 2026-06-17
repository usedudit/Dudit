"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { parseNFeFull, type NFMetadata, type ProductFromXML } from "@/lib/xml-parser"
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
  }
  items: ImportItemPreview[]
  errors?: any[] | null
  created_at?: string
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

async function matchProduct(
  supabase: any,
  partnerId: string,
  product: ProductFromXML,
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
        const conflicts = detectConflicts(product, data)
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
        const conflicts = detectConflicts(product, data)
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
        const conflicts = detectConflicts(product, prod)
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
          const conflicts = detectConflicts(product, data)
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
              const conflicts = detectConflicts(product, prod)
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

function detectConflicts(product: ProductFromXML, dbProduct: any): any[] {
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

    // 2. Validar CPF/CNPJ do parceiro (destinatário)
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

    const docsMatch = partnerDoc && xmlDocDest && partnerDoc === xmlDocDest

    // 3. Verificar idempotência
    const { data: existingImport } = await supabase
      .from("xml_imports")
      .select("id, status, created_at")
      .eq("partner_id", partnerId)
      .eq("access_key", metadata.invoice.chave)
      .maybeSingle()

    if (existingImport) {
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

    // 4. Buscar ou preparar fornecedor
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
        })
        .select("id")
        .single()

      if (createErr) {
        return { success: false, error: `Erro ao criar fornecedor: ${createErr.message}` }
      }

      supplierId = newSupplier.id
    }

    // 6. Criar xml_imports
    const { data: xmlImport, error: importErr } = await supabase
      .from("xml_imports")
      .insert({
        partner_id: partnerId,
        supplier_id: supplierId,
        access_key: metadata.invoice.chave,
        invoice_number: metadata.invoice.numero,
        invoice_series: metadata.invoice.serie,
        invoice_date: metadata.invoice.data_emissao || null,
        total_value: metadata.invoice.valor_total,
        supplier_name: metadata.emitente.nome,
        supplier_document: supplier.document,
        supplier_document_type: supplier.documentType,
        supplier_ie: metadata.emitente.ie || null,
        status: "preview",
        raw_xml: xmlContent,
        items_count: metadata.produtos.length,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (importErr) {
      return { success: false, error: `Erro ao registrar importação: ${importErr.message}` }
    }

    // 7. Processar matching para cada produto e criar xml_import_items
    const items: ImportItemPreview[] = []

    for (const prod of metadata.produtos) {
      const match = await matchProduct(supabase, partnerId, prod)

      const { data: item, error: itemErr } = await supabase
        .from("xml_import_items")
        .insert({
          xml_import_id: xmlImport.id,
          raw_sku: prod.codigo || null,
          raw_name: prod.nome,
          raw_ean: prod.gtin || null,
          raw_ncm: prod.ncm || null,
          raw_cest: prod.cest || null,
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
          conflicts: match.conflicts ? JSON.stringify(match.conflicts) : null,
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
      },
      items,
    }

    return { success: true, preview, validation: { docsMatch } }
  } catch (error: any) {
    console.error("Erro no upload XML:", error)
    return { success: false, error: error.message || "Erro interno" }
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
  }>,
): Promise<{ success: boolean; imported?: number; skipped?: number; errors?: string[]; error?: string }> {
  try {
    await requirePartnerAccessWithPermission(partnerId, "products", "create")

    const supabase = await getSupabaseServerClient()
    const user = await requireUser()

    const { data: xmlImport, error: fetchErr } = await supabase
      .from("xml_imports")
      .select("id, status")
      .eq("id", xmlImportId)
      .eq("partner_id", partnerId)
      .single()

    if (fetchErr || !xmlImport) {
      return { success: false, error: "Importação não encontrada" }
    }

    if (xmlImport.status !== "preview") {
      return { success: false, error: "Importação já foi processada" }
    }

    const { data: result, error: rpcErr } = await supabase.rpc("execute_xml_import", {
      p_xml_import_id: xmlImportId,
      p_partner_id: partnerId,
      p_store_id: storeId,
      p_items: decisions,
      p_created_by: user.id,
    })

    if (rpcErr) {
      console.error("Erro RPC execute_xml_import:", rpcErr)
      return { success: false, error: `Erro ao processar importação: ${rpcErr.message}` }
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

    return {
      success: true,
      imported: result.imported || 0,
      skipped: result.skipped || 0,
      errors: result.errors?.length > 0 ? result.errors.map((e: any) => e.error) : undefined,
    }
  } catch (error: any) {
    console.error("Erro ao confirmar importação:", error)
    return { success: false, error: error.message || "Erro interno" }
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

    const preview: ImportPreview & { errors?: any[]; created_at?: string } = {
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
      },
      items: items.map((item: any) => ({
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
        conflicts: item.conflicts,
      })),
      errors: xmlImport.errors,
      created_at: xmlImport.created_at,
    }

    return { success: true, preview }
  } catch (error: any) {
    return { success: false, error: error.message || "Erro interno" }
  }
}

export async function listImportsAction(
  partnerId: string,
  limit = 20,
): Promise<{ success: boolean; imports?: any[]; error?: string }> {
  try {
    const supabase = await getSupabaseServerClient()

    const { data, error } = await supabase
      .from("xml_imports")
      .select(`
        id, access_key, invoice_number, invoice_series, total_value,
        supplier_name, supplier_document, status,
        items_count, imported_items, skipped_items,
        created_at
      `)
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, imports: data }
  } catch (error: any) {
    return { success: false, error: error.message || "Erro interno" }
  }
}
