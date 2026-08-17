"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "@/hooks/use-notification"
import { confirmDeliveryPaymentReceivedAction, transitionMyDeliveryAssignmentAction } from "@/app/actions/delivery-drivers"

const labels: Record<string, string> = { assigned: "Atribuída", accepted: "Aceita", picked_up: "Pedido retirado", out_for_delivery: "Saiu para entrega", delivered: "Entregue", failed: "Falha na entrega", cancelled: "Cancelada" }
const nextStatus: Record<string, { status: "accepted" | "picked_up" | "out_for_delivery" | "delivered"; label: string }> = { assigned: { status: "accepted", label: "Aceitar entrega" }, accepted: { status: "picked_up", label: "Marcar como retirada" }, picked_up: { status: "out_for_delivery", label: "Marcar como saiu para entrega" }, out_for_delivery: { status: "delivered", label: "Marcar como entregue" } }

export default function DeliveryAssignmentDetail({ assignment: initial }: { assignment: any }) {
  const [assignment, setAssignment] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [failureOpen, setFailureOpen] = useState(false)
  const [failureReason, setFailureReason] = useState("")
  const advance = async () => {
    const action = nextStatus[assignment.status]
    if (!action) return
    setLoading(true)
    const result = await transitionMyDeliveryAssignmentAction({ assignmentId: assignment.assignment_id, status: action.status })
    setLoading(false)
    if (!result.success) return toast.error(result.error)
    setAssignment({ ...assignment, status: action.status, completed_at: action.status === "delivered" ? new Date().toISOString() : assignment.completed_at })
    toast.success("Status atualizado.")
  }
  const fail = async () => {
    if (!failureReason.trim()) return toast.error("Informe o motivo da falha.")
    setLoading(true)
    const result = await transitionMyDeliveryAssignmentAction({ assignmentId: assignment.assignment_id, status: "failed", failureReason })
    setLoading(false)
    if (!result.success) return toast.error(result.error)
    setAssignment({ ...assignment, status: "failed", failure_reason: failureReason })
    setFailureOpen(false)
  }
  const confirmPayment = async () => {
    setLoading(true)
    const result = await confirmDeliveryPaymentReceivedAction(assignment.assignment_id)
    setLoading(false)
    if (!result.success) return toast.error(result.error)
    setAssignment({ ...assignment, payment_confirmed_at: result.data?.confirmed_at || new Date().toISOString() })
    toast.success("Recebimento operacional registrado.")
  }
  const cashPayment = /dinheiro|cash|money/i.test(String(assignment.payment_method || ""))
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6"><Link href="/entregadores/entregas" className="text-sm font-semibold text-brand-green">← Voltar para minhas entregas</Link><div className="rounded-2xl border border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><p className="text-sm text-brand-inactive-text">{assignment.partner_name}</p><h1 className="text-2xl font-bold">Pedido {assignment.order_number || `#${String(assignment.order_id).slice(0, 8)}`}</h1></div><span className="h-fit rounded-full bg-brand-gray px-3 py-1 text-sm font-semibold dark:bg-dark-border">{labels[assignment.status] || assignment.status}</span></div><div className="mt-6 grid gap-5 md:grid-cols-2"><div><p className="text-xs uppercase text-brand-inactive-text">Cliente</p><p className="mt-1 font-semibold">{assignment.customer_name}</p>{assignment.customer_phone ? <a href={`tel:${assignment.customer_phone}`} className="text-sm text-brand-green">{assignment.customer_phone}</a> : <p className="text-sm text-brand-inactive-text">Telefone não informado</p>}</div><div><p className="text-xs uppercase text-brand-inactive-text">Endereço</p><p className="mt-1 text-sm">{assignment.delivery_address || "Endereço não informado"}</p></div><div><p className="text-xs uppercase text-brand-inactive-text">Pagamento</p><p className="mt-1 text-sm">{assignment.payment_method || "Não informado"} {assignment.payment_status ? `· ${assignment.payment_status}` : ""}</p></div><div><p className="text-xs uppercase text-brand-inactive-text">Valores</p><p className="mt-1 text-sm">Pedido: R$ {Number(assignment.total_amount || 0).toFixed(2).replace(".", ",")} · Taxa: R$ {Number(assignment.delivery_fee || 0).toFixed(2).replace(".", ",")}</p></div></div>{assignment.items?.length ? <div className="mt-6 border-t border-brand-border pt-5 dark:border-dark-border"><p className="text-xs uppercase text-brand-inactive-text">Itens resumidos</p><ul className="mt-2 space-y-1 text-sm">{assignment.items.map((item: any, index: number) => <li key={`${item.name}-${index}`}>{item.quantity || 0}x {item.name || "Item"}</li>)}</ul></div> : null}{assignment.notes ? <div className="mt-6 rounded-xl bg-brand-gray p-4 text-sm dark:bg-dark-border"><p className="font-semibold">Observações</p><p className="mt-1">{assignment.notes}</p></div> : null}<div className="mt-6 flex flex-col gap-3">{nextStatus[assignment.status] ? <button onClick={advance} disabled={loading} className="rounded-xl bg-brand-green px-4 py-3 font-semibold text-white disabled:opacity-50">{nextStatus[assignment.status].label}</button> : null}{["assigned", "accepted", "picked_up", "out_for_delivery"].includes(assignment.status) ? <button onClick={() => setFailureOpen(true)} disabled={loading} className="rounded-xl border border-red-300 px-4 py-3 font-semibold text-red-700">Informar problema/falha</button> : null}{cashPayment && ["out_for_delivery", "delivered"].includes(assignment.status) && !assignment.payment_confirmed_at ? <button onClick={confirmPayment} disabled={loading} className="rounded-xl border border-brand-border px-4 py-3 font-semibold">Confirmar recebimento em dinheiro</button> : null}{assignment.payment_confirmed_at ? <p className="text-center text-sm text-emerald-700">Recebimento operacional confirmado.</p> : null}</div></div>{failureOpen ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5"><label className="text-sm font-semibold">Motivo da falha<textarea value={failureReason} onChange={(event) => setFailureReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-red-200 bg-white p-3 font-normal" /></label><div className="mt-3 flex gap-3"><button onClick={fail} disabled={loading} className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">Registrar falha</button><button onClick={() => setFailureOpen(false)} className="rounded-xl border border-red-200 px-4 py-2">Cancelar</button></div></div> : null}</main>
}
