"use client"

import { useState, useRef, Fragment } from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getPartnerUrl, getProductUrl } from "@/lib/utils/url-generator"
import { TrashIcon, ChevronUpIcon, ChevronDownIcon } from "@/lib/icons"
import { QuantitySelector } from "@/components/reusable/QuantitySelector"
import { AnimatePresence, motion } from "framer-motion"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { updateCartQuantityAction, removeFromCartAction, toggleCartSelectionAction, toggleCartPartnerSelectionAction, switchCartItemVariantAction } from "@/app/actions/marketplace/cart"
import { Button, Checkbox, Badge, IconPlaceholder, AlertModal, DefaultModal } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { useNotification } from "@/hooks/use-notification"
import { invalidateCartCache } from "@/hooks/use-cart"
import { formatCurrency, formatDateToBR } from "@/lib/utils"
import { useTransitionDirection } from "@/providers/transition-provider"
import { useCSRFToken } from "@/hooks/use-csrf-token"
import { computeItemCampaignPricing } from "@/lib/services/pricing-engine"

interface CartPageClientProps {
    itemsByPartner: any
    userId: string
}

export function CartPageClient({ itemsByPartner, userId }: CartPageClientProps) {
    const router = useRouter()
    const { user } = useSupabase()
    const { setDirection } = useTransitionDirection()
    const [isVendorExpanded, setIsVendorExpanded] = useState<Record<string, boolean>>({})
    const [loading, setLoading] = useState<string | null>(null)
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; cartItemId: string | null }>({ open: false, cartItemId: null })
    const [showErrorModal, setShowErrorModal] = useState(false)
    const isActionInProgress = useRef(false)

    // Optimistic overrides for instant UI feedback (selection + quantity)
    const [optimisticItems, setOptimisticItems] = useState<Record<string, { selected?: boolean; quantity?: number }>>({})

    const renderPromoBanners = (partnerId: string, partnerItemsTotal: number) => {
        const promos = itemsByPartner[partnerId]?.promotions || []
        const pendingPromos = promos.filter((p: any) =>
            p.minSpendAmount &&
            p.minSpendAmount > partnerItemsTotal &&
            (p.promotionType === "gift" || p.promotionType === "free_shipping")
        )

        if (pendingPromos.length === 0) return null

        return (
            <div className="mt-4 space-y-3">
                {pendingPromos.map((promo: any) => {
                    const diff = promo.minSpendAmount - partnerItemsTotal
                    const pct = Math.min(100, (partnerItemsTotal / promo.minSpendAmount) * 100)
                    const isFreeShipping = promo.promotionType === "free_shipping"
                    const label = isFreeShipping
                        ? `Falta ${formatCurrency(diff)} para você ganhar Entrega Grátis nesta loja!`
                        : `Falta ${formatCurrency(diff)} para você ganhar um Brinde Especial (${promo.name})!`

                    return (
                        <div key={promo.id} className="bg-gradient-to-r from-emerald-500/5 to-emerald-500/10 dark:from-emerald-950/10 dark:to-emerald-900/10 p-4 rounded-xl border border-emerald-500/15 dark:border-emerald-500/20 space-y-2">
                            <div className="flex justify-between items-center text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                <span>{label}</span>
                                <span className="text-brand-green">{pct.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-brand-gray dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                                <div
                                    className="bg-brand-green h-full rounded-full transition-all duration-500 ease-out"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    const getImageUrl = (path: string) => getR2ImageUrl(path)
    const isExpanded = (partnerId: string) => isVendorExpanded[partnerId] !== false
    const toggleVendor = (partnerId: string) =>
        setIsVendorExpanded(prev => ({ ...prev, [partnerId]: !prev[partnerId] }))

    const getItemPricingContext = (item: any, promotions: any[]) => {
        const type = item.item_type || "product"
        const basePrice = Number(item.products?.price || 0)
        const promoPrice = item.products?.promotional_price ? Number(item.products.promotional_price) : 0
        const hasPromo = promoPrice > 0 && promoPrice < basePrice
        const unitPrice = (item.variant_id && item.product_variants)
            ? Number(item.product_variants.price_adjustment) || basePrice
            : basePrice
        const individualPromo = item.variant_id ? null : (hasPromo ? promoPrice : null)

        // Non-product types: no campaign pricing, just manual promo
        if (type !== "product") {
            const bestPrice = individualPromo ?? unitPrice
            return { bestPrice, referencePrice: bestPrice < unitPrice ? unitPrice : undefined, discountSource: bestPrice < unitPrice ? "manual" : "none" as const, discountPercent: 0, campaignDiscount: 0 }
        }

        // Find best campaign among ALL applicable promotions
        let bestCampaign: { bestPrice: number; discountSource: "campaign" | "manual" | "none"; campaignDiscount: number } = { bestPrice: unitPrice, discountSource: "none", campaignDiscount: 0 }
        for (const promo of promotions || []) {
            if (promo.promotionType === "discount" && promo.is_active !== false) {
                const result = computeItemCampaignPricing(unitPrice, individualPromo, promo, {
                    productId: item.product_id,
                    categoryId: item.products?.category_id || undefined,
                })
                if (result.bestPrice < bestCampaign.bestPrice) {
                    bestCampaign = {
                        bestPrice: result.bestPrice,
                        discountSource: result.discountSource as "campaign" | "manual" | "none",
                        campaignDiscount: result.campaignDiscount,
                    }
                }
            }
        }

        // Final best price with all promotions considered
        const finalResult = bestCampaign.discountSource !== "none"
            ? bestCampaign
            : computeItemCampaignPricing(unitPrice, individualPromo, null)
        const bestPrice = finalResult.bestPrice
        const discountSource = finalResult.discountSource
        const referencePrice = bestPrice < unitPrice ? unitPrice : undefined
        const discountPercent = referencePrice ? Math.round((1 - bestPrice / unitPrice) * 100) : 0
        return { bestPrice, referencePrice, discountSource, discountPercent, campaignDiscount: finalResult.campaignDiscount }
    }

    const getItemBestPrice = (item: any, promotions: any[]) => getItemPricingContext(item, promotions).bestPrice

    const getPartnerDisplayTotal = (partnerId: string, items: any[]) => {
        const promos = itemsByPartner[partnerId]?.promotions || []
        return items
            .filter((item: any) => getItemSelected(item))
            .reduce((sum: number, item: any) => sum + getItemBestPrice(item, promos) * getItemQuantity(item), 0)
    }

    const getItemImage = (item: any) => {
        if ((item.item_type || "product") !== "product") {
            return "https://img.dudit.com.br/static/Placeholder.png"
        }
        if (item.variant_id && item.product_variants?.variant_options) {
            const opts = typeof item.product_variants.variant_options === "string"
                ? JSON.parse(item.product_variants.variant_options)
                : item.product_variants.variant_options
            if (opts?.image) return getImageUrl(opts.image)
        }
        return getImageUrl(item.products.images?.[0]) || "https://img.dudit.com.br/static/Placeholder.png"
    }

    const getItemName = (item: any) => {
        const type = item.item_type || "product"
        if (type === "service_booking") {
            const meta = item.booking_metadata
            if (meta?.date && meta?.time) {
                return `${item.services?.name || meta.serviceName} — ${formatDateToBR(meta.date)} ${meta.time}`
            }
            return item.services?.name || meta?.serviceName || "Serviço"
        }
        if (type === "subscription") {
            return item.recurring_plans?.name || "Assinatura"
        }
        return item.variant_id && item.product_variants
            ? `${item.products.name} - ${item.product_variants.variant_name}`
            : item.products?.name || "Item"
    }

    const isItemOutOfStock = (item: any): boolean => {
        const type = item.item_type || "product"
        if (type !== "product") return false
        if (item.variant_id && item.product_variants) {
            const stock = item.product_variants.stock_available ?? item.product_variants.stock_quantity ?? 0
            return stock <= 0
        }
        return false
    }

    const getAlternativePrice = (alt: any, product: any) => {
        const variantPrice = Number(alt.price_adjustment)
        if (variantPrice > 0) return variantPrice
        const basePrice = Number(product.price)
        const promoPrice = product.promotional_price ? Number(product.promotional_price) : 0
        return promoPrice > 0 && promoPrice < basePrice ? promoPrice : basePrice
    }

    // Resolve optimistic overrides per item
    const getItemSelected = (item: any): boolean => {
        if (isItemOutOfStock(item)) return false
        return optimisticItems[item.id]?.selected ?? (item.selected !== false)
    }

    const getItemQuantity = (item: any): number =>
        optimisticItems[item.id]?.quantity ?? item.quantity

    const csrfToken = useCSRFToken()

    const getCsrfToken = async (): Promise<string> => {
        if (csrfToken) return csrfToken
        const { token } = await (await fetch("/api/csrf-token")).json()
        return token
    }

    const updateQty = async (cartItemId: string, newQty: number, currentQty: number) => {
        if (loading || isActionInProgress.current || newQty === currentQty) return
        isActionInProgress.current = true
        setOptimisticItems(prev => ({ ...prev, [cartItemId]: { ...prev[cartItemId], quantity: newQty } }))
        setLoading(cartItemId)
        try {
            const token = await getCsrfToken()
            await updateCartQuantityAction(cartItemId, newQty, token)
            invalidateCartCache()
            // Removed router.refresh() - optimistic state update handles UI
        } catch {
            setOptimisticItems(prev => ({ ...prev, [cartItemId]: { ...prev[cartItemId], quantity: currentQty } }))
        } finally {
            setLoading(null)
            isActionInProgress.current = false
        }
    }

    const switchVariant = async (cartItemId: string, newVariantId: string) => {
        if (loading || isActionInProgress.current) return
        isActionInProgress.current = true
        setLoading(cartItemId)
        try {
            const token = await getCsrfToken()
            const res = await switchCartItemVariantAction(cartItemId, newVariantId, token)
            if (res?.error) {
                notifyError(res.error)
            } else {
                notifySuccess("Variante alterada com sucesso!")
                invalidateCartCache()
            }
        } catch (err: any) {
            notifyError("Erro ao alterar variante.")
        } finally {
            setLoading(null)
            isActionInProgress.current = false
        }
    }

    const removeItem = async (cartItemId: string) => {
        if (loading || isActionInProgress.current) return
        isActionInProgress.current = true
        setLoading(cartItemId)
        try {
            const token = await getCsrfToken()
            await removeFromCartAction(cartItemId, token)
            invalidateCartCache()
            // Removed router.refresh() - item removal is handled by server action revalidation
        } finally {
            setLoading(null)
            isActionInProgress.current = false
            setDeleteModal({ open: false, cartItemId: null })
        }
    }

    const toggleItemSelection = async (cartItemId: string, currentSelected: boolean) => {
        if (loading || isActionInProgress.current) return
        isActionInProgress.current = true
        setOptimisticItems(prev => ({ ...prev, [cartItemId]: { ...prev[cartItemId], selected: !currentSelected } }))
        setLoading(cartItemId)
        try {
            const token = await getCsrfToken()
            await toggleCartSelectionAction(cartItemId, token)
            invalidateCartCache()
            // Removed router.refresh() - optimistic state update handles UI
        } catch {
            setOptimisticItems(prev => ({ ...prev, [cartItemId]: { ...prev[cartItemId], selected: currentSelected } }))
        } finally {
            setLoading(null)
            isActionInProgress.current = false
        }
    }

    const togglePartnerSelection = async (partnerId: string, items: any[], currentAllSelected: boolean) => {
        if (loading || isActionInProgress.current) return
        isActionInProgress.current = true
        const newState = !currentAllSelected
        setLoading(partnerId)

        // Filter to only items that are in stock
        const targetItems = items.filter(item => !isItemOutOfStock(item))

        // Optimistically update target items
        const updates: Record<string, { selected: boolean }> = {}
        targetItems.forEach(item => {
            updates[item.id] = { ...optimisticItems[item.id], selected: newState }
        })
        setOptimisticItems(prev => ({ ...prev, ...updates }))

        try {
            const token = await getCsrfToken()
            await toggleCartPartnerSelectionAction(partnerId, newState, token)
            invalidateCartCache()
            // Removed router.refresh() - optimistic state update handles UI
        } catch {
            // Revert items to original state
            const revert: Record<string, { selected: boolean }> = {}
            items.forEach(item => {
                revert[item.id] = { ...optimisticItems[item.id], selected: item.selected }
            })
            setOptimisticItems(prev => ({ ...prev, ...revert }))
        } finally {
            setLoading(null)
            isActionInProgress.current = false
        }
    }

    const handleOpenCheckout = (partnerId: string) => {
        if (!userId) { router.push("/auth/login?next=/cart"); return }

        const partnerData = itemsByPartner[partnerId]
        const hasSelected = partnerData?.items.some((item: any) => getItemSelected(item))

        if (!hasSelected) {
            setShowErrorModal(true)
            return
        }

        const partnerItems = partnerData.items.filter((item: any) => getItemSelected(item))

        const checkoutData = {
            source: "cart",
            partnerId: partnerId,
            products: getPartnerCheckoutProducts(partnerId),
            partnerInfo: {
                address: partnerData.partner?.addresses?.[0] || {},
                paymentMethods: partnerData.paymentMethods || ["Dinheiro"],
                mpConnected: !!partnerData.partner?.mp_user_id,
                mpPublicKey: partnerData.partner?.mp_public_key,
                store_name: partnerData.partner?.store_name,
                openingHours: partnerData.partner?.opening_hours || null,
            },
            cartItems: partnerItems.map((item: any) => ({
                cartItemId: item.id,
                itemType: item.item_type || "product",
                productId: item.product_id || undefined,
                variantId: item.variant_id || undefined,
                serviceId: item.service_id || undefined,
                recurringPlanId: item.recurring_plan_id || undefined,
                quantity: getItemQuantity(item),
            })),
            deliverySettings: partnerData.deliverySettings
        }

        sessionStorage.setItem("checkout_session", JSON.stringify(checkoutData))
        router.push("/checkout")
    }

    const { success: notifySuccess, error: notifyError } = useNotification()

    const getPartnerDeliveryFee = (partnerData: any) => {
        const settings = partnerData.deliverySettings
        if (!settings || settings.is_delivery_enabled === false) return 0
        return Number(settings.base_fee || 0)
    }

    // Total only counts selected items (with optimistic overrides)
    const globalTotal = Object.values(itemsByPartner).reduce((acc: number, partner: any) => {
        const items = partner.items.filter((item: any) => getItemSelected(item))
        if (items.length === 0) return acc
        const itemsTotal = getPartnerDisplayTotal(partner.partner?.id, items)
        return acc + itemsTotal + getPartnerDeliveryFee(partner)
    }, 0)

    const getPartnerSelectedTotal = (items: any[], partnerId?: string) =>
        items
            .filter((item: any) => getItemSelected(item))
            .reduce((sum: number, item: any) => {
                const price = partnerId ? getItemBestPrice(item, itemsByPartner[partnerId]?.promotions || []) : (item.products?.price || 0)
                return sum + price * getItemQuantity(item)
            }, 0)

    const getPartnerCheckoutProducts = (partnerId: string) =>
        itemsByPartner[partnerId].items
            .filter((item: any) => getItemSelected(item))
            .map((item: any) => ({
                id: item.variant_id || item.product_id || item.service_id || item.recurring_plan_id,
                name: getItemName(item),
                variant: item.variant_id && item.product_variants ? `${item.product_variants.variant_type}: ${item.product_variants.variant_name}` : undefined,
                price: getItemBestPrice(item, partnerId ? itemsByPartner[partnerId]?.promotions || [] : []),
                quantity: getItemQuantity(item),
                image: getItemImage(item),
                availabilityValue: Number(item.products?.availability_value || 0),
                availabilityUnit: item.products?.availability_unit || "Minutos",
            }))

    const getDeliveryLabel = (partnerData: any) => {
        const settings = partnerData.deliverySettings
        if (!settings) return "A combinar"
        if (settings.is_delivery_enabled === false) return "Apenas retirada"
        const fee = Number(settings.base_fee || 0)
        return fee > 0 ? formatCurrency(fee) : "Grátis"
    }

    const multiplePartners = Object.keys(itemsByPartner).length > 1

    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
            <MarketplaceHeader simpleTitle="Minha sacola" />

            <div className="flex-1 flex flex-col container mx-auto px-4 max-w-[1400px] w-full pt-6 md:pt-10 pb-20 mt-[78px] lg:mt-[108px] relative overflow-hidden">
                <div className="hidden lg:block items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Minha sacola</h1>
                        <p className="text-md text-brand-inactive-text mt-1">Veja os itens da sua sacola</p>
                    </div>
                </div>

                {Object.keys(itemsByPartner).length === 0 ? (
                    <div className="text-center flex flex-col items-center justify-center">
                        <IconPlaceholder
                            placeholderType="image"
                            imageSrc="https://img.dudit.com.br/static/mascots/SacolaVazia.png"
                            imageAlt="Sacola vazia"
                            title="Sua sacola está leve até demais"
                            subtitle="O Dino está pronto para carregar seus achados. Explore o catálogo e dê um peso pra essa sacola!"
                            itemButton={{
                                text: "Explorar agora",
                                action: "/"
                            }}
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        <div className="lg:col-span-12 space-y-8">
                            {Object.entries(itemsByPartner).map(([partnerId, data]: [string, any], index: number, array: any[]) => {
                                const partnerPromos = data.promotions || []
                                const partnerItemsTotal = getPartnerSelectedTotal(data.items, partnerId)
                                const partnerDeliveryFee = getPartnerDeliveryFee(data)
                                const partnerTotalWithDelivery = partnerItemsTotal > 0 ? partnerItemsTotal + partnerDeliveryFee : 0
                                const expanded = isExpanded(partnerId)
                                const inStockItems = data.items.filter((item: any) => !isItemOutOfStock(item))
                                const allSelected = inStockItems.length > 0 && inStockItems.every((item: any) => getItemSelected(item))
                                const sellerImage = data.partner?.store_image_url

                                return (
                                    <Fragment key={partnerId}>
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-8 lg:gap-y-0 relative items-start">
                                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 bg-transparent overflow-hidden">
                                                {/* Header do vendedor - estilo Accordion / FormSection */}
                                                <div
                                                    className="flex items-center justify-between pb-4 mb-4 border-b border-brand-border dark:border-dark-border cursor-pointer select-none"
                                                    onClick={() => toggleVendor(partnerId)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div onClick={e => e.stopPropagation()} className="flex items-center">
                                                            <Checkbox
                                                                id={`select-partner-${partnerId}`}
                                                                checked={allSelected}
                                                                onChange={() => togglePartnerSelection(partnerId, data.items, allSelected)}
                                                                disabled={loading === partnerId}
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <img
                                                                src={getImageUrl(sellerImage) || "https://img.dudit.com.br/static/Placeholder.png"}
                                                                alt={data.partner?.store_name}
                                                                className="bg-white border border-brand-border dark:border-dark-border w-6 h-6 rounded-full object-cover"
                                                                onClick={e => { e.stopPropagation(); router.push(getPartnerUrl(data.partner)) }}
                                                            />
                                                            <h3
                                                                className="text-lg font-semibold text-brand-dark dark:text-dark-heading hover:text-brand-green transition-colors"
                                                                onClick={e => { e.stopPropagation(); router.push(getPartnerUrl(data.partner)) }}
                                                            >
                                                                {data.partner?.store_name || "Loja"}
                                                            </h3>
                                                        </div>
                                                    </div>
                                                    <button className="text-brand-dark dark:text-dark-heading hover:bg-brand-gray/50 dark:hover:bg-zinc-800 p-1 rounded-full transition-colors">
                                                        {expanded ? <ChevronUpIcon size={20} /> : <ChevronDownIcon size={20} />}
                                                    </button>
                                                </div>

                                                {/* Conteúdo com animação suave de expand/collapse */}
                                                <AnimatePresence initial={false}>
                                                    {expanded && (
                                                        <motion.div
                                                            key="content"
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.22, ease: "easeInOut" }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="pt-2 pb-6">
                                                                {[
                                                                    { title: "Produtos", items: data.products?.length ? data.products : data.items.filter((i: any) => (i.item_type || "product") === "product") },
                                                                    { title: "Serviços", items: data.services || [] },
                                                                    { title: "Assinaturas", items: data.subscriptions || [] },
                                                                ].flatMap((section) =>
                                                                    section.items.length === 0
                                                                        ? []
                                                                        : [
                                                                            <div key={`${partnerId}-${section.title}-hdr`} className="flex items-center justify-between mb-3 mt-2 first:mt-0">
                                                                                <h4 className="text-xs font-bold uppercase tracking-wide text-brand-inactive-text">{section.title}</h4>
                                                                                <span className="text-xs text-brand-inactive-text">
                                                                                    {section.items.filter((i: any) => getItemSelected(i)).length} itens · {formatCurrency(
                                                                                        section.items
                                                                                            .filter((i: any) => getItemSelected(i))
                                                                                            .reduce((s: number, i: any) => s + getItemBestPrice(i, partnerPromos) * getItemQuantity(i), 0),
                                                                                    )}
                                                                                </span>
                                                                            </div>,
                                                                            ...section.items,
                                                                        ],
                                                                ).map((entry: any, index: number) => {
                                                                    if (!entry?.id) return entry
                                                                    const item = entry
                                                                    const itemSelected = getItemSelected(item)
                                                                    const itemQty = getItemQuantity(item)

                                                                    return (
                                                                        <div key={item.id} className={`lg:pb-6 ${index !== data.items.length - 1 ? "border-b border-brand-border dark:border-dark-border mb-6" : "mb-2"}`}>

                                                                            {/* Mobile/Tablet Layout (< md) */}
                                                                            {(() => {
                                                                                const isOutOfStock = isItemOutOfStock(item);
                                                                                return (
                                                                                    <div className="flex flex-col">
                                                                                        <div className={`flex md:hidden gap-3 ${isOutOfStock ? "opacity-75" : ""}`}>
                                                                                            <div className="flex items-start pt-1 shrink-0">
                                                                                                <Checkbox
                                                                                                    id={`cart-item-mob-${item.id}`}
                                                                                                    checked={isOutOfStock ? false : itemSelected}
                                                                                                    onChange={() => !isOutOfStock && toggleItemSelection(item.id, itemSelected)}
                                                                                                    disabled={loading === item.id || isOutOfStock}
                                                                                                />
                                                                                            </div>

                                                                                            <Link
                                                                                                href={getProductUrl({ ...item.products, id: item.product_id }, data.partner)}
                                                                                                prefetch={false}
                                                                                                className="w-[68px] h-[68px] rounded-[8px] overflow-hidden border border-brand-border dark:border-dark-border shrink-0 cursor-pointer block"
                                                                                            >
                                                                                                <img src={getItemImage(item)} alt={getItemName(item)} className="w-full h-full object-cover" />
                                                                                            </Link>

                                                                                            <div className="flex-1 min-w-0">
                                                                                                <div className="flex items-start justify-between gap-2">
                                                                                                    <Link
                                                                                                        href={getProductUrl({ ...item.products, id: item.product_id }, data.partner)}
                                                                                                        prefetch={false}
                                                                                                        className="text-[14px] font-medium text-brand-dark dark:text-dark-heading line-clamp-2 cursor-pointer hover:text-brand-green leading-snug"
                                                                                                    >
                                                                                                        {getItemName(item)}
                                                                                                    </Link>
                                                                                                    <button
                                                                                                        onClick={() => setDeleteModal({ open: true, cartItemId: item.id })}
                                                                                                        className="text-brand-red p-1 hover:bg-brand-red/15 rounded-full transition-colors shrink-0"
                                                                                                        disabled={loading === item.id}
                                                                                                    >
                                                                                                        <TrashIcon size={16} />
                                                                                                    </button>
                                                                                                </div>

                                                                                                {item.variant_id && item.product_variants && (
                                                                                                    <p className="text-[12px] text-brand-inactive-text mt-0.5">
                                                                                                        {item.product_variants.variant_type}: <span className="font-medium text-brand-dark dark:text-dark-heading">{item.product_variants.variant_name}</span>
                                                                                                    </p>
                                                                                                )}

                                                                                                <div className="flex items-center justify-between mt-2">
                                                                                                    {isOutOfStock ? (
                                                                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
                                                                                                            Esgotado
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <QuantitySelector
                                                                                                            value={itemQty}
                                                                                                            onChange={(val) => updateQty(item.id, val, itemQty)}
                                                                                                            disabled={loading === item.id}
                                                                                                            size="sm"
                                                                                                        />
                                                                                                    )}
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        {(() => {
                                                                                                            const ctx = getItemPricingContext(item, partnerPromos)
                                                                                                            const total = isOutOfStock ? ctx.bestPrice : ctx.bestPrice * itemQty
                                                                                                            return (
                                                                                                                <>
                                                                                                                    {ctx.referencePrice && (
                                                                                                                        <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(isOutOfStock ? ctx.referencePrice : ctx.referencePrice * itemQty)}</span>
                                                                                                                    )}
                                                                                                                    <span className="text-[15px] font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</span>
                                                                                                                    {ctx.discountSource === "campaign" && (
                                                                                                                        <Badge variant="blue" icon={null} className="text-[10px] whitespace-nowrap">-{ctx.discountPercent}%</Badge>
                                                                                                                    )}
                                                                                                                    {ctx.discountSource === "manual" && (
                                                                                                                        <Badge variant="orange" icon={null} className="text-[10px] whitespace-nowrap">-{ctx.discountPercent}%</Badge>
                                                                                                                    )}
                                                                                                                </>
                                                                                                            )
                                                                                                        })()}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        {isOutOfStock && item.available_alternatives && item.available_alternatives.length > 0 && (
                                                                                            <div className="mt-3 pl-8 md:hidden">
                                                                                                <div className="bg-brand-gray/30 dark:bg-zinc-800/40 p-3 rounded-xl border border-brand-border dark:border-dark-border text-xs">
                                                                                                    <p className="font-semibold text-brand-dark dark:text-dark-heading mb-2 flex items-center gap-1.5">
                                                                                                        <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
                                                                                                        Disponível em outra(s) variante(s):
                                                                                                    </p>
                                                                                                    <div className="flex flex-wrap gap-2">
                                                                                                        {item.available_alternatives.map((alt: any) => (
                                                                                                            <button
                                                                                                                key={alt.id}
                                                                                                                onClick={() => switchVariant(item.id, alt.id)}
                                                                                                                disabled={loading === item.id}
                                                                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-brand-gray dark:bg-dark-surface dark:hover:bg-zinc-800 border border-brand-border dark:border-dark-border hover:border-brand-green dark:hover:border-brand-green font-medium text-brand-dark dark:text-dark-heading transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                                                                                            >
                                                                                                                <span>{alt.variant_name}</span>
                                                                                                                <span className="text-brand-inactive-text">•</span>
                                                                                                                <span className="font-semibold text-brand-green">{formatCurrency(getAlternativePrice(alt, item.products))}</span>
                                                                                                            </button>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })()}

                                                                            {/* Desktop Layout (>= md) */}
                                                                            {(() => {
                                                                                const isOutOfStock = isItemOutOfStock(item);
                                                                                return (
                                                                                    <div className="hidden md:block">
                                                                                        <div className="flex gap-4">
                                                                                            <div className="flex items-center shrink-0">
                                                                                                <Checkbox
                                                                                                    id={`cart-item-${item.id}`}
                                                                                                    checked={isOutOfStock ? false : itemSelected}
                                                                                                    onChange={() => !isOutOfStock && toggleItemSelection(item.id, itemSelected)}
                                                                                                    disabled={loading === item.id || isOutOfStock}
                                                                                                />
                                                                                            </div>

                                                                                            <div className={`flex-1 flex md:justify-between md:items-center gap-4 ${isOutOfStock ? "opacity-75" : ""}`}>
                                                                                                <Link
                                                                                                    href={getProductUrl({ ...item.products, id: item.product_id }, data.partner)}
                                                                                                    prefetch={false}
                                                                                                    className="w-[68px] h-[68px] rounded-[8px] overflow-hidden border border-brand-border dark:border-dark-border shrink-0 cursor-pointer block"
                                                                                                >
                                                                                                    <img src={getItemImage(item)} alt={getItemName(item)} className="w-full h-full object-cover" />
                                                                                                </Link>

                                                                                                <div className="flex-1">
                                                                                                    <Link
                                                                                                        href={getProductUrl({ ...item.products, id: item.product_id }, data.partner)}
                                                                                                        prefetch={false}
                                                                                                        className="text-[16px] font-medium text-brand-dark dark:text-dark-heading mb-1 line-clamp-2 cursor-pointer hover:text-brand-green block"
                                                                                                    >
                                                                                                        {getItemName(item)}
                                                                                                    </Link>
                                                                                                    {item.variant_id && item.product_variants && (
                                                                                                        <p className="text-[13px] text-brand-inactive-text mb-1">
                                                                                                            {item.product_variants.variant_type}: <span className="font-medium text-brand-dark dark:text-dark-heading">{item.product_variants.variant_name}</span>
                                                                                                        </p>
                                                                                                    )}
                                                                                                    {(() => {
                                                                                                        const ctx = getItemPricingContext(item, partnerPromos)
                                                                                                        return (
                                                                                                            <>
                                                                                                                <div className="flex items-center gap-2">
                                                                                                                    {ctx.referencePrice && <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(ctx.referencePrice)}</span>}
                                                                                                                    <p className="text-[15px] font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(ctx.bestPrice)}</p>
                                                                                                                    {ctx.discountSource === "campaign" && (
                                                                                                                        <Badge variant="blue" icon={null} className="text-[10px] whitespace-nowrap">-{ctx.discountPercent}%</Badge>
                                                                                                                    )}
                                                                                                                    {ctx.discountSource === "manual" && (
                                                                                                                        <Badge variant="orange" icon={null} className="text-[10px] whitespace-nowrap">-{ctx.discountPercent}%</Badge>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                            </>
                                                                                                        )
                                                                                                    })()}
                                                                                                </div>

                                                                                                <div className="flex items-center justify-end gap-4">
                                                                                                    {isOutOfStock ? (
                                                                                                        <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-semibold bg-red-150 text-red-700 border border-red-255 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
                                                                                                            Esgotado
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <QuantitySelector
                                                                                                            value={itemQty}
                                                                                                            onChange={(val) => updateQty(item.id, val, itemQty)}
                                                                                                            disabled={loading === item.id}
                                                                                                        />
                                                                                                    )}
                                                                                                    {(() => {
                                                                                                        const ctx = getItemPricingContext(item, partnerPromos)
                                                                                                        const total = isOutOfStock ? ctx.bestPrice : ctx.bestPrice * itemQty
                                                                                                        return (
                                                                                                            <div className="text-right min-w-[80px]">
                                                                                                                {ctx.referencePrice && <p className="text-xs text-brand-inactive-text line-through">{formatCurrency(isOutOfStock ? ctx.referencePrice : ctx.referencePrice * itemQty)}</p>}
                                                                                                                <p className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</p>
                                                                                                            </div>
                                                                                                        )
                                                                                                    })()}
                                                                                                    <button onClick={() => setDeleteModal({ open: true, cartItemId: item.id })} className="text-brand-red p-2 hover:bg-brand-red/15 rounded-full transition-colors" disabled={loading === item.id}><TrashIcon size={18} /></button>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        {isOutOfStock && item.available_alternatives && item.available_alternatives.length > 0 && (
                                                                                            <div className="mt-3 ml-10">
                                                                                                <div className="bg-brand-gray/30 dark:bg-zinc-800/40 p-3.5 rounded-xl border border-brand-border dark:border-dark-border text-sm max-w-xl animate-fade-in">
                                                                                                    <p className="font-semibold text-brand-dark dark:text-dark-heading mb-2 flex items-center gap-1.5">
                                                                                                        <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
                                                                                                        Disponível em outra(s) variante(s):
                                                                                                    </p>
                                                                                                    <div className="flex flex-wrap gap-2">
                                                                                                        {item.available_alternatives.map((alt: any) => (
                                                                                                            <button
                                                                                                                key={alt.id}
                                                                                                                onClick={() => switchVariant(item.id, alt.id)}
                                                                                                                disabled={loading === item.id}
                                                                                                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white hover:bg-brand-gray dark:bg-dark-surface dark:hover:bg-zinc-800 border border-brand-border dark:border-dark-border hover:border-brand-green dark:hover:border-brand-green font-medium text-brand-dark dark:text-dark-heading transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                                                                                            >
                                                                                                                <span>{alt.variant_name}</span>
                                                                                                                <span className="text-brand-inactive-text">•</span>
                                                                                                                <span className="font-semibold text-brand-green">{formatCurrency(getAlternativePrice(alt, item.products))}</span>
                                                                                                            </button>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    )
                                                                })}

                                                                {/* Mobile/Tablet: resumo inline + botão */}
                                                                <div className="mt-4 pt-4 border-t border-brand-border dark:border-dark-border md:hidden space-y-3">
                                                                    {renderPromoBanners(partnerId, partnerItemsTotal)}
                                                                    <div className="flex justify-between items-center text-sm">
                                                                        <span className="text-brand-inactive-text">Total dos itens</span>
                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(partnerItemsTotal)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center text-sm">
                                                                        <span className="text-brand-inactive-text">Entrega</span>
                                                                        <span className="text-brand-green font-semibold">{getDeliveryLabel(data)}</span>
                                                                    </div>
                                                                    <div className="h-[1px] bg-brand-border dark:bg-dark-border w-full" />
                                                                    <div className="flex justify-between items-center text-base font-bold text-brand-dark dark:text-dark-heading">
                                                                        <span>Total</span>
                                                                        <span>{formatCurrency(partnerTotalWithDelivery)}</span>
                                                                    </div>
                                                                    <Button
                                                                        onClick={() => handleOpenCheckout(partnerId)}
                                                                        className="w-full"
                                                                        disabled={partnerItemsTotal === 0}
                                                                    >
                                                                        Finalizar pedido
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            {/* Desktop sidebar para esta loja especificamente */}
                                            <div className="hidden lg:block col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 self-start">
                                                <div className="border border-brand-border dark:border-dark-border rounded-[12px] overflow-hidden bg-white dark:bg-dark-surface sticky top-[100px]">
                                                    <div className="bg-brand-gray/50 dark:bg-emerald-900/10 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                                                        Resumo do Pedido{!expanded && partnerTotalWithDelivery > 0 && (
                                                            <span className="text-brand-green font-semibold ml-1">({formatCurrency(partnerTotalWithDelivery)})</span>
                                                        )}
                                                    </div>

                                                    <AnimatePresence initial={false}>
                                                        {expanded && (
                                                            <motion.div
                                                                key="summary-content"
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.22, ease: "easeInOut" }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="p-6 space-y-4">
                                                                    {renderPromoBanners(partnerId, partnerItemsTotal)}
                                                                    <div className="flex justify-between items-center text-sm font-medium">
                                                                        <span className="text-brand-inactive-text">Total dos itens</span>
                                                                        <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(partnerItemsTotal)}</span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center text-sm font-medium">
                                                                        <span className="text-brand-inactive-text">Entrega</span>
                                                                        <span className="text-brand-green font-semibold">{getDeliveryLabel(data)}</span>
                                                                    </div>
                                                                    <div className="h-[1px] bg-brand-border dark:bg-dark-border w-full" />
                                                                    <div className="flex justify-between items-center font-bold text-xl text-brand-dark dark:text-dark-heading">
                                                                        <span>Total Geral</span>
                                                                        <span>{formatCurrency(partnerTotalWithDelivery)}</span>
                                                                    </div>
                                                                    <Button
                                                                        onClick={() => handleOpenCheckout(partnerId)}
                                                                        className="w-full h-[46px]"
                                                                        disabled={partnerItemsTotal === 0}
                                                                    >
                                                                        Finalizar Pedido
                                                                    </Button>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        </div>
                                        {index !== array.length - 1 && (
                                            <div className="w-full h-[1px] bg-brand-border dark:bg-dark-border my-12" />
                                        )}
                                    </Fragment>)
                            })}
                        </div>
                    </div>
                )}
            </div>

            <MarketplaceFooter />

            <AlertModal
                isOpen={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, cartItemId: null })}
                onConfirm={() => removeItem(deleteModal.cartItemId!)}
                title="Remover da sacola"
                description="Tem certeza que deseja remover este item? Esta ação não pode ser desfeita."
                confirmText="Remover"
                cancelText="Cancelar"
                isDestructive={true}
                disabled={loading === deleteModal.cartItemId}
            />

            {/* Fallback Error Modal */}
            <DefaultModal
                isOpen={showErrorModal}
                onClose={() => setShowErrorModal(false)}
                title=""
                hideHeader={true}
            >
                <div className="flex flex-col items-center text-center p-4">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                        imageAlt="Ops"
                        title="Ops! Algo deu errado por aqui"
                        subtitle="Algo inesperado aconteceu. Tente novamente em alguns instantes."
                        itemButton={{
                            text: "Entendido",
                            action: () => setShowErrorModal(false),
                            className: "w-full max-w-[200px]"
                        }}
                    />
                </div>
            </DefaultModal>
        </div>
    )
}