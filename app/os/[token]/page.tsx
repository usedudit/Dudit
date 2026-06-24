import { getServiceOrderByTokenAction } from "@/app/actions/erp/service-orders"
import { notFound } from "next/navigation"
import PublicOSPortal from "@/components/public/PublicOSPortal"

export const dynamic = "force-dynamic"

interface PageProps {
    params: Promise<{ token: string }>
}

export default async function ClientPortalPage({ params }: PageProps) {
    const { token } = await params

    const result = await getServiceOrderByTokenAction(token)

    if (!result.success || !result.data) {
        notFound()
    }

    return <PublicOSPortal data={result.data} />
}
