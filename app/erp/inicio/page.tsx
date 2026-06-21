import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getOnboardingStatusAction } from "@/app/actions/erp/quick-mode"
import QuickModeOnboarding from "@/components/erp/quick-mode/QuickModeOnboarding"
import { SkeletonLoader } from "@/components/reusable"

export const metadata = {
    title: "Início - Dudit Marketplace",
}

export default async function QuickModeInicioPage() {
    const context = await getCurrentPartnerContext()
    
    if (!context) {
        redirect("/erp/switch")
    }

    const { partnerId, businessInfo } = context

    // Security check: if not in quick mode, redirect to regular dashboard
    if (businessInfo?.mode !== "quick") {
        redirect("/erp/dashboard")
    }

    const result = await getOnboardingStatusAction(partnerId)

    if (!result.success) {
        const errResult = result as any
        if (errResult.redirect) {
            redirect(errResult.redirect)
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
            <Suspense fallback={<QuickModeOnboardingSkeleton />}>
                <QuickModeOnboarding data={result.data as any} partnerId={partnerId} />
            </Suspense>
        </main>
    )
}

function QuickModeOnboardingSkeleton() {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
                <SkeletonLoader className="h-10 w-64" />
                <SkeletonLoader className="h-6 w-96" />
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                    <SkeletonLoader className="h-28 rounded-3xl" />
                    <div className="space-y-4">
                        <SkeletonLoader className="h-24 rounded-2xl" />
                        <SkeletonLoader className="h-24 rounded-2xl" />
                        <SkeletonLoader className="h-24 rounded-2xl" />
                        <SkeletonLoader className="h-24 rounded-2xl" />
                    </div>
                </div>
                <div className="space-y-6">
                    <SkeletonLoader className="h-64 rounded-3xl" />
                    <SkeletonLoader className="h-48 rounded-3xl" />
                </div>
            </div>
        </div>
    )
}
