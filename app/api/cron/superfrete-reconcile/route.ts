import { isValidBearerToken } from "@/lib/security/timing-safe"
import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { captureError } from "@/lib/monitoring/sentry"
import {
  SUPERFRETE_PROVIDER,
  findSuperFreteIntegration,
  buildSuperFreteClient,
} from "@/lib/services/shipping/superfrete-integration"
import { applySuperFreteShipmentStatus } from "@/lib/services/shipping/superfrete-status-sync"

// A SuperFrete tenta entregar cada evento 5x (15 min de intervalo) e depois
// descarta. Este cron relê as etiquetas ainda abertas via API para recuperar
// eventos perdidos (deploy, indisponibilidade, secret rotacionado etc.).
const MAX_SHIPMENTS_PER_RUN = 60
const MAX_SHIPMENT_AGE_DAYS = 45
const CONCURRENCY = 5

// O cron-job.org corta a conexão em 30s. Mantemos uma margem para devolver a
// resposta (e o log) em vez de a execução ser marcada como timeout. Etiquetas
// não processadas ficam para a próxima rodada: a fila gira por updated_at.
const RUN_BUDGET_MS = 22_000
const MAX_REQUEST_MS = 20_000
const MIN_BATCH_WINDOW_MS = 3_000

interface ShipmentRow {
  id: string
  order_id: string
  partner_id: string
  kind: string | null
  return_request_id: string | null
  status: string | null
  tracking_number: string | null
  tracking_url: string | null
  payload: Record<string, unknown> | null
  external_label_id: string
  created_at?: string
}

/**
 * Detecta se o erro indica que o pedido/etiqueta não existe na SuperFrete
 * (ex.: HTTP 404, HTTP 400 com "Pedido não encontrado" ou validação orders.0).
 */
function isNotFoundError(err: any): boolean {
  if (err?.status === 404) return true
  const msg = String(err?.message || "").toLowerCase()
  const detailStr = typeof err?.detail === "object" ? JSON.stringify(err.detail).toLowerCase() : ""
  return (
    msg.includes("pedido não encontrado") ||
    msg.includes("não encontrado") ||
    msg.includes("not found") ||
    detailStr.includes("pedido não encontrado") ||
    detailStr.includes("não encontrado") ||
    detailStr.includes("not found") ||
    detailStr.includes("orders.0")
  )
}

/**
 * Detecta erro de autenticação (token expirado ou revogado no parceiro).
 */
function isAuthError(err: any): boolean {
  if (err?.status === 401 || err?.status === 403) return true
  const msg = String(err?.message || "").toLowerCase()
  return msg.includes("unauthorized") || msg.includes("não autorizado")
}

/**
 * Detecta se a SuperFrete respondeu Rate Limit (HTTP 429).
 */
function isRateLimitError(err: any): boolean {
  if (err?.status === 429) return true
  const msg = String(err?.message || "").toLowerCase()
  return msg.includes("too many requests") || msg.includes("rate limit")
}

export async function GET(req: Request) {
  const startedAt = Date.now()
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!isValidBearerToken(authHeader, secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getAdminClient()

    const { data: integrations, error: integrationsError } = await supabase
      .from("partner_integrations")
      .select("partner_id")
      .eq("provider_slug", SUPERFRETE_PROVIDER)
      .eq("status", "connected")
      .not("access_token_encrypted", "is", null)

    if (integrationsError) {
      throw new Error(integrationsError.message)
    }

    const partnerIds = (integrations || []).map((row: any) => row.partner_id)
    if (partnerIds.length === 0) {
      return NextResponse.json({ success: true, checked: 0, processed: 0, failed: 0, total: 0 })
    }

    const since = new Date(Date.now() - MAX_SHIPMENT_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Só etiquetas abertas. Ordenar por updated_at faz o lote girar: cada
    // passagem grava last_event_at no payload e joga a etiqueta para o fim.
    const { data: shipments, error: shipmentsError } = await supabase
      .from("order_shipments")
      .select(
        "id, order_id, partner_id, kind, return_request_id, status, tracking_number, tracking_url, payload, external_label_id, created_at",
      )
      .eq("provider_slug", SUPERFRETE_PROVIDER)
      .not("external_label_id", "is", null)
      .in("partner_id", partnerIds)
      .in("status", ["pending", "released", "posted", "in_transit"])
      .gte("created_at", since)
      .order("updated_at", { ascending: true })
      .limit(MAX_SHIPMENTS_PER_RUN)

    if (shipmentsError) {
      throw new Error(shipmentsError.message)
    }

    const clients = new Map<string, ReturnType<typeof buildSuperFreteClient>>()
    const getClient = async (partnerId: string) => {
      if (!clients.has(partnerId)) {
        const integration = await findSuperFreteIntegration(supabase, partnerId)
        clients.set(partnerId, buildSuperFreteClient(integration))
      }
      return clients.get(partnerId) || null
    }

    let checked = 0
    let processed = 0
    let failed = 0
    const authFailedPartners = new Set<string>()
    let hitRateLimit = false

    const reconcile = async (shipment: ShipmentRow) => {
      if (hitRateLimit) return
      if (authFailedPartners.has(shipment.partner_id)) return

      checked++
      const cleanLabelId = String(shipment.external_label_id || "").trim()

      // 1. Validação básica do ID da etiqueta externa
      if (!cleanLabelId || cleanLabelId === "undefined" || cleanLabelId === "null") {
        await supabase
          .from("order_shipments")
          .update({
            status: "failed",
            payload: {
              ...(shipment.payload || {}),
              last_event: "invalid_label_id",
              last_event_at: new Date().toISOString(),
              last_reconcile_error: "ID de etiqueta externo ausente ou inválido.",
            },
          })
          .eq("id", shipment.id)
          .eq("partner_id", shipment.partner_id)
        processed++
        return
      }

      // 2. Etiqueta gerada com checkout simulado (sandbox / fallback de saldo)
      // Não existe pedido real na SuperFrete a reconciliar via API.
      if (shipment.payload?.payment_simulated) {
        await supabase
          .from("order_shipments")
          .update({
            status: "failed",
            payload: {
              ...(shipment.payload || {}),
              last_event: "skipped_simulated",
              last_event_at: new Date().toISOString(),
              last_reconcile_error:
                "Etiqueta gerada em modo simulado (não existe na SuperFrete). Reconciliação encerrada.",
            },
          })
          .eq("id", shipment.id)
          .eq("partner_id", shipment.partner_id)
        processed++
        return
      }

      // 3. Etiqueta no carrinho ('pending') expirada
      // Na SuperFrete, se uma etiqueta ficou 'pending' (não paga) por mais de 14 dias,
      // o carrinho expirou/foi limpo. Não adianta consultar a cada 5 min.
      const PENDING_MAX_AGE_DAYS = 14
      const createdAtMs = shipment.created_at ? new Date(shipment.created_at).getTime() : 0
      if (
        shipment.status === "pending" &&
        createdAtMs > 0 &&
        Date.now() - createdAtMs > PENDING_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
      ) {
        await supabase
          .from("order_shipments")
          .update({
            status: "failed",
            payload: {
              ...(shipment.payload || {}),
              last_event: "cart_expired",
              last_event_at: new Date().toISOString(),
              last_reconcile_error: "Etiqueta não paga no carrinho expirou após 14 dias.",
            },
          })
          .eq("id", shipment.id)
          .eq("partner_id", shipment.partner_id)
        processed++
        return
      }

      try {
        const client = await getClient(shipment.partner_id)
        if (!client) {
          throw new Error("Integração SuperFrete indisponível para o parceiro")
        }

        // Recalcula o fôlego restante aqui: a busca da integração acima também
        // consome tempo, e o corte precisa acontecer antes do cron-job.org.
        const timeoutMs = Math.min(MAX_REQUEST_MS, Math.max(1_000, deadline - Date.now()))
        const info = await client.getOrderInfo(cleanLabelId, timeoutMs)
        const status = typeof info?.status === "string" ? info.status : null
        if (!status) {
          throw new Error("SuperFrete não retornou status da etiqueta")
        }

        const tracking = info?.tracking || null
        const deliveredAt = status === "delivered" ? info?.delivered_at || null : null

        await applySuperFreteShipmentStatus({
          supabase,
          shipment,
          data: {
            status,
            event: "reconcile",
            tracking,
            trackingUrl: info?.tracking_url || null,
            paidAt: info?.paid_at || null,
            createdAt: info?.created_at || null,
            generatedAt: info?.generated_at || null,
            postedAt: info?.posted_at || null,
            deliveredAt,
            canceledAt: info?.canceled_at || null,
          },
          source: "system",
        })
        processed++
      } catch (err: any) {
        // Pedido não encontrado na SuperFrete (404 ou 400 'orders.0: Pedido não encontrado'):
        // A etiqueta não existe (expirou, foi apagada ou criada em outro ambiente/sandbox).
        // Marca como 'failed' para sair definitivamente da fila e não gera alerta no Sentry.
        if (isNotFoundError(err)) {
          console.info(
            `[SuperFrete Reconcile] Etiqueta ${cleanLabelId} não encontrada na SuperFrete. Encerrando reconciliação (status='failed').`,
          )
          await supabase
            .from("order_shipments")
            .update({
              status: "failed",
              payload: {
                ...(shipment.payload || {}),
                last_event: "not_found",
                last_event_at: new Date().toISOString(),
                last_reconcile_error:
                  "Pedido não encontrado na SuperFrete. Etiqueta encerrada.",
              },
            })
            .eq("id", shipment.id)
            .eq("partner_id", shipment.partner_id)
          processed++
          return
        }

        // Erro de autenticação do parceiro (token inválido/expirado):
        if (isAuthError(err)) {
          authFailedPartners.add(shipment.partner_id)
          failed++
          console.warn(
            `[SuperFrete Reconcile] Parceiro ${shipment.partner_id} não autorizado na SuperFrete (token expirado ou inválido).`,
          )
          await supabase
            .from("order_shipments")
            .update({
              payload: {
                ...(shipment.payload || {}),
                last_event: "reconcile_auth_error",
                last_event_at: new Date().toISOString(),
                last_reconcile_error: "Token SuperFrete não autorizado ou expirado.",
              },
            })
            .eq("id", shipment.id)
            .eq("partner_id", shipment.partner_id)
          return
        }

        // Rate Limit da SuperFrete (HTTP 429):
        if (isRateLimitError(err)) {
          hitRateLimit = true
          console.warn(
            "[SuperFrete Reconcile] Rate limit atingido na SuperFrete. Interrompendo lote atual.",
          )
          return
        }

        failed++
        console.warn(
          `[SuperFrete Reconcile] Falha ao sincronizar etiqueta ${cleanLabelId}:`,
          err?.message || err,
        )
        captureError(err, {
          module: "shipping",
          action: "reconcile_shipment",
          partnerId: shipment.partner_id,
        })

        // Marca a tentativa para a etiqueta não ficar presa no início da fila.
        await supabase
          .from("order_shipments")
          .update({
            payload: {
              ...(shipment.payload || {}),
              last_event: "reconcile_error",
              last_event_at: new Date().toISOString(),
              last_reconcile_error: err?.message || "Erro desconhecido",
            },
          })
          .eq("id", shipment.id)
          .eq("partner_id", shipment.partner_id)
      }
    }

    const rows = (shipments || []) as ShipmentRow[]
    const deadline = startedAt + RUN_BUDGET_MS
    let deferred = 0

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      if (hitRateLimit) {
        deferred = rows.length - i
        break
      }

      const remaining = deadline - Date.now()
      if (remaining < MIN_BATCH_WINDOW_MS) {
        deferred = rows.length - i
        break
      }

      await Promise.all(rows.slice(i, i + CONCURRENCY).map(reconcile))
    }

    return NextResponse.json({
      success: true,
      checked,
      processed,
      failed,
      total: rows.length,
      deferred,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error: any) {
    captureError(error, {
      module: "shipping",
      action: "superfrete_reconcile_cron",
    })
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 })
  }
}
