import { AdminHeader } from "@/components/admin/admin-header"
import QuotesList from "@/components/admin/quotes/QuotesList"
import { getAdminQuotes, getAdminQuotesStats } from "@/app/actions/admin/quotes"

export const dynamic = "force-dynamic"

export default async function AdminQuotesPage() {
    const [initialData, initialStats] = await Promise.all([
        getAdminQuotes(null, 50),
        getAdminQuotesStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Orçamentos" />
            <QuotesList
                quotes={initialData.data}
                initialNextCursor={initialData.nextCursor}
                initialHasMore={initialData.hasMore}
                initialStats={initialStats}
            />
        </>
    )
}
