import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getQuickModeHomeDataAction } from "@/app/actions/erp/quick-mode"
import QuickModeHome from "@/components/erp/quick-mode/QuickModeHome"
import { FadeIn } from "@/components/animations/FadeIn"
import { IconPlaceholder, SkeletonLoader } from "@/components/reusable"

export const dynamic = "force-dynamic"

export default async function PainelPage() {
    const context = await getCurrentPartnerContext()

    if (!context) {
        redirect("/select-erp")
    }

    const { partnerId, roleId, businessInfo } = context

    if (roleId === "delivery") {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-140px)] p-4 text-center">
                <FadeIn>
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/QRDino.png"
                        imageAlt="Área do Entregador"
                        title="Área do Entregador"
                        subtitle="Acesse a seção de entregas para acompanhar suas rotas e entregas em tempo real."
                        itemButton={{
                            text: "Acessar Entregas",
                            action: "/erp/entregas"
                        }}
                    />
                </FadeIn>
            </div>
        )
    }

    if (businessInfo?.mode !== "quick") {
        redirect("/erp/inicio")
    }

    const result = await getQuickModeHomeDataAction(partnerId)

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

    return (
        <FadeIn className="p-4">
            <Suspense fallback={<QuickModeLoadingSkeleton />}>
                <QuickModeHome data={result.data as any} partnerId={partnerId} />
            </Suspense>
        </FadeIn>
    )
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
