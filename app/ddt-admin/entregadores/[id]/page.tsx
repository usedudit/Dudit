import Link from "next/link"
import { AdminHeader } from "@/components/admin/admin-header"
import { getDeliveryDriverAdminAction } from "@/app/actions/admin/delivery-drivers"

export default async function AdminDeliveryDriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getDeliveryDriverAdminAction(id)
  if (!result.success) {
    return <><AdminHeader pageTitle="Entregadores" /><main className="p-6"><p className="text-sm text-brand-inactive-text">{result.error}</p><Link href="/ddt-admin/entregadores" className="mt-4 inline-block text-sm font-semibold text-brand-green">Voltar para entregadores</Link></main></>
  }
  const { driver } = result
  const profile = driver.profile
  return (
    <>
      <AdminHeader pageTitle="Detalhes do entregador" backHref="/ddt-admin/entregadores" />
      <main className="max-w-[1300px] space-y-6 p-4 md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="text-sm text-brand-inactive-text">Entregadores Dudit</p><h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{profile?.full_name || "Entregador"}</h1><p className="mt-1 text-sm text-brand-inactive-text">{driver.email || "Email não disponível"}</p></div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${driver.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{driver.is_active ? "Ativo" : "Inativo"}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[["Entregas realizadas", driver.metrics.completed], ["Total de atribuições", driver.metrics.total], ["Taxa de sucesso", `${driver.metrics.successRate}%`], ["Falhas", driver.metrics.failed]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-brand-border bg-white p-5 dark:border-dark-border dark:bg-dark-surface"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-inactive-text">{label}</p></div>)}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface"><h2 className="font-bold">Dados cadastrais</h2><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-brand-inactive-text">Telefone</dt><dd className="font-semibold">{profile?.phone || "-"}</dd></div><div className="flex justify-between gap-4"><dt className="text-brand-inactive-text">Cidade</dt><dd className="font-semibold">{driver.city}</dd></div><div className="flex justify-between gap-4"><dt className="text-brand-inactive-text">Bairro</dt><dd className="font-semibold">{driver.neighborhood}</dd></div><div className="flex justify-between gap-4"><dt className="text-brand-inactive-text">Veículo</dt><dd className="font-semibold capitalize">{driver.vehicle_type}</dd></div><div className="flex justify-between gap-4"><dt className="text-brand-inactive-text">Disponibilidade</dt><dd className="font-semibold capitalize">{driver.availability_status}</dd></div></dl>{driver.notes ? <p className="mt-5 rounded-xl bg-brand-gray p-3 text-sm dark:bg-dark-border">{driver.notes}</p> : null}</section>
          <section className="rounded-2xl border border-brand-border bg-white p-6 lg:col-span-2 dark:border-dark-border dark:bg-dark-surface"><h2 className="font-bold">Parceiros vinculados</h2><div className="mt-4 space-y-2">{driver.partners.length ? driver.partners.map((partner: any) => <div key={partner.id} className="flex items-center justify-between rounded-xl border border-brand-border px-4 py-3 text-sm dark:border-dark-border"><span>{partner.partner_name}</span><span className="text-xs text-brand-inactive-text">{partner.is_active ? "Ativo" : "Inativo"}</span></div>) : <p className="text-sm text-brand-inactive-text">Autônomo / sem vínculos específicos.</p>}</div></section>
        </div>
        <section className="overflow-hidden rounded-2xl border border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface"><div className="border-b border-brand-border px-6 py-5 dark:border-dark-border"><h2 className="font-bold">Histórico de entregas</h2></div><div className="divide-y divide-brand-border dark:divide-dark-border">{driver.assignments.length ? driver.assignments.map((assignment: any) => <div key={assignment.id} className="flex flex-col justify-between gap-2 px-6 py-4 text-sm md:flex-row md:items-center"><div><p className="font-semibold">Pedido #{String(assignment.order_id).slice(0, 8)}</p><p className="text-xs text-brand-inactive-text">{assignment.partner_name} · {new Date(assignment.assigned_at).toLocaleDateString("pt-BR")}</p></div><span className="font-semibold capitalize">{assignment.status}</span></div>) : <p className="p-6 text-sm text-brand-inactive-text">Nenhuma entrega registrada.</p>}</div></section>
      </main>
    </>
  )
}
