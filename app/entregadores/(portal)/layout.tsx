import type React from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { requireDeliveryDriver } from "@/lib/auth/delivery-driver"

export default async function DeliveryPortalLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireDeliveryDriver()
  } catch {
    redirect("/auth/login?next=%2Fentregadores")
  }

  return (
    <div className="min-h-screen bg-brand-gray text-brand-dark dark:bg-dark-background dark:text-white">
      <header className="border-b border-brand-border bg-white dark:border-dark-border dark:bg-dark-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href="/entregadores" className="font-bold">Portal do Entregador</Link>
          <nav className="flex items-center gap-4 text-sm"><Link href="/entregadores">Resumo</Link><Link href="/entregadores/entregas">Minhas entregas</Link></nav>
        </div>
      </header>
      {children}
    </div>
  )
}
