import type React from "react"
import { Suspense } from "react"
import type { Metadata } from "next"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { AdminHeader } from "@/components/admin/admin-header"
import SkeletonLoader from "@/components/erp/skeleton-loader"
import { ThemeProvider } from "@/components/theme-provider"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { StoreProvider } from "@/lib/store-context"

export const metadata: Metadata = {
    title: "Dudit - Administração",
    robots: {
        index: false,
        follow: false,
    },
}

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // SECURITY: Server-side admin role verification.
    // requireAdmin() checks auth session + admin_roles table.
    // If user is not an admin, redirect to home (not an error page — don't leak info).
    try {
        await requireAdmin()
    } catch {
        redirect("/")
    }

    // Read sidebar cookie
    const cookieStore = await cookies()
    const sidebarCookie = cookieStore.get("dudit_sidebar_state")
    const initialExpanded = sidebarCookie ? sidebarCookie.value === "expanded" : true

    return (
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
            <div className="flex h-screen bg-[var(--brand-page-bg)] dark:bg-[var(--brand-page-bg)] text-[var(--brand-dark)] dark:text-white transition-colors duration-200">
                <AdminSidebar initialExpanded={initialExpanded} />
                <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
                    {/* Note: AdminHeader is rendered dynamically by the pages, or we can just render it here but pages need to set the title. let's put it on the layout and maybe pass a generic title, or render it inside the pages like erp does. ERP renders erp-header inside the layout? Wait, let's check erp/layout.tsx */}
                    {/* Wait, erp/layout.tsx doesn't render ERpHeader, it renders only sidebar. The header is in the page wrappers. */}
                    <Suspense fallback={<SkeletonLoader />}>{children}</Suspense>
                </div>
            </div>
        </ThemeProvider>
    )
}
