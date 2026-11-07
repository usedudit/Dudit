import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { getCachedStoreById } from "@/app/actions/marketplace/stores"
import { getStoreUrl } from "@/lib/utils/url-generator"

export async function generateMetadata({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }): Promise<Metadata> {
  const { id } = await params
  const store = await getCachedStoreById(id)

  if (!store) {
    return { title: "Loja não encontrada" }
  }

  const sname = store.name || "Loja Parceira"
  const sdesc = store.description || `Conheça a loja ${sname} na Dudit, sua conexão direta e sem taxas.`
  const addr = store.addresses
  const city = addr?.city || store.city || "Brasil"
  const state = addr?.state || store.state || "BR"
  const logo = store.logo_url || "https://img.dudit.com.br/static/Logo.png"
  const url = `https://dudit.com.br${getStoreUrl(store)}`

  return {
    title: `${sname} em ${city} - ${state}`,
    description: sdesc,
    alternates: { canonical: url },
    openGraph: {
      title: `${sname}`,
      description: sdesc,
      url,
      images: [{ url: logo, width: 800, height: 600, alt: `Capa da loja ${sname}` }],
      type: "website",
    },
  }
}

export default async function VendorLegacyRedirectPage({ params }: { params: Promise<{ slug: string; cidadeUf: string; id: string }> }) {
  const { id: storeId } = await params
  const store = await getCachedStoreById(storeId)

  if (!store) {
    return notFound()
  }

  redirect(getStoreUrl(store))
}
