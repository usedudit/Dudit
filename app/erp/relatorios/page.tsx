import { redirect } from "next/navigation"

export default async function ERPReportsRedirect(props: {
    searchParams?: Promise<{ period?: string; compare?: string; compareFrom?: string; compareTo?: string }>
}) {
    const searchParams = await props.searchParams
    const query = new URLSearchParams()
    if (searchParams?.period) query.set("period", searchParams.period)
    if (searchParams?.compare) query.set("compare", searchParams.compare)
    if (searchParams?.compareFrom) query.set("compareFrom", searchParams.compareFrom)
    if (searchParams?.compareTo) query.set("compareTo", searchParams.compareTo)

    const queryString = query.toString()
    redirect(`/erp/estatisticas${queryString ? `?${queryString}` : ""}`)
}
