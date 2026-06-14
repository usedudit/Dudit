import { redirect } from "next/navigation"

export default async function DuplicateGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/erp/goals?duplicate=${id}`)
}

