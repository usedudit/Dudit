import { redirect } from "next/navigation"

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id === "new") {
    redirect("/erp/suppliers?create=true")
  }
  redirect(`/erp/suppliers?view=${id}`)
}

