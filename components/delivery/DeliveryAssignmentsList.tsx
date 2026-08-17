"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { listMyDeliveryAssignmentsAction } from "@/app/actions/delivery-drivers"

const buckets = [{ value: "pending", label: "Pendentes" }, { value: "in_progress", label: "Em andamento" }, { value: "completed", label: "Concluídas" }] as const

export default function DeliveryAssignmentsList() {
  const [bucket, setBucket] = useState<typeof buckets[number]["value"]>("pending")
  const [items, setItems] = useState<any[]>([])
  const [cursor, setCursor] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const load = async (nextBucket = bucket, before?: any, append = false) => {
    setLoading(true)
    const result = await listMyDeliveryAssignmentsAction({ bucket: nextBucket, limit: 20, beforeAssignedAt: before?.assignedAt, beforeId: before?.id })
    setLoading(false)
    if (!result.success) return
    setItems((current) => append ? [...current, ...result.items] : result.items)
    setCursor(result.nextCursor)
  }
  useEffect(() => { void load(bucket) }, [bucket])
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6"><div><p className="text-sm text-brand-inactive-text">Portal do Entregador</p><h1 className="text-3xl font-bold">Minhas entregas</h1></div><div className="flex gap-2 overflow-x-auto">{buckets.map((item) => <button key={item.value} onClick={() => setBucket(item.value)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${bucket === item.value ? "bg-brand-green text-white" : "border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface"}`}>{item.label}</button>)}</div><section className="rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface"><div className="divide-y divide-brand-border dark:divide-dark-border">{loading && items.length === 0 ? <p className="p-6 text-sm text-brand-inactive-text">Carregando...</p> : items.length === 0 ? <p className="p-6 text-sm text-brand-inactive-text">Nenhuma entrega nesta categoria.</p> : items.map((item) => <Link key={item.assignment_id} href={`/entregadores/entregas/${item.assignment_id}`} className="block px-5 py-5 hover:bg-brand-gray dark:hover:bg-dark-border/40"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><p className="font-bold">Pedido {item.order_number || `#${String(item.order_id).slice(0, 8)}`}</p><p className="text-sm text-brand-inactive-text">{item.partner_name} · {item.customer_name}</p><p className="mt-2 text-sm">{item.delivery_address || "Endereço não informado"}</p></div><div className="text-left md:text-right"><p className="font-semibold">R$ {Number(item.total_amount || 0).toFixed(2).replace(".", ",")}</p><p className="text-sm text-brand-inactive-text">Taxa: R$ {Number(item.delivery_fee || 0).toFixed(2).replace(".", ",")}</p></div></div></Link>)}</div>{cursor ? <div className="border-t border-brand-border p-4 text-center dark:border-dark-border"><button onClick={() => load(bucket, cursor, true)} disabled={loading} className="text-sm font-semibold text-brand-green">Carregar mais</button></div> : null}</section></main>
}
