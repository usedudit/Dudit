"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import { UnosendService } from "@/lib/services/unosend.service"
import { syncToExploreRedis } from "@/lib/redis-sync"

// --- Interfaces Atualizadas ---

interface CreatePartnerData {
  userId: string
  storeName: string
  storeDescription: string
  // Endereço agora é opcional (pode ser string vazia ou null)
  zipCode?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  // Dados fiscais opcionais
  businessType: "pf" | "pj"
  cnpj: string | null
  cpf?: string | null
  // Horários opcionais na criação
  openingHours?: any
  storeImageUrl: string | null
  offeringType: "products" | "services" | "both"
}

// Horários padrão para quando não forem enviados
const defaultOpeningHours = [
  { day: "Monday", isOpen: true, from: "09:00", to: "18:00" },
  { day: "Tuesday", isOpen: true, from: "09:00", to: "18:00" },
  { day: "Wednesday", isOpen: true, from: "09:00", to: "18:00" },
  { day: "Thursday", isOpen: true, from: "09:00", to: "18:00" },
  { day: "Friday", isOpen: true, from: "09:00", to: "18:00" },
  { day: "Saturday", isOpen: false, from: "09:00", to: "13:00" },
  { day: "Sunday", isOpen: false, from: "00:00", to: "00:00" },
]

export async function createPartnerAction(data: CreatePartnerData) {
  await requireRateLimit(RateLimitCategory.PARTNER_REGISTER)
  // SECURITY: Verify the authenticated user matches the claimed userId
  const currentUser = await requireUser()
  if (!currentUser || currentUser.id !== data.userId) {
    return { success: false, error: "Não autorizado" }
  }

  const supabaseAdmin = getAdminClient()

  try {
    const { data: existingPartner } = await supabaseAdmin
      .from("partners")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle()

    if (existingPartner) {
      return { success: false, error: "Você já possui uma conta de parceiro." }
    }

    const { data: duplicateName } = await supabaseAdmin
      .from("partners")
      .select("id")
      .ilike("store_name", data.storeName)
      .maybeSingle()

    if (duplicateName) {
      return { success: false, error: "Já existe uma loja com este nome. Escolha outro nome." }
    }

    let cpfEncrypted = null
    if (data.cpf) {
      const { encryptCPF } = await import("@/lib/crypto")
      try {
        cpfEncrypted = await encryptCPF(data.cpf)
      } catch (error) {
        console.error("Error encrypting CPF:", error)
        return { success: false, error: "Erro ao criptografar CPF" }
      }
    }

    const cnpjClean = data.cnpj ? data.cnpj.replace(/\D/g, "") : null

    const insertData = {
      user_id: data.userId,
      store_name: data.storeName,
      store_description: data.storeDescription || "",
      business_type: data.businessType,
      cnpj: cnpjClean,
      cpf_encrypted: cpfEncrypted,
      opening_hours: data.openingHours || defaultOpeningHours,
      store_image_url: data.storeImageUrl,
      offering_type: data.offeringType,
      sells_products: data.offeringType === "products" || data.offeringType === "both",
      provides_services: data.offeringType === "services" || data.offeringType === "both",
    }

    const { data: partner, error: partnerError } = await supabaseAdmin
      .from("partners")
      .insert(insertData)
      .select()
      .single()

    if (partnerError) {
      return { success: false, error: `Erro ao criar parceria: ${partnerError.message}` }
    }

    // Inserir endereço na tabela addresses (se houver dados de endereço)
    if (data.city || data.street || data.zipCode) {
      await supabaseAdmin.from("addresses").insert({
        partner_id: partner.id,
        zip_code: data.zipCode || null,
        street: data.street || null,
        number: data.number || null,
        complement: data.complement || null,
        neighborhood: data.neighborhood || null,
        city: data.city || null,
        state: data.state || null,
        country: "BR",
        is_default: true,
      })
    }

    // Contas padrão (Caixa/Conta bancária) são gerenciadas por migrations/trigger no banco.

    // Criar métodos de pagamento padrão
    await supabaseAdmin.from("payment_methods").insert([
      {
        partner_id: partner.id,
        name: "Dinheiro",
        payment_type: "dinheiro",
        is_active: true,
      },
      {
        partner_id: partner.id,
        name: "PIX",
        payment_type: "pix",
        is_active: true,
      },
    ])

    // Send partner account created email via Unosend
    try {
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(data.userId)
      const userEmail = authData?.user?.email || null

      if (userEmail) {
        const emailResult = await UnosendService.sendEmail({
          userId: data.userId,
          from: process.env.UNOSEND_FROM_EMAIL || "contato@dudit.com.br",
          to: [{ email: userEmail }],
          subject: "Conta de Parceiro Criada com Sucesso! 🚀",
          // USANDO O TEMPLATE ID QUE VOCÊ ACHOU
          template_id: "37617cfd-fdee-4894-a842-93e2ff7184f6",
          variables: {
            // Garanta que esses nomes são os mesmos que estão entre {{ }} no Unosend
            full_name: data.storeName,
            store_name: data.storeName,
            dashboard_url: "https://dudit.com.br/erp/dashboard"
          }
        })

        if (emailResult.success) {
          console.log("[v0] Partner account created email sent:", emailResult.messageId)
        } else {
          console.warn("[v0] Failed to send partner email:", emailResult.error)
        }
      }
    } catch (emailError) {
      console.error("[v0] Error sending partner creation email:", emailError)
      // Continue anyway, don't fail the partner creation
    }

    // Revalidate only the specific paths affected by partner creation
    revalidatePath("/erp/dashboard")
    revalidatePath("/erp")

    // Revalidate the cached partner status query
    const { revalidatePartnerStatus } = await import("@/lib/utils/revalidation")
    await revalidatePartnerStatus()

    // Redis Sync for Marketplace Vitrines
    await syncToExploreRedis({ id: partner.id, type: "loja", data: {} })

    return { success: true, partnerId: partner.id }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erro inesperado ao criar parceria"
    return { success: false, error: errorMsg }
  }
}

export async function updatePartnerAction(
  partnerId: string,
  data: Partial<CreatePartnerData> & {
    crt?: string
    contribuinte?: string
    inscricaoEstadual?: string | null
    ieIsento?: boolean
    inscricaoMunicipal?: string | null
    csrf_token?: string
  },
) {
  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  // SECURITY: Verify ownership - only owner can update their partner
  const currentUser = await requireUser()
  if (!currentUser) {
    return { error: "Não autenticado" }
  }

  const supabase = await getSupabaseServerClient()

  // Verify this partner belongs to the current user
  const { data: partnerCheck } = await supabase
    .from("partners")
    .select("user_id")
    .eq("id", partnerId)
    .single()

  if (!partnerCheck || partnerCheck.user_id !== currentUser.id) {
    return { error: "Não autorizado" }
  }

  const updateData: any = {}
  if (data.storeName) updateData.store_name = data.storeName
  if (data.storeDescription !== undefined) updateData.store_description = data.storeDescription
  if (data.businessType) updateData.business_type = data.businessType
  if (data.cnpj !== undefined) updateData.cnpj = data.cnpj
  if (data.cpf !== undefined) {
    if (data.cpf) {
      const { encryptCPF } = await import("@/lib/crypto")
      try {
        updateData.cpf_encrypted = await encryptCPF(data.cpf)
      } catch (error) {
        console.error("Error encrypting CPF:", error)
        return { error: "Erro ao criptografar CPF" }
      }
    } else {
      updateData.cpf_encrypted = null
    }
  }
  if (data.openingHours !== undefined) updateData.opening_hours = data.openingHours
  if (data.storeImageUrl !== undefined) updateData.store_image_url = data.storeImageUrl

  if (data.offeringType !== undefined) updateData.offering_type = data.offeringType

  // Campos de endereço vão para a tabela addresses, não para partners
  const addressData: any = {}
  let hasAddressData = false
  if (data.zipCode !== undefined) { addressData.zip_code = data.zipCode; hasAddressData = true }
  if (data.street !== undefined) { addressData.street = data.street; hasAddressData = true }
  if (data.number !== undefined) { addressData.number = data.number; hasAddressData = true }
  if (data.complement !== undefined) { addressData.complement = data.complement; hasAddressData = true }
  if (data.neighborhood !== undefined) { addressData.neighborhood = data.neighborhood; hasAddressData = true }
  if (data.city !== undefined) { addressData.city = data.city; hasAddressData = true }
  if (data.state !== undefined) { addressData.state = data.state; hasAddressData = true }

  if (data.crt !== undefined) updateData.crt = data.crt
  if (data.contribuinte !== undefined) updateData.contribuinte = data.contribuinte
  if (data.inscricaoEstadual !== undefined) updateData.inscricao_estadual = data.inscricaoEstadual
  if (data.ieIsento !== undefined) updateData.ie_isento = data.ieIsento
  if (data.inscricaoMunicipal !== undefined) updateData.inscricao_municipal = data.inscricaoMunicipal

  const { error } = await supabase.from("partners").update(updateData).eq("id", partnerId)

  if (error) {
    return { error: error.message }
  }

  // Atualizar endereço na tabela addresses se houver dados
  if (hasAddressData) {
    const existingAddress = await supabase
      .from("addresses")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("is_default", true)
      .maybeSingle()

    if (existingAddress?.data?.id) {
      // Atualizar endereço existente
      await supabase
        .from("addresses")
        .update(addressData)
        .eq("id", existingAddress.data.id)
    } else {
      // Criar novo endereço
      await supabase.from("addresses").insert({
        partner_id: partnerId,
        ...addressData,
        country: "BR",
        is_default: true,
      })
    }
  }

  revalidatePath("/erp/settings")

  // Redis Sync for Marketplace Vitrines
  await syncToExploreRedis({ id: partnerId, type: "loja", data: {} })

  return { success: true }
}

export async function registerPartner(data: {
  userId: string
  businessType: "pf" | "pj"
  cnpj: string | null
  cpf?: string | null
  sellsProducts: boolean
  providesServices: boolean
  storeName: string
  phone: string
  address: {
    zipCode?: string
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: string
    state?: string
  }
  storeDescription: string
  storeImageUrl: string
  businessHours?: any // Tornado opcional
}) {
  try {
    if (!data.userId) {
      return { success: false, error: "ID do usuário é obrigatório" }
    }

    if (!data.storeName || data.storeName.trim() === "") {
      return { success: false, error: "Nome da loja é obrigatório" }
    }

    let offeringType: "products" | "services" | "both" = "products"
    if (data.sellsProducts && data.providesServices) {
      offeringType = "both"
    } else if (data.providesServices) {
      offeringType = "services"
    }

    const result = await createPartnerAction({
      userId: data.userId,
      storeName: data.storeName,
      storeDescription: data.storeDescription || "",
      // Mapeia endereço (pode ser undefined/string vazia)
      zipCode: data.address.zipCode || null,
      street: data.address.street || null,
      number: data.address.number || "S/N",
      complement: data.address.complement || null,
      neighborhood: data.address.neighborhood || null,
      city: data.address.city || null,
      state: data.address.state || null,
      businessType: data.businessType,
      cnpj: data.cnpj,
      cpf: data.cpf,
      // Usa os horários passados ou o padrão se undefined
      openingHours: data.businessHours || defaultOpeningHours,
      storeImageUrl: data.storeImageUrl,
      offeringType: offeringType,
    })

    return result
  } catch (error) {
    console.error("[RegisterPartner] Erro fatal:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    }
  }
}
