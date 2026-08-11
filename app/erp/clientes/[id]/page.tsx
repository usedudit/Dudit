import { redirect } from "next/navigation"

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (id === "new") {
    redirect("/erp/clientes?create=true")
  }
  redirect(`/erp/clientes?view=${id}`)
}

