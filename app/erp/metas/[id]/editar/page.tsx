import { redirect } from "next/navigation"

export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/erp/metas?edit=${id}`)
}

