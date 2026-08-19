import type React from "react"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { ThemeProvider } from "@/components/theme-provider"
import { DeliveryPortalHeader } from "@/components/delivery/DeliveryPortalChrome"
import { DeliveryAccessDenied } from "@/components/delivery/DeliveryAccessDenied"

export default async function DeliveryPortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/auth/login?next=%2Fentregadores")
  }

  const supabase = await getSupabaseServerClient()
  const { data: driverData } = await supabase
    .from("delivery_drivers")
    .select("user_id, is_active")
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
      <div className="flex flex-col min-h-screen bg-white dark:bg-dark-background text-brand-dark dark:text-white transition-colors duration-200">
        <DeliveryPortalHeader userProfile={userProfile} />
        <main className="flex-1 w-full bg-white dark:bg-dark-background transition-colors duration-200">
          {isDriver ? children : <DeliveryAccessDenied userEmail={user.email || ""} />}
        </main>
      </div>
    </ThemeProvider>
  )
}
