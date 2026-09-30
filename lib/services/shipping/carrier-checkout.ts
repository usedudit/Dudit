import type { SupabaseClient } from "@supabase/supabase-js"
import { captureError } from "@/lib/monitoring/sentry"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import {
  SERVICE_LABELS,
  type SuperFreteServiceId,
} from "@/lib/services/shipping/superfrete"
import {
  findSuperFreteIntegration,
  buildSuperFreteClient,
  buildSuperFreteVolumes,
} from "@/lib/services/shipping/superfrete-integration"

export { extractPostalCodeFromAddress } from "@/lib/services/shipping/postal-code"

export interface CarrierFreightOption {
  serviceId: number
  serviceName: string
  price: number
  deliveryMinDays: number | null
  deliveryMaxDays: number | null
  companyName: string | null
}

export type CarrierUnavailableReason =
  | "plan"
  | "not_connected"
  | "origin_missing"
  | "invalid_destination"
  | "no_options"
  | "quote_failed"

export type CarrierQuoteResult =
  | { available: true; options: CarrierFreightOption[]; fromPostalCode: string }
  | { available: false; reason: CarrierUnavailableReason }

export function carrierReasonMessage(reason: CarrierUnavailableReason): string {
  switch (reason) {
    case "plan":
      return "Entrega nacional exige o plano Escalar."
    case "origin_missing":
      return "Frete indisponível: cadastre o CEP de origem nas configurações do SuperFrete."
    case "invalid_destination":
      return "Informe um endereço com CEP válido para calcular o frete."
    case "no_options":
      return "Nenhuma transportadora disponível para este endereço."
    case "quote_failed":
      return "Não foi possível calcular o frete agora. Tente novamente."
    case "not_connected":
    default:
      return "Frete indisponível."
  }
}

// Cotação SuperFrete é a parte mais lenta do checkout (roundtrip à API).
// Cache em memória por parceiro + CEPs + parâmetros do pacote torna
// instantâneas as repetições: troca de serviço (PAC/SEDEX), recálculo de
// totais, reabertura do checkout e submit. Sucesso de até 30min; se a
// API falhar depois, servimos o último resultado de até 1h (stale-if-error).
// Requisições concorrentes da mesma chave compartilham um único roundtrip.
const CARRIER_QUOTE_TTL_MS = 30 * 60 * 1000
const CARRIER_QUOTE_STALE_MS = 60 * 60 * 1000
const CARRIER_QUOTE_CACHE_MAX = 100
const carrierQuoteCache = new Map<string, { at: number; result: CarrierQuoteResult }>()
const carrierQuoteInflight = new Map<string, Promise<CarrierQuoteResult>>()

function pruneCarrierQuoteCache(now: number): void {
  for (const [key, entry] of carrierQuoteCache) {
    if (now - entry.at > CARRIER_QUOTE_STALE_MS) carrierQuoteCache.delete(key)
  }
  while (carrierQuoteCache.size > CARRIER_QUOTE_CACHE_MAX) {
    const oldest = carrierQuoteCache.keys().next().value
    if (oldest === undefined) break
    carrierQuoteCache.delete(oldest)
  }
}

async function loadCarrierContext(
  supabase: SupabaseClient,
  partnerId: string,
  toPostalCode: string,
): Promise<
  | {
      ok: true
      client: NonNullable<ReturnType<typeof buildSuperFreteClient>>
      config: Record<string, any>
      fromPostalCode: string
    }
  | { ok: false; reason: CarrierUnavailableReason }
> {
  if (!/^\d{8}$/.test(toPostalCode)) {
    return { ok: false, reason: "invalid_destination" }
  }

  const plan = await getPartnerPlan(partnerId)
  if (!hasMinimumPlan(plan?.slug || "free", "escalar")) {
    return { ok: false, reason: "plan" }
  }

  const integration = await findSuperFreteIntegration(supabase, partnerId)
  if (!integration || integration.status !== "connected" || !integration.access_token_encrypted) {
    return { ok: false, reason: "not_connected" }
  }

  const config = (integration.config as Record<string, any>) || {}
  const client = buildSuperFreteClient(integration)
  if (!client) return { ok: false, reason: "not_connected" }

  let fromPostalCode = String(config.originCep || "").replace(/\D/g, "")
  if (!fromPostalCode) {
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("partner_id", partnerId)
      .order("is_headquarters", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (store?.id) {
      const { data: storeAddr } = await supabase
        .from("addresses")
        .select("zip_code")
        .eq("store_id", store.id)
        .maybeSingle()
      fromPostalCode = String(storeAddr?.zip_code || "").replace(/\D/g, "")
    }
  }
  if (fromPostalCode.length !== 8) {
    return { ok: false, reason: "origin_missing" }
  }

  return { ok: true, client, config, fromPostalCode }
}

export async function quoteCarrierFreightOptions(
  supabase: SupabaseClient,
  input: { partnerId: string; toPostalCode: string },
): Promise<CarrierQuoteResult> {
  const toPostalCode = String(input.toPostalCode || "").replace(/\D/g, "")
  const ctx = await loadCarrierContext(supabase, input.partnerId, toPostalCode)
  if (!ctx.ok) return { available: false, reason: ctx.reason }

  const { client, config, fromPostalCode } = ctx
  const services: SuperFreteServiceId[] =
    Array.isArray(config.services) && config.services.length > 0
      ? config.services
      : ([1, 2] as SuperFreteServiceId[])

  const requestParams = {
    fromPostalCode,
    toPostalCode,
    services,
    package: buildSuperFreteVolumes(config),
    options: {
      own_hand: Boolean(config.ownHand),
      receipt: Boolean(config.receipt),
      insurance_value: Number(config.insuranceValue || 0),
      use_insurance_value: Number(config.insuranceValue || 0) > 0,
    },
  }

  const cacheKey = `${input.partnerId}|${JSON.stringify(requestParams)}`
  const now = Date.now()
  const cached = carrierQuoteCache.get(cacheKey)
  if (cached && now - cached.at <= CARRIER_QUOTE_TTL_MS) {
    return cached.result
  }

  const inflight = carrierQuoteInflight.get(cacheKey)
  if (inflight) return inflight

  const pending = (async (): Promise<CarrierQuoteResult> => {
    try {
      const quotes = await client.calculateFreight(requestParams)

      const options: CarrierFreightOption[] = (Array.isArray(quotes) ? quotes : [])
        .filter((q: any) => q && !q.has_error && Number.isFinite(Number(q.price)))
        .map((q: any) => ({
          serviceId: Number(q.id),
          serviceName: q.name || SERVICE_LABELS[Number(q.id)] || `Serviço ${q.id}`,
          price: Math.round(Number(q.price) * 100) / 100,
          deliveryMinDays: q.delivery_range?.min ?? q.delivery_time ?? null,
          deliveryMaxDays: q.delivery_range?.max ?? q.delivery_time ?? null,
          companyName: q.company?.name || null,
        }))
        .filter((o: CarrierFreightOption) => o.serviceId > 0)
        .sort((a: CarrierFreightOption, b: CarrierFreightOption) => a.price - b.price)

      const result: CarrierQuoteResult =
        options.length === 0
          ? { available: false, reason: "no_options" }
          : { available: true, options, fromPostalCode }
      pruneCarrierQuoteCache(Date.now())
      carrierQuoteCache.delete(cacheKey)
      carrierQuoteCache.set(cacheKey, { at: Date.now(), result })
      return result
    } catch (err) {
      const stale = carrierQuoteCache.get(cacheKey)
      if (stale && Date.now() - stale.at <= CARRIER_QUOTE_STALE_MS) {
        console.warn("[carrier-quote] SuperFrete falhou; servindo cotação stale:", cacheKey)
        return stale.result
      }
      captureError(err, {
        module: "shipping",
        action: "quote_carrier_freight",
        partnerId: input.partnerId,
      })
      return { available: false, reason: "quote_failed" }
    }
  })()
  carrierQuoteInflight.set(cacheKey, pending)
  try {
    return await pending
  } finally {
    carrierQuoteInflight.delete(cacheKey)
  }
}

export async function quoteCarrierFreightFee(
  supabase: SupabaseClient,
  input: { partnerId: string; toPostalCode: string; serviceId: number },
): Promise<
  | { success: true; fee: number; breakdown: Record<string, unknown> }
  | { success: false; error: string; reason: CarrierUnavailableReason }
> {
  const quoted = await quoteCarrierFreightOptions(supabase, {
    partnerId: input.partnerId,
    toPostalCode: input.toPostalCode,
  })
  if (!quoted.available) {
    return { success: false, error: carrierReasonMessage(quoted.reason), reason: quoted.reason }
  }

  const selected = quoted.options.find((o) => o.serviceId === Number(input.serviceId))
  if (!selected) {
    return {
      success: false,
      error: carrierReasonMessage("no_options"),
      reason: "no_options",
    }
  }

  return {
    success: true,
    fee: selected.price,
    breakdown: {
      source: "superfrete",
      carrier: "SuperFrete",
      serviceId: selected.serviceId,
      serviceName: selected.serviceName,
      companyName: selected.companyName,
      deliveryMinDays: selected.deliveryMinDays,
      deliveryMaxDays: selected.deliveryMaxDays,
      fromPostalCode: quoted.fromPostalCode,
      toPostalCode: String(input.toPostalCode).replace(/\D/g, ""),
    },
  }
}
