"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabaseBrowser } from "@/lib/supabase/browser-client"
import { acceptDeliveryDriverInvitationAction } from "@/app/actions/delivery-drivers"

export default function DeliveryInviteForm({ token, maskedEmail }: { token: string; maskedEmail: string }) {
  const router = useRouter()
  const [form, setForm] = useState({ email: "", fullName: "", phone: "", password: "" })
  const [terms, setTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!terms) return setMessage("Aceite os termos para continuar.")
    if (form.password.length < 8) return setMessage("A senha deve ter pelo menos 8 caracteres.")
    setLoading(true)
    setMessage("")
    let session = (await supabaseBrowser.auth.getSession()).data.session
    if (!session) {
      const login = await supabaseBrowser.auth.signInWithPassword({ email: form.email.trim(), password: form.password })
      session = login.data.session
      if (!session) {
        const signup = await supabaseBrowser.auth.signUp({ email: form.email.trim(), password: form.password, options: { data: { full_name: form.fullName.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/entregadores/convite/${token}`)}` } })
        if (signup.error || !signup.data.session) {
          setLoading(false)
          return setMessage("Não foi possível criar ou acessar a conta. Confirme o email do convite e tente novamente.")
        }
        session = signup.data.session
      }
    }
    const result = await acceptDeliveryDriverInvitationAction({ token, fullName: form.fullName, phone: form.phone })
    setLoading(false)
    if (!result.success) return setMessage(result.error)
    router.push("/entregadores")
    router.refresh()
  }
  return <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-10"><form onSubmit={submit} className="w-full rounded-2xl border border-brand-border bg-white p-7 shadow-sm dark:border-dark-border dark:bg-dark-surface"><p className="text-sm text-brand-inactive-text">Portal do Entregador Dudit</p><h1 className="mt-1 text-2xl font-bold">Criar acesso</h1><p className="mt-2 text-sm text-brand-inactive-text">Convite enviado para {maskedEmail}. Use exatamente esse email.</p><div className="mt-6 space-y-4">{([['email', 'Email do convite'], ['fullName', 'Nome'], ['phone', 'Telefone'], ['password', 'Senha']] as const).map(([key, label]) => <label key={key} className="block text-sm font-medium">{label}<input required type={key === "password" ? "password" : key === "email" ? "email" : "text"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-1 w-full rounded-xl border border-brand-border bg-transparent px-3 py-2.5 font-normal" /></label>)}<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-1" />Aceito os termos de uso do Portal do Entregador.</label>{message ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}<button disabled={loading} className="w-full rounded-xl bg-brand-green px-4 py-3 font-semibold text-white disabled:opacity-50">{loading ? "Processando..." : "Criar minha conta"}</button></div></form></main>
}
