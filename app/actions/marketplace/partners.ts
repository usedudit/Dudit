"use server"

// Removed createSupabaseAdmin
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { unstable_cache, revalidatePath, revalidateTag } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { cache } from "react"
import { revalidatePartnerProfile } from "@/lib/utils/revalidation"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeInput, validatePhoneBR } from "@/lib/input-validator"
import { normalizePhoneToE164 } from "@/lib/utils/phone-utils"
import { normalizeOpeningHours } from "@/lib/utils/opening-hours"
import { decryptCPF } from "@/lib/crypto"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { geocodeAddress } from "@/lib/services/location.service"
import { syncPartnerItemsToExploreRedis, syncToExploreRedis } from "@/lib/redis-sync"
import { getRandomDefaultBanner } from "@/lib/utils/banner"

// --- CLIENTES ---

import { getAdminClient } from "@/lib/supabase/admin"

// ==========================================
// DIRECT FETCH FUNCTIONS (NO CACHE)
// Used by force-dynamic pages for strict consistency
// ==========================================

async function _getPartnerProfile(partnerId: string) {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("partners")
    .select(`
      *,
      addresses(id, zip_code, street, number, complement, neighborhood, city, state, is_default),
      payment_methods(*)
    `)
    .eq("id", partnerId)
    .eq("is_active", true)
    .single()

  if (error) {
    console.error(`[Partner] Profile fetch error for ${partnerId}:`, error.message)
    return null
  }

  if (data && typeof data.business_info === "string") {
    try {
      data.business_info = JSON.parse(data.business_info)
    } catch (e) {
      data.business_info = normalizeBusinessInfo(null)
    }
  }

  if (data && data.cpf) {
    try {
      data.cpf = await decryptCPF(data.cpf)
    } catch (e) {
      console.error("[Partner] CPF decryption error:", e)
    }
  }

  if (data && !data.banner_url) {
    const bannerUrl = await getDefaultPartnerBannerUrl(data.store_name || "Vendedor", data.store_image_url)
    const { error: bannerError } = await supabase
      .from("partners")
      .update({ banner_url: bannerUrl, banner_moderation_status: "approved" })
      .eq("id", partnerId)

    if (!bannerError) {
      data.banner_url = bannerUrl
      data.banner_moderation_status = "approved"
      await syncToExploreRedis({ id: partnerId, type: "loja", data: {}, silent: true })
    }
  }

  return data
}

async function getDefaultPartnerBannerUrl(storeName: string, storeImageUrl?: string | null) {
  if (storeImageUrl) return getRandomDefaultBanner()
  const { getAvatarColor, getBannerUrlByColor } = await import("@/lib/utils/UserProfileImage")
  return getBannerUrlByColor(getAvatarColor(storeName))
}

import { getCurrentUser } from "@/lib/auth/server-user"

// ... (existing code)

async function _getPartnerProducts(partnerId: string) {
  const supabase = getAdminClient()
  const user = await getCurrentUser()

  // Get partner owner info to check ownership
  const { data: partner } = await supabase.from("partners").select("user_id").eq("id", partnerId).single()
  const isOwner = user && partner?.user_id === user.id

  let query = supabase
    .from("products")
    .select("*, product_variants(variant_options, price_adjustment, is_active)")
    .eq("partner_id", partnerId)

  // If NOT owner, apply visibility filters
  if (!isOwner) {
    query = query
      .eq("is_active", true)
      .eq("moderation_status", "approved")
      .eq("show_in_marketplace", true)
  }

  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(100)

  const safeData = (data || []).map((item: any) => {
    const variants = item.product_variants
    let fallback_variant_image: string | null = null
    let fallback_variant_price: number | null = null

    if (variants && variants.length > 0) {
      const withImage = variants.find((v: any) => v.is_active && v.variant_options?.image)
      const first = variants.find((v: any) => v.is_active) || variants[0]
      fallback_variant_image = withImage?.variant_options?.image || null
      const priceAdj = first?.price_adjustment
      fallback_variant_price = priceAdj && priceAdj > 0 ? priceAdj : null
    }

    const { product_variants, ...rest } = item
    return { ...rest, fallback_variant_image, fallback_variant_price }
  })

  return safeData
}

async function _getPartnerServices(partnerId: string) {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
  return data || []
}

async function _getPartnerReviews(partnerId: string) {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("reviews")
    .select(`
      *,
      profiles:user_id (full_name, profile_image_url),
      products:product_id (name),
      services:service_id (name)
    `)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
  return data || []
}

async function _getPartnerStats(partnerId: string) {
  const supabase = getAdminClient()
  const [partner, reviews] = await Promise.all([
    supabase.from("partners").select("vendas_totais").eq("id", partnerId).single(),
    supabase.from("reviews").select("*", { count: "exact", head: true }).eq("partner_id", partnerId)
  ])

  return {
    salesCount: partner.data?.vendas_totais || 0,
    reviewsCount: reviews.count || 0
  }
}

// React cache() wrappers - deduplicate within SSR request
export const getPartnerProfile = cache(_getPartnerProfile)
export const getPartnerProducts = cache(_getPartnerProducts)
export const getPartnerServices = cache(_getPartnerServices)
export const getPartnerReviews = cache(_getPartnerReviews)
export const getPartnerStats = cache(_getPartnerStats)

// ==========================================
// CACHED FUNCTIONS (kept for other pages)
// ==========================================

export const getCachedPartnerProfile = async (partnerId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data, error } = await supabase
        .from("partners")
        .select(`
          *,
          addresses(id, zip_code, street, number, complement, neighborhood, city, state, is_default),
          payment_methods(*)
        `)
        .eq("id", partnerId)
        .eq("is_active", true)
        .single()

      if (error) return null
      if (data && typeof data.business_info === "string") {
        try {
          data.business_info = JSON.parse(data.business_info)
        } catch (e) {
          data.business_info = normalizeBusinessInfo(null)
        }
      }
      if (data && data.cpf) {
        try {
          data.cpf = await decryptCPF(data.cpf)
        } catch (e) {
          console.error("[Partner] CPF decryption error:", e)
        }
      }
      return data
    },
    [`partner-profile-${partnerId}-v2`],
    { tags: ["partner-profile", `partner-${partnerId}`] }
  )
  return fn()
}

export const getCachedPartnerProducts = async (partnerId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data } = await supabase
        .from("products")
        .select("*, product_variants(variant_options, price_adjustment, is_active)")
        .eq("partner_id", partnerId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100)

      // Extrai fallback de variante e remove product_variants do payload
      const safeData = (data || []).map((item: any) => {
        const variants = item.product_variants
        let fallback_variant_image: string | null = null
        let fallback_variant_price: number | null = null

        if (variants && variants.length > 0) {
          const withImage = variants.find((v: any) => v.is_active && v.variant_options?.image)
          const first = variants.find((v: any) => v.is_active) || variants[0]
          fallback_variant_image = withImage?.variant_options?.image || null
          const priceAdj = first?.price_adjustment
          fallback_variant_price = priceAdj && priceAdj > 0 ? priceAdj : null
        }

        const { product_variants, ...rest } = item
        return { ...rest, fallback_variant_image, fallback_variant_price }
      })

      return safeData
    },
    [`partner-products-${partnerId}-v2`],
    { tags: ["partner-products", `partner-${partnerId}`] }
  )
  return fn()
}

export const getCachedPartnerServices = async (partnerId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data } = await supabase
        .from("services")
        .select("*")
        .eq("partner_id", partnerId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
      return data || []
    },
    [`partner-services-${partnerId}`],
    { tags: ["partner-services", `partner-${partnerId}`] }
  )
  return fn()
}

export const getCachedPartnerStats = async (partnerId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const [partner, reviews] = await Promise.all([
        supabase.from("partners").select("vendas_totais").eq("id", partnerId).single(),
        supabase.from("reviews").select("*", { count: "exact", head: true }).eq("partner_id", partnerId)
      ])

      return {
        salesCount: partner.data?.vendas_totais || 0,
        reviewsCount: reviews.count || 0
      }
    },
    [`partner-stats-${partnerId}`],
    { tags: ["partner-stats", `partner-${partnerId}`] }
  )
  return fn()
}

export const getCachedPartnerReviews = async (partnerId: string) => {
  const fn = unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const { data } = await supabase
        .from("reviews")
        .select(`
          *,
          profiles:user_id (full_name, profile_image_url),
          products:product_id (name),
          services:service_id (name)
        `)
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })
      return data || []
    },
    [`partner-reviews-list-${partnerId}`],
    { tags: ["partner-reviews", `partner-${partnerId}`] }
  )
  return fn()
}

// ==========================================
// ESCRITA (SERVER ACTIONS)
// ==========================================

export async function updatePartnerAction(partnerId: string, data: any) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  // SECURITY: Verify ownership - only partner owner can update
  const currentUser = await requireUser()
  if (!currentUser) {
    return { error: "Não autenticado" }
  }

  const supabase = await getSupabaseServerClient()

  // Verify this partner belongs to the current user
  const { data: partnerCheck } = await supabase
    .from("partners")
    .select("user_id, business_info, store_name, store_image_url, banner_url")
    .eq("id", partnerId)
    .single()

  if (!partnerCheck || partnerCheck.user_id !== currentUser.id) {
    return { error: "Não autorizado" }
  }

  const updateData: any = {}
  const sanitizedPhone = typeof data.phone === "string" ? sanitizeInput(data.phone, 20) : undefined

  // Mapeamento de campos da tabela PARTNERS
  if (data.storeName) updateData.store_name = data.storeName
  if (data.storeDescription !== undefined) updateData.store_description = data.storeDescription
  if (data.storeImageUrl !== undefined) {
    if (data.storeImageUrl && data.storeImageUrl.startsWith("data:")) {
      return { error: "Formato de imagem inválido (base64 não permitido)" }
    }
    updateData.store_image_url = data.storeImageUrl
  }
  if (data.businessType) updateData.business_type = data.businessType
  if (data.cnpj !== undefined) {
    updateData.cnpj = data.cnpj ? data.cnpj.replace(/\D/g, "") : null
    if (updateData.cnpj === "") updateData.cnpj = null
  }
  if (data.businessInfo !== undefined) {
    const existingInfo = normalizeBusinessInfo(partnerCheck?.business_info)
    const newInfo = normalizeBusinessInfo(data.businessInfo)
    updateData.business_info = {
      ...newInfo,
      mode: existingInfo.mode // Never trust the frontend for mode changes on update
    }
  }
  if (data.openingHours !== undefined) updateData.opening_hours = normalizeOpeningHours(data.openingHours)
  if (sanitizedPhone !== undefined) {
    if (sanitizedPhone) {
      let phoneToValidate = sanitizedPhone
      const digits = sanitizedPhone.replace(/\D/g, "")
      if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
        phoneToValidate = digits.slice(2)
      }
      
      if (!validatePhoneBR(phoneToValidate)) {
        return { error: "Número de telefone inválido" }
      }
      updateData.phone = normalizePhoneToE164(sanitizedPhone)
    } else {
      updateData.phone = null
    }
  }

  // Campos fiscais
  if (data.crt !== undefined) updateData.crt = data.crt
  if (data.contribuinte !== undefined) updateData.contribuinte = data.contribuinte
  if (data.inscricaoEstadual !== undefined) updateData.inscricao_estadual = data.inscricaoEstadual
  if (data.ieIsento !== undefined) updateData.ie_isento = data.ieIsento
  if (data.inscricaoMunicipal !== undefined) updateData.inscricao_municipal = data.inscricaoMunicipal
  
  // Vitrine Online
  if (data.bannerUrl !== undefined) {
    if (data.bannerUrl && data.bannerUrl.startsWith("data:")) {
      return { error: "Formato de banner inválido (base64 não permitido)" }
    }
    
    // Se o banner for removido ou for nulo, gera um padrão baseado no nome
    if (!data.bannerUrl) {
      const storeNameForBanner = data.storeName || partnerCheck?.store_name || "Vendedor"
      updateData.banner_url = await getDefaultPartnerBannerUrl(storeNameForBanner, data.storeImageUrl ?? partnerCheck?.store_image_url)
    } else {
      updateData.banner_url = data.bannerUrl
    }
  }
  if (data.isShowcaseActive !== undefined) updateData.is_showcase_active = data.isShowcaseActive
  if (data.category !== undefined) updateData.category = data.category
  if (data.logoModerationStatus !== undefined) updateData.logo_moderation_status = data.logoModerationStatus
  if (data.bannerModerationStatus !== undefined) updateData.banner_moderation_status = data.bannerModerationStatus

  // Handle CPF (Encrypted)
  if (data.cpf !== undefined) {
    const cleanCPF = data.cpf ? data.cpf.replace(/\D/g, "") : null
    if (cleanCPF) {
      try {
        const { encryptCPF } = await import("@/lib/crypto")
        updateData.cpf = await encryptCPF(cleanCPF)
      } catch (error) {
        console.error("Erro ao criptografar CPF:", error)
      }
    } else {
      updateData.cpf = null
    }
  }

  // 1. Atualiza dados do parceiro (SE houver algo para atualizar)
  if (Object.keys(updateData).length > 0) {
    const { error } = await supabase
      .from("partners")
      .update(updateData)
      .eq("id", partnerId)

    if (error) {
      console.error("Erro no update de partner:", error)
      return { error: "Erro ao atualizar dados: " + error.message }
    }
  }

  // 2. Atualiza ENDEREÇO (separado, na tabela addresses)
  // Verifica se veio algum dado de endereço
  const hasAddressData =
    data.zipCode !== undefined ||
    data.street !== undefined ||
    data.number !== undefined ||
    data.city !== undefined ||
    data.state !== undefined;

  if (hasAddressData) {
    const addressData: any = {};
    if (data.zipCode !== undefined) addressData.zip_code = data.zipCode
    if (data.street !== undefined) addressData.street = data.street
    if (data.number !== undefined) addressData.number = data.number
    if (data.complement !== undefined) addressData.complement = data.complement
    if (data.neighborhood !== undefined) addressData.neighborhood = data.neighborhood
    if (data.city !== undefined) addressData.city = data.city
    if (data.state !== undefined) addressData.state = data.state

    // Busca o endereço padrão atual
    const { data: currentAddress } = await supabase
      .from('addresses')
      .select('id')
      .eq('partner_id', partnerId)
      .eq('is_default', true)
      .maybeSingle();

    if (currentAddress) {
      // Atualiza
      await supabase.from('addresses').update(addressData).eq('id', currentAddress.id);
    } else {
      // Cria se não existir (caso de erro anterior ou migração)
      await supabase.from('addresses').insert({
        partner_id: partnerId,
        ...addressData,
        country: 'BR',
        is_default: true
      });
    }

    // GEOCODING: atualiza latitude/longitude no partner baseado no novo endereço
    if (addressData.street && addressData.city) {
      const addressString = [
        addressData.street, addressData.number,
        addressData.city, addressData.state
      ].filter(Boolean).join(", ")
      try {
        const coords = await geocodeAddress(addressString)
        if (coords) {
          await supabase.from('partners').update({ latitude: coords.lat, longitude: coords.lng }).eq('id', partnerId)
          // Also persist coordinates to the addresses record
          if (currentAddress) {
            await supabase.from('addresses').update({ latitude: coords.lat, longitude: coords.lng }).eq('id', currentAddress.id)
          }
        }
      } catch (e) {
        console.error("Geocoding exception:", e)
      }
    }
  }

  await revalidatePartnerProfile(partnerId)
  await syncToExploreRedis({ id: partnerId, type: "loja", data: {}, silent: true })
  await syncPartnerItemsToExploreRedis(partnerId)
  revalidatePath("/erp/settings")

  return { success: true }
}

export async function registerPartner(data: any) {
  await requireRateLimit(RateLimitCategory.PARTNER_REGISTER)

  // SECURITY FIX (HIGH-01): userId derived from session, NEVER from client input
  const currentUser = await requireUser()
  if (!currentUser) {
    return { success: false, error: "Não autorizado" }
  }
  const userId = currentUser.id

  const supabaseAdmin = getAdminClient()

  try {
    const sanitizedPhone = typeof data.phone === "string" ? sanitizeInput(data.phone, 20) : ""

    // 1. Verifica duplicidade de usuário na tabela de partners
    const { data: existing } = await supabaseAdmin.from("partners").select("id").eq("user_id", userId).maybeSingle()
    if (existing) return { success: false, error: "Você já possui uma conta de parceiro." }

    // 2. Verifica duplicidade de nome da loja (case-insensitive)
    if (data.storeName) {
      const normalizedStoreName = data.storeName.trim().toLowerCase()
      const { data: duplicateName } = await supabaseAdmin
        .from("partners")
        .select("id")
        .ilike("store_name", normalizedStoreName)
        .maybeSingle()
      if (duplicateName) {
        return { success: false, error: "Já existe uma loja com este nome. Escolha outro nome." }
      }
    }

    if (!sanitizedPhone || !validatePhoneBR(sanitizedPhone)) {
      return { success: false, error: "Número de telefone inválido" }
    }

    // --- GARANTIR QUE O PERFIL EXISTE ANTES DE CRIAR O PARTNER ---
    const { data: profileExists } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle()

    if (!profileExists) {
      const { error: userProfileError } = await supabaseAdmin
        .from("user_profiles")
        .insert({
          user_id: userId,
          full_name: "",
          phone: null,
          pending_partner_registration: false,
        })

      if (userProfileError && userProfileError.code !== "23505") {
        console.warn("Erro ao criar user_profile:", userProfileError.message)
      }
    }
    // -------------------------------------------------------

    let cpfEncrypted = null
    if (data.cpf) {
      const cleanCPF = String(data.cpf).replace(/\D/g, "")
      if (cleanCPF) {
        const { encryptCPF } = await import("@/lib/crypto")
        cpfEncrypted = await encryptCPF(cleanCPF)
      }
    }

    // DADOS APENAS DA TABELA PARTNERS (Sem endereço aqui!)
    if (data.storeImageUrl && data.storeImageUrl.startsWith("data:")) {
      return { success: false, error: "Formato de imagem inválido (base64 não permitido)" }
    }

    const defaultBannerUrl = await getDefaultPartnerBannerUrl(data.storeName, data.storeImageUrl)

    const insertPartnerData = {
      user_id: userId,
      store_name: data.storeName,
      store_description: data.storeDescription || "",
      store_image_url: data.storeImageUrl,
      banner_url: data.bannerUrl || defaultBannerUrl,
      phone: normalizePhoneToE164(sanitizedPhone),
      business_type: data.businessType,
      cnpj: data.cnpj?.replace(/\D/g, "") || null,
      cpf: cpfEncrypted,
      business_info: normalizeBusinessInfo(data.businessInfo),
      opening_hours: data.businessHours || null,
      is_active: true
    }

    // 2. Inserir o Parceiro
    const { data: newPartner, error } = await supabaseAdmin
      .from("partners")
      .insert(insertPartnerData)
      .select("id")
      .single()

    if (error) {
      throw error
    }

    // 3. Inserir o Endereço na tabela ADDRESSES (Usando o ID do novo parceiro)
    // Os dados vêm do frontend como data.zipCode, data.street, etc (conforme seu PartnerWizard)
    if (data.zipCode || data.street || data.city) {
      const addressData = {
        partner_id: newPartner.id,
        zip_code: data.zipCode,
        street: data.street,
        number: data.number || "S/N",
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        country: "BR",
        is_default: true
      }

      const { error: addressError } = await supabaseAdmin
        .from("addresses")
        .insert(addressData)

      if (addressError) {
        console.error("Error inserting address:", addressError)
        // Não lançamos erro fatal aqui para não bloquear o cadastro se apenas o endereço falhar,
        // mas idealmente deveria tratar.
      }
      
      // GEOCODING AUTOMATICO PARA NOVOS REGISTROS
      if (data.street && data.city) {
        const addressString = `${data.street}, ${data.number || ''}, ${data.city} - ${data.state || ''}, Brazil, ${data.zipCode || ''}`
        try {
          const coords = await geocodeAddress(addressString)
          if (coords) {
            await supabaseAdmin.from('partners').update({ latitude: coords.lat, longitude: coords.lng }).eq('id', newPartner.id)
          }
        } catch(e) { console.error("Geocoding failed on register", e) }
      }
    }

    // 4. Cria métodos de pagamento padrão
    await supabaseAdmin.from("payment_methods").insert([
      { partner_id: newPartner.id, name: "Dinheiro", payment_type: "dinheiro", type: "cash", is_active: true },
      { partner_id: newPartner.id, name: "Pix", payment_type: "pix", type: "pix", is_active: true },
      { partner_id: newPartner.id, name: "Cartão de Credito", payment_type: "credito", type: "credit_card", is_active: true },
      { partner_id: newPartner.id, name: "Cartao de Debito", payment_type: "debito", type: "debit_card", is_active: true },
    ])

    // 5. Categorias financeiras padrão
    const defaultCategories = [
      { name: "Vendas", category_type: "income" as const },
      { name: "Outras receitas", category_type: "income" as const },
      { name: "Moradia / Estrutura", category_type: "expense" as const },
      { name: "Alimentação", category_type: "expense" as const },
      { name: "Transporte", category_type: "expense" as const },
      { name: "Negócio", category_type: "expense" as const },
      { name: "Financeiro", category_type: "expense" as const },
      { name: "Impostos", category_type: "expense" as const },
      { name: "Outros", category_type: "expense" as const },
    ]
    const { data: insertedCategories } = await supabaseAdmin
      .from("financial_categories")
      .insert(
        defaultCategories.map((item) => ({
          partner_id: newPartner.id,
          name: item.name,
          category_type: item.category_type,
          parent_id: null,
          is_active: true,
        })),
      )
      .select("id, name")

    const byName = new Map((insertedCategories || []).map((c: any) => [c.name, c.id]))
    const vendasId = byName.get("Vendas")
    const negocioId = byName.get("Negócio")

    const defaultSubcategories: Array<{ name: string; parent_id: string; category_type: "income" | "expense" }> = []
    if (vendasId) {
      defaultSubcategories.push(
        { name: "Produtos", parent_id: vendasId as string, category_type: "income" },
        { name: "Serviços", parent_id: vendasId as string, category_type: "income" },
      )
    }
    if (negocioId) {
      defaultSubcategories.push(
        { name: "Marketing", parent_id: negocioId as string, category_type: "expense" },
        { name: "Ferramentas", parent_id: negocioId as string, category_type: "expense" },
      )
    }
    if (defaultSubcategories.length > 0) {
      await supabaseAdmin.from("financial_categories").insert(
        defaultSubcategories.map((item) => ({
          partner_id: newPartner.id,
          name: item.name,
          parent_id: item.parent_id,
          category_type: item.category_type,
          is_active: true,
        })),
      )
    }

    revalidateTag(TAGS.userAccess(userId), "max")
    revalidatePath("/erp")

    return { success: true, partnerId: newPartner.id }

  } catch (err: any) {
    console.error("Erro ao criar parceiro:", err)
    return { success: false, error: err.message || "Erro desconhecido ao criar parceiro." }
  }
}
