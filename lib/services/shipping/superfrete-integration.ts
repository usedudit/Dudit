import type { SupabaseClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/cryptoService"
import {
  createSuperFreteClient,
  type SuperFreteClient,
  type SuperFreteEnvironment,
} from "@/lib/services/shipping/superfrete"
import type { PartnerIntegrationRow } from "@/lib/services/integrations/types"

export const SUPERFRETE_PROVIDER = "superfrete"

export type { PartnerIntegrationRow }

export function resolveSuperFreteEnvironment(
  explicit: unknown,
  fallback?: unknown,
): SuperFreteEnvironment {
  if (explicit === "sandbox" || explicit === "production") return explicit
  if (fallback === "sandbox" || fallback === "production") return fallback
  return process.env.NODE_ENV === "production" ? "production" : "sandbox"
}

export async function findSuperFreteIntegration(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<PartnerIntegrationRow | null> {
  const { data } = await supabase
    .from("partner_integrations")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("provider_slug", SUPERFRETE_PROVIDER)
    .maybeSingle()
  return (data as PartnerIntegrationRow) || null
}

export function buildSuperFreteClient(
  integration: PartnerIntegrationRow | null,
): SuperFreteClient | null {
  if (!integration?.access_token_encrypted) return null
  const token = decrypt(integration.access_token_encrypted, SUPERFRETE_PROVIDER)
  const environment = resolveSuperFreteEnvironment((integration.config as Record<string, any>)?.environment)
  return createSuperFreteClient(token, integration.account_email || undefined, environment)
}

export interface ShippingItemLogistics {
  quantity?: number | null
  weight_gross?: number | null
  weight_net?: number | null
  width?: number | null
  height?: number | null
  length?: number | null
  packaging_type?: string | null
  preparation_days?: number | null
}

export interface ConsolidatedShippingVolumes {
  height: number
  width: number
  length: number
  weight: number
  preparationDays?: number
}

/**
 * Consolida múltiplos produtos de um pedido/carrinho em um único volume
 * compatível com as regras físicas da SuperFrete e das transportadoras (Correios, Jadlog, Loggi).
 *
 * Regras aplicadas:
 * 1. Peso: prioriza peso bruto (weight_gross = produto + embalagem). Se nulo, usa líquido (weight_net).
 *    Soma os pesos ponderados pela quantidade. Garante mínimo de 0.1 kg (100g).
 * 2. Dimensões:
 *    - Comprimento: maior comprimento entre os itens (mínimo 15 cm dos Correios).
 *    - Largura: maior largura entre os itens (mínimo 10 cm dos Correios).
 *    - Altura: soma das alturas empilhadas (mínimo 2 cm dos Correios).
 *    - Embalagem Envelope: altura mínima (2 cm), comprimento e largura reais.
 *    - Embalagem Cilindro: diâmetro aplicado a largura e altura.
 *    - Soma (C + L + A): garante o mínimo legal de 26 cm.
 *    - Se empilhamento ultrapassar 100 cm de altura ou soma > 200 cm, reorganiza pelo volume cúbico com folga.
 * 3. Fallback: se nenhum item tiver medidas cadastradas, recorre às configurações gerais da loja (config)
 *    ou aos padrões 15x10x2 cm e 0.5 kg.
 */
export function consolidateShippingVolumes(
  items?: ShippingItemLogistics[] | null,
  config: Record<string, any> = {},
): ConsolidatedShippingVolumes {
  const defaultWeight = Math.max(0.1, Number(config.weight ?? 0.5))
  const defaultHeight = Math.max(2, Number(config.height ?? 10))
  const defaultWidth = Math.max(10, Number(config.width ?? 10))
  const defaultLength = Math.max(15, Number(config.length ?? 10))

  if (!items || items.length === 0) {
    let length = defaultLength
    let width = defaultWidth
    let height = defaultHeight
    if (length + width + height < 26) {
      length = Math.max(length, 26 - width - height)
    }
    return {
      height,
      width,
      length,
      weight: defaultWeight,
      preparationDays: 0,
    }
  }

  let totalWeight = 0
  let maxWidth = 0
  let maxLength = 0
  let totalStackedHeight = 0
  let totalVolume = 0
  let maxPrepDays = 0
  let hasValidDimensions = false
  let hasValidWeight = false

  for (const it of items) {
    const qty = Math.max(1, Number(it.quantity || 1))

    // Peso: prioriza bruto sobre líquido
    const rawGross = it.weight_gross != null && Number(it.weight_gross) > 0 ? Number(it.weight_gross) : null
    const rawNet = it.weight_net != null && Number(it.weight_net) > 0 ? Number(it.weight_net) : null
    const unitWeight = rawGross ?? rawNet

    if (unitWeight != null && unitWeight > 0) {
      hasValidWeight = true
      totalWeight += unitWeight * qty
    } else {
      totalWeight += (defaultWeight / items.length) * qty
    }

    // Dimensões
    let w = it.width != null && Number(it.width) > 0 ? Number(it.width) : 0
    let h = it.height != null && Number(it.height) > 0 ? Number(it.height) : 0
    let l = it.length != null && Number(it.length) > 0 ? Number(it.length) : 0

    const packaging = String(it.packaging_type || "package").toLowerCase().trim()

    if (packaging === "envelope") {
      if (h <= 0) h = 2
    } else if (packaging === "cilinder" || packaging === "cylinder") {
      if (w > 0 && h <= 0) h = w
      if (h > 0 && w <= 0) w = h
    }

    if (w > 0 || h > 0 || l > 0) {
      hasValidDimensions = true
    }

    w = w > 0 ? w : defaultWidth
    h = h > 0 ? h : defaultHeight
    l = l > 0 ? l : defaultLength

    maxWidth = Math.max(maxWidth, w)
    maxLength = Math.max(maxLength, l)
    totalStackedHeight += h * qty
    totalVolume += (w * h * l) * qty

    if (it.preparation_days != null && Number(it.preparation_days) > 0) {
      maxPrepDays = Math.max(maxPrepDays, Number(it.preparation_days))
    }
  }

  let finalLength = hasValidDimensions ? maxLength : defaultLength
  let finalWidth = hasValidDimensions ? maxWidth : defaultWidth
  let finalHeight = hasValidDimensions ? totalStackedHeight : defaultHeight

  // Se o empilhamento vertical violar limites dos Correios (altura > 100 ou soma > 200),
  // redistribui em caixa volumétrica proporcional
  if (finalHeight > 100 || (finalLength + finalWidth + finalHeight) > 200) {
    const side = Math.ceil(Math.cbrt(totalVolume * 1.15))
    finalLength = Math.max(finalLength, side)
    finalWidth = Math.max(finalWidth, side)
    finalHeight = Math.max(2, Math.ceil(totalVolume / (finalLength * finalWidth)))
  }

  // Limites mínimos da SuperFrete / Correios
  finalLength = Math.max(15, Math.ceil(finalLength))
  finalWidth = Math.max(10, Math.ceil(finalWidth))
  finalHeight = Math.max(2, Math.ceil(finalHeight))

  // Soma mínima C + L + A >= 26
  if (finalLength + finalWidth + finalHeight < 26) {
    finalLength = Math.max(finalLength, 26 - finalWidth - finalHeight)
  }

  // Limites máximos das transportadoras
  finalLength = Math.min(100, finalLength)
  finalWidth = Math.min(100, finalWidth)
  finalHeight = Math.min(100, finalHeight)

  // Peso final (mínimo 0.1 kg, arredondado a 3 casas)
  let finalWeight = hasValidWeight
    ? Math.max(0.1, Math.round(totalWeight * 1000) / 1000)
    : defaultWeight
  finalWeight = Math.min(30, finalWeight)

  return {
    height: finalHeight,
    width: finalWidth,
    length: finalLength,
    weight: finalWeight,
    preparationDays: maxPrepDays,
  }
}

export function buildSuperFreteVolumes(
  config: Record<string, any>,
  items?: ShippingItemLogistics[] | null,
): ConsolidatedShippingVolumes {
  return consolidateShippingVolumes(items, config)
}
