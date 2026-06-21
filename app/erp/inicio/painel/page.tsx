import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getQuickModeHomeDataAction } from "@/app/actions/erp/quick-mode"
import QuickModeHome from "@/components/erp/quick-mode/QuickModeHome"
import { SkeletonLoader } from "@/components/reusable"

export const metadata = {
    title: "Painel de Vendas - Dudit Marketplace",
}

export default async function QuickModePainelPage() {
    const context = await getCurrentPartnerContext()
    
    if (!context) {
        redirect("/erp/switch")
    }

    const { partnerId, businessInfo } = context

    // Security check: if not in quick mode, redirect to regular dashboard
    if (businessInfo?.mode !== "quick") {
        redirect("/erp/dashboard")
    }

    const result = await getQuickModeHomeDataAction(partnerId)

    if (!result.success) {
        if (result.redirect) {
            redirect(result.redirect)
        }
        return (
            <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
                <h1 className="text-xl font-bold text-brand-red">Erro ao carregar dados</h1>
                <p className="text-brand-inactive-text dark:text-dark-body mt-2">{result.error}</p>
            </div>
        )
    }

    return (
        <main className="mx-auto w-full px-4 md:px-8 pt-8 max-w-[1600px]">
            <Suspense fallback={<QuickModeLoadingSkeleton />}>
                <QuickModeHome data={result.data as any} partnerId={partnerId} />
            </Suspense>
        </main>
    )
}

function QuickModeLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <SkeletonLoader className="h-10 w-64" />
                <SkeletonLoader className="h-6 w-96" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SkeletonLoader className="h-32 rounded-3xl" />
                <SkeletonLoader className="h-32 rounded-3xl" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <SkeletonLoader className="h-40 rounded-2xl" />
                <SkeletonLoader className="h-40 rounded-2xl" />
                <SkeletonLoader className="h-40 rounded-2xl" />
            </div>
        </div>
    )
}
