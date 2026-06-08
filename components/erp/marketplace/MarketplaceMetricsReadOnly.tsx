"use client"

type MetricsProps = {
  entityType: "product" | "service" | "plan" | "seller"
  metrics: Record<string, number | string | null | undefined>
}

const LABELS: Record<string, Record<string, string>> = {
  product: {
    total_sales: "Vendas totais",
    sales_last_30_days: "Vendas (30 dias)",
    sales_last_7_days: "Vendas (7 dias)",
    views_count: "Visualizações",
    favorites_count: "Favoritos",
    marketplace_score: "Score marketplace",
  },
  service: {
    total_bookings: "Agendamentos totais",
    completed_bookings: "Agendamentos concluídos",
    bookings_last_30_days: "Agendamentos (30 dias)",
    views_count: "Visualizações",
    favorites_count: "Favoritos",
    marketplace_score: "Score marketplace",
  },
  plan: {
    total_signups: "Assinaturas totais",
    active_signups: "Assinaturas ativas",
    signups_last_30_days: "Assinaturas (30 dias)",
    views_count: "Visualizações",
    favorites_count: "Favoritos",
    marketplace_score: "Score marketplace",
  },
  seller: {
    vendas_totais: "Vendas totais",
    vendas_produtos: "Vendas de produtos",
    vendas_servicos: "Vendas de serviços",
    vendas_assinaturas: "Vendas de assinaturas",
    marketplace_reputation: "Reputação marketplace",
  },
}

export function MarketplaceMetricsReadOnly({ entityType, metrics }: MetricsProps) {
  const labels = LABELS[entityType] || {}
  const entries = Object.entries(labels)

  if (entries.length === 0) return null

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mt-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Métricas do marketplace (somente leitura)</h3>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {entries.map(([key, label]) => (
          <div key={key}>
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="text-sm font-medium text-gray-900">
              {formatMetricValue(key, metrics[key])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function formatMetricValue(key: string, value: number | string | null | undefined): string {
  if (value == null) return "0"
  if (key.includes("score") || key.includes("reputation")) {
    return Number(value).toFixed(2)
  }
  return String(value)
}
