"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon } from "@/lib/icons"
import { ItemCard } from "@/components/marketplace/shared-components"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface CollectionDetailProps {
  collection: any
}

export function CollectionDetailPage({ collection }: CollectionDetailProps) {
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

  return (
    <div className="min-h-screen bg-white pt-[108px] font-sans flex flex-col">
      <div className="container mx-auto max-w-[1400px] px-4 py-6 flex-1">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-brand-inactive-text hover:text-brand-dark transition-colors mb-6"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          Voltar
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <UserProfileImage
            fullName={authorName}
            imageUrl={collection.author?.avatar_url || null}
            className="w-14 h-14 border-2 border-brand-border shrink-0"
          />
          <div>
            <h1 className="text-2xl font-bold text-brand-dark">{collection.name}</h1>
            {collection.description && (
              <p className="text-sm text-gray-500 mt-1">{collection.description}</p>
            )}
            <p className="text-xs text-brand-inactive-text mt-1">
              {authorName} &bull; {collection.items_count} {collection.items_count === 1 ? "item" : "itens"} &bull; {collection.views_count} visualizações
            </p>
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
  )
}
