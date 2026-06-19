import { redirect } from "next/navigation"

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id === "new") {
    redirect("/erp/customers?create=true")
  }
  redirect(`/erp/customers?view=${id}`)
}

