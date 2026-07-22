"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import Link from "next/link"
import { StarIcon, FlagIcon } from "@/lib/icons"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { ReportModal } from "./ReportModal"
import { IconPlaceholder } from "@/components/reusable"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { formatQuantityWithUnit } from "@/lib/utils/formatters"

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
    products?: { name: string; images?: string[] | null; slug?: string | null; unit?: string | null } | null
    services?: { name: string; images?: string[] | null; slug?: string | null; unit?: string | null } | null
    product_name?: string | null
    service_name?: string | null
    quantity?: number | null
    variant_name?: string | null
    variant_options?: any
    unit?: string | null
    itemUrl?: string | null
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

const formatQty = (qty: number, unit?: string | null) => {
    return formatQuantityWithUnit(qty, unit);
};

function getVariantLabel(v: any): string | null {
    if (typeof v === "string" && v.trim()) return v.trim()
    if (typeof v === "object" && v !== null) {
        const opts = v.variant_options || v
        const parts: string[] = []
        Object.entries(opts).forEach(([k, val]) => {
            if (k !== "image" && val) parts.push(`${k}: ${val}`)
        })
        if (parts.length > 0) return parts.join(", ")
    }
    return null
}

export function ReviewsSection({ reviews, showItemInfo = false, className = "" }: ReviewsSectionProps) {
    const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null)
    const [visibleCount, setVisibleCount] = useState(20)
    const sentinelRef = useRef<HTMLDivElement>(null)

    const avgRating = reviews.length > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
        : 0

    const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
        star,
        count: reviews.filter(r => r.rating === star).length
    }))

    const displayedReviews = useMemo(() => {
        return reviews.slice(0, visibleCount)
    }, [reviews, visibleCount])

    const hasMore = reviews.length > visibleCount

    useEffect(() => {
        if (!hasMore) return

        const observer = new IntersectionObserver((entries) => {
            const first = entries[0]
            if (first.isIntersecting) {
                setVisibleCount(prev => Math.min(prev + 20, reviews.length))
            }
        }, { rootMargin: "200px" })

        const currentSentinel = sentinelRef.current
        if (currentSentinel) {
            observer.observe(currentSentinel)
        }

        return () => {
            if (currentSentinel) {
                observer.unobserve(currentSentinel)
            }
        }
    }, [hasMore, reviews.length])

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
                {displayedReviews.map((rev) => {
                    const itemName = rev.products?.name || rev.services?.name || rev.product_name || rev.service_name
                    const itemImages = rev.products?.images || rev.services?.images || null
                    const unit = rev.unit || rev.products?.unit || rev.services?.unit
                    const variantLabel = rev.variant_name || getVariantLabel(rev.variant_options)
                    const itemImage = getPrimaryProductDisplayImage({
                        images: itemImages,
                        video_thumbnail: null,
                        fallback_variant_image: null,
                    })

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
                                        <span className="font-semibold text-sm text-brand-dark truncate">
                                            {rev.profiles?.full_name || "Usuário"}
                                        </span>
                                        <span className="text-xs text-brand-inactive-text shrink-0">
                                            {formatReviewDate(rev.created_at)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <StarRow rating={rev.rating} size={11} />
                                        <button
                                            onClick={() => setReportTarget({ id: rev.id, name: `${rev.profiles?.full_name || "Usuário"}` })}
                                            className="text-brand-inactive-text hover:text-brand-red transition-colors mt-1"
                                            title="Denunciar avaliação"
                                        >
                                            <FlagIcon size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {rev.comment && (
                                <p className="text-brand-ianctive-text text-sm">{rev.comment}</p>
                            )}

                            {showItemInfo && itemName && (
                                <div className="mt-4">
                                    {(() => {
                                        const card = (
                                            <>
                                                <div className="w-12 h-12 bg-white border border-brand-border rounded-[8px] flex items-center justify-center shrink-0">
                                                    <img src={itemImage} alt={itemName} className="w-full h-full object-contain mix-blend-multiply rounded-[4px]" />
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                    <h4 className="font-bold text-sm text-brand-dark mb-0.5 truncate">{itemName}</h4>
                                                    {variantLabel && (
                                                        <div className="text-xs text-brand-inactive-text mt-0.5 truncate">{variantLabel}</div>
                                                    )}
                                                    {rev.quantity != null && (
                                                        <div className="flex items-center gap-2 text-xs mt-1">
                                                            <span className="text-brand-inactive-text truncate">
                                                                {formatQty(rev.quantity, unit)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )
                                        if (rev.itemUrl) {
                                            return (
                                                <Link href={rev.itemUrl} className="flex gap-4 p-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors group">
                                                    {card}
                                                </Link>
                                            )
                                        }
                                        return (
                                            <div className="flex gap-4 p-2 -mx-2 rounded-lg">
                                                {card}
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {hasMore && (
                <div ref={sentinelRef} className="h-10 flex items-center justify-center mt-4">
                    <span className="text-xs text-brand-inactive-text">Carregando mais avaliações...</span>
                </div>
            )}

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
