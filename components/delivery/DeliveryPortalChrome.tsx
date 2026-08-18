"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MenuIcon, HomeIcon, TruckIcon, ChevronLeftIcon, ChevronRightIcon } from "@/lib/icons"
import { useSidebar } from "@/lib/sidebar-context"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/entregadores", label: "Resumo", icon: HomeIcon },
  { href: "/entregadores/entregas", label: "Minhas entregas", icon: TruckIcon },
]

export function DeliveryPortalSidebar() {
  const pathname = usePathname()
  const { isExpanded, isMobileOpen, setIsMobileOpen, toggleSidebar } = useSidebar()
  const collapsed = !isExpanded
  return (
    <>
      {isMobileOpen ? <button type="button" aria-label="Fechar menu" onClick={() => setIsMobileOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" /> : null}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex flex-col border-r border-brand-border bg-white transition-all dark:border-dark-border dark:bg-dark-surface lg:static lg:z-auto", collapsed ? "w-20" : "w-64", isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        <div className="flex h-16 items-center justify-between border-b border-brand-border px-4 dark:border-dark-border"><Link href="/entregadores" onClick={() => setIsMobileOpen(false)} className="flex min-w-0 items-center gap-3"><img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" className={cn("h-7 w-auto", collapsed && "hidden")} /><span className={cn("font-bold text-brand-dark dark:text-dark-heading", !collapsed && "hidden")}>D</span></Link><button type="button" onClick={toggleSidebar} className="hidden rounded-lg p-2 text-brand-inactive-text hover:bg-brand-gray lg:block" aria-label="Recolher menu">{collapsed ? <ChevronRightIcon size={18} /> : <ChevronLeftIcon size={18} />}</button></div>
        <div className={cn("px-3 py-5", collapsed && "px-2")}>{!collapsed ? <p className="px-3 text-xs font-semibold uppercase tracking-wider text-brand-inactive-text">Portal do Entregador</p> : null}<nav className="mt-3 space-y-1">{navItems.map(({ href, label, icon: Icon }) => { const active = pathname === href || (href !== "/entregadores" && pathname.startsWith(`${href}/`)); return <Link key={href} href={href} onClick={() => setIsMobileOpen(false)} title={collapsed ? label : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition", active ? "bg-brand-green/10 text-brand-green" : "text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark dark:hover:bg-dark-border/50 dark:hover:text-dark-heading", collapsed && "justify-center px-2")}><Icon size={19} /><span className={cn(collapsed && "hidden")}>{label}</span></Link> })}</nav></div>
        <div className="mt-auto border-t border-brand-border p-4 text-xs text-brand-inactive-text dark:border-dark-border">{collapsed ? "" : "Operação de entregas Dudit"}</div>
      </aside>
    </>
  )
}

export function DeliveryPortalTopbar() {
  const { setIsMobileOpen } = useSidebar()
  return <header className="sticky top-0 z-30 flex h-16 items-center border-b border-brand-border bg-brand-page-bg/95 px-4 backdrop-blur dark:border-dark-border dark:bg-dark-background/95 md:px-6"><button type="button" onClick={() => setIsMobileOpen(true)} className="mr-3 rounded-lg p-2 text-brand-inactive-text hover:bg-brand-gray lg:hidden" aria-label="Abrir menu"><MenuIcon size={21} /></button><h1 className="text-base font-bold text-brand-dark dark:text-dark-heading">Portal do Entregador</h1></header>
}
