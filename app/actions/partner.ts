"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import { SMTP2GOService } from "@/lib/services/smtp2go.service"
import { syncToExploreRedis, syncPartnerItemsToExploreRedis } from "@/lib/redis-sync"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { geocodeAddress, enrichAddressData } from "@/lib/services/location.service"
import { getRandomDefaultBanner } from "@/lib/utils/banner"

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
  personType: "pf" | "pj"
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
      .from("stores")
      .select("id")
      .ilike("name", data.storeName)
      .maybeSingle()

    if (duplicateName) {
      return { success: false, error: "Já existe uma loja com este nome. Escolha outro nome." }
    }

    let cpfEncrypted = null
    if (data.cpf) {
      const cleanCPF = String(data.cpf).replace(/\D/g, "")
      if (cleanCPF) {
        const { encryptCPF } = await import("@/lib/crypto")
        try {
          cpfEncrypted = await encryptCPF(cleanCPF)
        } catch (error) {
          console.error("Error encrypting CPF:", error)
          return { success: false, error: "Erro ao criptografar CPF" }
        }
      }
    }

    const cnpjClean = data.cnpj ? data.cnpj.replace(/\D/g, "") : null

    const insertData: any = {
      user_id: data.userId,
      business_info: {
        sells: data.offeringType === "both" ? ["products", "services"] : data.offeringType === "services" ? ["services"] : ["products"],
        mode: "erp",
      },
    }

    let coords: { lat: number; lng: number } | null = null
    if (data.city || data.street || data.zipCode) {
      const fullAddressString = [data.street, data.number, data.neighborhood, data.city, data.state, "BR"].filter(Boolean).join(", ")
      try {
        coords = await geocodeAddress(fullAddressString)
      } catch (e) {
        console.error("[createPartnerAction] Geocoding failed:", e)
      }
    }

    const { data: partner, error: partnerError } = await supabaseAdmin
      .from("partners")
      .insert(insertData)
      .select()
      .single()

    if (partnerError) {
      return { success: false, error: `Erro ao criar parceria: ${partnerError.message}` }
    }

    // Auto-create default headquarters store for the partner
    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .insert({
        partner_id: partner.id,
        name: data.storeName,
        slug: data.storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        description: data.storeDescription || "",
        logo_url: data.storeImageUrl || null,
        banner_url: getRandomDefaultBanner(),
        opening_hours: data.openingHours || defaultOpeningHours,
        person_type: data.personType,
        cnpj: cnpjClean,
        cpf: cpfEncrypted,
        is_headquarters: true,
        is_active: true,
        is_showcase_active: true,
      })
      .select("id")
      .single()

    if (storeError) {
      console.error("[createPartnerAction] Failed to create default store:", storeError.message)
    }

    // Inicializar contadores de uso (usage_counters) para o parceiro
    await supabaseAdmin
      .from("usage_counters")
      .insert({ partner_id: partner.id })
      .select("partner_id")
      .single()

    // Inserir endereço na tabela addresses e linkar com a loja
    if (data.city || data.street || data.zipCode) {
      let resolvedLat = coords?.lat || null
      let resolvedLng = coords?.lng || null

      if (store?.id) {
        const enrichedStore = await enrichAddressData({
          store_id: store.id,
          zip_code: data.zipCode || null,
          street: data.street || null,
          number: data.number || null,
          complement: data.complement || null,
          neighborhood: data.neighborhood || null,
          city: data.city || null,
          state: data.state || null,
          country: "BR",
          is_default: true,
          address_type: "primary",
          latitude: resolvedLat,
          longitude: resolvedLng,
        })

        resolvedLat = enrichedStore.latitude ?? resolvedLat
        resolvedLng = enrichedStore.longitude ?? resolvedLng

        const { error: addressError } = await supabaseAdmin
          .from("addresses")
          .insert(enrichedStore)

        if (addressError) {
          console.error("[createPartnerAction] Failed to create store address:", addressError.message)
        }
      }

      // Inserir/atualizar endereço do usuário
      if (currentUser?.id) {
        const { data: existingUserAddr } = await supabaseAdmin
          .from("addresses")
          .select("id")
          .eq("user_id", currentUser.id)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle()

        const enrichedUser = await enrichAddressData({
          user_id: currentUser.id,
          zip_code: data.zipCode || null,
          street: data.street || null,
          number: data.number || null,
          complement: data.complement || null,
          neighborhood: data.neighborhood || null,
          city: data.city || null,
          state: data.state || null,
          country: "BR",
          is_default: true,
          address_type: "casa",
          latitude: resolvedLat,
          longitude: resolvedLng,
        })

        if (!existingUserAddr) {
          await supabaseAdmin.from("addresses").insert(enrichedUser)
        } else {
          await supabaseAdmin.from("addresses").update(enrichedUser).eq("id", existingUserAddr.id)
        }
      }
    }

    // Contas padrão (Caixa/Conta bancária) são gerenciadas por migrations/trigger no banco.

    // Criar métodos de pagamento padrão
    await supabaseAdmin.from("payment_methods").insert([
      {
        partner_id: partner.id,
        name: "Dinheiro",
        payment_type: "dinheiro",
        type: "cash",
        is_active: true,
      },
      {
        partner_id: partner.id,
        name: "Pix",
        payment_type: "pix",
        type: "pix",
        is_active: true,
      },
      {
        partner_id: partner.id,
        name: "Cartão de Credito",
        payment_type: "credito",
        type: "credit_card",
        is_active: true,
      },
      {
        partner_id: partner.id,
        name: "Cartao de Debito",
        payment_type: "debito",
        type: "debit_card",
        is_active: true,
      },
    ])

    // Send partner account created email via SMTP2GO
    try {
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(data.userId)
      const userEmail = authData?.user?.email || null

      if (userEmail) {
        const emailResult = await SMTP2GOService.sendEmail({
          userId: data.userId,
          from: process.env.SMTP2GO_FROM_EMAIL || "contato@dudit.com.br",
          to: [{ email: userEmail }],
          subject: "Conta de Parceiro Criada com Sucesso! 🚀",
          html: `<h1>Conta de parceiro criada com sucesso!</h1><p>Olá, ${data.storeName}.</p><p>Sua conta já está pronta para uso na Dudit.</p><p><a href="https://dudit.com.br/erp/inicio">Acessar o ERP</a></p>`,
          text: `Olá, ${data.storeName}. Sua conta de parceiro foi criada com sucesso. Acesse https://dudit.com.br/erp/inicio para entrar na Dudit.`,
        })

        if (emailResult.success) {
          console.log("Partner account created email sent:", emailResult.messageId)
        } else {
          console.warn("Failed to send partner email:", emailResult.error)
        }
      }
    } catch (emailError) {
      console.error("Error sending partner creation email:", emailError)
      // Continue anyway, don't fail the partner creation
    }

    // Revalidate only the specific paths affected by partner creation
    revalidatePath("/erp/inicio")
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

  // Verify this partner exists and user has permission
  const { data: partnerCheck } = await supabase
    .from("partners")
    .select("user_id")
    .eq("id", partnerId)
    .single()

  if (!partnerCheck) {
    return { error: "Parceiro não encontrado" }
  }

  const isOwner = partnerCheck.user_id === currentUser.id
  if (!isOwner) {
    const { checkPartnerPermission } = await import("@/lib/auth/authorization")
    const permission = await checkPartnerPermission(partnerId, "settings" as any, "settings_negocio")
    if (!permission.allowed) {
      return { error: "Não autorizado" }
    }
  }

  // Get current store and address from stores table
  const { data: currentStore } = await supabase
    .from("stores")
    .select("name, last_seo_update_at, addresses(*)")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  const currentStoreName = currentStore?.name || ""
  const storeAddress = currentStore?.addresses?.find((a: any) => a.is_default) || currentStore?.addresses?.[0]

  // Verificar se há mudanças sensíveis a SEO (nome da loja, cidade, estado)
  const isSeoSensitiveChange =
    (data.storeName && data.storeName !== currentStoreName) ||
    (data.city !== undefined && data.city !== storeAddress?.city) ||
    (data.state !== undefined && data.state !== storeAddress?.state)

  if (isSeoSensitiveChange) {
    if (currentStore?.last_seo_update_at) {
      const lastUpdate = new Date(currentStore.last_seo_update_at)
      const daysSinceUpdate = (new Date().getTime() - lastUpdate.getTime()) / (1000 * 3600 * 24)
      if (daysSinceUpdate < 15) {
        return { error: `Você só pode alterar o nome e a cidade da loja a cada 15 dias. Próxima alteração permitida em: ${new Date(lastUpdate.getTime() + 15 * 24 * 3600 * 1000).toLocaleDateString('pt-BR')}` }
      }
    }
  }

  // Handle store updates (headquarters store) - all fiscal fields moved per-store
  const storeUpdateData: Record<string, any> = {}
  if (isSeoSensitiveChange) {
    storeUpdateData.last_seo_update_at = new Date().toISOString()
  }
  if (data.storeName) storeUpdateData.name = data.storeName
  if (data.storeDescription !== undefined) storeUpdateData.description = data.storeDescription
  if (data.openingHours !== undefined) storeUpdateData.opening_hours = normalizeOpeningHours(data.openingHours)
  if (data.storeImageUrl !== undefined) storeUpdateData.logo_url = data.storeImageUrl
  if (data.personType) storeUpdateData.person_type = data.personType
  if (data.cnpj !== undefined) storeUpdateData.cnpj = data.cnpj
  if (data.cpf !== undefined) {
    const cleanCPF = data.cpf ? String(data.cpf).replace(/\D/g, "") : null
    if (cleanCPF) {
      const { encryptCPF } = await import("@/lib/crypto")
      try {
        storeUpdateData.cpf = await encryptCPF(cleanCPF)
      } catch (error) {
        console.error("Error encrypting CPF:", error)
        return { error: "Erro ao criptografar CPF" }
      }
    } else {
      storeUpdateData.cpf = null
    }
  }

  if ((data as any).gallery !== undefined) {
    if (!Array.isArray((data as any).gallery)) {
      return { error: "Formato de galeria inválido" }
    }
    const { getPartnerPlan } = await import("@/lib/services/subscription.service")
    const plan = await getPartnerPlan(partnerId)
    const limit = plan.slug === "free" ? 1 : plan.slug === "crescer" ? 5 : plan.slug === "escalar" ? 10 : 10
    if ((data as any).gallery.length > limit) {
      return { error: `Seu plano atual permite apenas até ${limit} imagem(ns) na galeria.` }
    }
    storeUpdateData.gallery = (data as any).gallery
  }

  if (Object.keys(storeUpdateData).length > 0) {
    storeUpdateData.updated_at = new Date().toISOString()
    const admin = getAdminClient()
    const { data: hqStore } = await admin
      .from("stores")
      .select("id")
      .eq("partner_id", partnerId)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (hqStore?.id) {
      await admin.from("stores").update(storeUpdateData).eq("id", hqStore.id)
    }
  }

  const updateData: any = {}

  if (data.offeringType !== undefined) {
    updateData.business_info = {
      sells: data.offeringType === "both" ? ["products", "services"] : data.offeringType === "services" ? ["services"] : ["products"],
      mode: "erp",
    }
  }

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

  if (data.crt !== undefined) storeUpdateData.crt = data.crt
  if (data.contribuinte !== undefined) storeUpdateData.contribuinte = data.contribuinte
  if (data.inscricaoEstadual !== undefined) storeUpdateData.inscricao_estadual = data.inscricaoEstadual
  if (data.ieIsento !== undefined) storeUpdateData.ie_isento = data.ieIsento
  if (data.inscricaoMunicipal !== undefined) storeUpdateData.inscricao_municipal = data.inscricaoMunicipal

  // Geocode address to get lat/lng
  let geocodedCoords: { lat: number; lng: number } | null = null
  if (hasAddressData) {
    const currentAddr = storeAddress || {}
    const fullAddressString = [
      data.street ?? currentAddr.street,
      data.number ?? currentAddr.number,
      data.neighborhood ?? currentAddr.neighborhood,
      data.city ?? currentAddr.city,
      data.state ?? currentAddr.state,
      "BR"
    ].filter(Boolean).join(", ")

    try {
      geocodedCoords = await geocodeAddress(fullAddressString)
    } catch (e) {
      console.error("[updatePartnerAction] Geocoding failed:", e)
    }
  }

  const { error } = await supabase.from("partners").update(updateData).eq("id", partnerId)

  if (error) {
    return { error: error.message }
  }

  // Atualizar endereço na tabela addresses se houver dados
  if (hasAddressData) {
    const storeRes = await supabase.from("stores").select("id").eq("partner_id", partnerId).limit(1).maybeSingle()
    const storeId = storeRes.data?.id

    if (storeId) {
      const existingAddress = await supabase
        .from("addresses")
        .select("*")
        .eq("store_id", storeId)
        .limit(1)
        .maybeSingle()

      const combinedPayload = {
        ...(existingAddress?.data || {}),
        store_id: storeId,
        zip_code: data.zipCode ?? existingAddress?.data?.zip_code,
        street: data.street ?? existingAddress?.data?.street,
        number: data.number ?? existingAddress?.data?.number,
        complement: data.complement !== undefined ? (data.complement || null) : existingAddress?.data?.complement,
        neighborhood: data.neighborhood ?? existingAddress?.data?.neighborhood,
        city: data.city ?? existingAddress?.data?.city,
        state: data.state ?? existingAddress?.data?.state,
        country: "BR",
        municipio_codigo_ibge: (data as any).municipioCodigoIbge ?? (data as any).ibge ?? existingAddress?.data?.municipio_codigo_ibge,
        latitude: geocodedCoords?.lat ?? existingAddress?.data?.latitude ?? null,
        longitude: geocodedCoords?.lng ?? existingAddress?.data?.longitude ?? null,
        address_type: "primary",
        is_default: true,
      }

      const enriched = await enrichAddressData(combinedPayload)

      if (existingAddress?.data?.id) {
        await supabase
          .from("addresses")
          .update(enriched)
          .eq("id", existingAddress.data.id)
      } else {
        await supabase.from("addresses").insert(enriched)
      }
    }
  }

  revalidatePath("/erp/configuracoes")

  // Redis Sync for Marketplace Vitrines
  await syncToExploreRedis({ id: partnerId, type: "loja", data: {} })
  await syncPartnerItemsToExploreRedis(partnerId)

  return { success: true }
}

export async function registerPartner(data: {
  userId: string
  personType: "pf" | "pj"
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
      personType: data.personType,
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
