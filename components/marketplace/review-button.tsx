"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button, InfoCard, DefaultModal, FormTextarea } from "@/components/reusable"
import { Label } from "@/components/ui/label"
import { createReviewAction } from "@/app/actions/marketplace/reviews"
import { StarIcon } from "@/lib/icons"
import { useCSRFToken } from "@/hooks/use-csrf-token"
import { useNotification } from "@/hooks/use-notification"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"

interface ReviewButtonProps {
  orderId: string
  partnerId: string
  items: any[]
  userId: string
  reviewedItemsSet?: Set<string>
}

export function ReviewButton({
  orderId,
  partnerId,
  items,
  userId,
  reviewedItemsSet,
}: ReviewButtonProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reviewableItems = (items || []).filter(
    (item) => item.product_id || item.service_id
  )

  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [comments, setComments] = useState<Record<string, string>>({})

  const isItemReviewed = (item: any) => {
    return reviewedItemsSet?.has(`${orderId}:${item.product_id || item.service_id}`) ?? false
  }

  useEffect(() => {
    if (open) {
      const initialRatings: Record<string, number> = {}
      const initialComments: Record<string, string> = {}
      reviewableItems.forEach((item) => {
        initialRatings[item.id] = 5
        initialComments[item.id] = ""
      })
      setRatings(initialRatings)
      setComments(initialComments)
    }
  }, [open, items])

  const csrfToken = useCSRFToken()
  const { success, error: notifyError } = useNotification()

  if (reviewableItems.length === 0) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const itemsToReview = reviewableItems.filter((item) => !isItemReviewed(item))
    if (itemsToReview.length === 0) {
      setOpen(false)
      setIsLoading(false)
      return
    }

    try {
      const promises = itemsToReview.map((item) => {
        const itemRating = ratings[item.id] ?? 5
        const itemComment = comments[item.id] ?? ""
        return createReviewAction({
          orderId,
          partnerId,
          productId: item.product_id || null,
          serviceId: item.service_id || null,
          rating: itemRating,
          comment: itemComment,
          csrf_token: csrfToken || undefined,
        })
      })

      const results = await Promise.all(promises)

      const failed = results.find((r) => r.error)
      if (failed) {
        setError(failed.error)
        notifyError("Erro ao enviar avaliação", failed.error)
      } else {
        setOpen(false)
        success("Avaliação enviada", "Sua avaliação foi enviada com sucesso!")
      }
    } catch (err) {
      setError("Erro ao enviar avaliação")
      notifyError("Erro inesperado", "Ocorreu um erro ao tentar processar sua avaliação.")
    } finally {
      setIsLoading(false)
    }
  }

  const modalDescription =
    reviewableItems.length === 1
      ? (reviewableItems[0].products?.name ||
        reviewableItems[0].services?.name ||
        reviewableItems[0].product_name)
      : "Avalie os itens do seu pedido"

  return (
    <>
      <Button
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        Avaliar
      </Button>

      <DefaultModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Avaliar pedido"
        description={modalDescription}
        maxWidth="md"
      >
        <div onClick={(e) => e.stopPropagation()}>
          <form onSubmit={handleSubmit} className="space-y-6 py-2">
            {reviewableItems.length === 1 ? (
              // Single Item Layout
              (() => {
                const item = reviewableItems[0]
                const itemRating = ratings[item.id] ?? 5
                const itemComment = comments[item.id] ?? ""
                const isReviewed = isItemReviewed(item)
                return (
                  <>
                    <div className={`flex flex-col items-center justify-center gap-3 ${isReviewed ? "opacity-60" : ""}`}>
                      <Label className="text-base font-semibold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                        Sua nota para este item
                        {isReviewed && (
                          <span className="text-xs px-2.5 py-0.5 bg-brand-green/15 text-brand-green rounded-full font-bold">
                            Já avaliado
                          </span>
                        )}
                      </Label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            disabled={isReviewed}
                            onClick={() =>
                              setRatings((prev) => ({ ...prev, [item.id]: star }))
                            }
                            className={`transition-transform focus:outline-none ${isReviewed ? "cursor-not-allowed" : "hover:scale-110"}`}
                          >
                            <StarIcon
                              size={42}
                              color={star <= itemRating ? "#059669" : "#E5E7EB"}
                              className={star <= itemRating ? "fill-[#059669]" : ""}
                            />
                          </button>
                        ))}
                      </div>
                      <span className="text-sm font-medium text-brand-inactive-text">
                        {itemRating === 5
                          ? "Excelente!"
                          : itemRating === 4
                          ? "Muito bom"
                          : itemRating === 3
                          ? "Bom"
                          : itemRating === 2
                          ? "Regular"
                          : "Ruim"}
                      </span>
                    </div>

                    <div className={`grid gap-2 ${isReviewed ? "opacity-60 font-medium" : ""}`}>
                      <FormTextarea
                        label="Conte mais (opcional)"
                        name="comment"
                        rows={4}
                        value={isReviewed ? "Item já avaliado anteriormente." : itemComment}
                        disabled={isReviewed}
                        onChange={(e) =>
                          setComments((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder={isReviewed ? "" : "Sua opinião ajuda outros compradores..."}
                        maxLength={512}
                        showCharacterCount
                        className="resize-none rounded-xl border-brand-border focus:ring-brand-green/20"
                      />
                    </div>
                  </>
                )
              })()
            ) : (
              // Multiple Items Layout
              <div className="space-y-6 divide-y divide-brand-border dark:divide-dark-border max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {reviewableItems.map((item, idx) => {
                  const itemRating = ratings[item.id] ?? 5
                  const itemComment = comments[item.id] ?? ""
                  const isReviewed = isItemReviewed(item)
                  const itemImage = getPrimaryProductDisplayImage({
                    images: item.products?.images || item.services?.images || null,
                    video_thumbnail: item.products?.video_thumbnail || null,
                    fallback_variant_image:
                      item.product_variants?.variant_options?.image || null,
                  })

                  return (
                    <div key={item.id} className={`pt-6 ${idx === 0 ? "pt-0" : ""}`}>
                      <div className="flex gap-4 mb-4">
                        <div className="w-12 h-12 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center p-1 shrink-0">
                          <img
                            src={itemImage}
                            alt={item.products?.name || item.services?.name || item.product_name}
                            className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]"
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                            {item.products?.name || item.services?.name || item.product_name}
                          </h4>
                          {item.product_variants?.variant_name && (
                            <div className="text-xs text-brand-inactive-text mt-0.5">
                              {item.product_variants.variant_name}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={`flex flex-col gap-2 mb-4 ${isReviewed ? "opacity-60" : ""}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                            Sua nota:
                          </span>
                          <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                disabled={isReviewed}
                                onClick={() =>
                                  setRatings((prev) => ({ ...prev, [item.id]: star }))
                                }
                                className={`transition-transform focus:outline-none ${isReviewed ? "cursor-not-allowed" : "hover:scale-110"}`}
                              >
                                <StarIcon
                                  size={28}
                                  color={star <= itemRating ? "#059669" : "#E5E7EB"}
                                  className={star <= itemRating ? "fill-[#059669]" : ""}
                                />
                              </button>
                            ))}
                          </div>
                          <span className="text-xs font-semibold text-brand-green">
                            {isReviewed ? "Já avaliado" : (
                              itemRating === 5
                                ? "Excelente!"
                                : itemRating === 4
                                ? "Muito bom"
                                : itemRating === 3
                                ? "Bom"
                                : itemRating === 2
                                ? "Regular"
                                : "Ruim"
                            )}
                          </span>
                        </div>
                      </div>

                      <div className={`grid gap-2 ${isReviewed ? "opacity-60" : ""}`}>
                        <FormTextarea
                          label="Comentário (opcional)"
                          name={`comment-${item.id}`}
                          rows={2}
                          value={isReviewed ? "Item já avaliado anteriormente." : itemComment}
                          disabled={isReviewed}
                          onChange={(e) =>
                            setComments((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder={isReviewed ? "" : "Sua opinião ajuda outros compradores..."}
                          maxLength={512}
                          showCharacterCount
                          className="resize-none rounded-xl border-brand-border focus:ring-brand-green/20"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {error && <InfoCard message={error} color="red" />}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-[2]" isLoading={isLoading} disabled={reviewableItems.every(isItemReviewed)}>
                Enviar avaliação
              </Button>
            </div>
          </form>
        </div>
      </DefaultModal>
    </>
  )
}
