"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, FormSection, Input } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { createDeliveryDriverInvitationAdminAction } from "@/app/actions/admin/delivery-drivers"

export default function DeliveryDriverInvitePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: "", fullName: "", phone: "", city: "", neighborhood: "", vehicleType: "moto", notes: "" })

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    const result = await createDeliveryDriverInvitationAdminAction({ ...form, vehicleType: form.vehicleType as "moto" | "carro" })
    setLoading(false)
    if (!result.success) return toast.error(result.error)
    toast.success(result.emailSent ? "Convite enviado por email." : "Convite criado.")
    router.push("/ddt-admin/entregadores")
    router.refresh()
  }

  return <main className="max-w-[1100px] p-4 md:p-6"><form onSubmit={submit} className="space-y-6"><div><h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Novo entregador</h1><p className="mt-1 text-sm text-brand-inactive-text">Cadastre os dados operacionais e envie o convite para o email do entregador.</p></div><FormSection title="Dados do entregador"><div className="grid gap-5 md:grid-cols-2"><Input label="Nome completo" required value={form.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="Nome do entregador" /><Input label="Email" required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="entregador@email.com" /><Input label="Telefone" required value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="(00) 00000-0000" /><Input label="Cidade" required value={form.city} onChange={(event) => update("city", event.target.value)} placeholder="Cidade" /><Input label="Bairro" required value={form.neighborhood} onChange={(event) => update("neighborhood", event.target.value)} placeholder="Bairro" /><label className="block text-sm font-medium text-brand-dark dark:text-dark-heading">Veículo<select value={form.vehicleType} onChange={(event) => update("vehicleType", event.target.value)} className="mt-1 w-full rounded-lg border border-brand-border bg-brand-gray px-3 py-2.5 text-sm dark:border-dark-border dark:bg-dark-border/30"><option value="moto">Moto</option><option value="carro">Carro</option></select></label></div></FormSection><FormSection title="Observações"><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Informações operacionais adicionais..." className="min-h-32 w-full rounded-lg border border-brand-border bg-brand-gray p-3 text-sm outline-none focus:border-brand-green dark:border-dark-border dark:bg-dark-border/30" /></FormSection><div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => router.push("/ddt-admin/entregadores")}>Cancelar</Button><Button type="submit" disabled={loading}>{loading ? "Enviando convite..." : "Enviar convite"}</Button></div></form></main>
}
