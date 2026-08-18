import type React from "react"
import { redirect } from "next/navigation"
import { requireDeliveryDriver } from "@/lib/auth/delivery-driver"
import { SidebarProvider } from "@/lib/sidebar-context"
import { DeliveryPortalSidebar, DeliveryPortalTopbar } from "@/components/delivery/DeliveryPortalChrome"

export default async function DeliveryPortalLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireDeliveryDriver()
  } catch {
    redirect("/auth/login?next=%2Fentregadores")
  }

  return (
    <SidebarProvider initialExpanded={true}>
      <div className="flex h-screen bg-brand-page-bg text-brand-dark dark:bg-dark-background dark:text-white">
        <DeliveryPortalSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"><DeliveryPortalTopbar />{children}</div>
      </div>
    </SidebarProvider>
  )
}
