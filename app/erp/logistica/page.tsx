import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function LogisticsRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = searchParams ? await searchParams : {}
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v)
    else if (Array.isArray(v)) v.forEach((item) => qs.append(k, item))
  }
  const query = qs.toString()
  redirect(query ? `/erp/entregas?${query}` : "/erp/entregas")
}
