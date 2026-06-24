"use client"

import { useState } from "react"
import { StarIcon, FlagIcon } from "@/lib/icons"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { ReportModal } from "./ReportModal"
import { IconPlaceholder } from "@/components/reusable"

interface ReviewItem {
    id: string
    rating: number
    comment?: string | null
    created_at: string
    profiles?: {
        full_name?: string | null
        avatar_url?: string | null
        profile_image_url?: string | null
    } | null
    products?: { name: string } | null
    services?: { name: string } | null
    product_name?: string | null
    service_name?: string | null
}

interface ReviewsSectionProps {
    reviews: ReviewItem[]
    showItemInfo?: boolean
    className?: string
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
    return (
        <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
                <StarIcon key={i} size={size} strokeWidth={0}
                    className={i < Math.round(rating) ? "text-brand-green fill-brand-green" : "text-gray-300 fill-gray-300"} />
            ))}
        </div>
    )
}

function formatReviewDate(dateStr: string) {
    try {
        return new Date(dateStr).toLocaleDateString("pt-BR")
    } catch {
        return dateStr
    }
}

export function ReviewsSection({ reviews, showItemInfo = false, className = "" }: ReviewsSectionProps) {
    const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null)

    const avgRating = reviews.length > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
        : 0

    const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
        star,
        count: reviews.filter(r => r.rating === star).length
    }))

    if (reviews.length === 0) {
        return (
            <div className={className}>
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Avaliacoes.png"
                    imageAlt="Sem avaliações"
                    title="Ainda não temos avaliações por aqui"
                    subtitle="Seja o primeiro a contar para a comunidade como foi sua experiência!"
                />
            </div>
        )
    }

    return (
        <div className={className}>
            <div className="border border-brand-border rounded-xl p-5 mb-8 flex gap-8 items-center">
                <div className="text-center shrink-0">
                    <p className="text-5xl font-black text-brand-dark leading-none mb-2">{avgRating.toFixed(1)}</p>
                    <div className="flex justify-center mb-1.5"><StarRow rating={avgRating} size={14} /></div>
                    <p className="text-xs text-brand-inactive-text">Média de {reviews.length} avaliações</p>
                </div>
                <div className="flex-1 space-y-2">
                    {ratingDistribution.map(({ star, count }) => {
                        const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0
                        return (
                            <div key={star} className="flex items-center gap-2">
                                <span className="text-xs text-brand-inactive-text w-3 shrink-0">{star}</span>
                                <StarIcon size={10} strokeWidth={0} className="text-brand-inactive-text fill-gray-400 shrink-0" />
                                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-brand-green rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-brand-inactive-text w-4 text-right shrink-0">{count}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="space-y-6">
                {reviews.map((rev) => {
                    const itemName = rev.products?.name || rev.services?.name || rev.product_name || rev.service_name || null
                    return (
                        <div key={rev.id} className="border-b border-brand-border pb-6 last:border-0">
                            <div className="flex items-start gap-3 mb-3">
                                <UserProfileImage
                                    fullName={rev.profiles?.full_name || "Usuário"}
                                    imageUrl={rev.profiles?.avatar_url || rev.profiles?.profile_image_url || null}
                                    className="w-9 h-9 rounded-full shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-semibold text-sm text-brand-dark truncate">
                                                {rev.profiles?.full_name || "Usuário"}
                                            </span>
                                            {showItemInfo && itemName && (
                                                <>
                                                    <span className="text-gray-300 text-xs shrink-0">|</span>
                                                    <span className="text-xs text-brand-inactive-text truncate">
                                                        {itemName}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        <span className="text-xs text-brand-inactive-text shrink-0">
                                            {formatReviewDate(rev.created_at)}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex items-center justify-between">
                                        <StarRow rating={rev.rating} size={11} />
                                        <button
                                            onClick={() => setReportTarget({ id: rev.id, name: `${rev.profiles?.full_name || "Usuário"}` })}
                                            className="text-brand-inactive-text hover:text-[#d32f2f] transition-colors p-1"
                                            title="Denunciar avaliação"
                                        >
                                            <FlagIcon size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {rev.comment && (
                                <p className="text-gray-600 text-sm leading-relaxed ml-12">{rev.comment}</p>
                            )}
                        </div>
                    )
                })}
            </div>

            {reportTarget && (
                <ReportModal
                    isOpen={!!reportTarget}
                    onClose={() => setReportTarget(null)}
                    targetType="review"
                    targetId={reportTarget.id}
                    targetName={`Avaliação de ${reportTarget.name}`}
                />
            )}
        </div>
    )
}
