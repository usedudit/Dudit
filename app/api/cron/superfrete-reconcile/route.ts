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
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
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
        "id, order_id, partner_id, kind, return_request_id, status, tracking_number, tracking_url, payload, external_label_id",
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

    const reconcile = async (shipment: ShipmentRow) => {
      checked++

      try {
        const client = await getClient(shipment.partner_id)
        if (!client) {
          throw new Error("Integração SuperFrete indisponível para o parceiro")
        }

        const info = await client.getOrderInfo(shipment.external_label_id)
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
        failed++
        console.warn(
          `[SuperFrete Reconcile] Falha ao sincronizar etiqueta ${shipment.external_label_id}:`,
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
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map(reconcile))
    }

    return NextResponse.json({
      success: true,
      checked,
      processed,
      failed,
      total: rows.length,
    })
  } catch (error: any) {
    captureError(error, {
      module: "shipping",
      action: "superfrete_reconcile_cron",
    })
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 })
  }
}
