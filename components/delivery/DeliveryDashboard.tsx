"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "@/hooks/use-notification"
import { setMyDeliveryAvailabilityAction } from "@/app/actions/delivery-drivers"

const statusLabels: Record<string, string> = { assigned: "Atribuída", accepted: "Aceita", picked_up: "Retirada", out_for_delivery: "Saiu para entrega", delivered: "Entregue", failed: "Falhou" }

export default function DeliveryDashboard({ dashboard, deliveries }: { dashboard: any; deliveries: any[] }) {
  const [availability, setAvailability] = useState(String(dashboard?.availability || "offline"))
  const [saving, setSaving] = useState(false)
  const changeAvailability = async (value: "available" | "offline") => {
    setSaving(true)
    const result = await setMyDeliveryAvailabilityAction(value)
    setSaving(false)
    if (!result.success) return toast.error(result.error)
    setAvailability(value)
  }
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm text-brand-inactive-text">Operação</p><h1 className="text-3xl font-bold">Olá, entregador</h1></div><div className="flex items-center gap-2 rounded-xl border border-brand-border bg-white p-2 dark:border-dark-border dark:bg-dark-surface"><span className="px-2 text-sm font-medium">Disponibilidade</span><select value={availability === "occupied" ? "available" : availability} onChange={(event) => changeAvailability(event.target.value as "available" | "offline")} disabled={saving || availability === "occupied"} className="rounded-lg border border-brand-border bg-transparent px-2 py-1.5 text-sm"><option value="available">Disponível</option><option value="offline">Offline</option></select></div></div>
    <div className="grid gap-4 md:grid-cols-4">{[["Pendentes", dashboard?.pending || 0], ["Em andamento", dashboard?.in_progress || 0], ["Concluídas", dashboard?.completed || 0], ["Status", availability === "occupied" ? "Ocupado" : availability === "available" ? "Disponível" : "Offline"]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface"><p className="text-sm text-brand-inactive-text">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    <section className="rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface"><div className="flex items-center justify-between border-b border-brand-border px-5 py-4 dark:border-dark-border"><h2 className="font-bold">Últimas entregas</h2><Link href="/entregadores/entregas" className="text-sm font-semibold text-brand-green">Ver todas</Link></div><div className="divide-y divide-brand-border dark:divide-dark-border">{deliveries.length === 0 ? <p className="p-5 text-sm text-brand-inactive-text">Nenhuma entrega atribuída.</p> : deliveries.map((delivery) => <Link href={`/entregadores/entregas/${delivery.assignment_id}`} key={delivery.assignment_id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-brand-gray dark:hover:bg-dark-border/40"><div><p className="font-semibold">Pedido {delivery.order_number || `#${String(delivery.order_id).slice(0, 8)}`}</p><p className="text-sm text-brand-inactive-text">{delivery.partner_name} · {delivery.customer_name}</p></div><span className="text-sm">{statusLabels[delivery.status] || delivery.status}</span></Link>)}</div></section>
  </main>
}
