"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { parseNFeXML, mapNFeToProductData } from "@/lib/xml-parser"
import { generateSKUBase, generateSKUWithSuffix } from "@/lib/utils/code-generators"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { UNITS } from "@/lib/constants/product-constants"

interface CPFCNPJValidationResult {
  isValid: boolean
  message?: string
  partnerDoc?: string
  xmlDoc?: string
}

async function validatePartnerCPFCNPJ(
  partnerId: string,
  xmlContent: string,
  supabase: any,
): Promise<CPFCNPJValidationResult> {
  try {
    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .select("cpf, cnpj")
      .eq("id", partnerId)
      .single()

    if (partnerError || !partner) {
      return { isValid: false, message: "Parceiro não encontrado" }
    }

    const partnerDoc = (partner.cnpj || partner.cpf || "").replace(/\D/g, "")
    if (!partnerDoc) {
      return { isValid: false, message: "CPF/CNPJ do parceiro não cadastrado" }
    }

    const cleanXml = xmlContent.replace(/xmlns[^=]*="[^"]*"/g, "")

    const destMatch = cleanXml.match(/<dest>([\s\S]*?)<\/dest>/)
    if (!destMatch) {
      return { isValid: false, message: "Destinatário não encontrado no XML" }
    }

    const destContent = destMatch[1]

    const cnpjMatch = destContent.match(/<CNPJ>(.*?)<\/CNPJ>/)
    const cpfMatch = destContent.match(/<CPF>(.*?)<\/CPF>/)

    const xmlDoc = (cnpjMatch?.[1] || cpfMatch?.[1] || "").replace(/\D/g, "")

    if (!xmlDoc) {
      return { isValid: false, message: "CPF/CNPJ não encontrado no XML" }
    }

    if (partnerDoc !== xmlDoc) {
      return {
        isValid: false,
        message: `CPF/CNPJ não corresponde. Cadastrado: ${partnerDoc}, XML: ${xmlDoc}`,
        partnerDoc,
        xmlDoc,
      }
    }

    return { isValid: true }
  } catch (error) {
    console.error("Erro ao validar CPF/CNPJ:", error)
    return { isValid: false, message: "Erro ao validar documentos" }
  }
}

export async function importProductsFromXMLAction(xmlContent: string, partnerId: string, storeId: string) {
  console.log("Iniciando importação XML...")

  try {
    await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)

    const supabase = await getSupabaseServerClient()

    const user = await requireUser()

    // SECURITY: Verify caller has product-create access for this partner
    await requirePermission(partnerId, "products", "create")

    const validation = await validatePartnerCPFCNPJ(partnerId, xmlContent, supabase)
    if (!validation.isValid) {
      return {
        success: false,
        error: "Validação de documento",
        validationError: validation.message,
        requiresConfirmation: true,
        partnerDoc: validation.partnerDoc,
        xmlDoc: validation.xmlDoc,
      }
    }

    let produtosBrutos
    try {
      produtosBrutos = parseNFeXML(xmlContent)
    } catch (e) {
      return { success: false, error: "XML inválido ou corrompido" }
    }

    if (produtosBrutos.length === 0) return { success: false, error: "Nenhum produto encontrado no XML" }

    const productsToProcess = produtosBrutos.map((p) => mapNFeToProductData(p))

    console.log(`${productsToProcess.length} produtos mapeados. Processando...`)

    const codigosUnidadesValidas = new Set<string>(UNITS)

    const importedProducts = []
    const updatedProducts = []
    const errors = []
    const brasiliaOffset = -3 * 60
    const now = new Date()
    const brasiliaTime = new Date(now.getTime() + brasiliaOffset * 60 * 1000)

    for (const product of productsToProcess) {
      try {
        if (!product.unit || !codigosUnidadesValidas.has(product.unit)) {
          product.unit = "UN"
        }

        let existingProduct = null

        if (product.gtin) {
          const { data } = await supabase
            .from("products")
            .select("*")
            .eq("partner_id", partnerId)
            .eq("gtin", product.gtin)
            .maybeSingle()
          existingProduct = data
        }

        if (!existingProduct && product.name) {
          const { data } = await supabase
            .from("products")
            .select("*")
            .eq("partner_id", partnerId)
            .ilike("name", `%${product.name}%`)
            .maybeSingle()
          existingProduct = data
        }

        if (existingProduct) {
          const newStock = (existingProduct.stock_quantity || 0) + (product.stock_quantity || 0)

          const { data: updated, error: updateError } = await supabase
            .from("products")
            .update({
              stock_quantity: newStock,
              updated_at: brasiliaTime.toISOString(),
            })
            .eq("id", existingProduct.id)
            .select()
            .single()

          if (updateError) {
            errors.push(`${product.name}: Erro ao atualizar estoque - ${updateError.message}`)
          } else {
            updatedProducts.push(updated)
            console.log(`Estoque atualizado: ${product.name} (${existingProduct.stock_quantity} → ${newStock})`)
          }
        } else {
          let inserted = null
          let generatedSku = ""
          let finalError = null

          for (let attempt = 0; attempt < 3; attempt++) {
            generatedSku = attempt === 0 ? generateSKUBase(product.name) : generateSKUWithSuffix(generateSKUBase(product.name), attempt)

            const dbPayload = {
              ...product,
              sku: generatedSku,
              partner_id: partnerId,
              store_id: storeId,
              is_active: true,
              created_at: brasiliaTime.toISOString(),
              updated_at: brasiliaTime.toISOString(),
              description: product.name,
              category: "Geral",
              images: [],
              show_price_in_store: true,
              item_type: "00",
              tax_percentage: 0,
            }

            const { data, error: insertError } = await supabase
              .from("products")
              .insert(dbPayload)
              .select()
              .single()

            if (!insertError) {
              inserted = data
              finalError = null
              break
            }

            if (insertError.code === '23505' || insertError.message?.includes('unique')) {
              finalError = insertError
              continue
            }

            finalError = insertError
            break
          }

          if (finalError) {
            console.error(`Erro ao importar ${product.name}:`, finalError.message)
            errors.push(`${product.name}: ${finalError.message}`)
          } else {
            importedProducts.push(inserted!)
            console.log(`Produto criado: ${product.name} (SKU: ${generatedSku})`)
          }
        }
      } catch (err: any) {
        errors.push(`${product.name}: ${err.message}`)
      }
    }

    const totalProcessed = importedProducts.length + updatedProducts.length

    if (errors.length > 0 && totalProcessed === 0) {
      return { success: false, error: "Falha total na importação", errors }
    }

    return {
      success: true,
      importedCount: importedProducts.length,
      updatedCount: updatedProducts.length,
      message: `${importedProducts.length} criados, ${updatedProducts.length} atualizados`,
      error: errors.length > 0 ? "Alguns produtos falharam" : null,
      errors: errors.length > 0 ? errors : undefined,
    }
  } catch (error) {
    console.error("Erro crítico:", error)
    return { success: false, error: "Erro interno no servidor" }
  }
}
