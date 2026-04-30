"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TrashIcon, ChevronRightIcon, XIcon, SalesIcon, MoneyIcon, TagIcon, FileIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, AlertModal, DefaultModal, MoneyInput, PercentageInput, InfoCard, Input, IconPlaceholder, ListItem, RadioButton } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { useMediaQuery } from "@/components/erp/hooks"
import { useNotification } from "@/hooks/use-notification"
import { useCSRFToken } from "@/hooks/use-csrf-token"
import {
    deletePreSaleDraftAction,
    finalizePreSaleAction,
    getPOSCustomerDetailsAction,
    createPOSCustomerAddressAction,
    createPOSCustomerQuickAction,
    upsertPreSaleDraftAction,
    applyCouponToPreSaleAction,
    removeCouponFromPreSaleAction,
} from "@/app/actions/erp/pdv"
import { validateCouponAction } from "@/app/actions/shared/coupons"
import { createProductComprehensiveAction } from "@/app/actions/erp/products"
import { openCashSessionAction } from "@/app/actions/erp/cash-register"
import { getTeamMembers } from "@/app/actions/erp/team"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import SelectSellerSheet from "@/components/erp/pdv/SelectSellerSheet"
import SelectCouponSheet from "@/components/erp/pdv/SelectCouponSheet"
import PaymentModal, { PAYMENT_MODAL_HEADER_SUBTITLE } from "@/components/erp/orders/PaymentModal"
import POSCartItemCard from "@/components/erp/pdv/POSCartItemCard"
import { POSMorePreSalesCard, POSPreSaleCard } from "@/components/erp/pdv/POSPreSaleCard"
import POSCashClosedView from "@/components/erp/pdv/POSCashClosedView"
import POSHeader from "@/components/erp/pdv/POSHeader"
import POSDesktopOrderPanel, { POSOrderSummaryContent } from "@/components/erp/pdv/POSOrderSummaryCard"
import POSQuickProductSheet from "@/components/erp/pdv/POSQuickProductSheet"
import POSShippingSheet from "@/components/erp/pdv/POSShippingSheet"
import SelectProductVariantSheet from "@/components/erp/pdv/SelectProductVariantSheet"
import type {
    PDVCartItem as CartItem,
    PDVCustomer as Customer,
    PDVFinanceAccount as FinanceAccount,
    PDVPaymentBreakdownEntry as PaymentBreakdownEntry,
    PDVPaymentMethodOption as PaymentMethodOption,
    PDVPreSale as PreSale,
    PDVProduct as Product,
} from "@/lib/types/pdv"
import { FadeIn } from "@/components/animations/FadeIn"
import { normalizePDVSearchTerm } from "@/lib/utils/pdv"

interface Props {
    partnerId: string
    initialData: {
        products: Product[]
        customers: Customer[]
        financeAccounts: FinanceAccount[]
        preSales: PreSale[]
        paymentMethods: PaymentMethodOption[]
    }
    initialActiveSession: any | null
}

type TeamMember = {
    id: string
    fullName?: string | null
    userId?: string
}

function DesktopPOSSheet({
    isOpen,
    onClose,
    title,
    children,
    widthClassName = "w-[450px]",
}: {
    isOpen: boolean
    onClose: () => void
    title: string
    children: React.ReactNode
    widthClassName?: string
}) {
    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 ${widthClassName} overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
                        <header className="flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h2>
                            <Button variant="ghost" onClick={onClose} size="icon">
                                <XIcon className="h-5 w-5" />
                            </Button>
                        </header>
                        <div className="flex-1 overflow-y-auto">{children}</div>
                    </div>
                </div>
            </div>
        </Portal>
    )
}

export default function POSPage({ partnerId, initialData, initialActiveSession }: Props) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const isMobile = useMediaQuery("(max-width: 1024px)")
    const csrfToken = useCSRFToken()

    const [products, setProducts] = useState<Product[]>(initialData.products || [])
    const [customers, setCustomers] = useState<Customer[]>(initialData.customers || [])
    const accounts = initialData.financeAccounts || []
    const [preSales, setPreSales] = useState<PreSale[]>(initialData.preSales || [])
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
    const [activeCashSession, setActiveCashSession] = useState<any | null>(initialActiveSession || null)

    const isCashierOpen = !!activeCashSession?.id
    const [selectedCategory, setSelectedCategory] = useState("Todos")
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(timer)
    }, [search])
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined)
    const [selectedSellerId, setSelectedSellerId] = useState<string | undefined>(undefined)
    const financeAccountId = useMemo(
        () => accounts.find((account) => account.is_default)?.id || accounts[0]?.id,
        [accounts]
    )
    const [discountAmount, setDiscountAmount] = useState(0)
    const [discountType, setDiscountType] = useState<"fixed" | "percentage" | "coupon">("fixed")
    const [discountCouponCode, setDiscountCouponCode] = useState("")
    const [shippingFee, setShippingFee] = useState(0)
    const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | null>(null)
    const [deliveryBreakdown, setDeliveryBreakdown] = useState<Record<string, unknown> | null>(null)
    const [otherCosts] = useState(0)
    const [notes, setNotes] = useState("")
    const [cart, setCart] = useState<CartItem[]>([])
    const [activePreSaleId, setActivePreSaleId] = useState<string | null>(null)
    const [isSavingDraft, setIsSavingDraft] = useState(false)
    const [isFinalizing, setIsFinalizing] = useState(false)
    const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null)
    const [isSelectCustomerOpen, setIsSelectCustomerOpen] = useState(false)
    const [isSelectSellerOpen, setIsSelectSellerOpen] = useState(false)
    const [isResetAlertOpen, setIsResetAlertOpen] = useState(false)
    const [isPreSaleSheetOpen, setIsPreSaleSheetOpen] = useState(false)
    const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [isMobileSummarySheetOpen, setIsMobileSummarySheetOpen] = useState(false)
    const [isMobileItemsSheetOpen, setIsMobileItemsSheetOpen] = useState(false)
    const [itemToRemoveId, setItemToRemoveId] = useState<string | null>(null)
    const [editingItem, setEditingItem] = useState<CartItem | null>(null)
    const [isNotesSheetOpen, setIsNotesSheetOpen] = useState(false)
    const [isOpenCashModalOpen, setIsOpenCashModalOpen] = useState(false)
    const [openingBalance, setOpeningBalance] = useState(0)
    const [openingNotes, setOpeningNotes] = useState("")
    const [isOpeningCash, setIsOpeningCash] = useState(false)
    const [editQty, setEditQty] = useState(1)
    const [editPrice, setEditPrice] = useState(0)
    const [isGlobalDiscountModalOpen, setIsGlobalDiscountModalOpen] = useState(false)
    const [globalDiscountValue, setGlobalDiscountValue] = useState(0)
    const [globalDiscountType, setGlobalDiscountType] = useState<"fixed" | "percentage" | "coupon">("fixed")
    const [globalDiscountCouponCode, setGlobalDiscountCouponCode] = useState("")
    const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)
    const [isCouponSheetOpen, setIsCouponSheetOpen] = useState(false)
    const [isQuickProductSheetOpen, setIsQuickProductSheetOpen] = useState(false)
    const [isShippingSheetOpen, setIsShippingSheetOpen] = useState(false)
    const [isCreatingQuickProduct, setIsCreatingQuickProduct] = useState(false)
    const [shippingCustomerDetails, setShippingCustomerDetails] = useState<{
        id: string
        name: string
        email?: string | null
        phone?: string | null
        cpf?: string | null
        address?: {
            zipCode?: string
            street?: string
            number?: string
            complement?: string
            neighborhood?: string
            city?: string
            state?: string
            country?: string
        } | null
    } | null>(null)
    const [isUserDraftSaveUi, setIsUserDraftSaveUi] = useState(false)
    const [appliedCouponId, setAppliedCouponId] = useState<string | null>(null)
    const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null)
    const [appliedCouponDiscount, setAppliedCouponDiscount] = useState(0)

    const isXL = useMediaQuery("(min-width: 1280px)")
    const isLG = useMediaQuery("(min-width: 1024px)")
    const isMD = useMediaQuery("(min-width: 768px)")

    const preSaleLimit = useMemo(() => {
        if (isXL) return 4
        if (isLG) return 3
        if (isMD) return 2
        return 1
    }, [isXL, isLG, isMD])

    const categories = useMemo(() => {
        const cats = new Set<string>()
        products.forEach((product) => {
            if (product.category) cats.add(product.category)
        })
        return ["Todos", ...Array.from(cats)]
    }, [products])

    useEffect(() => {
        async function loadTeam() {
            const res = await getTeamMembers()
            if (res.error || !res.members?.length) return
            setTeamMembers(
                res.members.map((member) => ({
                    id: member.id,
                    fullName: member.fullName,
                    userId: member.userId,
                }))
            )
            if (res.currentUserId) {
                const self = res.members.find((member) => member.userId === res.currentUserId)
                if (self) {
                    defaultSellerPartnerUserIdRef.current = self.id
                    setSelectedSellerId((prev) => prev || self.id)
                }
            }
        }
        loadTeam()
    }, [])

    const isFinalizingRef = useRef(false)
    /** Igual venda manual: o carrinho só é limpo ao fechar o PaymentModal após venda concluída, para a tela de sucesso e o recibo exibirem os valores. */
    const clearCartAfterPaymentModalClosesRef = useRef(false)
    const isSavingDraftRef = useRef(false)
    const defaultSellerPartnerUserIdRef = useRef<string | undefined>(undefined)
    const bypassBeforeUnloadRef = useRef(false)
    const desktopScrollClass = "custom-scrollbar max-lg:hide-scrollbar"
    const [customerSelectIntent, setCustomerSelectIntent] = useState<"default" | "shipping-preflight">("default")
    const [isRemoveCustomerAlertOpen, setIsRemoveCustomerAlertOpen] = useState(false)
    const [isLeaveWithoutSaveAlertOpen, setIsLeaveWithoutSaveAlertOpen] = useState(false)
    const [pendingLeaveHref, setPendingLeaveHref] = useState<string | null>(null)
    const EMPTY_ORDER_SIGNATURE = "__empty_order__"

    const buildOrderSignature = useCallback((payload: {
        selectedCustomerId?: string
        selectedSellerId?: string
        discountAmount: number
        discountType: "fixed" | "percentage" | "coupon"
        discountCouponCode: string
        shippingFee: number
        notes: string
        cart: CartItem[]
    }) => {
        if (!payload.cart.length) return EMPTY_ORDER_SIGNATURE
        return JSON.stringify({
            selectedCustomerId: payload.selectedCustomerId || "",
            selectedSellerId: payload.selectedSellerId || "",
            discountAmount: Number(payload.discountAmount || 0),
            discountType: payload.discountType,
            discountCouponCode: payload.discountCouponCode || "",
            shippingFee: Number(payload.shippingFee || 0),
            notes: payload.notes || "",
            cart: payload.cart.map((item) => ({
                id: item.id,
                productId: item.productId,
                variantId: item.variantId,
                name: item.name,
                price: Number(item.price || 0),
                qty: Number(item.qty || 0),
                listUnitPrice: Number(item.listUnitPrice ?? item.price ?? 0),
                lineDiscountType: item.lineDiscountType ?? null,
                lineDiscountValue: Number(item.lineDiscountValue ?? 0),
            })),
        })
    }, [])
    const [lastSavedOrderSignature, setLastSavedOrderSignature] = useState<string>(EMPTY_ORDER_SIGNATURE)

    const filteredProducts = useMemo(() => {
        let result = products
        const term = normalizePDVSearchTerm(debouncedSearch)

        if (selectedCategory !== "Todos") {
            result = result.filter((product) => product.category === selectedCategory)
        }

        if (term) {
            result = result.filter((product) => normalizePDVSearchTerm(product.name).includes(term))
        }

        return result
    }, [products, debouncedSearch, selectedCategory])

    const itemCount = useMemo(() => cart.reduce((acc, item) => acc + item.qty, 0), [cart])
    const subtotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.qty), 0), [cart])
    const discountVal = useMemo(() => {
        if (discountType === "percentage") {
            return (subtotal * discountAmount) / 100
        }
        if (discountType === "coupon") {
            return Number(appliedCouponDiscount || discountAmount || 0)
        }
        return discountAmount
    }, [subtotal, discountAmount, discountType, appliedCouponDiscount])
    const total = useMemo(() => Math.max(0, subtotal - discountVal + shippingFee + otherCosts), [subtotal, discountVal, shippingFee, otherCosts])
    const mobileCategoryLabel = selectedCategory === "Todos" ? "Categorias" : selectedCategory
    const selectedCustomer = useMemo(
        () => (selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId) || null : null),
        [customers, selectedCustomerId]
    )
    const pinnedCustomerForSheet = useMemo(() => {
        if (!selectedCustomerId) return null
        const found = customers.find((c) => c.id === selectedCustomerId)
        return found
            ? { id: found.id, name: found.name, email: found.email ?? null }
            : { id: selectedCustomerId, name: "Cliente selecionado", email: null as string | null }
    }, [customers, selectedCustomerId])
    const paymentModalCart = useMemo(
        () => cart.map((item) => ({
            ...item,
            unitPrice: item.price,
            quantity: item.qty,
        })),
        [cart]
    )
    const hasNotes = notes.trim().length > 0
    const currentOrderSignature = useMemo(
        () => buildOrderSignature({
            selectedCustomerId,
            selectedSellerId,
            discountAmount,
            discountType,
            discountCouponCode,
            shippingFee,
            notes,
            cart,
        }),
        [
            buildOrderSignature,
            selectedCustomerId,
            selectedSellerId,
            discountAmount,
            discountType,
            discountCouponCode,
            shippingFee,
            notes,
            cart,
        ]
    )
    const hasUnsavedOrderChanges = currentOrderSignature !== lastSavedOrderSignature
    const percentagePresets = [5, 10, 15, 20]

    const addToCart = useCallback((product: Product, variantId?: string | null, quantity: number = 1) => {
        const normalizedQty = Math.max(1, Number(quantity || 1))
        const selectedVariant = variantId
            ? product.product_variants?.find((variant) => variant.id === variantId)
            : null

        if (variantId && !selectedVariant) {
            notifyError(`A variação selecionada para "${product.name}" não existe.`)
            return
        }

        const availableStock = selectedVariant
            ? Number(selectedVariant.stock_available || 0)
            : Number(product.stock_available || 0)

        if (!product.allow_sell_without_stock && availableStock <= 0) {
            notifyError(`"${product.name}" está sem estoque.`)
            return
        }

        setCart((prev) => {
            const found = prev.find((item) => item.productId === product.id && item.variantId === (variantId || null))
            if (!found) {
                const listUnit = Number(product.price || 0) + Number(selectedVariant?.price_adjustment || 0)
                if (!product.allow_sell_without_stock && normalizedQty > availableStock) {
                    notifyError(`Estoque insuficiente para o item ${product.name}${selectedVariant?.variant_name ? ` - ${selectedVariant.variant_name}` : ""}`)
                    return prev
                }
                return [
                    ...prev,
                    {
                        id: crypto.randomUUID(),
                        productId: product.id,
                        variantId: variantId || null,
                        name: product.name,
                        variantName: selectedVariant?.variant_name || null,
                        listUnitPrice: listUnit,
                        lineDiscountType: null,
                        lineDiscountValue: null,
                        price: listUnit,
                        qty: normalizedQty,
                        image: (selectedVariant?.variant_options?.image as string | undefined) || product.images?.[0] || null,
                    },
                ]
            }

            const nextQty = found.qty + normalizedQty
            if (!product.allow_sell_without_stock && nextQty > availableStock) {
                notifyError(`Estoque insuficiente para o item ${found.name}${found.variantName ? ` - ${found.variantName}` : ""}`)
                return prev
            }

            return prev.map((item) => (item.id === found.id ? { ...item, qty: nextQty } : item))
        })
    }, [notifyError])

    const handleCreateQuickProduct = useCallback(async (payload: {
        name: string
        price: number
        stockQuantity: number
    }) => {
        setIsCreatingQuickProduct(true)
        try {
            if (!csrfToken) {
                notifyError("Não foi possível validar a sessão. Recarregue a página e tente novamente.")
                return
            }
            const result = await createProductComprehensiveAction({
                partnerId,
                storeId: "",
                name: payload.name,
                price: payload.price,
                stockQuantity: payload.stockQuantity,
                isActive: true,
                allow_sell_without_stock: false,
                csrf_token: csrfToken,
            })

            if (!result?.success || !result.data) {
                notifyError((result as any)?.error || "Não foi possível criar o produto.")
                return
            }

            const created = result.data as any
            const createdProduct: Product = {
                id: String(created.id),
                name: String(created.name || payload.name),
                category: created.category ?? null,
                sku: created.sku ?? null,
                price: Number(created.price ?? payload.price) || 0,
                stock_available: Number(created.stock_available ?? created.stock_quantity ?? payload.stockQuantity ?? 0) || 0,
                allow_sell_without_stock: Boolean(created.allow_sell_without_stock ?? created.allow_sell_without_stock),
                images: Array.isArray(created.images) ? created.images : null,
                product_variants: Array.isArray(created.product_variants) ? created.product_variants : [],
            }
            setProducts((prev) => [createdProduct, ...prev])
            addToCart(createdProduct)
            setIsQuickProductSheetOpen(false)
            notifySuccess("Produto criado e adicionado ao carrinho.")
        } finally {
            setIsCreatingQuickProduct(false)
        }
    }, [partnerId, notifyError, notifySuccess, addToCart, csrfToken])

    const handleCreateQuickCustomer = useCallback(async (payload: {
        name: string
        email?: string
        phone?: string
    }) => {
        const result = await createPOSCustomerQuickAction({
            partnerId,
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
        })

        if (!result.success || !result.data) {
            notifyError(result.error || "Não foi possível cadastrar o cliente.")
            return null
        }

        const created = result.data as {
            id: string
            name: string
            email?: string | null
            phone?: string | null
        }

        setCustomers((prev) => {
            if (prev.some((customer) => customer.id === created.id)) return prev
            return [{ id: created.id, name: created.name, email: created.email ?? null, phone: created.phone ?? null }, ...prev]
        })

        notifySuccess("Cliente cadastrado com sucesso.")
        return created
    }, [partnerId, notifyError, notifySuccess])

    const changeQty = useCallback((itemId: string, delta: number) => {
        setCart((prev) => prev
            .map((item) => {
                if (item.id !== itemId) return item
                if (delta < 0 && item.qty <= 1) return item
                const nextQty = Math.max(0, item.qty + delta)
                const product = products.find((currentProduct) => currentProduct.id === item.productId)
                const variant = item.variantId ? product?.product_variants?.find((currentVariant) => currentVariant.id === item.variantId) : null
                const availableStock = variant ? Number(variant.stock_available || 0) : Number(product?.stock_available || 0)

                if (product && !product.allow_sell_without_stock && nextQty > availableStock) {
                    notifyError(`Estoque insuficiente para o item ${item.name}${item.variantName ? ` - ${item.variantName}` : ""}`)
                    return item
                }

                return { ...item, qty: nextQty }
            })
            .filter((item) => item.qty > 0))
    }, [products, notifyError])

    const removeItem = useCallback((itemId: string) => {
        setCart((prev) => prev.filter((item) => item.id !== itemId))
    }, [])

    const persistDraft = async (opts?: { notifyOnSuccess?: boolean }) => {
        if (cart.length === 0) return null
        if (isSavingDraftRef.current) return null

        const signatureAtSave = buildOrderSignature({
            selectedCustomerId,
            selectedSellerId,
            discountAmount,
            discountType,
            discountCouponCode,
            shippingFee,
            notes,
            cart,
        })

        isSavingDraftRef.current = true
        setIsSavingDraft(true)
        try {
            const result = await upsertPreSaleDraftAction({
                partnerId,
                preSaleId: activePreSaleId || undefined,
                customerId: selectedCustomerId,
                notes,
                subtotal,
                discountAmount: discountVal,
                totalAmount: total,
                shippingFee,
                distanceKm: deliveryDistanceKm,
                deliveryBreakdown,
                otherCosts,
                items: cart.map((item) => ({
                    productId: item.productId,
                    variantId: item.variantId,
                    variantName: item.variantName,
                    name: item.name,
                    qty: item.qty,
                    price: item.price,
                    totalPrice: item.price * item.qty,
                    image: item.image,
                    listUnitPrice: item.listUnitPrice ?? item.price,
                    lineDiscountType: item.lineDiscountType ?? null,
                    lineDiscountValue: item.lineDiscountValue ?? null,
                })),
            })

            if (!result.success) {
                notifyError(result.error || "Falha ao salvar pré-venda.")
                return null
            }

            const saved = result.data as PreSale
            setActivePreSaleId(saved.id)
            setLastSavedOrderSignature(signatureAtSave)
            setPreSales((prev) => [saved, ...prev.filter((preSale) => preSale.id !== saved.id)].slice(0, 20))
            if (opts?.notifyOnSuccess) {
                notifySuccess("Pedido salvo com sucesso.")
            }
            return saved.id
        } finally {
            setIsSavingDraft(false)
            isSavingDraftRef.current = false
        }
    }

    const saveDraftFromMenu = async () => {
        if (cart.length === 0) return
        setIsUserDraftSaveUi(true)
        try {
            const savedId = await persistDraft({ notifyOnSuccess: true })
            if (savedId) clearCurrentOrder()
        } finally {
            setIsUserDraftSaveUi(false)
        }
    }

    const ensurePreSaleToFinalize = async () => {
        const savedId = await persistDraft()
        if (!savedId) {
            notifyError("Não foi possível atualizar a pré-venda antes de finalizar.")
            return null
        }
        return savedId
    }

    const loadPreSale = useCallback((preSale: PreSale) => {
        const items = (Array.isArray(preSale.items) ? preSale.items : []).map((item: any) => {
            const unit = Number((item.unit_price ?? item.price) || 0)
            return {
                id: crypto.randomUUID(),
                productId: item.product_id ?? item.productId ?? null,
                variantId: item.variant_id ?? item.variantId ?? null,
                variantName: item.variant_name || item.variantName || null,
                name: item.name,
                listUnitPrice: unit,
                lineDiscountType: null,
                lineDiscountValue: null,
                price: unit,
                qty: Number((item.quantity ?? item.qty) || 0),
                image: item.image || null,
            }
        })

        setActivePreSaleId(preSale.id)
        setSelectedCustomerId(preSale.customer_id || undefined)
        setDiscountAmount(Number(preSale.discount_amount || 0))
        setDiscountType("fixed")
        setDiscountCouponCode("")
        setNotes(preSale.notes || "")
        setShippingFee(Number(preSale.shipping_fee || 0))
        setDeliveryDistanceKm(Number((preSale as any).distance_km || 0) || null)
        setDeliveryBreakdown((preSale as any).delivery_breakdown || null)
        setCart(items)
        setLastSavedOrderSignature(buildOrderSignature({
            selectedCustomerId: preSale.customer_id || undefined,
            selectedSellerId,
            discountAmount: Number(preSale.discount_amount || 0),
            discountType: "fixed",
            discountCouponCode: "",
            shippingFee: Number(preSale.shipping_fee || 0),
            notes: preSale.notes || "",
            cart: items,
        }))
    }, [buildOrderSignature, selectedSellerId])

    const clearCurrentOrder = useCallback(() => {
        setActivePreSaleId(null)
        setSelectedCustomerId(undefined)
        setDiscountAmount(0)
        setDiscountType("fixed")
        setDiscountCouponCode("")
        setNotes("")
        setShippingFee(0)
        setDeliveryDistanceKm(null)
        setDeliveryBreakdown(null)
        setCart([])
        setSelectedSellerId(defaultSellerPartnerUserIdRef.current)
        setLastSavedOrderSignature(EMPTY_ORDER_SIGNATURE)
    }, [EMPTY_ORDER_SIGNATURE])

    const removeDraft = async (preSaleId: string) => {
        const result = await deletePreSaleDraftAction(partnerId, preSaleId)
        if (!result.success) {
            notifyError(result.error || "Não foi possível excluir a pré-venda.")
            return
        }

        setPreSales((prev) => prev.filter((item) => item.id !== preSaleId))
        if (activePreSaleId === preSaleId) clearCurrentOrder()
    }

    const closePaymentModal = useCallback(() => {
        setIsPaymentModalOpen(false)
        if (clearCartAfterPaymentModalClosesRef.current) {
            clearCartAfterPaymentModalClosesRef.current = false
            clearCurrentOrder()
            setIsMobileSummarySheetOpen(false)
            setIsMobileItemsSheetOpen(false)
        }
    }, [clearCurrentOrder])

    const handleOpenPaymentModal = useCallback(() => {
        if (cart.length === 0) {
            notifyError("Adicione itens para continuar.")
            return
        }

        setIsMobileSummarySheetOpen(false)
        setIsMobileItemsSheetOpen(false)
        setIsPaymentModalOpen(true)
    }, [cart.length, notifyError])

    const handleConfirmVariantSelection = useCallback((selections: Array<{ variantId: string; qty: number }>) => {
        if (!variantPickerProduct) return
        for (const selection of selections) {
            addToCart(variantPickerProduct, selection.variantId, selection.qty)
        }
    }, [addToCart, variantPickerProduct])

    const handleConfirmPayment = async (paymentData: {
        paymentMethod?: string
        paymentBreakdown?: PaymentBreakdownEntry[]
        paymentStatus?: "paid" | "partially_paid" | "unpaid"
        paidAmount?: number
    }) => {
        if (cart.length === 0) {
            return { error: "Adicione itens para finalizar." }
        }

        if (isFinalizingRef.current) return { error: "A venda já está sendo processada." }
        isFinalizingRef.current = true

        const preSaleIdToFinalize = await ensurePreSaleToFinalize()
        if (!preSaleIdToFinalize) {
            isFinalizingRef.current = false
            return { error: "Não foi possível gerar a pré-venda." }
        }

        setIsFinalizing(true)
        try {
            const paymentBreakdown = (paymentData.paymentBreakdown || []).map((entry) => ({
                method: String(entry.method || "").trim(),
                amount: Number(entry.amount || 0),
                paymentMethodId: entry.paymentMethodId || null,
                installmentNumber: Math.max(1, Math.floor(Number((entry as { installmentNumber?: number }).installmentNumber || 1))),
            }))

            const result = await finalizePreSaleAction({
                partnerId,
                preSaleId: preSaleIdToFinalize,
                financeAccountId: financeAccountId || null,
                paidAmount: Number(paymentData.paidAmount || 0),
                paymentMethod: paymentData.paymentMethod || "pendente",
                paymentBreakdown,
            })

            if (!result.success) {
                notifyError(result.error || "Não foi possível finalizar a venda.")
                return { error: result.error || "Não foi possível finalizar a venda." }
            }

            notifySuccess("Venda finalizada com sucesso.")
            setPreSales((prev) => prev.filter((draft) => draft.id !== preSaleIdToFinalize))
            clearCartAfterPaymentModalClosesRef.current = true
            return { success: true, orderNumber: result.data?.saleId }
        } finally {
            setIsFinalizing(false)
            isFinalizingRef.current = false
        }
    }

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (bypassBeforeUnloadRef.current) return
            if (!hasUnsavedOrderChanges) return
            event.preventDefault()
            event.returnValue = ""
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () => window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [hasUnsavedOrderChanges])

    useEffect(() => {
        const handleDocumentClick = (event: MouseEvent) => {
            if (!hasUnsavedOrderChanges) return
            const target = event.target as HTMLElement | null
            const anchor = target?.closest("a[href]") as HTMLAnchorElement | null
            if (!anchor) return
            if (anchor.target === "_blank" || anchor.hasAttribute("download")) return

            const hrefAttr = anchor.getAttribute("href")
            if (!hrefAttr || hrefAttr.startsWith("#")) return

            const destination = new URL(anchor.href, window.location.href)
            const current = new URL(window.location.href)
            if (destination.origin !== current.origin) return
            if (destination.pathname === current.pathname && destination.search === current.search && destination.hash === current.hash) return

            event.preventDefault()
            event.stopPropagation()
            setPendingLeaveHref(`${destination.pathname}${destination.search}${destination.hash}`)
            setIsLeaveWithoutSaveAlertOpen(true)
        }

        document.addEventListener("click", handleDocumentClick, true)
        return () => document.removeEventListener("click", handleDocumentClick, true)
    }, [hasUnsavedOrderChanges])

    useEffect(() => {
        const originalPushState = window.history.pushState
        const originalReplaceState = window.history.replaceState

        const shouldBlockHistoryNavigation = (url?: string | URL | null) => {
            if (!hasUnsavedOrderChanges || !url) return false

            const current = new URL(window.location.href)
            const destination = new URL(String(url), current.href)
            if (destination.origin !== current.origin) return false
            if (destination.pathname === current.pathname) return false

            setPendingLeaveHref(`${destination.pathname}${destination.search}${destination.hash}`)
            setIsLeaveWithoutSaveAlertOpen(true)
            return true
        }

        window.history.pushState = function pushState(
            data: any,
            unused: string,
            url?: string | URL | null
        ) {
            if (shouldBlockHistoryNavigation(url)) return
            return originalPushState.call(this, data, unused, url)
        }

        window.history.replaceState = function replaceState(
            data: any,
            unused: string,
            url?: string | URL | null
        ) {
            if (shouldBlockHistoryNavigation(url)) return
            return originalReplaceState.call(this, data, unused, url)
        }

        return () => {
            window.history.pushState = originalPushState
            window.history.replaceState = originalReplaceState
        }
    }, [hasUnsavedOrderChanges])

    useEffect(() => {
        if (!editingItem) return
        setEditQty(editingItem.qty)
        const list = editingItem.listUnitPrice ?? editingItem.price
        setEditPrice(list)
    }, [editingItem])

    useEffect(() => {
        if (!isGlobalDiscountModalOpen) return
        setGlobalDiscountValue(discountAmount)
        setGlobalDiscountType(discountType)
        setGlobalDiscountCouponCode(discountCouponCode)
    }, [isGlobalDiscountModalOpen, discountAmount, discountType, discountCouponCode])

    const saveEditedItem = () => {
        if (!editingItem) return

        const product = products.find((p) => p.id === editingItem.productId)
        const variant = editingItem.variantId
            ? product?.product_variants?.find((v) => v.id === editingItem.variantId)
            : null
        const available = variant ? Number(variant.stock_available || 0) : Number(product?.stock_available || 0)

        if (product && !product.allow_sell_without_stock && editQty > available) {
            notifyError(`Estoque insuficiente para o item ${editingItem.name}${editingItem.variantName ? ` - ${editingItem.variantName}` : ""}`)
            return
        }

        setCart((prev) => prev.map((item) => (item.id === editingItem.id
            ? {
                ...item,
                qty: editQty,
                price: editPrice,
                listUnitPrice: editPrice,
                lineDiscountType: null,
                lineDiscountValue: null,
            }
            : item)))
        setEditingItem(null)
        notifySuccess("Item atualizado.")
    }

    const handleOpenCash = async () => {
        if (openingBalance < 0) {
            notifyError("Saldo inicial inválido.")
            return
        }
        if (isOpeningCash) return

        setIsOpeningCash(true)
        try {
            const result = await openCashSessionAction({
                partnerId,
                initialAmount: openingBalance,
                notes: openingNotes,
            })

            if (!result.success) {
                notifyError(result.error || "Não foi possível abrir o caixa.")
                return
            }

            notifySuccess("Caixa aberto com sucesso.")
            setActiveCashSession(result.data)
            setIsOpenCashModalOpen(false)
            setOpeningBalance(0)
            setOpeningNotes("")
        } finally {
            setIsOpeningCash(false)
        }
    }

    const openShippingSheetWithCustomer = useCallback(async (customerId: string) => {
        const details = await getPOSCustomerDetailsAction({ partnerId, customerId })
        if (details.success && details.data) {
            setShippingCustomerDetails(details.data)
        } else {
            setShippingCustomerDetails(null)
        }
        setIsShippingSheetOpen(true)
    }, [partnerId])

    const handleOpenShippingSheet = useCallback(async () => {
        if (selectedCustomerId) {
            await openShippingSheetWithCustomer(selectedCustomerId)
            return
        }
        setCustomerSelectIntent("shipping-preflight")
        setIsSelectCustomerOpen(true)
    }, [selectedCustomerId, openShippingSheetWithCustomer])

    const applyCouponCode = useCallback(async (rawCode: string) => {
        const code = String(rawCode || "").trim().toUpperCase()
        if (!code) {
            notifyError("Informe um código de cupom.")
            return
        }
        if (isApplyingCoupon) return
        setIsApplyingCoupon(true)
        try {
            const res = activePreSaleId
                ? await applyCouponToPreSaleAction({
                    partnerId,
                    preSaleId: activePreSaleId,
                    couponCode: code,
                    customerId: selectedCustomerId || null,
                    subtotal,
                    shippingCost: shippingFee,
                    items: cart.map((item) => ({ productId: item.productId || null })),
                })
                : await validateCouponAction({
                    partnerId,
                    code,
                    customerId: selectedCustomerId || null,
                    subtotal,
                    shippingCost: shippingFee,
                    items: cart.map((item) => ({ productId: item.productId || null })),
                })

            if (!(res as any)?.valid && !(res as any)?.success) {
                notifyError((res as any)?.errorMessage || (res as any)?.error || "Cupom inválido.")
                return
            }

            const couponId = (res as any)?.couponId || (res as any)?.data?.couponId || null
            const couponCode = (res as any)?.couponCode || (res as any)?.data?.couponCode || code
            const discountAmount = Number((res as any)?.discountAmount ?? (res as any)?.data?.discountAmount ?? 0) || 0

            setAppliedCouponId(couponId)
            setAppliedCouponCode(couponCode)
            setAppliedCouponDiscount(discountAmount)
            setDiscountType("coupon")
            setDiscountAmount(discountAmount)
            setDiscountCouponCode(couponCode)
            setGlobalDiscountType("coupon")
            setGlobalDiscountCouponCode(couponCode)
            notifySuccess(`Cupom ${couponCode} aplicado!`)
        } finally {
            setIsApplyingCoupon(false)
        }
    }, [
        activePreSaleId,
        cart,
        isApplyingCoupon,
        notifyError,
        notifySuccess,
        partnerId,
        selectedCustomerId,
        shippingFee,
        subtotal,
    ])

    const handleCreateShippingAddress = useCallback(async (payload: {
        customerId: string
        address: {
            zipCode: string
            street: string
            number: string
            complement: string
            neighborhood: string
            city: string
            state: string
        }
    }) => {
        const result = await createPOSCustomerAddressAction({
            partnerId,
            customerId: payload.customerId,
            address: payload.address,
        })

        if (!result.success) {
            notifyError(result.error || "Não foi possível cadastrar o endereço.")
            throw new Error(result.error || "Não foi possível cadastrar o endereço.")
        }

        const details = await getPOSCustomerDetailsAction({ partnerId, customerId: payload.customerId })
        if (!details.success || !details.data) {
            notifyError(details.error || "Endereço salvo, mas falhou ao recarregar cliente.")
            throw new Error(details.error || "Endereço salvo, mas falhou ao recarregar cliente.")
        }

        setShippingCustomerDetails(details.data)
        notifySuccess("Endereço cadastrado com sucesso.")
    }, [partnerId, notifyError, notifySuccess])

    const handleOpenNotesSheet = useCallback(() => {
        setIsMobileSummarySheetOpen(false)
        setIsMobileItemsSheetOpen(false)
        setIsNotesSheetOpen(true)
    }, [])

    const cartItemsList = (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
            <div
                className={`space-y-3 flex-1 overflow-y-auto pr-1 ${desktopScrollClass}`}
                style={{ scrollbarGutter: "stable" }}
            >
                {cart.map((item) => (
                    <POSCartItemCard
                        key={item.id}
                        item={item}
                        onChangeQty={changeQty}
                        onRemove={(id) => setItemToRemoveId(id)}
                        onEdit={(currentItem) => setEditingItem(currentItem)}
                    />
                ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-[#F5F6F7] to-transparent dark:from-dark-border/60" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-[#F5F6F7] to-transparent dark:from-dark-border/60" />
        </div>
    )

    const mobileCartItemsList = (
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 hide-scrollbar">
            {cart.map((item) => (
                <POSCartItemCard
                    key={item.id}
                    item={item}
                    onChangeQty={changeQty}
                    onRemove={(id) => setItemToRemoveId(id)}
                    onEdit={(currentItem) => setEditingItem(currentItem)}
                />
            ))}
        </div>
    )

    return (
        <AnimatePresence mode="wait">
            {!isCashierOpen ? (
                <FadeIn key="closed">
                    <POSCashClosedView
                        isOpenCashModalOpen={isOpenCashModalOpen}
                        setIsOpenCashModalOpen={setIsOpenCashModalOpen}
                        isOpeningCash={isOpeningCash}
                        openingBalance={openingBalance}
                        setOpeningBalance={setOpeningBalance}
                        openingNotes={openingNotes}
                        setOpeningNotes={setOpeningNotes}
                        onOpenCash={handleOpenCash}
                    />
                </FadeIn>
            ) : (
                <FadeIn key="open" className="flex h-full flex-col gap-4">
                    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-12">
                        <div className="flex min-h-0 flex-col xl:col-span-8 xl:pr-6">
                            <POSHeader
                                isMobile={isMobile}
                                search={search}
                                onSearchChange={setSearch}
                                categories={categories}
                                selectedCategory={selectedCategory}
                                onCategoryChange={setSelectedCategory}
                                mobileCategoryLabel={mobileCategoryLabel}
                                onOpenCategorySheet={() => setIsCategorySheetOpen(true)}
                                selectedCustomerId={selectedCustomerId}
                                customers={customers}
                                onOpenCustomerSheet={() => {
                                    setCustomerSelectIntent("default")
                                    setIsSelectCustomerOpen(true)
                                }}
                                selectedSellerId={selectedSellerId}
                                teamMembers={teamMembers}
                                onOpenSellerSheet={() => setIsSelectSellerOpen(true)}
                            />

                            <AnimatePresence mode="wait">
                                <FadeIn key={`${selectedCategory}-${debouncedSearch}`} className={`mt-2 grid grid-cols-2 gap-3 overflow-y-auto pr-1 pb-24 md:grid-cols-4 xl:grid-cols-5 xl:pb-6 2xl:grid-cols-6 ${desktopScrollClass}`}>
                                    {filteredProducts
                                        .slice(0, (cart.length === 0 && preSales.length > 0) ? (preSaleLimit === 4 ? 8 : preSaleLimit === 3 ? 6 : preSaleLimit === 2 ? 4 : 2) : undefined)
                                        .map((product) => (
                                            <div key={product.id} className="rounded-xl border border-brand-border bg-white p-3 text-left transition-all dark:bg-dark-surface">
                                                <div className="relative mb-2 aspect-square overflow-hidden rounded-2xl">
                                                    <img
                                                        src={getR2ImageUrl(product.images?.[0] || null, "thumbnail")}
                                                        alt={product.name}
                                                        className="h-full w-full object-cover bg-brand-gray dark:bg-dark-border/50"
                                                    />
                                                    <span className="absolute left-2 top-2 rounded-lg bg-brand-dark/80 px-2 py-1 text-[9px] font-bold text-white backdrop-blur-sm sm:text-[10px] lg:text-[11px]">
                                                        {Math.max(0, Number(product.stock_available || 0))} em Estoque
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">{product.name}</p>
                                                    {product.product_variants && product.product_variants.length > 0 && (
                                                        <p className="text-sm text-brand-inactive-text">{product.product_variants.length} variação(ões)</p>
                                                    )}
                                                    <p className="mt-0.5 font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(Number(product.price || 0))}</p>

                                                    <Button
                                                        variant="outline"
                                                        className="mt-3 h-9 w-full rounded-full border-brand-border text-xs font-bold text-brand-dark hover:bg-brand-gray"
                                                        onClick={() => {
                                                            if (product.product_variants && product.product_variants.length > 0) {
                                                                setVariantPickerProduct(product)
                                                                return
                                                            }
                                                            addToCart(product)
                                                        }}
                                                    >
                                                        Adicionar
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                </FadeIn>
                            </AnimatePresence>

                            <AnimatePresence>
                                {cart.length === 0 && preSales.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="mt-auto border-t border-brand-border pt-6"
                                    >
                                        <h4 className="mb-4 text-xl font-bold text-brand-dark dark:text-dark-heading">Pedidos em pré-venda</h4>
                                        <div className={`flex items-stretch gap-4 overflow-x-auto pb-2 ${desktopScrollClass}`}>
                                            {preSales.slice(0, preSaleLimit).map((preSale, index) => (
                                                <div key={preSale.id} className="relative group">
                                                    <POSPreSaleCard
                                                        preSale={preSale}
                                                        index={index}
                                                        customers={customers}
                                                        onClick={() => loadPreSale(preSale)}
                                                    />
                                                </div>
                                            ))}
                                            {preSales.length > preSaleLimit && (
                                                <POSMorePreSalesCard
                                                    count={preSales.length - preSaleLimit}
                                                    onClick={() => setIsPreSaleSheetOpen(true)}
                                                />
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {!isMobile && (
                            <div className="min-h-0 xl:col-span-4">
                                <POSDesktopOrderPanel
                                    itemCount={itemCount}
                                    subtotal={subtotal}
                                    discountVal={discountVal}
                                    discountType={discountType}
                                    discountInputValue={discountAmount}
                                    discountCouponCode={(appliedCouponCode || discountCouponCode || "").toString()}
                                    couponDiscountValue={appliedCouponDiscount}
                                    shippingFee={shippingFee}
                                    otherCosts={otherCosts}
                                    total={total}
                                    isFinalizing={isFinalizing}
                                    canContinue={!isFinalizing && cart.length > 0}
                                    canReset={cart.length > 0}
                                    onReset={() => setIsResetAlertOpen(true)}
                                    onOpenItems={() => { }}
                                    onOpenDiscount={() => setIsGlobalDiscountModalOpen(true)}
                                    onContinue={handleOpenPaymentModal}
                                    onSaveDraft={saveDraftFromMenu}
                                    onAddShipping={handleOpenShippingSheet}
                                    onOpenCreateProduct={() => setIsQuickProductSheetOpen(true)}
                                    onOpenNotes={handleOpenNotesSheet}
                                    showItemsShortcut={false}
                                    showActionsMenu={cart.length > 0}
                                    hasNotes={hasNotes}
                                    cartItems={cartItemsList}
                                    isEmpty={cart.length === 0}
                                    emptyState={
                                        <IconPlaceholder
                                            icon={SalesIcon}
                                            title="Caixa aberto e pronto para vender"
                                            subtitle="Adicione itens ao pedido para ver o resumo, aplicar descontos e continuar o atendimento."
                                            containerSize="h-20 w-20"
                                            iconSize="h-8 w-8"
                                            titleClass="text-2xl font-bold text-brand-dark dark:text-dark-heading"
                                            subtitleClass="mt-2 max-w-md text-lg text-brand-inactive-text dark:text-dark-body"
                                        />
                                    }
                                />
                            </div>
                        )}
                    </div>
                    {isMobile && itemCount > 0 && (
                        <button
                            className="fixed bottom-4 left-4 right-4 z-40 flex h-14 items-center justify-between rounded-full bg-brand-green px-4 font-bold text-white"
                            onClick={() => setIsMobileSummarySheetOpen(true)}
                        >
                            <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 font-black items-center justify-center rounded-full bg-white text-sm text-brand-dark">{itemCount}</span>
                                <span>Ver Pedido</span>
                            </div>
                            <span>{formatCurrency(total)}</span>
                        </button>
                    )}

                    <BottomSheet isOpen={isCategorySheetOpen} onClose={() => setIsCategorySheetOpen(false)}>
                        <div className="space-y-3 px-1 pb-2">
                            <div>
                                <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Selecionar categoria</h3>
                                <p className="mt-1 text-sm text-brand-inactive-text dark:text-dark-body">Escolha uma categoria para filtrar os produtos do PDV.</p>
                            </div>
                            <div className="space-y-2">
                                {categories.map((category) => (
                                    <button
                                        key={category}
                                        type="button"
                                        onClick={() => {
                                            setSelectedCategory(category)
                                            setIsCategorySheetOpen(false)
                                        }}
                                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left ${selectedCategory === category
                                            ? "border-brand-primary bg-green-50 text-brand-primary"
                                            : "border-brand-border bg-white text-brand-dark dark:bg-dark-surface dark:text-dark-heading"
                                            }`}
                                    >
                                        <span className="font-bold">{category}</span>
                                        <ChevronRightIcon className="h-4 w-4" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </BottomSheet>

                    <BottomSheet isOpen={isMobileSummarySheetOpen} onClose={() => setIsMobileSummarySheetOpen(false)}>
                        <div className="space-y-5 px-1 pb-2">
                            <div>
                                <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Resumo do Pedido</h3>
                            </div>
                            <POSOrderSummaryContent
                                itemCount={itemCount}
                                subtotal={subtotal}
                                discountVal={discountVal}
                                discountType={discountType}
                                discountInputValue={discountAmount}
                                discountCouponCode={(appliedCouponCode || discountCouponCode || "").toString()}
                                couponDiscountValue={appliedCouponDiscount}
                                shippingFee={shippingFee}
                                otherCosts={otherCosts}
                                total={total}
                                isFinalizing={isFinalizing}
                                canContinue={!isFinalizing && cart.length > 0}
                                onOpenItems={() => {
                                    setIsMobileSummarySheetOpen(false)
                                    setIsMobileItemsSheetOpen(true)
                                }}
                                onOpenDiscount={() => setIsGlobalDiscountModalOpen(true)}
                                onContinue={handleOpenPaymentModal}
                                onSaveDraft={saveDraftFromMenu}
                                onAddShipping={handleOpenShippingSheet}
                                onOpenCreateProduct={() => setIsQuickProductSheetOpen(true)}
                                onOpenNotes={handleOpenNotesSheet}
                                showActionsMenu={cart.length > 0}
                            />
                        </div>
                    </BottomSheet>

                    <BottomSheet isOpen={isMobileItemsSheetOpen} onClose={() => setIsMobileItemsSheetOpen(false)}>
                        <div className="space-y-5 px-1 pb-2">
                            <div>
                                <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Itens do Pedido</h3>
                                <p className="mt-1 text-sm text-brand-inactive-text dark:text-dark-body">{itemCount} item(ns) no pedido</p>
                            </div>
                            {mobileCartItemsList}
                            <Button
                                className="h-12 w-full"
                                onClick={() => {
                                    setIsMobileItemsSheetOpen(false)
                                    setIsMobileSummarySheetOpen(true)
                                }}
                            >
                                Voltar
                            </Button>
                        </div>
                    </BottomSheet>

                    {isMobile ? (
                        <BottomSheet isOpen={isPreSaleSheetOpen} onClose={() => setIsPreSaleSheetOpen(false)} title="Pedidos em Pré-venda">
                            <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2 lg:grid-cols-3">
                                {preSales.map((preSale, index) => (
                                    <div key={preSale.id} className="relative group">
                                        <POSPreSaleCard
                                            preSale={preSale}
                                            index={index}
                                            customers={customers}
                                            onClick={() => {
                                                loadPreSale(preSale)
                                                setIsPreSaleSheetOpen(false)
                                            }}
                                        />
                                        <button
                                            className="absolute right-4 top-4 text-brand-red"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                removeDraft(preSale.id)
                                            }}
                                        >
                                            <TrashIcon size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </BottomSheet>
                    ) : (
                        <DesktopPOSSheet
                            isOpen={isPreSaleSheetOpen}
                            onClose={() => setIsPreSaleSheetOpen(false)}
                            title="Pedidos em Pré-venda"
                            widthClassName="w-[560px]"
                        >
                            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                                {preSales.map((preSale, index) => (
                                    <div key={preSale.id} className="relative group">
                                        <POSPreSaleCard
                                            preSale={preSale}
                                            index={index}
                                            customers={customers}
                                            onClick={() => {
                                                loadPreSale(preSale)
                                                setIsPreSaleSheetOpen(false)
                                            }}
                                        />
                                        <button
                                            className="absolute right-4 top-4 text-brand-red opacity-0 transition-opacity group-hover:opacity-100"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                removeDraft(preSale.id)
                                            }}
                                        >
                                            <TrashIcon size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </DesktopPOSSheet>
                    )}

                    <AnimatePresence>
                        {isPaymentModalOpen && (
                            <PaymentModal
                                isOpen={isPaymentModalOpen}
                                onClose={closePaymentModal}
                                cart={paymentModalCart}
                                customer={selectedCustomer}
                                partnerId={partnerId}
                                shippingFee={shippingFee}
                                otherCosts={otherCosts}
                                discountAmount={discountVal}
                                headerSubtitle={PAYMENT_MODAL_HEADER_SUBTITLE}
                                onConfirm={handleConfirmPayment}
                            />
                        )}
                    </AnimatePresence>

                    <SelectProductVariantSheet
                        isOpen={!!variantPickerProduct}
                        product={variantPickerProduct}
                        onClose={() => setVariantPickerProduct(null)}
                        onConfirm={handleConfirmVariantSelection}
                    />

                    {itemToRemoveId && (
                        <AlertModal
                            isOpen={!!itemToRemoveId}
                            onClose={() => setItemToRemoveId(null)}
                            onConfirm={() => {
                                removeItem(itemToRemoveId)
                                setItemToRemoveId(null)
                                notifySuccess("Item removido.")
                            }}
                            title="Remover Item?"
                            description="Você tem certeza que deseja remover este item do carrinho?"
                            confirmText="Remover"
                            cancelText="Cancelar"
                            variant="danger"
                        />
                    )}

                    <DefaultModal
                        isOpen={!!editingItem}
                        onClose={() => setEditingItem(null)}
                        title="Editar dados do produto"
                        footer={
                            <div className="flex w-full items-center gap-3">
                                <Button variant="outline" className="flex-1" onClick={() => setEditingItem(null)}>
                                    Cancelar
                                </Button>
                                <Button className="flex-1" onClick={saveEditedItem}>
                                    Salvar
                                </Button>
                            </div>
                        }
                    >
                        {editingItem && (
                            <div className="space-y-6 pt-2">
                                <InfoCard color="gray" title="Produto" message={editingItem.name} />

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Input
                                        label="Quantidade"
                                        name="editQty"
                                        type="number"
                                        value={editQty}
                                        onChange={(e: any) => setEditQty(Number(e.target.value))}
                                    />
                                    <Input
                                        label="Sub total"
                                        readOnly
                                        value={formatCurrency(editPrice * editQty)}
                                        className="flex-1 w-full"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-1">
                                    <MoneyInput
                                        label="Valor unitário"
                                        value={editPrice}
                                        onChange={(value: number) => setEditPrice(value)}
                                    />
                                </div>
                            </div>
                        )}
                    </DefaultModal>

                    <DefaultModal
                        isOpen={isGlobalDiscountModalOpen}
                        onClose={() => setIsGlobalDiscountModalOpen(false)}
                        title="Aplicar Desconto"
                        footer={
                            <div className="flex w-full items-center gap-3">
                                <Button variant="outline" className="flex-1" onClick={() => setIsGlobalDiscountModalOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button className="flex-1" isLoading={isApplyingCoupon} onClick={async () => {
                                    if (globalDiscountType === "coupon") {
                                        setIsGlobalDiscountModalOpen(false)
                                        setIsCouponSheetOpen(true)
                                        return
                                    }
                                    setDiscountType(globalDiscountType)
                                    setDiscountAmount(globalDiscountValue)
                                    setDiscountCouponCode("")
                                    setIsGlobalDiscountModalOpen(false)
                                }}>
                                    Aplicar
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-6 pt-2">
                            <InfoCard color="green" title="Valor total de itens" message={formatCurrency(subtotal)} />
                            <div className="grid grid-cols-1 gap-3">
                                <ListItem
                                    onClick={() => setGlobalDiscountType("percentage")}
                                    icon={TagIcon}
                                    title="Porcentagem"
                                    description="Aplica um desconto percentual sobre o subtotal"
                                    className={`px-4 py-3 gap-4 ${globalDiscountType === "percentage" ? "border-brand-primary bg-brand-primary/5" : ""}`}
                                    right={
                                        <RadioButton
                                            name="globalDiscountType"
                                            value="percentage"
                                            checked={globalDiscountType === "percentage"}
                                            onChange={() => setGlobalDiscountType("percentage")}
                                        />
                                    }
                                />
                                <ListItem
                                    onClick={() => setGlobalDiscountType("fixed")}
                                    icon={MoneyIcon}
                                    title="Valor fixo"
                                    description="Aplica um valor fixo de desconto em reais"
                                    className={`px-4 py-3 gap-4 ${globalDiscountType === "fixed" ? "border-brand-primary bg-brand-primary/5" : ""}`}
                                    right={
                                        <RadioButton
                                            name="globalDiscountType"
                                            value="fixed"
                                            checked={globalDiscountType === "fixed"}
                                            onChange={() => setGlobalDiscountType("fixed")}
                                        />
                                    }
                                />
                                <ListItem
                                    onClick={() => setGlobalDiscountType("coupon")}
                                    icon={FileIcon}
                                    title="Cupom"
                                    description="Utiliza um cupom de desconto pré-cadastrado"
                                    className={`px-4 py-3 gap-4 ${globalDiscountType === "coupon" ? "border-brand-primary bg-brand-primary/5" : ""}`}
                                    right={
                                        <RadioButton
                                            name="globalDiscountType"
                                            value="coupon"
                                            checked={globalDiscountType === "coupon"}
                                            onChange={() => setGlobalDiscountType("coupon")}
                                        />
                                    }
                                />
                            </div>
                            {globalDiscountType === "fixed" && (
                                <MoneyInput
                                    label="Desconto do pedido"
                                    value={globalDiscountValue}
                                    onChange={(value: number) => setGlobalDiscountValue(value)}
                                />
                            )}
                            {globalDiscountType === "percentage" && (
                                <div className="space-y-3">
                                    <PercentageInput
                                        label="Porcentagem a ser aplicada"
                                        value={globalDiscountValue}
                                        onChange={(value: number) => setGlobalDiscountValue(value)}
                                    />
                                    <div className="flex flex-wrap gap-3">
                                        {percentagePresets.map((preset) => (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setGlobalDiscountValue(preset)}
                                                className="h-12 min-w-[72px] rounded-xl border border-transparent bg-gray-100 px-5 text-sm font-bold text-brand-dark transition-colors hover:border-brand-border hover:bg-gray-200 dark:bg-dark-border/30 dark:text-dark-heading dark:hover:bg-dark-border/50"
                                            >
                                                {preset}%
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {globalDiscountType === "coupon" && (
                                <div className="space-y-2">
                                    <InfoCard
                                        color="gray"
                                        title="Cupom de desconto"
                                        message="Selecione um cupom na lista de cupons cadastrados."
                                    />
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => {
                                            setIsGlobalDiscountModalOpen(false)
                                            setIsCouponSheetOpen(true)
                                        }}
                                    >
                                        Ver cupons cadastrados
                                    </Button>
                                </div>
                            )}
                        </div>
                    </DefaultModal>

                    {isMobile && (
                        <BottomSheet isOpen={isNotesSheetOpen} onClose={() => setIsNotesSheetOpen(false)} title="Adicionar Observação">
                            <div className="space-y-4 pt-2">
                                <textarea
                                    className="h-32 w-full resize-none rounded-xl border border-brand-border bg-[#F5F6F7] p-4 text-brand-dark focus:border-brand-primary focus:outline-none dark:border-dark-border dark:bg-dark-gray dark:text-dark-text"
                                    placeholder="Digite alguma observação que sairá no pedido..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                                <div className="flex items-center gap-3">
                                    <Button variant="outline" className="flex-1" onClick={() => setIsNotesSheetOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button className="flex-1" onClick={() => setIsNotesSheetOpen(false)}>
                                        Confirmar
                                    </Button>
                                </div>
                            </div>
                        </BottomSheet>
                    )}

                    {!isMobile && (
                        <DesktopPOSSheet
                            isOpen={isNotesSheetOpen}
                            onClose={() => setIsNotesSheetOpen(false)}
                            title="Adicionar Observação"
                        >
                            <div className="flex h-full flex-col p-6">
                                <textarea
                                    className="h-40 w-full resize-none rounded-xl border border-brand-border bg-[#F5F6F7] p-4 text-brand-dark focus:border-brand-primary focus:outline-none dark:border-dark-border dark:bg-dark-gray dark:text-dark-text"
                                    placeholder="Digite alguma observação que sairá no pedido..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                                <div className="mt-4 flex items-center gap-3 border-t border-brand-border pt-4 dark:border-dark-border">
                                    <Button variant="outline" className="flex-1" onClick={() => setIsNotesSheetOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button className="flex-1" onClick={() => setIsNotesSheetOpen(false)}>
                                        Confirmar
                                    </Button>
                                </div>
                            </div>
                        </DesktopPOSSheet>
                    )}

                    <SelectCustomerSheet
                        isOpen={isSelectCustomerOpen}
                        onClose={() => {
                            setIsSelectCustomerOpen(false)
                            setCustomerSelectIntent("default")
                        }}
                        onSelect={(customer) => {
                            setSelectedCustomerId(customer.id)
                            setCustomers((prev) => {
                                if (prev.some((c) => c.id === customer.id)) return prev
                                return [{ id: customer.id, name: customer.name, email: customer.email ?? null }, ...prev]
                            })
                            setIsSelectCustomerOpen(false)
                            if (customerSelectIntent === "shipping-preflight") {
                                setCustomerSelectIntent("default")
                                void openShippingSheetWithCustomer(customer.id)
                            }
                        }}
                        partnerId={partnerId}
                        onCreateCustomer={handleCreateQuickCustomer}
                        selectedCustomerId={selectedCustomerId}
                        pinnedCustomer={pinnedCustomerForSheet}
                        onRequestRemoveSelected={
                            selectedCustomerId
                                ? () => {
                                    setIsSelectCustomerOpen(false)
                                    setIsRemoveCustomerAlertOpen(true)
                                }
                                : undefined
                        }
                    />

                    <SelectSellerSheet
                        isOpen={isSelectSellerOpen}
                        onClose={() => setIsSelectSellerOpen(false)}
                        onSelect={(seller) => {
                            setSelectedSellerId(seller.id)
                            setIsSelectSellerOpen(false)
                        }}
                    />

                    <SelectCouponSheet
                        isOpen={isCouponSheetOpen}
                        onClose={() => setIsCouponSheetOpen(false)}
                        partnerId={partnerId}
                        subtotal={subtotal}
                        selectedCustomerId={selectedCustomerId || null}
                        appliedCouponId={appliedCouponId}
                        onApplyCoupon={async (coupon) => {
                            await applyCouponCode(coupon.code)
                            setIsCouponSheetOpen(false)
                        }}
                        onRemoveCoupon={async () => {
                            if (activePreSaleId) {
                                await removeCouponFromPreSaleAction({ partnerId, preSaleId: activePreSaleId })
                            }
                            setAppliedCouponId(null)
                            setAppliedCouponCode(null)
                            setAppliedCouponDiscount(0)
                            setGlobalDiscountType("fixed")
                            setGlobalDiscountCouponCode("")
                            setDiscountAmount(0)
                            notifySuccess("Cupom removido.")
                        }}
                    />

                    <POSQuickProductSheet
                        isOpen={isQuickProductSheetOpen}
                        onClose={() => setIsQuickProductSheetOpen(false)}
                        onCreate={handleCreateQuickProduct}
                        isCreating={isCreatingQuickProduct}
                    />

                    <POSShippingSheet
                        isOpen={isShippingSheetOpen}
                        onClose={() => setIsShippingSheetOpen(false)}
                        selectedCustomerId={selectedCustomerId}
                        customerDetails={shippingCustomerDetails}
                        currentShippingFee={shippingFee}
                        partnerId={partnerId}
                        onCreateAddress={handleCreateShippingAddress}
                        onApply={({ shippingFee: fee, distanceKm, breakdown }) => {
                            setShippingFee(Math.max(0, Number(fee || 0)))
                            setDeliveryDistanceKm(distanceKm ?? null)
                            setDeliveryBreakdown((breakdown as Record<string, unknown>) || null)
                            setIsShippingSheetOpen(false)
                        }}
                    />

                    <DefaultModal
                        isOpen={isSavingDraft && isUserDraftSaveUi}
                        onClose={() => { }}
                        title=""
                        maxWidth="sm"
                        hideHeader
                    >
                        <div className="flex flex-col items-center justify-center gap-6 p-6">
                            <img src="https://img.dudit.com.br/static/mascots/Aguarde.png" alt="Aguarde" className="h-36 w-36 object-contain" />
                            <p className="text-center text-lg font-semibold leading-tight text-brand-dark dark:text-dark-heading">
                                Salvando pedido...
                            </p>
                        </div>
                    </DefaultModal>

                    <AlertModal
                        isOpen={isResetAlertOpen}
                        onClose={() => setIsResetAlertOpen(false)}
                        onConfirm={async () => {
                            if (activePreSaleId) {
                                await removeDraft(activePreSaleId)
                            } else {
                                clearCurrentOrder()
                            }
                            setIsResetAlertOpen(false)
                        }}
                        title="Limpar pedido?"
                        description="Todos os itens adicionados serão removidos do pedido atual."
                        confirmText="Limpar"
                        cancelText="Cancelar"
                        variant="danger"
                    />

                    <AlertModal
                        isOpen={isLeaveWithoutSaveAlertOpen}
                        onClose={() => {
                            setIsLeaveWithoutSaveAlertOpen(false)
                            setPendingLeaveHref(null)
                        }}
                        onConfirm={() => {
                            const destination = pendingLeaveHref
                            setIsLeaveWithoutSaveAlertOpen(false)
                            setPendingLeaveHref(null)
                            if (destination) {
                                bypassBeforeUnloadRef.current = true
                                window.location.assign(destination)
                            }
                        }}
                        title="Sair sem salvar?"
                        description="Você tem alterações no pedido que ainda não foram salvas."
                        confirmText="Sair sem salvar"
                        cancelText="Continuar editando"
                        variant="warning"
                    />
                    <AlertModal
                        isOpen={isRemoveCustomerAlertOpen}
                        onClose={() => setIsRemoveCustomerAlertOpen(false)}
                        onConfirm={() => {
                            setSelectedCustomerId(undefined)
                            setShippingCustomerDetails(null)
                            setIsRemoveCustomerAlertOpen(false)
                        }}
                        title="Remover cliente?"
                        description="O cliente será desvinculado deste pedido. Você pode selecionar outro a qualquer momento."
                        confirmText="Remover"
                        cancelText="Cancelar"
                        variant="warning"
                    />
                </FadeIn>
            )}
        </AnimatePresence>
    )
}
