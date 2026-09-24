import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function CouponDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id === "new") {
    redirect("/erp/cupons?create=true")
  }
  redirect(`/erp/cupons?view=${id}`)
}
