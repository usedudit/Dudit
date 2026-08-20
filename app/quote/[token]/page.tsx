import { getPublicQuoteAction } from "@/app/actions/erp/quotes"
import { headers } from "next/headers"
import { notFound, permanentRedirect } from "next/navigation"
import { isUuid } from "@/lib/utils/short-id"
import PublicQuotePortal from "@/components/public/PublicQuotePortal"

interface PageProps {
    params: Promise<{ token: string }>
}

export default async function PublicQuotePage({ params }: PageProps) {
    const { token } = await params

    const headerList = await headers()
    const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1"
    const userAgent = headerList.get("user-agent") || "unknown"

    // Load public quote data
    const res = await getPublicQuoteAction(token, ip, userAgent)

    if (!res.success || !res.data) {
        notFound()
    }

    const canonicalToken = res.data.quote?.public_token
    if (canonicalToken && canonicalToken !== token && isUuid(token)) {
        permanentRedirect(`/quote/${canonicalToken}`)
    }

    return (
        <PublicQuotePortal
            token={canonicalToken || token}
            initialData={res.data}
            ip={ip}
            userAgent={userAgent}
        />
    )
}

