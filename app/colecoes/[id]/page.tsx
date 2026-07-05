import { notFound } from "next/navigation"
import { getCollection, recordCollectionView } from "@/app/actions/marketplace/collections"
import { CollectionDetailPage } from "@/components/marketplace/CollectionDetailPage"
import { Metadata } from "next"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const collection = await getCollection(id)
  if (!collection) return { title: "Coleção não encontrada - Dudit" }

  return {
    title: `${collection.name} - Dudit`,
    description: collection.description || `Coleção de produtos e serviços na Dudit`,
  }
}

export default async function CollectionPage({ params }: PageProps) {
  const { id } = await params
  const collection = await getCollection(id)

  if (!collection) notFound()

  // Fire-and-forget view increment
  recordCollectionView(id).catch(() => {})

  return <CollectionDetailPage collection={collection} />
}
