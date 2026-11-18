import { getServiceOrderByTokenAction } from "@/app/actions/erp/service-orders"
import { headers } from "next/headers"
import { notFound, permanentRedirect } from "next/navigation"
import { isUuid } from "@/lib/utils/short-id"
import PublicOSPortal from "@/components/public/PublicOSPortal"
import { getTrustedClientIP } from "@/lib/security/client-ip"

export const dynamic = "force-dynamic"

interface PageProps {
    params: Promise<{ token: string }>
}

export default async function ClientPortalPage({ params }: PageProps) {
    const { token } = await params

    const headerList = await headers()
    const ip = getTrustedClientIP(headerList)
    const userAgent = headerList.get("user-agent") || "unknown"

    const result = await getServiceOrderByTokenAction(token)

    if (!result.success || !result.data) {
        notFound()
    }

    const canonicalToken = result.data.serviceOrder?.public_token
    if (canonicalToken && canonicalToken !== token) {
        permanentRedirect(`/os/${canonicalToken}`)
    }

    return (
        <PublicOSPortal
            token={canonicalToken || token}
            data={result.data}
            ip={ip}
            userAgent={userAgent}
        />
    )
}
