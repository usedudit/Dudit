import { notFound, redirect } from "next/navigation"
import { getCollection, recordCollectionView } from "@/app/actions/marketplace/collections"
import { CollectionDetailPage } from "@/components/marketplace/CollectionDetailPage"
import { getCollectionUrl } from "@/lib/utils/url-generator"
import { Metadata } from "next"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const collection = await getCollection(id)
  if (!collection) return { title: "Coleção não encontrada - Dudit" }

  const canonicalUrl = `https://dudit.com.br${getCollectionUrl(collection)}`

  return {
    title: `${collection.name} - Dudit`,
    description: collection.description || `Coleção de produtos e serviços na Dudit`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${collection.name} - Dudit`,
      description: collection.description || `Coleção de produtos e serviços na Dudit`,
      url: canonicalUrl,
      images: [
        {
          url: collection.cover_url || "https://img.dudit.com.br/static/Logo.png",
          alt: collection.name,
        },
      ],
    },
  }
}

export default async function CollectionPage({ params }: PageProps) {
  const { id } = await params
  const collection = await getCollection(id)

  if (!collection) notFound()

  // Canonical URL redirect (UUID -> short_id)
  const canonicalUrl = getCollectionUrl(collection)
  const currentPath = `/colecoes/${id}`
  if (currentPath !== canonicalUrl) {
    redirect(canonicalUrl)
  }

  // Fire-and-forget view increment using actual UUID
  recordCollectionView(collection.id).catch(() => {})

  return <CollectionDetailPage collection={collection} />
}

