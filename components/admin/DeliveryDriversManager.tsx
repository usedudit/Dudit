"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { PlusIcon, SearchIcon, TruckIcon } from "@/lib/icons"
import { toast } from "@/hooks/use-notification"
import {
  listDeliveryDriversAdminAction,
  updateDeliveryDriverAdminAction,
} from "@/app/actions/admin/delivery-drivers"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { Button } from "@/components/reusable"

type DriverRow = any

export default function DeliveryDriversManager({ initialData }: { initialData: { items: DriverRow[]; hasMore: boolean; nextCursor: string | null } }) {
  const [items, setItems] = useState<DriverRow[]>(initialData.items || [])
  const [cursor, setCursor] = useState(initialData.nextCursor)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")

  const filteredItems = useMemo(() => items.filter((driver) => {
    const haystack = `${driver.profile?.full_name || ""} ${driver.email || ""} ${driver.city || ""} ${driver.neighborhood || ""}`.toLowerCase()
    return (!search.trim() || haystack.includes(search.trim().toLowerCase())) && (status === "all" || (status === "active" ? driver.is_active : !driver.is_active))
  }), [items, search, status])

  const stats = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.is_active).length,
    available: items.filter((item) => item.is_active && item.availability_status === "available").length,
    offline: items.filter((item) => !item.is_active || item.availability_status === "offline").length,
  }), [items])

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
    const result = await updateDeliveryDriverAdminAction({ driverId: driver.user_id, city: driver.city, neighborhood: driver.neighborhood, vehicleType: driver.vehicle_type, isActive: !driver.is_active, notes: driver.notes || "" })
    setLoading(false)
    if (!result.success) return toast.error(result.error)
    setItems((current) => current.map((item) => item.user_id === driver.user_id ? { ...item, is_active: !driver.is_active, availability_status: driver.is_active ? "offline" : item.availability_status } : item))
    toast.success(driver.is_active ? "Entregador desativado." : "Entregador ativado.")
  }

  return (
    <main className="max-w-[1300px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="text-sm text-brand-inactive-text">Administração Dudit</p><h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Entregadores</h1><p className="mt-1 text-sm text-brand-inactive-text">Gerencie os entregadores da plataforma e seus acessos.</p></div>
        <Link href="/ddt-admin/entregadores/novo" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-green/90"><PlusIcon size={18} />Novo entregador</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Total", stats.total], ["Ativos", stats.active], ["Disponíveis", stats.available], ["Offline", stats.offline]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-inactive-text">{label}</p></div>)}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface md:flex-row">
        <label className="relative flex-1"><SearchIcon size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-inactive-text" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, email ou localização" className="w-full rounded-xl border border-brand-border bg-brand-gray py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-border/40" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-brand-border bg-brand-gray px-3 py-2.5 text-sm dark:border-dark-border dark:bg-dark-border/40"><option value="all">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
      </div>

      {filteredItems.length === 0 ? <div className="rounded-2xl border border-dashed border-brand-border bg-white p-12 text-center dark:border-dark-border dark:bg-dark-surface"><TruckIcon size={38} className="mx-auto text-brand-inactive-text" /><p className="mt-3 font-semibold">Nenhum entregador encontrado</p><p className="mt-1 text-sm text-brand-inactive-text">Cadastre o primeiro entregador da plataforma.</p></div> : <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{filteredItems.map((driver) => <article key={driver.user_id} className="flex flex-col rounded-2xl border border-brand-border bg-white p-5 transition hover:border-brand-dark/30 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><UserProfileImage fullName={driver.profile?.full_name || "Entregador"} imageUrl={driver.profile?.avatar_url} className="h-14 w-14 text-xl" /><div className="min-w-0"><h2 className="truncate font-bold">{driver.profile?.full_name || "Entregador"}</h2><p className="truncate text-xs text-brand-inactive-text">{driver.email || "Email não disponível"}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${driver.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{driver.is_active ? "Ativo" : "Inativo"}</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-brand-inactive-text">Localização</p><p className="mt-1 font-semibold">{driver.city} · {driver.neighborhood}</p></div><div><p className="text-xs text-brand-inactive-text">Veículo</p><p className="mt-1 font-semibold capitalize">{driver.vehicle_type}</p></div></div>
        <div className="mt-5 flex items-center justify-between border-t border-brand-border pt-4 dark:border-dark-border"><span className="text-xs font-medium text-brand-inactive-text">{driver.availability_status === "available" ? "Disponível" : "Offline"}</span><div className="flex items-center gap-3"><button type="button" onClick={() => toggle(driver)} disabled={loading} className="text-xs font-semibold text-brand-inactive-text hover:text-brand-dark">{driver.is_active ? "Desativar" : "Ativar"}</button><Link href={`/ddt-admin/entregadores/${driver.user_id}`} className="text-sm font-semibold text-brand-green">Ver detalhes</Link></div></div>
      </article>)}</div>}
      {cursor ? <div className="flex justify-center"><Button variant="outline" onClick={loadMore} disabled={loading}>{loading ? "Carregando..." : "Carregar mais"}</Button></div> : null}

    </main>
  )
}
