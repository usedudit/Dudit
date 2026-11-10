"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { StarIcon, ChevronDownIcon, XIcon, ArrowUpDownIcon } from "@/lib/icons"
import { DefaultModal } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { anonymizeName } from "@/lib/utils/avatar"
import Pagination from "@/components/reusable/Pagination"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { formatQuantityWithUnit } from "@/lib/utils/formatters"
import { ReportModal } from "./ReportModal"
import { cn } from "@/lib/utils"

interface ReviewItem {
    id: string
    rating: number
    comment?: string | null
    created_at: string
    profiles?: {
        full_name?: string | null
        avatar_url?: string | null
    } | null
    products?: { name: string; images?: string[] | null; unit?: string | null } | null
    services?: { name: string; images?: string[] | null; unit?: string | null } | null
    product_name?: string | null
    service_name?: string | null
    quantity?: number | null
    variant_name?: string | null
    variant_options?: any
    unit?: string | null
    itemUrl?: string | null
}

interface AllReviewsModalProps {
    isOpen: boolean
    onClose: () => void
    reviews: ReviewItem[]
    title?: string
    showItemInfo?: boolean
}

type SortOption = "recentes" | "maior_nota" | "menor_nota" | "relevancia"
type RatingFilter = "todas" | 5 | 4 | 3 | 2 | 1

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: "recentes", label: "Mais recentes" },
    { value: "maior_nota", label: "Maior nota" },
    { value: "menor_nota", label: "Menor nota" },
    { value: "relevancia", label: "Mais relevantes" },
]

const RATING_FILTERS: { value: RatingFilter; label: string }[] = [
    { value: "todas", label: "Todas" },
    { value: 5, label: "5 estrelas" },
    { value: 4, label: "4 estrelas" },
    { value: 3, label: "3 estrelas" },
    { value: 2, label: "2 estrelas" },
    { value: 1, label: "1 estrela" },
]

const REVIEWS_PER_PAGE = 8

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

export function AllReviewsModal({
    isOpen,
    onClose,
    reviews,
    title = "Todas as avaliações",
    showItemInfo = false,
}: AllReviewsModalProps) {
    const [currentPage, setCurrentPage] = useState(1)
    const [sortBy, setSortBy] = useState<SortOption>("recentes")
    const [ratingFilter, setRatingFilter] = useState<RatingFilter>("todas")
    const [sortDropdownOpen, setSortDropdownOpen] = useState(false)
    const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
    const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null)

    // Reset page when filters/sort change
    useEffect(() => {
        setCurrentPage(1)
    }, [sortBy, ratingFilter])

    const filteredAndSortedReviews = useMemo(() => {
        let result = [...reviews]

        // Apply rating filter
        if (ratingFilter !== "todas") {
            result = result.filter(r => r.rating === ratingFilter)
        }

        // Apply sorting
        switch (sortBy) {
            case "recentes":
                result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                break
            case "maior_nota":
                result.sort((a, b) => b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                break
            case "menor_nota":
                result.sort((a, b) => a.rating - b.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                break
            case "relevancia":
            default:
                // Relevância: prioriza avaliações com comentário e mais recentes
                result.sort((a, b) => {
                    const aHasComment = !!a.comment?.trim()
                    const bHasComment = !!b.comment?.trim()
                    if (aHasComment !== bHasComment) return bHasComment ? 1 : -1
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                })
                break
        }

        return result
    }, [reviews, sortBy, ratingFilter])

    const totalPages = Math.max(1, Math.ceil(filteredAndSortedReviews.length / REVIEWS_PER_PAGE))

    const displayedReviews = useMemo(() => {
        const start = (currentPage - 1) * REVIEWS_PER_PAGE
        return filteredAndSortedReviews.slice(start, start + REVIEWS_PER_PAGE)
    }, [filteredAndSortedReviews, currentPage])

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!e.target || typeof e.target !== "object") return
            const target = e.target as Element
            if (sortDropdownOpen && !target.closest('[data-sort-dropdown]')) {
                setSortDropdownOpen(false)
            }
            if (filterDropdownOpen && !target.closest('[data-filter-dropdown]')) {
                setFilterDropdownOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [sortDropdownOpen, filterDropdownOpen])

    const sortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || "Ordenar"
    const filterLabel = RATING_FILTERS.find(o => o.value === ratingFilter)?.label || "Filtro"

    return (
        <>
            <DefaultModal
                isOpen={isOpen}
                onClose={onClose}
                title={title}
                description={`${filteredAndSortedReviews.length} ${filteredAndSortedReviews.length === 1 ? "avaliação" : "avaliações"}`}
                maxWidth="lg"
                className="max-h-[90vh]"
            >
                <div className="flex flex-col h-full">
                    {/* Header with Sort and Filter */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-brand-border dark:border-dark-border sticky top-0 bg-white dark:bg-dark-background z-10">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body hidden sm:block">Ordenar:</span>
                            <div className="relative" data-sort-dropdown>
                                <button
                                    onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                                        "bg-white dark:bg-dark-surface",
                                        "text-brand-dark dark:text-dark-heading",
                                        "border-brand-border dark:border-dark-border",
                                        "hover:bg-brand-gray dark:hover:bg-dark-border/30"
                                    )}
                                    aria-haspopup="listbox"
                                    aria-expanded={sortDropdownOpen}
                                >
                                    <ArrowUpDownIcon size={14} className="text-brand-inactive-text dark:text-dark-body" />
                                    <span>{sortLabel}</span>
                                    <ChevronDownIcon size={12} className={cn(
                                        "text-brand-inactive-text dark:text-dark-body transition-transform",
                                        sortDropdownOpen && "rotate-180"
                                    )} />
                                </button>
                                {sortDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg shadow-lg z-20 overflow-hidden">
                                        {SORT_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                onClick={() => {
                                                    setSortBy(option.value)
                                                    setSortDropdownOpen(false)
                                                }}
                                                className={cn(
                                                    "w-full text-left px-3 py-2 text-sm font-medium transition-colors",
                                                    sortBy === option.value
                                                        ? "bg-[#ecfdf5] text-brand-green"
                                                        : "text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border/30"
                                                )}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body hidden sm:block">Filtrar:</span>
                            <div className="relative" data-filter-dropdown>
                                <button
                                    onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                                        "bg-white dark:bg-dark-surface",
                                        ratingFilter !== "todas" ? "text-brand-green border-brand-green/50 bg-green-50/50 dark:bg-brand-green/10" : "text-brand-dark dark:text-dark-heading border-brand-border dark:border-dark-border",
                                        "hover:bg-brand-gray dark:hover:bg-dark-border/30"
                                    )}
                                    aria-haspopup="listbox"
                                    aria-expanded={filterDropdownOpen}
                                >
                                    <StarIcon size={14} className={cn(
                                        ratingFilter !== "todas" ? "text-brand-green fill-brand-green" : "text-brand-inactive-text fill-gray-300 dark:text-dark-body"
                                    )} strokeWidth={0} />
                                    <span>{filterLabel}</span>
                                    <ChevronDownIcon size={12} className={cn(
                                        "text-brand-inactive-text dark:text-dark-body transition-transform",
                                        filterDropdownOpen && "rotate-180"
                                    )} />
                                </button>
                                {filterDropdownOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg shadow-lg z-20 overflow-hidden">
                                        {RATING_FILTERS.map((option) => (
                                            <button
                                                key={option.value}
                                                onClick={() => {
                                                    setRatingFilter(option.value)
                                                    setFilterDropdownOpen(false)
                                                }}
                                                className={cn(
                                                    "w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors",
                                                    ratingFilter === option.value
                                                        ? "bg-[#ecfdf5] text-brand-green"
                                                        : "text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border/30"
                                                )}
                                            >
                                                <span className="flex items-center gap-2">
                                                    {option.value !== "todas" && (
                                                        <StarRow rating={option.value as number} size={12} />
                                                    )}
                                                    <span>{option.label}</span>
                                                </span>
                                                {ratingFilter === option.value && (
                                                    <XIcon size={14} className="text-brand-green" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Reviews List */}
                    <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                        {filteredAndSortedReviews.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-16 h-16 bg-brand-gray/50 dark:bg-dark-border/30 rounded-full flex items-center justify-center mb-4">
                                    <StarIcon size={32} className="text-brand-inactive-text dark:text-dark-body fill-gray-300" strokeWidth={0} />
                                </div>
                                <h3 className="text-lg font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                    {ratingFilter !== "todas" ? "Nenhuma avaliação com este filtro" : "Nenhuma avaliação encontrada"}
                                </h3>
                                <p className="text-brand-inactive-text dark:text-dark-body text-sm">
                                    {ratingFilter !== "todas"
                                        ? "Tente alterar o filtro de nota ou remova o filtro para ver todas as avaliações."
                                        : "Seja o primeiro a avaliar este item!"}
                                </p>
                            </div>
                        ) : (
                            <>
                                {displayedReviews.map((rev) => {
                                    const itemName = rev.products?.name || rev.services?.name || rev.product_name || rev.service_name
                                    const itemImages = rev.products?.images || rev.services?.images || null
                                    const unit = rev.unit || rev.products?.unit || rev.services?.unit
                                    const variantLabel = rev.variant_name || getVariantLabel(rev.variant_options)
                                    const fallbackVariantImg = rev.variant_options?.image || null
                                    const itemImage = getPrimaryProductDisplayImage({
                                        images: itemImages,
                                        video_thumbnail: null,
                                        fallback_variant_image: fallbackVariantImg,
                                    })

                                    return (
                                        <div key={rev.id} className="border-b border-brand-border pb-6 last:border-0">
                                            <div className="flex items-start gap-3 mb-3">
                                                <UserProfileImage
                                                    fullName={anonymizeName(rev.profiles?.full_name || "Usuário")}
                                                    imageUrl={rev.profiles?.avatar_url || null}
                                                    className="w-9 h-9 rounded-full shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {anonymizeName(rev.profiles?.full_name || "Usuário")}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body shrink-0">
                                                            {formatReviewDate(rev.created_at)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <StarRow rating={rev.rating} size={11} />
                                                        <button
                                                            onClick={() => setReportTarget({ id: rev.id, name: anonymizeName(rev.profiles?.full_name || "Usuário") })}
                                                            className="text-brand-inactive-text dark:text-dark-body hover:text-brand-red transition-colors mt-1"
                                                            title="Denunciar avaliação"
                                                        >
                                                            <XIcon size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            {rev.comment && (
                                                <p className="text-brand-inactive-text dark:text-dark-body text-sm">{rev.comment}</p>
                                            )}

                                            {showItemInfo && itemName && (
                                                <div className="mt-4">
                                                    {(() => {
                                                        const card = (
                                                            <>
                                                                <div className="w-12 h-12 bg-white dark:bg-dark-border/50 border border-brand-border dark:border-dark-border rounded-[8px] flex items-center justify-center shrink-0">
                                                                    <img src={itemImage} alt={itemName} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]" />
                                                                </div>
                                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-0.5 truncate">{itemName}</h4>
                                                                    {variantLabel && (
                                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 truncate">{variantLabel}</div>
                                                                    )}
                                                                    {rev.quantity != null && (
                                                                        <div className="flex items-center gap-2 text-xs mt-1">
                                                                            <span className="text-brand-inactive-text dark:text-dark-body truncate">
                                                                                {formatQty(rev.quantity, unit)}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )
                                                        if (rev.itemUrl) {
                                                            return (
                                                                <a href={rev.itemUrl} className="flex gap-4 p-2 -mx-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border/30 transition-colors group">
                                                                    {card}
                                                                </a>
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

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                                        <Pagination
                                            currentPage={currentPage}
                                            totalPages={totalPages}
                                            onPageChange={setCurrentPage}
                                            inline={true}
                                            fixedUntil="lg"
                                        />
                                    </div>
                                )}
                            </>
                        )}
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
            </DefaultModal>
        </>
    )
}