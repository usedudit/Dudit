import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function OrderDetailPageServer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/erp/pedidos?view=${id}`)
}
