"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/reusable"
import { ChevronLeftIcon } from "@/lib/icons"
import { ItemCard } from "@/components/marketplace/shared-components"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"

interface CollectionDetailProps {
  collection: any
}

export function CollectionDetailPage({ collection }: CollectionDetailProps) {
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const authorName = collection.author?.full_name || "Usuário"

  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const { getCollectionItems } = await import("@/app/actions/marketplace/collections")
        const result = await getCollectionItems(collection.id)
        setItems(result.items || [])
      } catch (err: any) {
        setError(err.message || "Erro ao carregar itens")
      } finally {
        setIsLoading(false)
      }
    }
    loadItems()
  }, [collection.id])

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push("/colecoes")
    }
  }

  return (
    <>
      <MarketplaceHeader simpleTitle={collection.name} />
      <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col">
        <div className="container mx-auto px-4 max-w-[1400px] w-full mt-12 lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
          
          <div className="flex mb-8 items-center gap-4 animate-fade-in">
            <Button
              variant="filled"
              onClick={handleBack}
              className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
            >
              <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                {collection.name}
              </h1>
              {collection.description && (
                <p className="text-md text-brand-inactive-text mt-1">{collection.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-brand-inactive-text">
                <UserProfileImage
                  fullName={authorName}
                  imageUrl={collection.author?.avatar_url || null}
                  className="w-5 h-5 border border-brand-border shrink-0 bg-gray-50"
                />
                <span>
                  {authorName} &bull; {collection.items_count} {collection.items_count === 1 ? "item" : "itens"} &bull; {collection.views_count} visualizações
                </span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <Card className="p-12 text-center">
              <p className="text-red-500">{error}</p>
            </Card>
          ) : items.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-brand-inactive-text">Esta coleção está vazia</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {items.map((item: any) => (
                <ItemCard key={item.id} product={item} className="w-full" />
              ))}
            </div>
          )}
        </div>
      </div>
      <MarketplaceFooter />
    </>
  )
}
