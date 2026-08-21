import type React from "react"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { ThemeProvider } from "@/components/theme-provider"
import { DeliveryPortalHeader } from "@/components/delivery/DeliveryPortalChrome"
import { DeliverySidebar } from "@/components/delivery/DeliverySidebar"
import { DeliveryAccessDenied } from "@/components/delivery/DeliveryAccessDenied"
import { SidebarProvider } from "@/lib/sidebar-context"
import { NotificationsRealtimeProvider } from "@/providers/notifications-realtime-provider"

export default async function DeliveryPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/auth/login?next=%2Fentregadores")
  }

  const supabase = await getSupabaseServerClient()
  const { data: driverData } = await supabase
    .from("delivery_drivers")
    .select("user_id, is_active, availability_status")
    .eq("user_id", user.id)
    .maybeSingle()

  const isDriver = driverData?.is_active === true

  const userProfile = {
    fullName: user.user_metadata?.full_name || user.email?.split("@")[0] || "Entregador",
    email: user.email || "",
    initials: (user.user_metadata?.full_name?.[0] || user.email?.[0] || "E").toUpperCase(),
    avatarColor: "bg-brand-green",
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <NotificationsRealtimeProvider>
        <SidebarProvider initialExpanded={true}>
          <div className="flex h-screen bg-brand-page-bg dark:bg-brand-page-bg text-brand-dark dark:text-white transition-colors duration-200">
            {isDriver && (
              <DeliverySidebar
                userProfile={userProfile}
              />
            )}
            <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
              <DeliveryPortalHeader
                userProfile={userProfile}
                initialOnline={driverData?.availability_status === "available"}
              />
              {isDriver ? children : <DeliveryAccessDenied userEmail={user.email || ""} />}
            </div>
          </div>
        </SidebarProvider>
      </NotificationsRealtimeProvider>
    </ThemeProvider>
  )
}
