import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getErpRequestContext } from "@/lib/auth/erp-context"
import { getUnifiedDashboardAction } from "@/app/actions/erp/quick-mode"
import QuickModeHome from "@/components/erp/quick-mode/QuickModeHome"
import { FadeIn } from "@/components/animations/FadeIn"
import { IconPlaceholder, SkeletonLoader } from "@/components/reusable"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"

export const dynamic = "force-dynamic"

export default async function InicioPage() {
    const context = await getErpRequestContext()

    if (!context) {
        redirect("/select-erp")
    }

    const { partnerId, roleId } = context

    if (roleId?.toLowerCase() === "delivery" || !can(context as RbacUserLike, "dashboard.view")) {
        redirect("/erp/entregas")
    }

    return (
        <FadeIn className="p-4">
            <Suspense fallback={<QuickModeLoadingSkeleton />}>
                <DashboardContent partnerId={partnerId} />
            </Suspense>
        </FadeIn>
    )
}

/**
 * Keep the expensive dashboard query behind the Suspense boundary.
 * The previous version awaited this data in the page before rendering the
 * boundary, so the skeleton could never be streamed to the browser.
 */
async function DashboardContent({ partnerId }: { partnerId: string }) {
    const result = await getUnifiedDashboardAction(partnerId)

    if (!result.success) {
        return (
            <IconPlaceholder
                placeholderType="image"
                imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                imageAlt="Erro"
                title="Ops! Algo deu errado por aqui"
                subtitle={result.error}
            />
        )
    }

    return <QuickModeHome data={result.data as any} partnerId={partnerId} />
}

function QuickModeLoadingSkeleton() {
    return (
        <div className="mx-auto w-full pt-4 flex flex-col gap-8 pb-20 px-4 md:px-8">
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

