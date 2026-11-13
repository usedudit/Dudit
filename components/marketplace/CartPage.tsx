"use client"

import { useState, useRef, Fragment, useEffect, useCallback } from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getStoreUrl, getProductUrl, getServiceUrl, getPlanUrl } from "@/lib/utils/url-generator"
import { TrashIcon, ChevronUpIcon, ChevronDownIcon, FireIcon } from "@/lib/icons"
import { QuantitySelector } from "@/components/reusable/QuantitySelector"
import { AnimatePresence, motion } from "framer-motion"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { updateCartQuantityAction, removeFromCartAction, toggleCartSelectionAction, toggleCartPartnerSelectionAction, switchCartItemVariantAction } from "@/app/actions/marketplace/cart"
import { Button, Checkbox, IconPlaceholder, AlertModal, DefaultModal, Badge, Input, CepInput, StateComboBox, NumberInputWithCheckbox, Spinner, RadioButton, InfoCard } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { useNotification } from "@/hooks/use-notification"
import { invalidateCartCache } from "@/hooks/use-cart"
import { formatCurrency, formatDateToBR, formatDeliveryDaysRange } from "@/lib/utils"
import { parseTimeToMinutes } from "@/lib/utils/opening-hours"
import { useTransitionDirection } from "@/providers/transition-provider"
import { useCSRFToken, fetchCSRFTokenSingleton } from "@/hooks/use-csrf-token"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"
import { validateServiceBookingAvailabilityAction } from "@/app/actions/marketplace/services"
import { getAddressesAction, createAddressAction, setDefaultAddressAction } from "@/app/actions/shared/addresses"
import { quoteDeliveryFeeAction, checkServiceAttendanceAction } from "@/app/actions/shared/delivery"
import { quoteCarrierFreightAction } from "@/app/actions/marketplace/carrier-shipping"
import type { CarrierFreightOption } from "@/lib/services/shipping/carrier-checkout"
import { hasDeliveryRatesConfigured } from "@/lib/delivery/fee"
import { normalizeFulfillmentModes } from "@/lib/commerce/capabilities"
import { MapPinIcon, PlusIcon, CheckCircleIcon, TruckIcon } from "@/lib/icons"
import { notifyAddressUpdated, useAddressSync, DUDIT_ACTIVE_ADDRESS_STORAGE_KEY } from "@/lib/utils/address-sync"

interface CartPageClientProps {
    itemsByPartner: any
    userId: string
    initialCartCount: number
    initialUserProfile: { full_name: string | null; address: string | null; avatar_url: string | null } | null
    initialUserAddresses: any[]
}

// Cache em memória (client) das cotações de frete próprio. O carrinho recota a
// cada mudança de seleção/quantidade/endereço - alternar entre estados (marcar/
// desmarcar itens, trocar de endereço) repete a mesma assinatura e fica
// instantâneo, sem novo roundtrip.
const CART_DELIVERY_QUOTE_TTL_MS = 20 * 1000
const CART_DELIVERY_QUOTE_CACHE_MAX = 30
const cartDeliveryQuoteCache = new Map<string, { at: number; fee: number; distanceKm: number | null; breakdown: any; error: string | null }>()

function rememberCartDeliveryQuote(key: string, value: { fee: number; distanceKm: number | null; breakdown: any; error: string | null }) {
    cartDeliveryQuoteCache.delete(key)
    cartDeliveryQuoteCache.set(key, { at: Date.now(), ...value })
    while (cartDeliveryQuoteCache.size > CART_DELIVERY_QUOTE_CACHE_MAX) {
        const oldest = cartDeliveryQuoteCache.keys().next().value
        if (oldest === undefined) break
        cartDeliveryQuoteCache.delete(oldest)
    }
}

export function CartPageClient({ itemsByPartner, userId, initialCartCount, initialUserProfile, initialUserAddresses }: CartPageClientProps) {
    const router = useRouter()
    const { user } = useSupabase()
    const { setDirection } = useTransitionDirection()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const [isVendorExpanded, setIsVendorExpanded] = useState<Record<string, boolean>>({})
    const [loading, setLoading] = useState<string | null>(null)
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; cartItemId: string | null }>({ open: false, cartItemId: null })
    const [showErrorModal, setShowErrorModal] = useState(false)
    const isActionInProgress = useRef(false)
    const [serviceAvailability, setServiceAvailability] = useState<Record<string, { available: boolean; checked: boolean }>>({})
    const [cartConflicts, setCartConflicts] = useState<Record<string, string>>({}) // cartItemId → conflicting cartItemId
    // Avisos que impedem finalizar o pedido: ficam visíveis na tela e levam o
    // usuário até o item que precisa de ação (remover/desmarcar/remarcar).
    const [checkoutIssues, setCheckoutIssues] = useState<Array<{ storeKey: string; cartItemId: string; message: string }>>([])
    const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)

    // Optimistic overrides for instant UI feedback (selection + quantity)
    const [optimisticItems, setOptimisticItems] = useState<Record<string, { selected?: boolean; quantity?: number }>>({})
    const [cartCount, setCartCount] = useState(initialCartCount)

    const [userAddresses, setUserAddresses] = useState<any[]>(initialUserAddresses)
    const [selectedAddressId, setSelectedAddressId] = useState<string>(() => {
        if (typeof window !== "undefined") {
            const activeId = localStorage.getItem(DUDIT_ACTIVE_ADDRESS_STORAGE_KEY)
            if (activeId && initialUserAddresses.some((a: any) => a.id === activeId)) {
                return activeId
            }
        }
        const selected = initialUserAddresses.find((address: any) => address.is_default) || initialUserAddresses[0]
        return selected?.id || ""
    })
    const selectedAddress = userAddresses.find(a => a.id === selectedAddressId)
    const [deliveryQuotes, setDeliveryQuotes] = useState<Record<string, { fee: number; distanceKm: number | null; breakdown: any; loading: boolean; error: string | null; isOutsideRadius?: boolean }>>({})
    // Deslocamento para serviços prestados no endereço do cliente.
    const [serviceTravelQuotes, setServiceTravelQuotes] = useState<Record<string, { fee: number; distanceKm: number | null; loading: boolean; error: string | null; outOfRadius: boolean }>>({})
    const serviceTravelSeqRef = useRef<Record<string, number>>({})
    // Carrier freight (SuperFrete) - fallback when own delivery radius has no coverage
    const [carrierQuotes, setCarrierQuotes] = useState<Record<string, { options: CarrierFreightOption[]; loading: boolean; error: string | null; selectedServiceId: number | null; key: string | null }>>({})
    const deliveryQuoteSeqRef = useRef<Record<string, number>>({})
    const carrierFetchedKeysRef = useRef<Record<string, string>>({})
    const [showAddressModal, setShowAddressModal] = useState(false)
    const [showNewAddressForm, setShowNewAddressForm] = useState(false)
    const [newAddressData, setNewAddressData] = useState({
        zipCode: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        noNumber: false,
        addressType: "casa",
        isDefault: false,
        latitude: null as number | null,
        longitude: null as number | null,
    })
    const [loadingAddressSave, setLoadingAddressSave] = useState(false)
    const [addressFormError, setAddressFormError] = useState<string | null>(null)
    const [loadingCep, setLoadingCep] = useState(false)

    const loadUserAddresses = useCallback(async (preferredId?: string) => {
        if (!userId) return
        try {
            const res = await getAddressesAction(userId, "user")
            if (res.addresses && res.addresses.length > 0) {
                const list = res.addresses as any[]
                setUserAddresses(list)
                const storedActiveId = typeof window !== "undefined" ? localStorage.getItem(DUDIT_ACTIVE_ADDRESS_STORAGE_KEY) : null
                if (preferredId && list.some((a: any) => a.id === preferredId)) {
                    setSelectedAddressId(preferredId)
                } else if (storedActiveId && list.some((a: any) => a.id === storedActiveId)) {
                    setSelectedAddressId(storedActiveId)
                } else if (!selectedAddressId || !list.some((a: any) => a.id === selectedAddressId)) {
                    const def = list.find((a: any) => a.is_default) || list[0]
                    if (def) setSelectedAddressId(def.id)
                }
            } else {
                setUserAddresses([])
                setSelectedAddressId("")
            }
        } catch (err) {
            console.error("Error loading user addresses in cart:", err)
        }
    }, [userId, selectedAddressId])

    useAddressSync(useCallback((updatedId?: string) => {
        loadUserAddresses(updatedId)
    }, [loadUserAddresses]))

    const handleSelectAddress = (id: string) => {
        setSelectedAddressId(id)
        const addr = userAddresses.find(a => a.id === id)
        notifyAddressUpdated(id, addr)
        setShowAddressModal(false)
    }

    const handleSetDefaultInCart = async (e: React.MouseEvent, addrId: string) => {
        e.stopPropagation()
        try {
            const csrfToken = await fetchCSRFTokenSingleton() || ""
            const result = await setDefaultAddressAction(addrId, "user", userId, csrfToken)
            if (!result.error) {
                setUserAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === addrId })))
                const target = userAddresses.find(a => a.id === addrId)
                notifyAddressUpdated(addrId, target, (result as any)?.citySlug)
            }
        } catch (err) {
            console.error("Erro ao definir endereço padrão no carrinho:", err)
        }
    }

    const handleCepBlurInCart = async () => {
        const zip = newAddressData.zipCode.replace(/\D/g, "")
        if (zip.length !== 8) return
        setLoadingCep(true)
        try {
            const response = await fetch(`/api/cep?cep=${zip}`)
            const data = await response.json()
            if (!data.erro && !data.error) {
                setNewAddressData(prev => ({
                    ...prev,
                    street: data.logradouro || prev.street,
                    number: data.numero || prev.number,
                    noNumber: data.numero ? data.numero === "S/N" : prev.noNumber,
                    neighborhood: data.bairro || prev.neighborhood,
                    city: data.localidade || data.municipio || prev.city,
                    state: data.uf || prev.state,
                    latitude: typeof data.latitude === "number" ? data.latitude : prev.latitude,
                    longitude: typeof data.longitude === "number" ? data.longitude : prev.longitude,
                }))
            }
        } catch (err) {
            console.error("Erro ao buscar CEP:", err)
        } finally {
            setLoadingCep(false)
        }
    }

    const handleSaveNewAddressInCart = async () => {
        if (!userId) return
        const { zipCode, street, number, neighborhood, city, state, noNumber, addressType } = newAddressData
        const finalNumber = noNumber ? "S/N" : number
        if (!zipCode || !street || !finalNumber || !neighborhood || !city || !state) {
            setAddressFormError("Preencha todos os campos obrigatórios do endereço")
            return
        }
        setLoadingAddressSave(true)
        setAddressFormError(null)
        try {
            const csrfToken = await fetchCSRFTokenSingleton() || ""
            const result = await createAddressAction({
                entityId: userId, entityType: "user",
                street, number: finalNumber, complement: newAddressData.complement,
                neighborhood, city, state, zipCode,
                isDefault: newAddressData.isDefault || userAddresses.length === 0,
                addressType,
                latitude: newAddressData.latitude ?? null,
                longitude: newAddressData.longitude ?? null,
                csrf_token: csrfToken,
            })
            if (result.error) {
                setAddressFormError(result.error)
            } else if (result.address) {
                setUserAddresses(prev => {
                    if (result.address.is_default) {
                        return [...prev.map(a => ({ ...a, is_default: false })), result.address]
                    }
                    return [...prev, result.address]
                })
                setSelectedAddressId(result.address.id)
                notifyAddressUpdated(result.address.id, result.address, (result as any)?.citySlug)
                setShowNewAddressForm(false)
                setShowAddressModal(false)
                setNewAddressData({ zipCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", noNumber: false, addressType: "casa", isDefault: false, latitude: null, longitude: null })
            }
        } catch {
            setAddressFormError("Erro ao salvar endereço.")
        } finally {
            setLoadingAddressSave(false)
        }
    }

    const hasOnlyServices = (items: any[]) => {
        const selected = (items || []).filter((item: any) => getItemSelected(item))
        return selected.length > 0 && selected.every((item: any) => item.item_type === "service_booking")
    }

    const getCustomerLocationService = (items: any[]) => {
        return (items || []).find((item: any) => {
            if (!getItemSelected(item) || item.item_type !== "service_booking") return false
            if (item.fulfillment_mode) return item.fulfillment_mode === "customer_location"
            const modes = Array.isArray(item.services?.fulfillment_modes) ? item.services.fulfillment_modes : []
            if (modes.length === 0) return false
            return !modes.includes("on_site") && modes.includes("customer_location")
        })
    }

    const getServiceTravelFee = (storeKey?: string) => {
        if (!storeKey) return 0
        const quote = serviceTravelQuotes[storeKey]
        if (!quote || quote.loading || quote.outOfRadius || quote.error) return 0
        return Number(quote.fee || 0)
    }

    const getServiceTravelLabel = (storeKey: string) => {
        const quote = serviceTravelQuotes[storeKey]
        if (!quote) {
            return selectedAddress
                ? <span className="text-xs text-brand-inactive-text dark:text-dark-body animate-pulse">Calculando...</span>
                : <span className="text-xs text-brand-inactive-text dark:text-dark-body">A combinar</span>
        }
        if (quote.loading) {
            return <span className="text-xs text-brand-inactive-text dark:text-dark-body animate-pulse">Calculando...</span>
        }
        if (quote.outOfRadius || quote.error) {
            return <span className="text-xs text-brand-inactive-text dark:text-dark-body">A combinar</span>
        }
        if (quote.fee > 0) {
            return <span className="text-brand-green font-semibold">{formatCurrency(quote.fee)}</span>
        }
        return <span className="text-brand-green font-semibold">Grátis</span>
    }

    const renderPromoBanners = (storeKey: string, partnerItemsTotal: number) => {
        const partnerData = itemsByPartner[storeKey]
        const promos = partnerData?.promotions || []
        const pendingPromos = promos.filter((p: any) =>
            p.minSpendAmount &&
            p.minSpendAmount > partnerItemsTotal &&
            p.promotionType === "gift"
        )

        const settings = partnerData?.deliverySettings
        const freeDeliveryThreshold = settings?.free_delivery_threshold != null ? Number(settings.free_delivery_threshold) : 0
        const isFreeDeliveryEligible = freeDeliveryThreshold > 0 && partnerItemsTotal > 0 && !hasOnlyServices(partnerData?.items || [])
        const diffFreeDelivery = isFreeDeliveryEligible ? freeDeliveryThreshold - partnerItemsTotal : 0
        const showFreeDeliveryBanner = isFreeDeliveryEligible && diffFreeDelivery > 0

        if (pendingPromos.length === 0 && !showFreeDeliveryBanner) return null

        return (
            <div className="space-y-3">
                {showFreeDeliveryBanner && (
                    <div className="flex items-center gap-4 p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                        <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                            <TruckIcon className="text-brand-green" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                    Frete Grátis
                                </p>
                                <span className="text-xs font-bold text-brand-green">{Math.min(100, Math.round((partnerItemsTotal / freeDeliveryThreshold) * 100))}%</span>
                            </div>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                Falta <strong className="text-brand-green">{formatCurrency(diffFreeDelivery)}</strong> para entrega grátis
                            </p>
                            <div className="w-full bg-brand-gray dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                                <div
                                    className="bg-brand-green h-full rounded-full transition-all duration-500 ease-out"
                                    style={{ width: `${Math.min(100, (partnerItemsTotal / freeDeliveryThreshold) * 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                )}
                {pendingPromos.map((promo: any) => {
                    const diff = promo.minSpendAmount - partnerItemsTotal
                    const pct = Math.min(100, (partnerItemsTotal / promo.minSpendAmount) * 100)

                    return (
                        <div key={promo.id} className="flex items-center gap-4 p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
                            <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center shrink-0">
                                <CheckCircleIcon className="text-brand-green" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                        {promo.name}
                                    </p>
                                    <span className="text-xs font-bold text-brand-green">{pct.toFixed(0)}%</span>
                                </div>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                    Falta <strong className="text-brand-green">{formatCurrency(diff)}</strong> para ganhar este brinde
                                </p>
                                <div className="w-full bg-brand-gray dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                                    <div
                                        className="bg-brand-green h-full rounded-full transition-all duration-500 ease-out"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    const getImageUrl = (path: string) => getR2ImageUrl(path, "thumbnail")
    const isExpanded = (partnerId: string) => isVendorExpanded[partnerId] !== false
    const toggleVendor = (partnerId: string) =>
        setIsVendorExpanded(prev => ({ ...prev, [partnerId]: !prev[partnerId] }))

    const getItemPricingContext = (item: any, promotions: any[]) => {
        const isService = item.item_type === "service_booking"
        const addonsSum = (item.booking_metadata?.selectedAddons || []).reduce(
            (sum: number, a: any) => sum + (Number(a.price) || 0),
            0
        )
        const basePrice = (isService ? Number(item.services?.price || 0) : Number(item.products?.price || 0)) + addonsSum
        const unitPrice = (!isService && item.variant_id && item.product_variants)
            ? (Number(item.product_variants.price_adjustment) || (basePrice - addonsSum)) + addonsSum
            : basePrice
        const rawPromo = isService
            ? (item.services?.promotional_price ? Number(item.services.promotional_price) : 0)
            : (item.products?.promotional_price ? Number(item.products.promotional_price) : 0)
        const promoPrice = rawPromo > 0 ? rawPromo + addonsSum : 0
        const individualPromo = (!isService && !item.variant_id && promoPrice > 0 && promoPrice < unitPrice) ? promoPrice
            : (isService && promoPrice > 0 && promoPrice < unitPrice) ? promoPrice
                : null
        return computeItemDisplayPrice(unitPrice, individualPromo, promotions || [], {
            productId: isService ? undefined : item.product_id,
            serviceId: isService ? item.service_id : undefined,
            categoryId: isService ? undefined : item.products?.category_id || undefined,
        })
    }

    const getItemBestPrice = (item: any, promotions: any[]) => getItemPricingContext(item, promotions).bestPrice

    const getPartnerDisplayTotal = (storeKey: string, items: any[]) => {
        const promos = itemsByPartner[storeKey]?.promotions || []
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
            return item.services?.name || item.booking_metadata?.serviceName || "Serviço"
        }
        if (type === "subscription") {
            return item.recurring_plans?.name || "Assinatura"
        }
        return item.variant_id && item.product_variants
            ? `${item.products.name} - ${item.product_variants.variant_name}`
            : item.products?.name || "Item"
    }

    const getItemBooking = (item: any) => {
        if (item.item_type !== "service_booking") return null
        const meta = item.booking_metadata || {}
        if (!meta.date && !meta.time) return null
        return `${formatDateToBR(meta.date)} • ${meta.time}`
    }

    const getItemUrl = (item: any, partner: any) => {
        if (item.item_type === "service_booking") {
            return getServiceUrl({ ...item.services, id: item.service_id, short_id: item.services?.short_id }, partner)
        }
        if (item.item_type === "subscription") {
            return getPlanUrl({ ...item.recurring_plans, id: item.recurring_plan_id, short_id: item.recurring_plans?.short_id }, partner)
        }
        return getProductUrl({ ...item.products, id: item.product_id, short_id: item.products?.short_id }, partner)
    }


    const getItemMaxStock = (item: any): number => {
        const type = item.item_type || "product"
        if (type !== "product") return 999
        if (item.products?.allow_sell_without_stock) return 999
        if (item.variant_id && item.product_variants) {
            return Math.max(0, item.product_variants.stock_available ?? item.product_variants.stock_quantity ?? 0)
        }
        return Math.max(0, item.products?.stock_available ?? item.products?.stock_quantity ?? 0)
    }

    const isItemOutOfStock = (item: any): boolean => {
        const type = item.item_type || "product"
        if (type !== "product") return false
        if (item.products?.is_active === false) return true
        if (item.variant_id && item.product_variants && item.product_variants.is_active === false) return true
        if (item.products?.allow_sell_without_stock) return false
        return getItemMaxStock(item) <= 0
    }

    const isQuantityExceedingStock = (item: any): boolean => {
        const type = item.item_type || "product"
        if (type !== "product") return false
        if (item.products?.allow_sell_without_stock) return false
        const maxStock = getItemMaxStock(item)
        const qty = getItemQuantity(item)
        return maxStock > 0 && qty > maxStock
    }

    const getAlternativePrice = (alt: any, product: any) => {
        const variantPrice = Number(alt.price_adjustment)
        if (variantPrice > 0) return variantPrice
        const basePrice = Number(product.price)
        const promoPrice = product.promotional_price ? Number(product.promotional_price) : 0
        return promoPrice > 0 && promoPrice < basePrice ? promoPrice : basePrice
    }

    const getAlternativeImage = (alt: any, item: any) => {
        const opts = typeof alt?.variant_options === "string"
            ? (() => { try { return JSON.parse(alt.variant_options) } catch { return null } })()
            : alt?.variant_options
        if (opts?.image) return getImageUrl(opts.image)
        return getImageUrl(item?.products?.images?.[0]) || "https://img.dudit.com.br/static/Placeholder.png"
    }

    // Resolve optimistic overrides per item
    const getItemSelected = (item: any): boolean => {
        if (isItemOutOfStock(item)) return false
        return optimisticItems[item.id]?.selected ?? (item.selected !== false)
    }

    // Envio nacional (transportadora) só é válido quando TODOS os produtos
    // selecionados da loja declaram "shipping". Se houver mistura, a
    // transportadora é bloqueada e avisamos o cliente.
    const getPartnerShippingAvailability = (partnerData: any) => {
        const selectedProductItems = (partnerData?.products || []).filter((item: any) => getItemSelected(item))
        if (selectedProductItems.length === 0) {
            return { allAllowShipping: false, someAllowShipping: false, hasMixedShipping: false, blockedCount: 0 }
        }
        let shippingCount = 0
        let blockedCount = 0
        for (const item of selectedProductItems) {
            const modes = normalizeFulfillmentModes(item.products?.fulfillment_modes, ["delivery", "pickup"])
            if (modes.includes("shipping")) shippingCount++
            else blockedCount++
        }
        return {
            allAllowShipping: shippingCount > 0 && blockedCount === 0,
            someAllowShipping: shippingCount > 0,
            hasMixedShipping: shippingCount > 0 && blockedCount > 0,
            blockedCount,
        }
    }

    // Indica, item a item, quais produtos não aceitam envio nacional. Só é
    // exibido quando a loja oferece transportadora - assim o cliente entende
    // por que um endereço distante não pode receber o pedido.
    const renderItemShippingNote = (item: any, data: any) => {
        if (item.item_type && item.item_type !== "product") return null
        if (!data?.shippingEnabled) return null
        if (!getItemSelected(item)) return null
        const modes = normalizeFulfillmentModes(item.products?.fulfillment_modes, ["delivery", "pickup"])
        if (modes.includes("shipping")) return null
        const pickupOnly = !modes.includes("delivery")
        return (
            <p className="text-[12px] text-brand-orange dark:text-orange-400 font-medium mt-0.5 mb-1">
                {pickupOnly ? "Apenas retirada no local (sem envio nacional)" : "Sem envio nacional (somente entrega local)"}
            </p>
        )
    }

    const getItemQuantity = (item: any): number =>
        optimisticItems[item.id]?.quantity ?? item.quantity

    const csrfToken = useCSRFToken()

    const getCsrfToken = async (): Promise<string> => {
        if (csrfToken) return csrfToken
        return (await fetchCSRFTokenSingleton()) || ""
    }

    useEffect(() => {
        const serviceItems: Array<{ cartItemId: string; partnerId: string; staffId: string; date: string; time: string; durationMinutes: number }> = []
        for (const [, data] of Object.entries(itemsByPartner)) {
            const partnerData = data as any
            for (const item of (partnerData.services || [])) {
                const meta = item.booking_metadata
                if (meta?.staffId && meta?.date && meta?.time) {
                    serviceItems.push({
                        cartItemId: item.id,
                        partnerId: partnerData.partner?.id,
                        staffId: meta.staffId,
                        date: meta.date,
                        time: meta.time,
                        durationMinutes: meta.durationMinutes || 60,
                    })
                }
            }
        }
        if (serviceItems.length === 0) return
        validateServiceBookingAvailabilityAction(serviceItems).then((results) => {
            const map: Record<string, { available: boolean; checked: boolean }> = {}
            serviceItems.forEach((item, i) => {
                map[item.cartItemId] = { available: results[i]?.available ?? true, checked: true }
            })
            setServiceAvailability(map)
        })
    }, [itemsByPartner])

    // Detect scheduling conflicts between service bookings in the same cart
    useEffect(() => {
        const allServices: Array<{ id: string; staffId: string; date: string; time: string; durationMinutes: number }> = []
        for (const [, data] of Object.entries(itemsByPartner)) {
            const partnerData = data as any
            for (const item of (partnerData.services || [])) {
                const meta = item.booking_metadata
                if (meta?.staffId && meta?.date && meta?.time) {
                    allServices.push({
                        id: item.id,
                        staffId: meta.staffId,
                        date: meta.date,
                        time: meta.time,
                        durationMinutes: meta.durationMinutes || 60,
                    })
                }
            }
        }

        const conflicts: Record<string, string> = {}
        for (let i = 0; i < allServices.length; i++) {
            for (let j = i + 1; j < allServices.length; j++) {
                const a = allServices[i]
                const b = allServices[j]
                if (a.staffId !== b.staffId || a.date !== b.date) continue

                const aStart = parseTimeToMinutes(a.time)
                const aEnd = aStart + a.durationMinutes
                const bStart = parseTimeToMinutes(b.time)
                const bEnd = bStart + b.durationMinutes

                if (aStart < bEnd && aEnd > bStart) {
                    conflicts[a.id] = b.id
                    conflicts[b.id] = a.id
                }
            }
        }
        setCartConflicts(conflicts)
    }, [itemsByPartner])

    const updateQty = async (cartItemId: string, newQty: number, currentQty: number, maxStock?: number) => {
        if (loading || isActionInProgress.current || newQty === currentQty) return
        if (maxStock !== undefined && newQty > maxStock) {
            notifyError(`Quantidade máxima disponível: ${maxStock}`)
            newQty = maxStock
        }
        if (newQty === currentQty) return
        setCheckoutIssues([])
        isActionInProgress.current = true
        setOptimisticItems(prev => ({ ...prev, [cartItemId]: { ...prev[cartItemId], quantity: newQty } }))
        setLoading(cartItemId)
        try {
            const token = await getCsrfToken()
            const res = await updateCartQuantityAction(cartItemId, newQty, token)
            if (res?.error) {
                notifyError(res.error)
                setOptimisticItems(prev => ({ ...prev, [cartItemId]: { ...prev[cartItemId], quantity: currentQty } }))
            } else {
                setCartCount(prev => Math.max(0, prev + newQty - currentQty))
                invalidateCartCache()
            }
        } catch {
            setOptimisticItems(prev => ({ ...prev, [cartItemId]: { ...prev[cartItemId], quantity: currentQty } }))
            notifyError("Erro ao atualizar quantidade.")
        } finally {
            setLoading(null)
            isActionInProgress.current = false
        }
    }

    const switchVariant = async (cartItemId: string, newVariantId: string) => {
        if (loading || isActionInProgress.current) return
        setCheckoutIssues([])
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
        setCheckoutIssues([])
        const itemToRemove = Object.values(itemsByPartner)
            .flatMap((partner: any) => partner.items || [])
            .find((item: any) => item.id === cartItemId)
        isActionInProgress.current = true
        setLoading(cartItemId)
        try {
            const token = await getCsrfToken()
            const result = await removeFromCartAction(cartItemId, token)
            if (!result?.error) {
                setCartCount(prev => Math.max(0, prev - Number(itemToRemove?.quantity || 0)))
            }
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
        setCheckoutIssues([])
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
        setCheckoutIssues([])
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

    const scrollToCartItem = (cartItemId: string) => {
        if (typeof document === "undefined") return
        const target = document.querySelector(`[data-cart-item-id="${cartItemId}"]`)
        if (!target) return
        target.scrollIntoView({ behavior: "smooth", block: "center" })
        setHighlightedItemId(cartItemId)
        window.setTimeout(() => setHighlightedItemId(prev => prev === cartItemId ? null : prev), 2400)
    }

    const handleOpenCheckout = (storeKey: string) => {
        if (!userId) { router.push("/auth/login?next=/cart"); return }

        const partnerData = itemsByPartner[storeKey]
        if (partnerData?.isShowcaseActive === false) {
            notifyError("Esta vitrine está temporariamente inativa e não está aceitando novos pedidos.")
            return
        }
        if (partnerData?.isAcceptingOrders === false) {
            notifyError("Esta loja está fechada no momento e não está aceitando novos pedidos.")
            return
        }

        const hasSelected = partnerData?.items.some((item: any) => getItemSelected(item))

        if (!hasSelected) {
            setShowErrorModal(true)
            return
        }

        const partnerItems = partnerData.items.filter((item: any) => getItemSelected(item))

        // Coleta TODOS os impedimentos dos itens selecionados, mostra um aviso
        // na tela e leva o usuário ao primeiro item que precisa de ação.
        const issues: Array<{ storeKey: string; cartItemId: string; message: string }> = []
        for (const item of partnerItems) {
            if (isItemOutOfStock(item)) {
                issues.push({ storeKey, cartItemId: item.id, message: `"${getItemName(item)}" está esgotado. Desmarque ou remova-o da sacola para prosseguir.` })
            } else if (isQuantityExceedingStock(item)) {
                const max = getItemMaxStock(item)
                issues.push({ storeKey, cartItemId: item.id, message: `"${getItemName(item)}" possui apenas ${max} unidade(s) disponível(is). Ajuste a quantidade para continuar.` })
            } else if (item.item_type === "service_booking" && serviceAvailability[item.id]?.checked && !serviceAvailability[item.id]?.available) {
                issues.push({ storeKey, cartItemId: item.id, message: `O serviço "${getItemName(item)}" não está mais disponível no horário selecionado. Remarque ou remova-o da sacola para prosseguir.` })
            } else if (item.item_type === "service_booking" && cartConflicts[item.id]) {
                issues.push({ storeKey, cartItemId: item.id, message: `O serviço "${getItemName(item)}" tem horário conflitante com outro serviço da sacola. Remarque ou remova um deles para prosseguir.` })
            }
        }

        if (issues.length > 0) {
            setCheckoutIssues(issues)
            // Garante que a loja esteja expandida para o item existir no DOM.
            setIsVendorExpanded(prev => ({ ...prev, [storeKey]: true }))
            requestAnimationFrame(() => requestAnimationFrame(() => scrollToCartItem(issues[0].cartItemId)))
            return
        }
        setCheckoutIssues([])

        const partnerId = partnerData.partnerId || storeKey

        // Encaminha a opção de transportadora que o comprador já escolheu nesta
        // sacola - senão o /checkout reformataria de carregar e selecionaria a
        // opção mais barata, alterando serviço e valor da etiqueta gerada depois.
        const cq = carrierQuotes[storeKey]
        const selectedCarrier = cq?.selectedServiceId
            ? cq.options.find((o) => o.serviceId === cq.selectedServiceId)
            : null

        const checkoutData = {
            source: "cart",
            partnerId,
            storeId: partnerData.storeId || undefined,
            products: getPartnerCheckoutProducts(storeKey),
            partnerInfo: {
                address: partnerData.store?.addresses?.[0] || partnerData.partner?.addresses?.[0] || {},
                paymentMethods: partnerData.paymentMethods || ["Dinheiro"],
                mpConnected: !!partnerData.partner?.mp_user_id,
                mpPublicKey: partnerData.partner?.mp_public_key,
                store_name: partnerData.store?.name || "Loja",
                openingHours: partnerData.store?.opening_hours || null,
            },
            cartItems: partnerItems.map((item: any) => ({
                cartItemId: item.id,
                itemType: item.item_type || "product",
                productId: item.product_id || undefined,
                variantId: item.variant_id || undefined,
                serviceId: item.service_id || undefined,
                recurringPlanId: item.recurring_plan_id || undefined,
                quantity: getItemQuantity(item),
                selectedAddons: item.booking_metadata?.selectedAddons || undefined,
            })),
            deliverySettings: partnerData.deliverySettings,
            ...(selectedCarrier ? {
                carrierServiceId: selectedCarrier.serviceId,
                carrierServicePrice: selectedCarrier.price,
            } : {}),
        }

        sessionStorage.setItem("checkout_session", JSON.stringify(checkoutData))
        router.push("/checkout")
    }

    // Trigger quote delivery per partner whenever items selection, totals or address change
    useEffect(() => {
        if (!selectedAddress) {
            setServiceTravelQuotes((prev) => (Object.keys(prev).length > 0 ? {} : prev))
            return
        }
        const addressStr = `${selectedAddress.street}, ${selectedAddress.number}${selectedAddress.complement ? `, ${selectedAddress.complement}` : ""} - ${selectedAddress.neighborhood}, ${selectedAddress.city} - ${selectedAddress.state}, ${selectedAddress.zip_code}`

        const timer = setTimeout(() => {
            Object.entries(itemsByPartner).forEach(([storeKey, data]: [string, any]) => {
                const partnerItemsTotal = getPartnerSelectedTotal(data.items, storeKey)
                const isServicesOnly = hasOnlyServices(data.items || [])
                if (isServicesOnly) {
                    // Só serviços: não cota frete próprio nem transportadora.
                    deliveryQuoteSeqRef.current[storeKey] = (deliveryQuoteSeqRef.current[storeKey] || 0) + 1
                    delete carrierFetchedKeysRef.current[storeKey]
                    setDeliveryQuotes(prev => {
                        if (!(storeKey in prev)) return prev
                        const next = { ...prev }
                        delete next[storeKey]
                        return next
                    })
                    setCarrierQuotes(prev => {
                        if (!(storeKey in prev)) return prev
                        const next = { ...prev }
                        delete next[storeKey]
                        return next
                    })

                    const travelItem = partnerItemsTotal > 0 ? getCustomerLocationService(data.items) : null
                    if (!travelItem) {
                        setServiceTravelQuotes(prev => {
                            if (!(storeKey in prev)) return prev
                            const next = { ...prev }
                            delete next[storeKey]
                            return next
                        })
                        return
                    }

                    const targetPartnerId = data.partnerId || data.partner?.id || storeKey
                    const targetStoreId = travelItem.store_id || data.storeId || data.store?.id || null
                    serviceTravelSeqRef.current[storeKey] = (serviceTravelSeqRef.current[storeKey] || 0) + 1
                    const travelSeq = serviceTravelSeqRef.current[storeKey]

                    setServiceTravelQuotes(prev => ({
                        ...prev,
                        [storeKey]: { fee: 0, distanceKm: null, loading: true, error: null, outOfRadius: false },
                    }))

                    const destinationCoords = (selectedAddress?.latitude != null && selectedAddress?.longitude != null)
                        ? { lat: Number(selectedAddress.latitude), lng: Number(selectedAddress.longitude) }
                        : null

                    checkServiceAttendanceAction({
                        partnerId: targetPartnerId,
                        storeId: targetStoreId,
                        serviceId: travelItem.service_id || null,
                        deliveryAddress: addressStr,
                        destinationCoords,
                    }).then(res => {
                        if (serviceTravelSeqRef.current[storeKey] !== travelSeq) return
                        if (res.success) {
                            setServiceTravelQuotes(prev => ({
                                ...prev,
                                [storeKey]: {
                                    fee: res.outOfRadius ? 0 : Number(res.fee || 0),
                                    distanceKm: res.distanceKm,
                                    loading: false,
                                    error: null,
                                    outOfRadius: res.outOfRadius,
                                },
                            }))
                        } else {
                            setServiceTravelQuotes(prev => ({
                                ...prev,
                                [storeKey]: { fee: 0, distanceKm: null, loading: false, error: res.error || "A combinar", outOfRadius: true },
                            }))
                        }
                    }).catch(() => {
                        if (serviceTravelSeqRef.current[storeKey] !== travelSeq) return
                        setServiceTravelQuotes(prev => ({
                            ...prev,
                            [storeKey]: { fee: 0, distanceKm: null, loading: false, error: "A combinar", outOfRadius: true },
                        }))
                    })
                    return
                }

                if (partnerItemsTotal <= 0) {
                    deliveryQuoteSeqRef.current[storeKey] = (deliveryQuoteSeqRef.current[storeKey] || 0) + 1
                    delete carrierFetchedKeysRef.current[storeKey]
                    setDeliveryQuotes(prev => {
                        if (!(storeKey in prev)) return prev
                        const next = { ...prev }
                        delete next[storeKey]
                        return next
                    })
                    setCarrierQuotes(prev => {
                        if (!(storeKey in prev)) return prev
                        const next = { ...prev }
                        delete next[storeKey]
                        return next
                    })
                    setServiceTravelQuotes(prev => {
                        if (!(storeKey in prev)) return prev
                        const next = { ...prev }
                        delete next[storeKey]
                        return next
                    })
                    return
                }

                const targetPartnerId = data.partnerId || data.partner?.id || storeKey
                const targetStoreId = data.storeId || data.store?.id || null

                deliveryQuoteSeqRef.current[storeKey] = (deliveryQuoteSeqRef.current[storeKey] || 0) + 1
                const quoteSeq = deliveryQuoteSeqRef.current[storeKey]

                setDeliveryQuotes(prev => ({
                    ...prev,
                    [storeKey]: { ...(prev[storeKey] || { fee: 0, distanceKm: null, breakdown: null }), loading: true, error: null }
                }))

                const destinationCoords = (selectedAddress?.latitude != null && selectedAddress?.longitude != null)
                    ? { lat: Number(selectedAddress.latitude), lng: Number(selectedAddress.longitude) }
                    : null

                // Transportadora em PARALELO com o frete próprio: o SuperFrete já
                // responde enquanto o geocoding/radi check roda; se o frete próprio
                // cobrir, as opções simplesmente ficam escondidas (gate por "raio").
                const destinationCep = String(selectedAddress?.zip_code || "").replace(/\D/g, "")
                const shippingAvailability = getPartnerShippingAvailability(data)
                if (destinationCep.length === 8 && data.partner?.mp_user_id && data.shippingEnabled && shippingAvailability.allAllowShipping) {
                    const productItems = (data.items || [])
                        .filter((it: any) => (it.item_type || "product") === "product")
                        .map((it: any) => ({
                            productId: it.product_id || it.productId || it.id,
                            quantity: Math.max(1, Number(it.quantity || 1)),
                        }))
                    const itemsDedupe = productItems.map((p: any) => `${p.productId}:${p.quantity}`).sort().join(",")
                    const carrierKey = `${targetPartnerId}:${destinationCep}:${itemsDedupe}`
                    if (carrierFetchedKeysRef.current[storeKey] !== carrierKey) {
                        carrierFetchedKeysRef.current[storeKey] = carrierKey
                        setCarrierQuotes(prev => ({
                            ...prev,
                            [storeKey]: { options: [], loading: true, error: null, selectedServiceId: null, key: carrierKey },
                        }))
                        quoteCarrierFreightAction({
                            partnerId: targetPartnerId,
                            toPostalCode: destinationCep,
                            items: productItems,
                        }).then(res => {
                            if (deliveryQuoteSeqRef.current[storeKey] !== quoteSeq) return
                            setCarrierQuotes(prev => {
                                const cur = prev[storeKey]
                                if (!cur || cur.key !== carrierKey) return prev
                                if (res.success && res.options.length > 0) {
                                    return {
                                        ...prev,
                                        [storeKey]: { options: res.options, loading: false, error: null, selectedServiceId: res.options[0].serviceId, key: carrierKey },
                                    }
                                }
                                return {
                                    ...prev,
                                    [storeKey]: { options: [], loading: false, error: !res.success ? res.error : "Nenhuma transportadora disponível para este endereço.", selectedServiceId: null, key: carrierKey },
                                }
                            })
                        }).catch(() => {
                            if (deliveryQuoteSeqRef.current[storeKey] !== quoteSeq) return
                            setCarrierQuotes(prev => {
                                const cur = prev[storeKey]
                                if (!cur || cur.key !== carrierKey) return prev
                                return { ...prev, [storeKey]: { ...cur, loading: false, options: [], selectedServiceId: null, error: "Não foi possível calcular o frete agora." } }
                            })
                        })
                    }
                }

                const deliveryQuoteCacheKey = `${storeKey}|${destinationCep}|${destinationCoords ? `${destinationCoords.lat},${destinationCoords.lng}` : addressStr}|${Math.round(partnerItemsTotal * 100)}`
                const cachedDeliveryQuote = cartDeliveryQuoteCache.get(deliveryQuoteCacheKey)
                if (cachedDeliveryQuote && Date.now() - cachedDeliveryQuote.at <= CART_DELIVERY_QUOTE_TTL_MS) {
                    setDeliveryQuotes(prev => ({
                        ...prev,
                        [storeKey]: {
                            fee: cachedDeliveryQuote.fee,
                            distanceKm: cachedDeliveryQuote.distanceKm,
                            breakdown: cachedDeliveryQuote.breakdown,
                            loading: false,
                            error: cachedDeliveryQuote.error,
                        }
                    }))
                    return
                }

                quoteDeliveryFeeAction({
                    partnerId: targetPartnerId,
                    storeId: targetStoreId,
                    destinationAddress: addressStr,
                    destinationCoords,
                    orderSubtotal: partnerItemsTotal,
                }).then(quote => {
                    if (deliveryQuoteSeqRef.current[storeKey] !== quoteSeq) return
                    if (quote.success) {
                        const entry = { fee: Number(quote.fee || 0), distanceKm: Number(quote.distanceKm || 0), breakdown: quote.breakdown || null, error: null as string | null, isOutsideRadius: false }
                        rememberCartDeliveryQuote(deliveryQuoteCacheKey, entry)
                        setDeliveryQuotes(prev => ({
                            ...prev,
                            [storeKey]: { ...entry, loading: false }
                        }))
                    } else {
                        const entry = { fee: 0, distanceKm: null as number | null, breakdown: null as any, error: (quote.error || null) as string | null, isOutsideRadius: Boolean((quote as any).isOutsideRadius) }
                        rememberCartDeliveryQuote(deliveryQuoteCacheKey, entry)
                        setDeliveryQuotes(prev => ({
                            ...prev,
                            [storeKey]: { ...entry, loading: false }
                        }))
                    }
                }).catch(() => {
                    if (deliveryQuoteSeqRef.current[storeKey] !== quoteSeq) return
                    setDeliveryQuotes(prev => ({
                        ...prev,
                        [storeKey]: {
                            fee: 0,
                            distanceKm: null,
                            breakdown: null,
                            loading: false,
                            error: "Erro ao calcular entrega.",
                        }
                    }))
                })
            })
        }, 300)

        return () => clearTimeout(timer)
    }, [selectedAddress, optimisticItems, itemsByPartner])

    const handleCarrierQuoteSelect = (storeKey: string, opt: CarrierFreightOption) => {
        setCarrierQuotes(prev => ({
            ...prev,
            [storeKey]: { ...(prev[storeKey] || { loading: false, error: null, key: null }), selectedServiceId: opt.serviceId },
        }))
    }

    // A transportadora só é válida/exibida quando o frete próprio falhou por
    // raio - a cotação SuperFrete é pré-buscada em paralelo e fica oculta
    // enquanto o frete próprio cobre normalmente.
    const isOwnQuoteRaio = (storeKey?: string) => {
        if (!storeKey) return false
        const q = deliveryQuotes[storeKey]
        if (!q || q.loading || !q.error) return false
        // Prefere o sinal estruturado da cotação; o match textual fica só como
        // fallback para entradas vindas do cache.
        return Boolean(q.isOutsideRadius) || q.error.toLowerCase().includes("raio")
    }

    const getCarrierSelectedOption = (storeKey?: string) => {
        if (!storeKey || !isOwnQuoteRaio(storeKey)) return null
        const cq = carrierQuotes[storeKey]
        if (!cq || cq.selectedServiceId == null || cq.options.length === 0) return null
        return cq.options.find(o => o.serviceId === cq.selectedServiceId) || null
    }

    const renderCarrierQuote = (storeKey: string) => {
        if (hasOnlyServices(itemsByPartner[storeKey]?.items || [])) return null
        if (!isOwnQuoteRaio(storeKey)) return null
        const cq = carrierQuotes[storeKey]
        if (!cq || (!cq.loading && cq.options.length === 0 && !cq.error)) return null
        return (
            <div className="space-y-2">
                {cq.options.map(opt => (
                    <button
                        key={opt.serviceId}
                        type="button"
                        onClick={() => handleCarrierQuoteSelect(storeKey, opt)}
                        className={`w-full flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer ${cq.selectedServiceId === opt.serviceId
                            ? "border-brand-green bg-green-50/30 dark:bg-green-900/10"
                            : "border border-brand-border dark:border-dark-border hover:border-brand-dark dark:hover:border-dark-heading bg-transparent hover:bg-brand-slate/50 dark:hover:bg-dark-border/10"
                            }`}
                    >
                        <span className="flex flex-col">
                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                {opt.companyName ? `${opt.companyName} - ${opt.serviceName}` : opt.serviceName}
                            </span>
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                {formatDeliveryDaysRange(opt.deliveryMinDays, opt.deliveryMaxDays)}
                            </span>
                        </span>
                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(Number(opt.price))}
                        </span>
                    </button>
                ))}
                {cq.loading && (
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">Calculando opções de entrega...</p>
                )}
                {cq.error && !cq.loading && (
                    <p className="text-xs text-brand-red">{cq.error}</p>
                )}
            </div>
        )
    }

    // Aviso quando a loja tem produtos com e sem envio nacional ao mesmo tempo:
    // a transportadora fica indisponível para todo o pedido.
    const renderShippingWarning = (storeKey: string) => {
        const partnerData = itemsByPartner[storeKey]
        const info = getPartnerShippingAvailability(partnerData)
        if (!info.hasMixedShipping) return null
        const blockedItems = (partnerData?.products || []).filter((item: any) => {
            if (!getItemSelected(item)) return false
            const modes = normalizeFulfillmentModes(item.products?.fulfillment_modes, ["delivery", "pickup"])
            return !modes.includes("shipping")
        })
        return (
            <InfoCard
                title="Envio nacional indisponível para este pedido."
                message={
                    <div className="space-y-1">
                        <p>
                            {info.blockedCount === 1
                                ? "1 item desta loja não aceita envio por transportadora. Remova esse item para usar o envio nacional, ou escolha entrega local/retirada."
                                : `${info.blockedCount} itens desta loja não aceitam envio por transportadora. Remova esses itens para usar o envio nacional, ou escolha entrega local/retirada.`}
                        </p>
                        {blockedItems.length > 0 && (
                            <ul className="list-disc list-inside">
                                {blockedItems.map((item: any) => (
                                    <li key={item.id}>
                                        <span>{getItemName(item)}</span>
                                        <button
                                            type="button"
                                            onClick={() => scrollToCartItem(item.id)}
                                            className="ml-1 underline font-medium hover:text-brand-orange"
                                        >
                                            Ir para o item
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                }
                color="orange"
            />
        )
    }

    const getPartnerDeliveryFee = (partnerData: any, selectedItemsTotal: number = 0, storeKey?: string) => {
        if (hasOnlyServices(partnerData?.items || [])) {
            return getCustomerLocationService(partnerData?.items || []) ? getServiceTravelFee(storeKey) : 0
        }
        const settings = partnerData?.deliverySettings
        // Frete grátis por valor mínimo vale para a entrega própria E para a
        // transportadora: o vendedor absorve o custo no mesmo limite.
        const isFreeThreshold = settings?.free_delivery_threshold != null
            && Number(settings.free_delivery_threshold) > 0
            && selectedItemsTotal >= Number(settings.free_delivery_threshold)
        const carrierOption = getCarrierSelectedOption(storeKey)
        if (carrierOption) return isFreeThreshold ? 0 : Number(carrierOption.price)
        const quoteState = storeKey ? deliveryQuotes[storeKey] : null
        if (quoteState && !quoteState.loading && !quoteState.error) {
            return Number(quoteState.fee || 0)
        }
        // Frete próprio falhou (ex.: endereço fora do raio) e não há transportadora
        // selecionada: não existe frete a cobrar, então não cai na taxa base.
        if (quoteState && !quoteState.loading && quoteState.error) {
            return 0
        }
        if (!settings || settings.is_delivery_enabled === false || settings.delivery_payer === "seller") return 0
        if (isFreeThreshold) {
            return 0
        }
        return Number(settings.base_fee || 0)
    }

    // Total only counts selected items (with optimistic overrides)
    const globalTotal = Object.entries(itemsByPartner).reduce((acc: number, [storeKey, partner]: [string, any]) => {
        const items = partner.items.filter((item: any) => getItemSelected(item))
        if (items.length === 0) return acc
        const itemsTotal = getPartnerDisplayTotal(storeKey, items)
        return acc + itemsTotal + getPartnerDeliveryFee(partner, itemsTotal, storeKey)
    }, 0)

    const getPartnerSelectedTotal = (items: any[], storeKey?: string) =>
        items
            .filter((item: any) => getItemSelected(item))
            .reduce((sum: number, item: any) => {
                const price = storeKey ? getItemBestPrice(item, itemsByPartner[storeKey]?.promotions || []) : (item.products?.price || 0)
                return sum + price * getItemQuantity(item)
            }, 0)

    const getPartnerCheckoutProducts = (storeKey: string) =>
        itemsByPartner[storeKey].items
            .filter((item: any) => getItemSelected(item))
            .map((item: any) => ({
                id: item.variant_id || item.product_id || item.service_id || item.recurring_plan_id,
                name: getItemName(item),
                variant: item.variant_id && item.product_variants ? `${item.product_variants.variant_type}: ${item.product_variants.variant_name}` : undefined,
                price: getItemBestPrice(item, storeKey ? itemsByPartner[storeKey]?.promotions || [] : []),
                quantity: getItemQuantity(item),
                image: getItemImage(item),
                availabilityValue: Number(item.products?.availability_value || 0),
                availabilityUnit: item.products?.availability_unit || "Minutos",
                unit: item.products?.unit || item.unit || null,
                selectedAddons: item.booking_metadata?.selectedAddons || undefined,
            }))

    const getDeliveryLabel = (partnerData: any, selectedItemsTotal: number = 0, storeKey?: string) => {
        if (hasOnlyServices(partnerData?.items || [])) {
            if (!storeKey || !getCustomerLocationService(partnerData?.items || [])) return null
            return getServiceTravelLabel(storeKey)
        }
        const quote = storeKey ? deliveryQuotes[storeKey] : null
        if (quote?.loading) {
            return <span className="text-xs text-brand-inactive-text dark:text-dark-body animate-pulse">Calculando...</span>
        }
        const settings = partnerData?.deliverySettings
        const isFreeThreshold = (settings?.free_delivery_threshold != null
            && Number(settings.free_delivery_threshold) > 0
            && selectedItemsTotal >= Number(settings.free_delivery_threshold))
            || Boolean(quote?.breakdown?.isFreeByThreshold)
        const carrierOption = getCarrierSelectedOption(storeKey)
        if (carrierOption) {
            const carrierPrice = Number(carrierOption.price)
            if (isFreeThreshold) {
                return (
                    <span className="flex items-center gap-1.5 justify-end">
                        {carrierPrice > 0 && <span className="line-through text-brand-inactive-text dark:text-dark-body font-normal">{formatCurrency(carrierPrice)} | </span>}
                        <span className="text-brand-green font-semibold">Grátis</span>
                    </span>
                )
            }
            return formatCurrency(carrierPrice)
        }
        const carrierQuoteState = storeKey && isOwnQuoteRaio(storeKey) ? carrierQuotes[storeKey] : null
        if (carrierQuoteState?.loading) {
            return <span className="text-xs text-brand-inactive-text dark:text-dark-body animate-pulse">Calculando frete nacional...</span>
        }
        if (quote?.error && quote.error !== "Entrega não disponível no plano atual.") {
            const isTechnical = quote.error.includes("incompleto") || quote.error.includes("coordenadas") || quote.error.includes("plano")
            if (!isTechnical) {
                return <span className="text-xs text-red-500 font-normal">{quote.error}</span>
            }
        }
        if (quote?.breakdown?.deliveryPayer === "seller" || settings?.delivery_payer === "seller") {
            const fee = Number(quote?.breakdown?.originalFee || settings?.base_fee || 0)
            return (
                <span className="flex items-center gap-1.5 justify-end">
                    {fee > 0 && <span className="line-through text-brand-inactive-text dark:text-dark-body font-normal">{formatCurrency(fee)} | </span>}
                    <span className="text-brand-green font-semibold">Grátis</span>
                </span>
            )
        }
        if (settings?.is_delivery_enabled === false) {
            return settings.is_pickup_enabled !== false ? "Apenas retirada (Grátis)" : "Indisponível"
        }
        if (isFreeThreshold) {
            const originalFee = Number(quote?.breakdown?.originalFee || 0)
            return (
                <span className="flex items-center gap-1.5 justify-end">
                    {originalFee > 0 && <span className="line-through text-brand-inactive-text dark:text-dark-body font-normal">{formatCurrency(originalFee)} | </span>}
                    <span className="text-brand-green font-semibold">Grátis</span>
                </span>
            )
        }
        if (quote?.fee != null) {
            if (quote.fee === 0 && quote.breakdown?.hasRatesConfigured && !quote.breakdown?.isEstimate) {
                return <span className="text-brand-green font-semibold">Grátis</span>
            }
            if (quote.fee > 0) {
                return quote.breakdown?.isEstimate ? `${formatCurrency(quote.fee)} (A partir de)` : formatCurrency(quote.fee)
            }
            if (quote.fee === 0) {
                return "A combinar"
            }
        }
        const fee = Number(settings?.base_fee || 0)
        if (fee > 0) {
            return hasDeliveryRatesConfigured(settings, []) ? `${formatCurrency(fee)} (A partir de)` : formatCurrency(fee)
        }
        return "A combinar"
    }

    const multiplePartners = Object.keys(itemsByPartner).length > 1

    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
            <MarketplaceHeader
                simpleTitle="Minha sacola"
                userProfile={initialUserProfile}
                cartCount={cartCount}
            />

            <div className="flex-1 flex flex-col container mx-auto px-4 max-w-[1400px] w-full pt-6 md:pt-10 pb-20 mt-[78px] lg:mt-[108px] relative overflow-hidden">
                <div className="hidden lg:block items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Minha sacola</h1>
                        <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">Veja os itens da sua sacola</p>
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
                            {Object.entries(itemsByPartner).map(([storeKey, data]: [string, any], index: number, array: any[]) => {
                                const partnerId = data.partnerId || storeKey
                                const partnerPromos = data.promotions || []
                                const partnerItemsTotal = getPartnerSelectedTotal(data.items, storeKey)
                                const partnerDeliveryFee = getPartnerDeliveryFee(data, partnerItemsTotal, storeKey)
                                const partnerTotalWithDelivery = partnerItemsTotal > 0 ? partnerItemsTotal + partnerDeliveryFee : 0
                                const expanded = isExpanded(storeKey)
                                const inStockItems = data.items.filter((item: any) => !isItemOutOfStock(item))
                                const allSelected = inStockItems.length > 0 && inStockItems.every((item: any) => getItemSelected(item))
                                const sellerName = data.store?.name || data.partner?.name || "Loja"
                                const sellerImage = data.store?.logo_url || data.partner?.logo_url || data.partner?.store_image_url
                                const storeObj = data.store
                                    ? { ...data.store, id: data.store.id, short_id: data.store.short_id, slug: data.store.slug, name: data.store.name }
                                    : { ...data.partner, id: data.partner?.store_id || data.partner?.id, short_id: data.partner?.short_id, slug: data.partner?.slug, name: data.partner?.name || sellerName }
                                const partnerIssues = checkoutIssues.filter(issue => issue.storeKey === storeKey)

                                return (
                                    <Fragment key={storeKey}>
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-8 lg:gap-y-0 relative items-start">
                                            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 bg-transparent overflow-hidden">
                                                {/* Header do vendedor - estilo Accordion / FormSection */}
                                                <div
                                                    className="flex items-center justify-between pb-4 mb-4 border-b border-brand-border dark:border-dark-border cursor-pointer select-none"
                                                    onClick={() => toggleVendor(storeKey)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div onClick={e => e.stopPropagation()} className="flex items-center">
                                                            <Checkbox
                                                                id={`select-partner-${storeKey}`}
                                                                checked={allSelected}
                                                                onChange={() => togglePartnerSelection(partnerId, data.items, allSelected)}
                                                                disabled={loading === storeKey}
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <img
                                                                src={getImageUrl(sellerImage) || "https://img.dudit.com.br/static/Placeholder.png"}
                                                                alt={sellerName}
                                                                className="bg-white border border-brand-border dark:border-dark-border w-6 h-6 rounded-full object-cover"
                                                                onClick={e => { e.stopPropagation(); router.push(getStoreUrl(storeObj)) }}
                                                            />
                                                            <h3
                                                                className="text-lg font-semibold text-brand-dark dark:text-dark-heading hover:text-brand-green transition-colors"
                                                                onClick={e => { e.stopPropagation(); router.push(getStoreUrl(storeObj)) }}
                                                            >
                                                                {sellerName}
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
                                                                {data.isShowcaseActive === false ? (
                                                                    <InfoCard
                                                                        title="Vitrine Inativa"
                                                                        message="Esta vitrine está temporariamente inativa e não está aceitando novos pedidos."
                                                                        color="orange"
                                                                        className="mb-4"
                                                                    />
                                                                ) : data.isAcceptingOrders === false ? (
                                                                    <InfoCard
                                                                        title="Loja Fechada"
                                                                        message="Esta loja está fechada no momento e não está aceitando novos pedidos fora do horário de funcionamento."
                                                                        color="orange"
                                                                        className="mb-4"
                                                                    />
                                                                ) : null}
                                                                {partnerIssues.length > 0 && (
                                                                    <InfoCard
                                                                        title="Revise os itens para finalizar o pedido"
                                                                        message={
                                                                            <ul className="list-disc list-inside space-y-1">
                                                                                {partnerIssues.map(issue => (
                                                                                    <li key={issue.cartItemId}>
                                                                                        <span>{issue.message}</span>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => scrollToCartItem(issue.cartItemId)}
                                                                                            className="ml-1 underline font-medium hover:text-brand-orange"
                                                                                        >
                                                                                            Ir para o item
                                                                                        </button>
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        }
                                                                        color="red"
                                                                        className="mb-4"
                                                                    />
                                                                )}
                                                                {[
                                                                    { title: "Produtos", items: data.products?.length ? data.products : data.items.filter((i: any) => (i.item_type || "product") === "product") },
                                                                    { title: "Serviços", items: data.services || [] },
                                                                    { title: "Assinaturas", items: data.subscriptions || [] },
                                                                ].flatMap((section) =>
                                                                    section.items.length === 0
                                                                        ? []
                                                                        : [
                                                                            <div key={`${storeKey}-${section.title}-hdr`} className="flex items-center justify-between mb-3 mt-2 first:mt-0">
                                                                                <h4 className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{section.title}</h4>
                                                                            </div>,
                                                                            ...section.items,
                                                                        ],
                                                                ).map((entry: any, index: number) => {
                                                                    if (!entry?.id) return entry
                                                                    const item = entry
                                                                    const itemSelected = getItemSelected(item)
                                                                    const itemQty = getItemQuantity(item)

                                                                    return (
                                                                        <div
                                                                            key={item.id}
                                                                            data-cart-item-id={item.id}
                                                                            className={`lg:pb-6 ${index !== data.items.length - 1 ? "border-b border-brand-border dark:border-dark-border mb-6" : "mb-2"} ${highlightedItemId === item.id ? "rounded-xl border-brand-orange" : "border-brand-border dark:border-dark-border"}`}
                                                                        >

                                                                            {/* Mobile/Tablet Layout (< md) */}
                                                                            {(() => {
                                                                                const isOutOfStock = isItemOutOfStock(item);
                                                                                const maxStock = getItemMaxStock(item);
                                                                                const exceedsStock = !isOutOfStock && isQuantityExceedingStock(item);
                                                                                const isSellWithoutStock = Boolean(item.products?.allow_sell_without_stock);
                                                                                const isVariantSoldOut = isOutOfStock && Boolean(item.variant_id && item.product_variants);
                                                                                const isServiceUnavailable = item.item_type === "service_booking" && Boolean(serviceAvailability[item.id]?.checked && !serviceAvailability[item.id]?.available);
                                                                                const showLowStock = !isOutOfStock && !exceedsStock && !isSellWithoutStock && maxStock <= 5 && maxStock > 0;
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

                                                                                            <div className="flex flex-col shrink-0 self-start">
                                                                                                <Link
                                                                                                    href={getItemUrl(item, data.partner)}
                                                                                                    prefetch={false}
                                                                                                    className={`w-[68px] h-[68px] overflow-hidden border border-brand-border dark:border-dark-border block cursor-pointer ${(isVariantSoldOut || isServiceUnavailable || showLowStock) ? "rounded-t-[8px] border-b-0" : "rounded-[8px]"}`}
                                                                                                >
                                                                                                    <img src={getItemImage(item)} alt={getItemName(item)} className="w-full h-full object-cover" />
                                                                                                </Link>
                                                                                                {isVariantSoldOut || isServiceUnavailable ? (
                                                                                                    <div className="w-[68px] bg-gray-500 text-white text-[9px] font-bold uppercase text-center py-1 px-0.5 leading-tight rounded-b-[8px]">
                                                                                                        {isServiceUnavailable ? "Indisponível" : "Esgotado"}
                                                                                                    </div>
                                                                                                ) : showLowStock ? (
                                                                                                    <div className="w-[68px] bg-brand-orange text-white text-[9px] font-bold uppercase flex items-center justify-center gap-0.5 py-1 px-0.5 leading-tight rounded-b-[8px]">
                                                                                                        <FireIcon size={10} className="shrink-0" />
                                                                                                        <span>Últimos {maxStock}</span>
                                                                                                    </div>
                                                                                                ) : null}
                                                                                            </div>

                                                                                            <div className="flex-1 min-w-0">
                                                                                                <div className="flex items-start justify-between gap-2">
                                                                                                    <Link
                                                                                                        href={getItemUrl(item, data.partner)}
                                                                                                        prefetch={false}
                                                                                                        className="text-[14px] font-medium text-brand-dark dark:text-dark-heading line-clamp-2 cursor-pointer hover:text-brand-green leading-snug"
                                                                                                    >
                                                                                                        {getItemName(item)}
                                                                                                    </Link>
                                                                                                    <Button
                                                                                                        variant="ghostred"
                                                                                                        onClick={() => setDeleteModal({ open: true, cartItemId: item.id })}
                                                                                                        className="p-1 shrink-0"
                                                                                                        disabled={loading === item.id}
                                                                                                    >
                                                                                                        <TrashIcon size={16} />
                                                                                                    </Button>
                                                                                                </div>

                                                                                                {isVariantSoldOut && item.available_alternatives && item.available_alternatives.length > 0 && (
                                                                                                    <div className="mt-1.5">
                                                                                                        <p className="text-[12px] font-semibold text-brand-dark dark:text-dark-heading mb-1.5">Disponível em outra(s) variante(s):</p>
                                                                                                        <div className="flex flex-wrap gap-1.5">
                                                                                                            {item.available_alternatives.map((alt: any) => (
                                                                                                                <button
                                                                                                                    key={alt.id}
                                                                                                                    onClick={() => switchVariant(item.id, alt.id)}
                                                                                                                    disabled={loading === item.id}
                                                                                                                    className="inline-flex items-center gap-2 pr-2 py-1 pl-1 rounded-lg bg-white hover:bg-brand-gray dark:bg-dark-surface dark:hover:bg-zinc-800 border border-brand-border dark:border-dark-border hover:border-brand-green dark:hover:border-brand-green transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                                                                                                >
                                                                                                                    <span className="w-8 h-8 rounded-md overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                                                                                                                        <img src={getAlternativeImage(alt, item)} alt={alt.variant_name} className="w-full h-full object-cover" />
                                                                                                                    </span>
                                                                                                                    <span className="flex flex-col items-start leading-tight">
                                                                                                                        <span className="text-[12px] font-medium text-brand-dark dark:text-dark-heading">{alt.variant_name}</span>
                                                                                                                        <span className="text-[12px] font-semibold text-brand-green">{formatCurrency(getAlternativePrice(alt, item.products))}</span>
                                                                                                                    </span>
                                                                                                                </button>
                                                                                                            ))}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}

                                                                                                {item.variant_id && item.product_variants && !isVariantSoldOut && (
                                                                                                    <p className="text-[12px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                                                        {item.product_variants.variant_type}: <span className="font-medium text-brand-dark dark:text-dark-heading">{item.product_variants.variant_name}</span>
                                                                                                    </p>
                                                                                                )}

                                                                                                {!isVariantSoldOut && !isServiceUnavailable && Array.isArray(item.booking_metadata?.selectedAddons) && item.booking_metadata.selectedAddons.length > 0 && (
                                                                                                    <div className="text-[12px] text-brand-inactive-text dark:text-dark-body mt-0.5 space-y-0.5">
                                                                                                        {(() => {
                                                                                                            const addons = item.booking_metadata.selectedAddons
                                                                                                            const groupsMap: Record<string, any[]> = {}
                                                                                                            addons.forEach((a: any) => {
                                                                                                                const gTitle = a.groupTitle || (addons.length === 1 ? "Complemento" : "Complementos")
                                                                                                                if (!groupsMap[gTitle]) groupsMap[gTitle] = []
                                                                                                                groupsMap[gTitle].push(a)
                                                                                                            })
                                                                                                            return Object.entries(groupsMap).map(([title, groupList], gIdx) => (
                                                                                                                <p key={gIdx}>
                                                                                                                    {title}: <span className="font-medium text-brand-dark dark:text-dark-heading">{groupList.map((a: any) => `${a.optionName || a.name || a.title || "Adicional"}${(Number(a.price) || 0) > 0 ? ` (+${formatCurrency(Number(a.price))})` : ""}`).join(", ")}</span>
                                                                                                                </p>
                                                                                                            ))
                                                                                                        })()}
                                                                                                    </div>
                                                                                                )}

                                                                                                {item.item_type === "service_booking" && !isServiceUnavailable && getItemBooking(item) && (
                                                                                                    <p className="text-[12px] text-brand-inactive-text dark:text-dark-body mt-0.5">{getItemBooking(item)}</p>
                                                                                                )}

                                                                                                {exceedsStock && (
                                                                                                    <p className="text-[12px] text-brand-red font-medium mt-0.5">
                                                                                                        Apenas {maxStock} unidade(s) disponível(is) no estoque
                                                                                                    </p>
                                                                                                )}
                                                                                                {renderItemShippingNote(item, data)}

                                                                                                <div className="flex flex-col items-start gap-2 md:hidden mt-2">
                                                                                                    {isOutOfStock ? (
                                                                                                        isVariantSoldOut ? null : (
                                                                                                            <Badge variant="red" className="whitespace-nowrap scale-90 shrink-0">
                                                                                                                Esgotado
                                                                                                            </Badge>
                                                                                                        )
                                                                                                    ) : item.item_type !== "service_booking" ? (
                                                                                                        <QuantitySelector
                                                                                                            value={itemQty}
                                                                                                            onChange={(val) => updateQty(item.id, val, itemQty, isSellWithoutStock ? undefined : maxStock)}
                                                                                                            disabled={loading === item.id}
                                                                                                            max={isSellWithoutStock ? undefined : maxStock}
                                                                                                            size="sm"
                                                                                                        />
                                                                                                    ) : null}
                                                                                                    {!isVariantSoldOut && !isServiceUnavailable && (() => {
                                                                                                        const ctx = getItemPricingContext(item, partnerPromos)
                                                                                                        const total = isOutOfStock ? ctx.bestPrice : ctx.bestPrice * itemQty
                                                                                                        return (
                                                                                                            <div className="flex flex-col items-end">
                                                                                                                <div className="flex items-center gap-1">
                                                                                                                    {ctx.discountSource === "campaign" && (
                                                                                                                        <p className="text-xs text-brand-blue">
                                                                                                                            -{ctx.discountPercent}%
                                                                                                                        </p>
                                                                                                                    )}
                                                                                                                    {ctx.discountSource === "manual" && (
                                                                                                                        <p className="text-xs text-brand-orange">
                                                                                                                            -{ctx.discountPercent}%
                                                                                                                        </p>
                                                                                                                    )}
                                                                                                                    {ctx.referencePrice && (
                                                                                                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body line-through">{formatCurrency(isOutOfStock ? ctx.referencePrice : ctx.referencePrice * itemQty)}</span>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                                <span className="text-[15px] font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</span>
                                                                                                            </div>
                                                                                                        )
                                                                                                    })()}

                                                                                                    {serviceAvailability[item.id]?.checked && !serviceAvailability[item.id]?.available && (
                                                                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-brand-orange dark:text-orange-400 font-medium">
                                                                                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
                                                                                                            <span>Este horário não está mais disponível</span>
                                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                                            <Link
                                                                                                                href={getServiceUrl({ id: item.service_id, short_id: item.services?.short_id, name: item.services?.name || item.booking_metadata?.serviceName }, data.partner)}

                                                                                                                className="font-semibold text-brand-green hover:underline"
                                                                                                            >
                                                                                                                Remarcar
                                                                                                            </Link>
                                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                                            <button
                                                                                                                onClick={() => setDeleteModal({ open: true, cartItemId: item.id })}
                                                                                                                className="font-semibold text-brand-red hover:underline"
                                                                                                            >
                                                                                                                Remover
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    )}

                                                                                                    {item.item_type === "service_booking" && cartConflicts[item.id] && !(serviceAvailability[item.id]?.checked && !serviceAvailability[item.id]?.available) && (
                                                                                                        <div className="mt-1 flex items-start gap-2 text-xs text-brand-orange font-medium">
                                                                                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
                                                                                                            <span>Conflito de horário com outro serviço na sacola</span>
                                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                                            <Link
                                                                                                                href={getServiceUrl({ id: item.service_id, short_id: item.services?.short_id, name: item.services?.name || item.booking_metadata?.serviceName }, data.partner)}
                                                                                                                className="font-semibold text-brand-green hover:underline"
                                                                                                            >
                                                                                                                Remarcar
                                                                                                            </Link>
                                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                                            <button
                                                                                                                onClick={() => setDeleteModal({ open: true, cartItemId: item.id })}
                                                                                                                className="font-semibold text-brand-red hover:underline"
                                                                                                            >
                                                                                                                Remover
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                    </div>
                                                                                );
                                                                            })()}

                                                                            {/* Desktop Layout (>= md) */}
                                                                            {(() => {
                                                                                const isOutOfStock = isItemOutOfStock(item);
                                                                                const maxStock = getItemMaxStock(item);
                                                                                const exceedsStock = !isOutOfStock && isQuantityExceedingStock(item);
                                                                                const isSellWithoutStock = Boolean(item.products?.allow_sell_without_stock);
                                                                                const isVariantSoldOut = isOutOfStock && Boolean(item.variant_id && item.product_variants);
                                                                                const isServiceUnavailable = item.item_type === "service_booking" && Boolean(serviceAvailability[item.id]?.checked && !serviceAvailability[item.id]?.available);
                                                                                const showLowStock = !isOutOfStock && !exceedsStock && !isSellWithoutStock && maxStock <= 5 && maxStock > 0;
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
                                                                                                <div className="flex flex-col shrink-0 self-start">
                                                                                                    <Link
                                                                                                        href={getItemUrl(item, data.partner)}
                                                                                                        prefetch={false}
                                                                                                        className={`w-[68px] h-[68px] overflow-hidden border border-brand-border dark:border-dark-border block cursor-pointer ${(isVariantSoldOut || isServiceUnavailable || showLowStock) ? "rounded-t-[8px] border-b-0" : "rounded-[8px]"}`}
                                                                                                    >
                                                                                                        <img src={getItemImage(item)} alt={getItemName(item)} className="w-full h-full object-cover" />
                                                                                                    </Link>
                                                                                                    {isVariantSoldOut || isServiceUnavailable ? (
                                                                                                        <div className="w-[68px] bg-gray-500 text-white text-[9px] font-bold uppercase text-center py-1 px-0.5 leading-tight rounded-b-[8px]">
                                                                                                            {isServiceUnavailable ? "Indisponível" : "Esgotado"}
                                                                                                        </div>
                                                                                                    ) : showLowStock ? (
                                                                                                        <div className="w-[68px] bg-brand-orange text-white text-[9px] font-bold uppercase flex items-center justify-center gap-0.5 py-1 px-0.5 leading-tight rounded-b-[8px]">
                                                                                                            <FireIcon size={10} className="shrink-0" />
                                                                                                            <span>Últimos {maxStock}</span>
                                                                                                        </div>
                                                                                                    ) : null}
                                                                                                </div>

                                                                                                <div className="flex-1">
                                                                                                    <Link
                                                                                                        href={getItemUrl(item, data.partner)}
                                                                                                        prefetch={false}
                                                                                                        className="text-[16px] font-medium text-brand-dark dark:text-dark-heading mb-1 line-clamp-2 cursor-pointer hover:text-brand-green block"
                                                                                                    >
                                                                                                        {getItemName(item)}
                                                                                                    </Link>

                                                                                                    {isVariantSoldOut && item.available_alternatives && item.available_alternatives.length > 0 && (
                                                                                                        <div className="mt-1.5 mb-2">
                                                                                                            <p className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading mb-1.5">Disponível em outra(s) variante(s):</p>
                                                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                                                {item.available_alternatives.map((alt: any) => (
                                                                                                                    <button
                                                                                                                        key={alt.id}
                                                                                                                        onClick={() => switchVariant(item.id, alt.id)}
                                                                                                                        disabled={loading === item.id}
                                                                                                                        className="inline-flex items-center gap-2 pr-2 py-1 pl-1 rounded-lg bg-white hover:bg-brand-gray dark:bg-dark-surface dark:hover:bg-zinc-800 border border-brand-border dark:border-dark-border hover:border-brand-green dark:hover:border-brand-green transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                                                                                                    >
                                                                                                                        <span className="w-8 h-8 rounded-md overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                                                                                                                            <img src={getAlternativeImage(alt, item)} alt={alt.variant_name} className="w-full h-full object-cover" />
                                                                                                                        </span>
                                                                                                                        <span className="flex flex-col items-start leading-tight">
                                                                                                                            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{alt.variant_name}</span>
                                                                                                                            <span className="text-[13px] font-semibold text-brand-green">{formatCurrency(getAlternativePrice(alt, item.products))}</span>
                                                                                                                        </span>
                                                                                                                    </button>
                                                                                                                ))}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    )}

                                                                                                    {item.variant_id && item.product_variants && !isVariantSoldOut && (
                                                                                                        <p className="text-[13px] text-brand-inactive-text dark:text-dark-body mb-1">
                                                                                                            {item.product_variants.variant_type}: <span className="font-medium text-brand-dark dark:text-dark-heading">{item.product_variants.variant_name}</span>
                                                                                                        </p>
                                                                                                    )}

                                                                                                    {!isVariantSoldOut && !isServiceUnavailable && Array.isArray(item.booking_metadata?.selectedAddons) && item.booking_metadata.selectedAddons.length > 0 && (
                                                                                                        <div className="text-[13px] text-brand-inactive-text dark:text-dark-body mb-1 space-y-0.5">
                                                                                                            {(() => {
                                                                                                                const addons = item.booking_metadata.selectedAddons
                                                                                                                const groupsMap: Record<string, any[]> = {}
                                                                                                                addons.forEach((a: any) => {
                                                                                                                    const gTitle = a.groupTitle || (addons.length === 1 ? "Complemento" : "Complementos")
                                                                                                                    if (!groupsMap[gTitle]) groupsMap[gTitle] = []
                                                                                                                    groupsMap[gTitle].push(a)
                                                                                                                })
                                                                                                                return Object.entries(groupsMap).map(([title, groupList], gIdx) => (
                                                                                                                    <p key={gIdx}>
                                                                                                                        {title}: <span className="font-medium text-brand-dark dark:text-dark-heading">{groupList.map((a: any) => `${a.optionName || a.name || a.title || "Adicional"}${(Number(a.price) || 0) > 0 ? ` (+${formatCurrency(Number(a.price))})` : ""}`).join(", ")}</span>
                                                                                                                    </p>
                                                                                                                ))
                                                                                                            })()}
                                                                                                        </div>
                                                                                                    )}

                                                                                                    {item.item_type === "service_booking" && !isServiceUnavailable && getItemBooking(item) && (
                                                                                                        <p className="text-[13px] text-brand-inactive-text dark:text-dark-body mb-1">{getItemBooking(item)}</p>
                                                                                                    )}

                                                                                                    {exceedsStock && (
                                                                                                        <p className="text-[12px] text-brand-red font-medium mb-1">
                                                                                                            Apenas {maxStock} unidade(s) disponível(is) no estoque
                                                                                                        </p>
                                                                                                    )}
                                                                                                    {renderItemShippingNote(item, data)}
                                                                                                    {!isVariantSoldOut && !isServiceUnavailable && (() => {
                                                                                                        const ctx = getItemPricingContext(item, partnerPromos)
                                                                                                        return (
                                                                                                            <div className="flex items-center gap-2">
                                                                                                                <p className="text-[15px] font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(ctx.bestPrice)}</p>
                                                                                                            </div>
                                                                                                        )
                                                                                                    })()}

                                                                                                    {serviceAvailability[item.id]?.checked && !serviceAvailability[item.id]?.available && (
                                                                                                        <div className="mt-1 mb-1 flex flex-wrap items-center gap-1.5 text-xs text-brand-orange dark:text-orange-400 font-medium">
                                                                                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
                                                                                                            <span>Este horário não está mais disponível</span>
                                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                                            <Link
                                                                                                                href={getServiceUrl({ id: item.service_id, short_id: item.services?.short_id, name: item.services?.name || item.booking_metadata?.serviceName }, data.partner)}

                                                                                                                className="font-semibold text-brand-green hover:underline"
                                                                                                            >
                                                                                                                Remarcar
                                                                                                            </Link>
                                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                                            <button
                                                                                                                onClick={() => setDeleteModal({ open: true, cartItemId: item.id })}
                                                                                                                className="font-semibold text-brand-red hover:underline"
                                                                                                            >
                                                                                                                Remover
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    )}

                                                                                                    {item.item_type === "service_booking" && cartConflicts[item.id] && !(serviceAvailability[item.id]?.checked && !serviceAvailability[item.id]?.available) && (
                                                                                                        <div className="mt-1 mb-1 flex flex-col items-start gap-2 text-xs text-brand-orange dark:text-orange-400 font-medium">
                                                                                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
                                                                                                            <span>Conflito de horário com outro serviço na sacola</span>
                                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                                            <Link
                                                                                                                href={getServiceUrl({ id: item.service_id, short_id: item.services?.short_id, name: item.services?.name || item.booking_metadata?.serviceName }, data.partner)}
                                                                                                                className="font-semibold text-brand-green hover:underline"
                                                                                                            >
                                                                                                                Remarcar
                                                                                                            </Link>
                                                                                                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                                                                            <button
                                                                                                                onClick={() => setDeleteModal({ open: true, cartItemId: item.id })}
                                                                                                                className="font-semibold text-brand-red hover:underline"
                                                                                                            >
                                                                                                                Remover
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>

                                                                                                <div className="flex items-center justify-end gap-4">
                                                                                                    {isOutOfStock ? (
                                                                                                        isVariantSoldOut ? null : (
                                                                                                            <Badge variant="red" className="whitespace-nowrap scale-90 shrink-0">
                                                                                                                Esgotado
                                                                                                            </Badge>
                                                                                                        )
                                                                                                    ) : item.item_type !== "service_booking" ? (
                                                                                                        <QuantitySelector
                                                                                                            value={itemQty}
                                                                                                            onChange={(val) => updateQty(item.id, val, itemQty, isSellWithoutStock ? undefined : maxStock)}
                                                                                                            disabled={loading === item.id}
                                                                                                            max={isSellWithoutStock ? undefined : maxStock}
                                                                                                        />
                                                                                                    ) : null}
                                                                                                    {!isVariantSoldOut && !isServiceUnavailable && (() => {
                                                                                                        const ctx = getItemPricingContext(item, partnerPromos)
                                                                                                        const total = isOutOfStock ? ctx.bestPrice : ctx.bestPrice * itemQty
                                                                                                        return (
                                                                                                            <div className="text-right min-w-[80px]">
                                                                                                                <div className="flex items-center justify-end gap-1 flex-wrap">
                                                                                                                    {ctx.discountSource === "campaign" && (
                                                                                                                        <p className="text-xs text-brand-blue">
                                                                                                                            -{ctx.discountPercent}%
                                                                                                                        </p>
                                                                                                                    )}
                                                                                                                    {ctx.discountSource === "manual" && (
                                                                                                                        <p className="text-xs text-brand-orange">
                                                                                                                            -{ctx.discountPercent}%
                                                                                                                        </p>
                                                                                                                    )}
                                                                                                                    {ctx.referencePrice && <p className="text-xs text-brand-inactive-text dark:text-dark-body line-through">{formatCurrency(isOutOfStock ? ctx.referencePrice : ctx.referencePrice * itemQty)}</p>}
                                                                                                                </div>
                                                                                                                <p className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</p>
                                                                                                            </div>
                                                                                                        )
                                                                                                    })()}
                                                                                                    <Button variant="ghostred" onClick={() => setDeleteModal({ open: true, cartItemId: item.id })} className="p-2" disabled={loading === item.id}><TrashIcon size={18} /></Button>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                    </div>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                    )
                                                                })}

                                                                {/* Mobile/Tablet: resumo inline + botão */}
                                                                <div className="mt-4 pt-4 border-t border-brand-border dark:border-dark-border md:hidden space-y-3">
                                                                    {renderPromoBanners(storeKey, partnerItemsTotal)}
                                                                    <div className="flex justify-between items-center text-sm">
                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Total dos itens</span>
                                                                        <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(partnerItemsTotal)}</span>
                                                                    </div>
                                                                    {getDeliveryLabel(data, partnerItemsTotal, storeKey) !== null && (
                                                                        <div className="flex justify-between items-center text-sm">
                                                                            <span className="text-brand-inactive-text dark:text-dark-body">{hasOnlyServices(data.items) ? "Deslocamento" : "Entrega"}</span>
                                                                            <span className="text-brand-green font-semibold">{getDeliveryLabel(data, partnerItemsTotal, storeKey)}</span>
                                                                        </div>
                                                                    )}
                                                                    {renderShippingWarning(storeKey)}
                                                                    {renderCarrierQuote(storeKey)}
                                                                    <div className="h-[1px] bg-brand-border dark:bg-dark-border w-full" />
                                                                    <div className="flex justify-between items-center text-base font-bold text-brand-dark dark:text-dark-heading">
                                                                        <span>Total</span>
                                                                        <span>{formatCurrency(partnerTotalWithDelivery)}</span>
                                                                    </div>
                                                                    <Button
                                                                        onClick={() => handleOpenCheckout(storeKey)}
                                                                        className="w-full"
                                                                        disabled={partnerItemsTotal === 0 || data.isShowcaseActive === false || data.isAcceptingOrders === false}
                                                                    >
                                                                        {data.isShowcaseActive === false ? "Vitrine Inativa" : data.isAcceptingOrders === false ? "Loja Fechada" : "Finalizar pedido"}
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
                                                    <div className="bg-brand-gray dark:bg-dark-border/50 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
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
                                                                    {renderPromoBanners(storeKey, partnerItemsTotal)}
                                                                    <div className="flex justify-between items-center text-sm font-medium">
                                                                        <span className="text-brand-inactive-text dark:text-dark-body">Total dos itens</span>
                                                                        <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(partnerItemsTotal)}</span>
                                                                    </div>
                                                                    {getDeliveryLabel(data, partnerItemsTotal, storeKey) !== null && (
                                                                        <div className="flex justify-between items-center text-sm font-medium">
                                                                            <span className="text-brand-inactive-text dark:text-dark-body">{hasOnlyServices(data.items) ? "Deslocamento" : "Entrega"}</span>
                                                                            <span className="text-brand-green font-semibold">{getDeliveryLabel(data, partnerItemsTotal, storeKey)}</span>
                                                                        </div>
                                                                    )}
                                                                    {renderShippingWarning(storeKey)}
                                                                    {renderCarrierQuote(storeKey)}
                                                                    <div className="h-[1px] bg-brand-border dark:bg-dark-border w-full" />
                                                                    <div className="flex justify-between items-center font-bold text-xl text-brand-dark dark:text-dark-heading">
                                                                        <span>Total Geral</span>
                                                                        <span>{formatCurrency(partnerTotalWithDelivery)}</span>
                                                                    </div>
                                                                    <Button
                                                                        onClick={() => handleOpenCheckout(storeKey)}
                                                                        className="w-full h-[46px]"
                                                                        disabled={partnerItemsTotal === 0 || data.isShowcaseActive === false || data.isAcceptingOrders === false}
                                                                    >
                                                                        {data.isShowcaseActive === false ? "Vitrine Inativa" : data.isAcceptingOrders === false ? "Loja Fechada" : "Finalizar Pedido"}
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

            {/* Modal de seleção/troca e criação de endereço na Sacola */}
            <DefaultModal
                isOpen={showAddressModal}
                onClose={() => {
                    setShowAddressModal(false)
                    setShowNewAddressForm(false)
                    setAddressFormError(null)
                }}
                title={showNewAddressForm ? "Adicionar novo endereço" : "Selecione o endereço de entrega"}
            >
                <div className="space-y-4">
                    {!showNewAddressForm ? (
                        <>
                            {userAddresses.length === 0 ? (
                                <div className="text-center py-6 space-y-3">
                                    <MapPinIcon size={32} className="mx-auto text-brand-inactive-text" />
                                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum endereço cadastrado</p>
                                    <Button
                                        onClick={() => setShowNewAddressForm(true)}
                                        className="w-full"
                                    >
                                        Cadastrar endereço
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                                    {userAddresses.map((addr: any) => {
                                        const isSelected = addr.id === selectedAddressId
                                        return (
                                            <button
                                                key={addr.id}
                                                type="button"
                                                onClick={() => handleSelectAddress(addr.id)}
                                                className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${isSelected
                                                    ? "border-brand-green bg-brand-green/5 shadow-sm ring-1 ring-brand-green"
                                                    : "border-brand-border dark:border-dark-border hover:border-brand-dark/40 dark:hover:border-dark-heading/40 bg-white dark:bg-dark-surface"
                                                    }`}
                                            >
                                                <div className="mt-0.5">
                                                    <RadioButton
                                                        name="cart_address_selection"
                                                        value={addr.id}
                                                        checked={isSelected}
                                                        onChange={() => handleSelectAddress(addr.id)}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {addr.street}, {addr.number}
                                                        </span>
                                                        {addr.is_default ? (
                                                            <span className="text-[10px] uppercase font-bold text-brand-green bg-brand-green/10 px-1.5 py-0.5 rounded shrink-0">
                                                                Padrão
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                title="Definir como endereço padrão (reflete no ERP de todas as lojas)"
                                                                onClick={(e) => handleSetDefaultInCart(e, addr.id)}
                                                                className="text-[11px] font-medium text-brand-green hover:underline ml-auto shrink-0"
                                                            >
                                                                Tornar padrão
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">
                                                        {addr.neighborhood}, {addr.city} - {addr.state}
                                                    </p>
                                                    {addr.zip_code && (
                                                        <p className="text-[11px] text-brand-inactive-text/80 dark:text-dark-body/80 mt-0.5">
                                                            CEP: {addr.zip_code}
                                                        </p>
                                                    )}
                                                </div>
                                            </button>
                                        )
                                    })}
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowNewAddressForm(true)}
                                        className="w-full mt-2"
                                    >
                                        <PlusIcon size={16} className="mr-1.5" />
                                        Novo endereço
                                    </Button>
                                </div>
                            )}
                        </>
                    ) : (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault()
                                void handleSaveNewAddressInCart()
                            }}
                            className="space-y-3.5"
                        >
                            {addressFormError && (
                                <p className="text-xs text-red-500 font-medium bg-red-50 dark:bg-red-950/30 p-2.5 rounded-lg border border-red-200 dark:border-red-900">
                                    {addressFormError}
                                </p>
                            )}
                            <div>
                                <CepInput
                                    value={newAddressData.zipCode}
                                    onChange={(v) => setNewAddressData(prev => ({ ...prev, zipCode: v }))}
                                    onAddressFetched={(data) => {
                                        setNewAddressData(prev => ({
                                            ...prev,
                                            street: data.street || prev.street,
                                            number: data.number || prev.number,
                                            noNumber: data.number ? data.number === "S/N" : prev.noNumber,
                                            neighborhood: data.neighborhood || prev.neighborhood,
                                            city: data.city || prev.city,
                                            state: data.state || prev.state,
                                            latitude: typeof data.latitude === "number" ? data.latitude : prev.latitude,
                                            longitude: typeof data.longitude === "number" ? data.longitude : prev.longitude,
                                        }))
                                    }}
                                    placeholder="00000-000"
                                />
                            </div>
                            <div className="flex items-center gap-3 mb-2">
                                {[
                                    { value: "casa", label: "Casa" },
                                    { value: "trabalho", label: "Trabalho" },
                                    { value: "outro", label: "Outro" },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setNewAddressData(prev => ({ ...prev, addressType: opt.value }))}
                                        className={`px-4 py-1.5 rounded-full text-[13px] font-medium border transition-all ${newAddressData.addressType === opt.value
                                            ? "bg-brand-green text-white border-brand-green"
                                            : "bg-white text-brand-inactive-text border-gray-200 hover:border-gray-300 dark:bg-dark-surface dark:text-dark-body dark:border-dark-border dark:hover:border-dark-border"
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-brand-dark dark:text-dark-heading block mb-1">Rua / Logradouro *</label>
                                <Input
                                    value={newAddressData.street}
                                    onChange={(e) => setNewAddressData(prev => ({ ...prev, street: e.target.value }))}
                                    placeholder="Ex: Av. Paulista"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <NumberInputWithCheckbox
                                        label="Número *"
                                        number={newAddressData.number}
                                        onNumberChange={(v: string) => setNewAddressData(prev => ({ ...prev, number: v }))}
                                        noNumber={newAddressData.noNumber}
                                        onNoNumberChange={(val: boolean) => setNewAddressData(prev => ({ ...prev, noNumber: val }))}
                                        placeholder="123"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-brand-dark dark:text-dark-heading block mb-1">Complemento</label>
                                    <Input
                                        value={newAddressData.complement}
                                        onChange={(e) => setNewAddressData(prev => ({ ...prev, complement: e.target.value }))}
                                        placeholder="Apto, Bloco"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-brand-dark dark:text-dark-heading block mb-1">Bairro *</label>
                                <Input
                                    value={newAddressData.neighborhood}
                                    onChange={(e) => setNewAddressData(prev => ({ ...prev, neighborhood: e.target.value }))}
                                    placeholder="Bairro"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-brand-dark dark:text-dark-heading block mb-1">Cidade *</label>
                                    <Input
                                        value={newAddressData.city}
                                        onChange={(e) => setNewAddressData(prev => ({ ...prev, city: e.target.value }))}
                                        placeholder="Cidade"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-brand-dark dark:text-dark-heading block mb-1">Estado *</label>
                                    <StateComboBox
                                        value={newAddressData.state}
                                        onChange={(val) => setNewAddressData(prev => ({ ...prev, state: val }))}
                                    />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-brand-dark dark:text-dark-heading cursor-pointer pt-1">
                                <input
                                    type="checkbox"
                                    checked={newAddressData.isDefault || userAddresses.length === 0}
                                    disabled={userAddresses.length === 0}
                                    onChange={(e) => setNewAddressData(prev => ({ ...prev, isDefault: e.target.checked }))}
                                    className="rounded text-brand-green focus:ring-brand-green h-4 w-4"
                                />
                                <span>Definir como endereço padrão (reflete no ERP de todas as lojas)</span>
                            </label>
                            <div className="flex gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowNewAddressForm(false)}
                                    className="flex-1"
                                    disabled={loadingAddressSave}
                                >
                                    Voltar
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1"
                                    disabled={loadingAddressSave}
                                >
                                    {loadingAddressSave ? <Spinner size={16} /> : "Salvar endereço"}
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </DefaultModal>

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
