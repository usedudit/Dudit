"use client"

import { useState } from "react"
import { toast } from "@/hooks/use-notification"
import {
  createDeliveryDriverInvitationAdminAction,
  listDeliveryDriversAdminAction,
  updateDeliveryDriverAdminAction,
} from "@/app/actions/admin/delivery-drivers"

type DriverRow = any

export default function DeliveryDriversManager({ initialData }: { initialData: { items: DriverRow[]; hasMore: boolean; nextCursor: string | null } }) {
  const [items, setItems] = useState<DriverRow[]>(initialData.items || [])
  const [cursor, setCursor] = useState(initialData.nextCursor)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: "", fullName: "", phone: "", city: "", neighborhood: "", vehicleType: "moto", notes: "" })

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    const result = await createDeliveryDriverInvitationAdminAction({ ...form, vehicleType: form.vehicleType as "moto" | "carro" })
    setLoading(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(result.emailSent ? "Convite enviado por email." : "Convite criado, mas o email não pôde ser enviado.")
    setForm({ email: "", fullName: "", phone: "", city: "", neighborhood: "", vehicleType: "moto", notes: "" })
  }

  const loadMore = async () => {
    if (!cursor || loading) return
    setLoading(true)
    const result = await listDeliveryDriversAdminAction({ limit: 25, cursor })
    setLoading(false)
    if (!result.success) return toast.error(result.error)
    setItems((current) => [...current, ...result.items])
    setCursor(result.nextCursor)
  }

  const toggle = async (driver: DriverRow) => {
    setLoading(true)
    const result = await updateDeliveryDriverAdminAction({
      driverId: driver.user_id,
      city: driver.city,
      neighborhood: driver.neighborhood,
      vehicleType: driver.vehicle_type,
      isActive: !driver.is_active,
      notes: driver.notes || "",
    })
    setLoading(false)
    if (!result.success) return toast.error(result.error)
    setItems((current) => current.map((item) => item.user_id === driver.user_id ? { ...item, is_active: !driver.is_active, availability_status: driver.is_active ? "offline" : item.availability_status } : item))
    toast.success(driver.is_active ? "Entregador desativado." : "Entregador ativado.")
  }

  return (
    <main className="p-6 md:p-8 space-y-8 max-w-7xl">
      <section className="rounded-2xl border border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-semibold">Novo convite</h2>
        <p className="mt-1 text-sm text-brand-inactive-text">O entregador cria a própria senha e não entra em partner_users.</p>
        <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
          {([['fullName', 'Nome'], ['email', 'Email'], ['phone', 'Telefone'], ['city', 'Cidade'], ['neighborhood', 'Bairro']] as const).map(([key, label]) => (
            <label key={key} className="text-sm font-medium">
              {label}
              <input required value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-1 w-full rounded-xl border border-brand-border bg-transparent px-3 py-2.5 font-normal" />
            </label>
          ))}
          <label className="text-sm font-medium">Veículo
            <select value={form.vehicleType} onChange={(event) => setForm({ ...form, vehicleType: event.target.value })} className="mt-1 w-full rounded-xl border border-brand-border bg-transparent px-3 py-2.5 font-normal">
              <option value="moto">Moto</option><option value="carro">Carro</option>
            </select>
          </label>
          <label className="text-sm font-medium md:col-span-2">Observações
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-1 min-h-20 w-full rounded-xl border border-brand-border bg-transparent px-3 py-2.5 font-normal" />
          </label>
          <button disabled={loading} className="rounded-xl bg-brand-green px-5 py-3 font-semibold text-white disabled:opacity-50 md:col-span-2">{loading ? "Processando..." : "Criar convite"}</button>
        </form>
      </section>

      <section className="rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
        <div className="border-b border-brand-border px-6 py-5 dark:border-dark-border"><h2 className="text-xl font-semibold">Entregadores cadastrados</h2></div>
        <div className="divide-y divide-brand-border dark:divide-dark-border">
          {items.length === 0 ? <p className="p-6 text-sm text-brand-inactive-text">Nenhum entregador cadastrado.</p> : items.map((driver) => (
            <div key={driver.user_id} className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div><p className="font-semibold">{driver.profile?.full_name || "Entregador"}</p><p className="text-sm text-brand-inactive-text">{driver.email || "Email não disponível"} · {driver.city}/{driver.neighborhood} · {driver.vehicle_type}</p></div>
              <div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${driver.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{driver.is_active ? "Ativo" : "Inativo"}</span><button onClick={() => toggle(driver)} disabled={loading} className="rounded-lg border border-brand-border px-3 py-2 text-sm">{driver.is_active ? "Desativar" : "Ativar"}</button></div>
            </div>
          ))}
        </div>
        {cursor ? <div className="border-t border-brand-border p-5 text-center dark:border-dark-border"><button onClick={loadMore} disabled={loading} className="text-sm font-semibold text-brand-green">Carregar mais</button></div> : null}
      </section>
    </main>
  )
}
