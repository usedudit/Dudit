import { AdminHeader } from "@/components/admin/admin-header"
import QuotesList from "@/components/admin/quotes/QuotesList"

export const dynamic = "force-dynamic"

export default async function AdminQuotesPage() {
    return (
        <>
            <AdminHeader pageTitle="Orçamentos" />
            <QuotesList
                quotes={[]}
                initialNextCursor={null}
                initialHasMore={false}
            />
        </>
    )
}
