import type React from "react"
import { Suspense } from "react"
import type { Metadata } from "next"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import SkeletonLoader from "@/components/erp/SkeletonLoader"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { SidebarProvider } from "@/lib/sidebar-context"

export const metadata: Metadata = {
    title: "Administração",
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
        <SidebarProvider initialExpanded={initialExpanded}>
            <div className="flex h-screen bg-[var(--brand-page-bg)] dark:bg-[var(--brand-page-bg)] text-[var(--brand-dark)] dark:text-white transition-colors duration-200">
                <AdminSidebar initialExpanded={initialExpanded} />
                <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
                    <Suspense fallback={<SkeletonLoader />}>{children}</Suspense>
                </div>
            </div>
        </SidebarProvider>
    )
}
