import type React from "react"
import { redirect } from "next/navigation"
import { requireDeliveryDriver } from "@/lib/auth/delivery-driver"
import { getCurrentUser } from "@/lib/auth/authorization"
import { ThemeProvider } from "@/components/theme-provider"
import { DeliveryPortalHeader } from "@/components/delivery/DeliveryPortalChrome"

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

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <div className="flex flex-col min-h-screen bg-white dark:bg-dark-background text-brand-dark dark:text-white transition-colors duration-200">
        <DeliveryPortalHeader userProfile={userProfile} />
        <main className="flex-1 w-full bg-white dark:bg-dark-background transition-colors duration-200">
          {children}
        </main>
      </div>
    </ThemeProvider>
  )
}
