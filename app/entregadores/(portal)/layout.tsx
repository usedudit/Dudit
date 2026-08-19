import type React from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { requireDeliveryDriver } from "@/lib/auth/delivery-driver"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SidebarProvider } from "@/lib/sidebar-context"
import { ThemeProvider } from "@/components/theme-provider"
import { DeliveryPortalSidebar, DeliveryPortalHeader } from "@/components/delivery/DeliveryPortalChrome"

export default async function DeliveryPortalLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireDeliveryDriver()
  } catch {
    redirect("/auth/login?mode=partner&next=%2Fentregadores")
  }

  const user = await getCurrentUser()
  const userProfile = user
    ? {
        fullName: user.email?.split("@")[0] || "Entregador",
        email: user.email || "",
        initials: (user.email?.[0] || "E").toUpperCase(),
        avatarColor: "bg-brand-green",
      }
    : undefined

  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get("dudit_sidebar_state")
  const initialExpanded = sidebarCookie ? sidebarCookie.value === "expanded" : true

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <SidebarProvider initialExpanded={initialExpanded}>
        <div className="flex h-screen bg-brand-page-bg dark:bg-dark-background text-brand-dark dark:text-white transition-colors duration-200 overflow-hidden">
          <DeliveryPortalSidebar />
          <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            <DeliveryPortalHeader userProfile={userProfile} />
            <div className="flex-1 bg-white dark:bg-dark-background transition-colors duration-200">
              {children}
            </div>
          </div>
        </div>
      </SidebarProvider>
    </ThemeProvider>
  )
}
