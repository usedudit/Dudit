"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { StarIcon, ChevronLeftIcon } from "@/lib/icons"
import { Button, InfoCard, DefaultModal, FormTextarea, SkeletonLoader, IconPlaceholder } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { getBuyerReviewsPaginatedAction, updateReviewAction, deleteReviewAction } from "@/app/actions/marketplace/reviews"
import { getProductUrl, getServiceUrl } from "@/lib/utils/url-generator"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { formatFullDate } from "@/lib/utils"
import { useNotification } from "@/hooks/use-notification"
import { useCSRFToken } from "@/hooks/use-csrf-token"
import { fade, View } from "./profile-shared"
import Link from "next/link"

interface ReviewsViewProps {
    navigate: (view: View) => void
}

export function ReviewsView({ navigate }: ReviewsViewProps) {
    const [reviews, setReviews] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)

    // Edit modal state
    const [editingReview, setEditingReview] = useState<any | null>(null)
    const [editRating, setEditRating] = useState(5)
    const [editComment, setEditComment] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const { success: notifySuccess, error: notifyError } = useNotification()
    const csrfToken = useCSRFToken()

    const REVIEWS_PER_PAGE = 10

    const fetchReviews = useCallback(async (page: number = 1) => {
        setIsLoading(true)
        setError(null)
        try {
            const res = await getBuyerReviewsPaginatedAction(page, REVIEWS_PER_PAGE)
            if (res.success && res.data) {
                setReviews(res.data)
                setTotalPages(Math.max(1, Math.ceil((res.total || 0) / REVIEWS_PER_PAGE)))
            } else {
                setError(res.error || "Não foi possível carregar suas avaliações.")
            }
        } catch (err) {
            setError("Erro interno ao buscar avaliações.")
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchReviews(currentPage)
    }, [fetchReviews, currentPage])

    const handleOpenEdit = (review: any) => {
        setEditingReview(review)
        setEditRating(review.rating)
        setEditComment(review.comment || "")
    }

    const handleCloseEdit = () => {
        setEditingReview(null)
        setEditRating(5)
        setEditComment("")
    }

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingReview) return

        setIsSaving(true)
        try {
            const res = await updateReviewAction(editingReview.id, {
                rating: editRating,
                comment: editComment,
                csrf_token: csrfToken || undefined,
            })

            if (res.success) {
                notifySuccess("Avaliação atualizada", "Sua avaliação foi atualizada com sucesso!")
                handleCloseEdit()
                await fetchReviews(currentPage)
            } else {
                notifyError("Erro ao atualizar", res.error || "Ocorreu um erro.")
            }
        } catch (err: any) {
            notifyError("Erro inesperado", "Não foi possível salvar as alterações.")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteReview = async (reviewId: string) => {
        if (!confirm("Tem certeza que deseja excluir esta avaliação?")) return

        setIsDeleting(true)
        try {
            const res = await deleteReviewAction(reviewId, csrfToken || undefined)
            if (res.success) {
                notifySuccess("Avaliação excluída", "Sua avaliação foi removida com sucesso.")
                handleCloseEdit()
                await fetchReviews(currentPage)
            } else {
                notifyError("Erro ao excluir", res.error || "Ocorreu um erro.")
            }
        } catch (err) {
            notifyError("Erro inesperado", "Não foi possível excluir a avaliação.")
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <motion.div key="reviews-view" {...fade} className="w-full">
            {/* Header */}
            <div className="hidden lg:flex mb-8 items-center gap-4">
                <Button
                    variant="filled"
                    onClick={() => navigate("main")}
                    className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
                >
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                        Minhas avaliações
                    </h1>
                    <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">
                        Veja e gerencie as avaliações que você enviou para produtos e serviços.
                    </p>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className="p-6 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl space-y-4">
                            <div className="flex gap-4">
                                <SkeletonLoader width={64} height={64} className="rounded-lg shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <SkeletonLoader height={16} width="40%" className="rounded" />
                                    <SkeletonLoader height={14} width="25%" className="rounded" />
                                    <SkeletonLoader height={14} width="15%" className="rounded" />
                                </div>
                            </div>
                            <SkeletonLoader height={32} width="100%" className="rounded" />
                        </div>
                    ))}
                </div>
            ) : error ? (
                <InfoCard message={error} color="red" />
            ) : reviews.length === 0 ? (
                <div className="flex justify-center py-12">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Avaliacoes.png"
                        imageAlt="Nenhuma avaliação enviada"
                        title="Nenhuma avaliação encontrada"
                        subtitle="Você ainda não avaliou nenhum item comprado no marketplace Dudit."
                        itemButton={{
                            text: "Voltar ao perfil",
                            action: () => navigate("main"),
                            variant: "outline"
                        }}
                    />
                </div>
            ) : (
                <div className="space-y-4">
                    {reviews.map((review) => {
                        const isService = !!review.service_id
                        const item = isService ? review.services : review.products
                        const store = Array.isArray(review.stores) ? review.stores[0] : review.stores

                        const partnerWithAddress = { ...review.partners, ...(store || {}), addresses: store?.addresses }

                        let itemUrl = ""
                        if (isService && review.services) {
                            itemUrl = getServiceUrl({ ...review.services, id: review.service_id, short_id: review.services?.short_id }, partnerWithAddress)
                        } else if (review.products) {
                            itemUrl = getProductUrl({ ...review.products, id: review.product_id, short_id: review.products?.short_id }, partnerWithAddress)
                        }


                        const itemImage = getPrimaryProductDisplayImage({
                            images: item?.images || null,
                            video_thumbnail: item?.video_thumbnail || null,
                        })

                        return (
                            <div
                                key={review.id}
                                className="p-5 md:p-6 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl flex flex-col md:flex-row gap-5 items-start justify-between hover:border-brand-green transition-all duration-300"
                            >
                                {/* Item / Review Body */}
                                <div className="flex gap-4 items-start w-full md:max-w-[80%]">
                                    <div className="w-16 h-16 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center p-1 shrink-0">
                                        <img
                                            src={itemImage}
                                            alt={item?.name || "Item avaliado"}
                                            className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]"
                                        />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        {itemUrl ? (
                                            <Link
                                                href={itemUrl}
                                                prefetch={false}
                                                className="font-bold text-brand-dark dark:text-dark-heading text-sm hover:text-brand-green transition-colors line-clamp-2"
                                            >
                                                {item?.name || "Item avaliado"}
                                            </Link>
                                        ) : (
                                            <h4 className="font-bold text-brand-dark dark:text-dark-heading text-sm line-clamp-2">
                                                {item?.name || "Item avaliado"}
                                            </h4>
                                        )}

                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            Vendido por: <span className="font-semibold text-brand-dark dark:text-dark-heading">{store?.name || "Loja Parceira"}</span>
                                        </p>

                                        {/* Rating stars */}
                                        <div className="flex items-center gap-1.5 mt-2">
                                            <div className="flex gap-0.5">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                    <StarIcon
                                                        key={star}
                                                        size={16}
                                                        color={star <= review.rating ? "#79c325" : "#E5E7EB"}
                                                        className={star <= review.rating ? "fill-[#79c325]" : ""}
                                                    />
                                                ))}
                                            </div>
                                            <span className="text-xs font-semibold text-brand-green">
                                                {review.rating === 5 ? "Excelente!" : review.rating === 4 ? "Muito bom" : review.rating === 3 ? "Bom" : review.rating === 2 ? "Regular" : "Ruim"}
                                            </span>
                                        </div>

                                        {/* Comment text */}
                                        {review.comment && (
                                            <div className="mt-3 p-3 bg-brand-gray/50 dark:bg-zinc-800/40 rounded-lg text-sm text-brand-dark dark:text-dark-heading italic leading-relaxed whitespace-pre-wrap">
                                                &ldquo;{review.comment}&rdquo;
                                            </div>
                                        )}

                                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-3">
                                            Avaliado em {formatFullDate(review.created_at)}
                                        </p>
                                    </div>
                                </div>

                                {/* Edit Action Button */}
                                <div className="flex gap-2 w-full md:w-auto md:shrink-0 justify-end pt-3 md:pt-0 border-t md:border-t-0 border-brand-border dark:border-dark-border">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full md:w-auto"
                                        onClick={() => handleOpenEdit(review)}
                                    >
                                        Editar avaliação
                                    </Button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {!isLoading && totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            )}

            {/* Edit Review Modal */}
            <DefaultModal
                isOpen={!!editingReview}
                onClose={handleCloseEdit}
                title="Editar sua avaliação"
                description={
                    editingReview?.products?.name ||
                    editingReview?.services?.name ||
                    "Item avaliado"
                }
                maxWidth="md"
            >
                <form onSubmit={handleSaveEdit} className="space-y-6 py-2">
                    <div className="flex flex-col items-center justify-center gap-3">
                        <label className="text-base font-semibold text-brand-dark dark:text-dark-heading">
                            Sua nota para este item
                        </label>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setEditRating(star)}
                                    className="transition-transform hover:scale-110 focus:outline-none"
                                >
                                    <StarIcon
                                        size={42}
                                        color={star <= editRating ? "#79c325" : "#E5E7EB"}
                                        className={star <= editRating ? "fill-[#79c325]" : ""}
                                    />
                                </button>
                            ))}
                        </div>
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                            {editRating === 5 ? "Excelente!" : editRating === 4 ? "Muito bom" : editRating === 3 ? "Bom" : editRating === 2 ? "Regular" : "Ruim"}
                        </span>
                    </div>

                    <div className="grid gap-2">
                        <FormTextarea
                            label="Conte mais (opcional)"
                            name="editComment"
                            rows={4}
                            value={editComment}
                            onChange={(e) => setEditComment(e.target.value)}
                            placeholder="Edite sua opinião para ajudar outros compradores..."
                            className="resize-none rounded-xl border-brand-border focus:ring-brand-green/20"
                            maxLength={500}
                            showCharacterCount
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <Button
                            type="button"
                            variant="outlinered"
                            className="flex-1 order-3 sm:order-1"
                            onClick={() => handleDeleteReview(editingReview.id)}
                            disabled={isSaving || isDeleting}
                        >
                            {isDeleting ? "Excluindo..." : "Excluir avaliação"}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1 order-2"
                            onClick={handleCloseEdit}
                            disabled={isSaving || isDeleting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            className="flex-[2] order-1 sm:order-3"
                            isLoading={isSaving}
                            disabled={isDeleting}
                        >
                            Salvar alterações
                        </Button>
                    </div>
                </form>
            </DefaultModal>
        </motion.div>
    )
}
