"use client"

import type React from "react"
import { useState } from "react"
import { Button, InfoCard, DefaultModal } from "@/components/reusable"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createReviewAction } from "@/app/actions/marketplace/reviews"
import { StarIcon } from "@/lib/icons"
import { useCSRFToken } from "@/hooks/use-csrf-token"
import { useNotification } from "@/hooks/use-notification"

interface ReviewButtonProps {
  orderId: string
  partnerId: string
  productId?: string | null
  serviceId?: string | null
  userId: string
  itemName: string
}

export function ReviewButton({
  orderId,
  partnerId,
  productId,
  serviceId,
  userId,
  itemName,
}: ReviewButtonProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")

  const csrfToken = useCSRFToken()
  const { success, error: notifyError } = useNotification()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const result = await createReviewAction({
        orderId,
        partnerId,
        productId: productId || null,
        serviceId: serviceId || null,
        rating,
        comment,
        csrf_token: csrfToken || undefined,
      })

      if (result.error) {
        setError(result.error)
        notifyError("Erro ao enviar avaliação", result.error)
      } else {
        setOpen(false)
        success("Avaliação enviada", "Sua avaliação foi enviada com sucesso!")
        // Reset form
        setRating(5)
        setComment("")
      }
    } catch (err) {
      setError("Erro ao enviar avaliação")
      notifyError("Erro inesperado", "Ocorreu um erro ao tentar processar sua avaliação.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Avaliar
      </Button>

      <DefaultModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Avaliar pedido"
        description={itemName}
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-6 py-2">
          <div className="flex flex-col items-center justify-center gap-3">
            <Label className="text-base font-semibold">Sua nota para este item</Label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="transition-transform hover:scale-110 focus:outline-none"
                >
                  <StarIcon
                    size={42}
                    color={star <= rating ? "#FACC15" : "#E5E7EB"}
                    className={star <= rating ? "fill-[#FACC15]" : ""}
                  />
                </button>
              ))}
            </div>
            <span className="text-sm font-medium text-brand-inactive-text">
              {rating === 5 ? "Excelente!" : rating === 4 ? "Muito bom" : rating === 3 ? "Bom" : rating === 2 ? "Regular" : "Ruim"}
            </span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="comment" className="font-semibold">
              Conte mais (opcional)
            </Label>
            <Textarea
              id="comment"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Sua opinião ajuda outros compradores..."
              className="resize-none rounded-xl border-brand-border focus:ring-brand-green/20"
            />
          </div>

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
            <Button type="submit" className="flex-[2]" isLoading={isLoading}>
              Enviar avaliação
            </Button>
          </div>
        </form>
      </DefaultModal>
    </>
  )
}
