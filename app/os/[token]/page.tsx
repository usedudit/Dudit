import { getServiceOrderByTokenAction } from "@/app/actions/erp/service-orders"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import PublicOSPortal from "@/components/public/PublicOSPortal"

export const dynamic = "force-dynamic"

interface PageProps {
    params: Promise<{ token: string }>
}

export default async function ClientPortalPage({ params }: PageProps) {
    const { token } = await params

    const headerList = await headers()
    const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1"
    const userAgent = headerList.get("user-agent") || "unknown"

    const result = await getServiceOrderByTokenAction(token)

    if (!result.success || !result.data) {
        notFound()
    }

    return (
        <PublicOSPortal
            token={token}
            data={result.data}
            ip={ip}
            userAgent={userAgent}
        />
    )
}
