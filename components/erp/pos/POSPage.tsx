"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TrashIcon, ChevronRightIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, AlertModal, DefaultModal, MoneyInput, InfoCard, Input } from "@/components/reusable"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useNotification } from "@/hooks/use-notification"
import {
  deletePreSaleDraftAction,
  finalizePreSaleAction,
  upsertPreSaleDraftAction,
} from "@/app/actions/erp/pos"
import { openCashSessionAction } from "@/app/actions/erp/cash-register"
import { getTeamMembers } from "@/app/actions/erp/team"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import SelectSellerSheet from "@/components/erp/pos/SelectSellerSheet"
import PaymentModal from "@/components/erp/orders/PaymentModal"
import POSCartItemCard from "@/components/erp/pos/POSCartItemCard"
import { POSMorePreSalesCard, POSPreSaleCard } from "@/components/erp/pos/POSPreSaleCard"
import POSCashClosedView from "@/components/erp/pos/POSCashClosedView"
import POSHeader from "@/components/erp/pos/POSHeader"
import POSDesktopOrderPanel, { POSOrderSummaryContent } from "@/components/erp/pos/POSOrderSummaryCard"
import type {
  PDVCartItem as CartItem,
  PDVCustomer as Customer,
  PDVFinanceAccount as FinanceAccount,
  PDVPaymentBreakdownEntry as PaymentBreakdownEntry,
  PDVPaymentMethodOption as PaymentMethodOption,
  PDVPreSale as PreSale,
  PDVProduct as Product,
} from "@/lib/types/pdv"
import { normalizePDVPaymentMethodLabel, normalizePDVSearchTerm } from "@/lib/utils/pdv"

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
}

export default function POSPage({ partnerId, initialData, initialActiveSession }: Props) {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const isMobile = useMediaQuery("(max-width: 1024px)")

  const products = initialData.products || []
  const customers = initialData.customers || []
  const accounts = initialData.financeAccounts || []
  const paymentMethods = initialData.paymentMethods || []
  const [preSales, setPreSales] = useState<PreSale[]>(initialData.preSales || [])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [activeCashSession, setActiveCashSession] = useState<any | null>(initialActiveSession || null)

  const isCashierOpen = !!activeCashSession?.id
  const [selectedCategory, setSelectedCategory] = useState("All Product")
  const [search, setSearch] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined)
  const [selectedSellerId, setSelectedSellerId] = useState<string | undefined>(undefined)
  const financeAccountId = useMemo(
    () => accounts.find((account) => account.is_default)?.id || accounts[0]?.id,
    [accounts]
  )
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed")
  const [shippingFee, setShippingFee] = useState(0)
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
  const [editDiscount, setEditDiscount] = useState(0)
  const [editDiscountType, setEditDiscountType] = useState<"fixed" | "percentage">("fixed")
  const [isGlobalDiscountModalOpen, setIsGlobalDiscountModalOpen] = useState(false)

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
    return ["All Product", ...Array.from(cats)]
  }, [products])

  useEffect(() => {
    async function loadTeam() {
      const res = await getTeamMembers()
      if (!res.error && res.members) {
        setTeamMembers(res.members)
      }
    }
    loadTeam()
  }, [])

  const isFinalizingRef = useRef(false)
  const isSavingDraftRef = useRef(false)
  const desktopScrollClass = "custom-scrollbar max-lg:hide-scrollbar"

  const filteredProducts = useMemo(() => {
    let result = products
    const term = normalizePDVSearchTerm(search)

    if (selectedCategory !== "All Product") {
      result = result.filter((product) => product.category === selectedCategory)
    }

    if (term) {
      result = result.filter((product) => normalizePDVSearchTerm(product.name).includes(term))
    }

    return result
  }, [products, search, selectedCategory])

  const itemCount = useMemo(() => cart.reduce((acc, item) => acc + item.qty, 0), [cart])
  const subtotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.qty), 0), [cart])
  const discountVal = useMemo(() => {
    if (discountType === "percentage") {
      return (subtotal * discountAmount) / 100
    }
    return discountAmount
  }, [subtotal, discountAmount, discountType])
  const total = useMemo(() => Math.max(0, subtotal - discountVal + shippingFee + otherCosts), [subtotal, discountVal, shippingFee, otherCosts])
  const mobileCategoryLabel = selectedCategory === "All Product" ? "Categorias" : selectedCategory
  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId) || null : null),
    [customers, selectedCustomerId]
  )
  const paymentModalCart = useMemo(
    () => cart.map((item) => ({
      ...item,
      unitPrice: item.price,
      quantity: item.qty,
    })),
    [cart]
  )

  const getPaymentMethodId = useCallback((methodLabel?: string | null) => {
    const normalizedLabel = normalizePDVSearchTerm(methodLabel)
    if (!normalizedLabel) return null

    const byType = paymentMethods.find((method) => {
      const type = normalizePDVSearchTerm(method.type)
      const name = normalizePDVSearchTerm(method.name)

      if (normalizedLabel === "dinheiro") {
        return type === "cash" || name.includes("dinheiro")
      }

      if (normalizedLabel === "pix") {
        return type === "pix" || name.includes("pix")
      }

      if (normalizedLabel === "cartao" || normalizedLabel === "cartão") {
        return ["card", "credit_card", "debit_card", "credito", "debito"].includes(type)
          || name.includes("cartao")
          || name.includes("cartão")
      }

      return false
    })

    if (byType?.id) return byType.id

    const byName = paymentMethods.find((method) => normalizePDVSearchTerm(method.name) === normalizedLabel)
    return byName?.id || null
  }, [paymentMethods])

  const addToCart = useCallback((product: Product, variantId?: string | null) => {
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
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            productId: product.id,
            variantId: variantId || null,
            name: product.name,
            variantName: selectedVariant?.variant_name || null,
            price: Number(product.price || 0) + Number(selectedVariant?.price_adjustment || 0),
            qty: 1,
            image: (selectedVariant?.variant_options?.image as string | undefined) || product.images?.[0] || null,
          },
        ]
      }

      const nextQty = found.qty + 1
      if (!product.allow_sell_without_stock && nextQty > availableStock) {
        notifyError(`Estoque insuficiente para o item ${found.name}${found.variantName ? ` - ${found.variantName}` : ""}`)
        return prev
      }

      return prev.map((item) => (item.id === found.id ? { ...item, qty: nextQty } : item))
    })
  }, [notifyError])

  const changeQty = useCallback((itemId: string, delta: number) => {
    setCart((prev) => prev
      .map((item) => {
        if (item.id !== itemId) return item
        const nextQty = Math.max(0, item.qty + delta)
        const product = products.find((currentProduct) => currentProduct.id === item.productId)
        const variant = item.variantId ? product?.product_variants?.find((currentVariant) => currentVariant.id === item.variantId) : null
        const availableStock = variant ? Number(variant.stock_available || 0) : Number(product?.stock_available || 0)

        if (product && !product.allow_sell_without_stock && nextQty > availableStock) {
          notifyError(`Estoque insuficiente para o item ${item.name}`)
          return item
        }

        return { ...item, qty: nextQty }
      })
      .filter((item) => item.qty > 0))
  }, [products, notifyError])

  const removeItem = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId))
  }, [])

  const persistDraft = async () => {
    if (cart.length === 0) return null
    if (isSavingDraftRef.current) return null

    isSavingDraftRef.current = true
    setIsSavingDraft(true)
    try {
      const result = await upsertPreSaleDraftAction({
        partnerId,
        preSaleId: activePreSaleId || undefined,
        customerId: selectedCustomerId,
        notes,
        subtotal,
        discountAmount,
        totalAmount: total,
        items: cart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          variantName: item.variantName,
          name: item.name,
          qty: item.qty,
          price: item.price,
          totalPrice: item.price * item.qty,
          image: item.image,
        })),
      })

      if (!result.success) {
        notifyError(result.error || "Falha ao salvar pré-venda.")
        return null
      }

      const saved = result.data as PreSale
      setActivePreSaleId(saved.id)
      setPreSales((prev) => [saved, ...prev.filter((preSale) => preSale.id !== saved.id)].slice(0, 20))
      return saved.id
    } finally {
      setIsSavingDraft(false)
      isSavingDraftRef.current = false
    }
  }

  const loadPreSale = useCallback((preSale: PreSale) => {
    const items = (Array.isArray(preSale.items) ? preSale.items : []).map((item: any) => ({
      id: crypto.randomUUID(),
      productId: item.product_id ?? item.productId ?? null,
      variantId: item.variant_id ?? item.variantId ?? null,
      variantName: item.variant_name || item.variantName || null,
      name: item.name,
      price: Number((item.unit_price ?? item.price) || 0),
      qty: Number((item.quantity ?? item.qty) || 0),
      image: item.image || null,
    }))

    setActivePreSaleId(preSale.id)
    setSelectedCustomerId(preSale.customer_id || undefined)
    setDiscountAmount(Number(preSale.discount_amount || 0))
    setNotes(preSale.notes || "")
    setCart(items)
  }, [])

  const clearCurrentOrder = useCallback(() => {
    setActivePreSaleId(null)
    setSelectedCustomerId(undefined)
    setDiscountAmount(0)
    setNotes("")
    setCart([])
  }, [])

  const removeDraft = async (preSaleId: string) => {
    const result = await deletePreSaleDraftAction(partnerId, preSaleId)
    if (!result.success) {
      notifyError(result.error || "Não foi possível excluir a pré-venda.")
      return
    }

    setPreSales((prev) => prev.filter((item) => item.id !== preSaleId))
    if (activePreSaleId === preSaleId) clearCurrentOrder()
  }

  const ensurePreSaleToFinalize = async () => {
    let preSaleIdToFinalize = activePreSaleId

    if (!preSaleIdToFinalize) {
      const createdDraftId = await persistDraft()
      if (!createdDraftId) {
        notifyError("Não foi possível gerar a pré-venda.")
        return null
      }
      setActivePreSaleId(createdDraftId)
      preSaleIdToFinalize = createdDraftId
    }

    return preSaleIdToFinalize
  }

  const handleOpenPaymentModal = useCallback(() => {
    if (cart.length === 0) {
      notifyError("Adicione itens para continuar.")
      return
    }

    setIsMobileSummarySheetOpen(false)
    setIsMobileItemsSheetOpen(false)
    setIsPaymentModalOpen(true)
  }, [cart.length, notifyError])

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
        method: normalizePDVPaymentMethodLabel(entry.method),
        amount: Number(entry.amount || 0),
        paymentMethodId: getPaymentMethodId(entry.method),
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
      clearCurrentOrder()
      setIsMobileSummarySheetOpen(false)
      setIsMobileItemsSheetOpen(false)
      return { success: true, orderNumber: result.data?.saleId }
    } finally {
      setIsFinalizing(false)
      isFinalizingRef.current = false
    }
  }

  useEffect(() => {
    if (!editingItem) return
    setEditQty(editingItem.qty)
    setEditPrice(editingItem.price)
    setEditDiscount(0)
    setEditDiscountType("fixed")
  }, [editingItem])

  const saveEditedItem = () => {
    if (!editingItem) return

    let finalUnitPrice = editPrice
    if (editDiscount > 0) {
      if (editDiscountType === "fixed") {
        finalUnitPrice = Math.max(0, editPrice - editDiscount)
      } else {
        finalUnitPrice = Math.max(0, editPrice * (1 - editDiscount / 100))
      }
    }

    setCart((prev) => prev.map((item) => (item.id === editingItem.id ? { ...item, qty: editQty, price: finalUnitPrice } : item)))
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

  const handleShippingPrompt = useCallback(() => {
    const fee = prompt("Valor do frete:")
    if (fee) setShippingFee(Number(fee))
  }, [])

  const cartItemsList = (
    <div className={`space-y-3 flex-1 overflow-y-auto pr-1 ${desktopScrollClass}`}>
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

  if (!isCashierOpen) {
    return (
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
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col gap-4">
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
            onOpenCustomerSheet={() => setIsSelectCustomerOpen(true)}
            selectedSellerId={selectedSellerId}
            teamMembers={teamMembers}
            onOpenSellerSheet={() => setIsSelectSellerOpen(true)}
          />

          <div className={`mt-2 grid grid-cols-2 gap-3 overflow-y-auto pr-1 pb-24 md:grid-cols-4 xl:grid-cols-5 xl:pb-6 2xl:grid-cols-6 ${desktopScrollClass}`}>
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
                    <span className="absolute left-2 top-2 rounded-lg bg-brand-dark/80 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                      {Math.max(0, Number(product.stock_available || 0))} Stock
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
          </div>

          <AnimatePresence>
            {cart.length === 0 && preSales.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-auto border-t border-brand-border pt-6"
              >
                <h4 className="mb-4 text-xl font-bold tracking-tight text-brand-dark">Pedidos em pré-venda</h4>
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
              onSaveDraft={persistDraft}
              onAddShipping={handleShippingPrompt}
              onOpenNotes={() => setIsNotesSheetOpen(true)}
              showItemsShortcut={false}
            />
            <div className="mt-4">{cartItemsList}</div>
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
            onSaveDraft={persistDraft}
            onAddShipping={handleShippingPrompt}
            onOpenNotes={() => setIsNotesSheetOpen(true)}
          />
        </div>
      </BottomSheet>

      <BottomSheet isOpen={isMobileItemsSheetOpen} onClose={() => setIsMobileItemsSheetOpen(false)}>
        <div className="space-y-5 px-1 pb-2">
          <div>
            <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Itens do Pedido</h3>
            <p className="mt-1 text-sm text-brand-inactive-text dark:text-dark-body">{itemCount} item(ns) no pedido</p>
          </div>
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
      </BottomSheet>

      <AnimatePresence>
        {isPaymentModalOpen && (
          <PaymentModal
            isOpen={isPaymentModalOpen}
            onClose={() => setIsPaymentModalOpen(false)}
            cart={paymentModalCart}
            customer={selectedCustomer}
            partnerId={partnerId}
            shippingFee={shippingFee}
            otherCosts={otherCosts}
            discountAmount={discountVal}
            onConfirm={handleConfirmPayment}
          />
        )}
      </AnimatePresence>

      {variantPickerProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[32px] bg-white p-6 shadow-2xl">
            <h4 className="mb-4 text-xl font-bold tracking-tight text-brand-dark">Selecionar Variação</h4>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1 hide-scrollbar">
              {variantPickerProduct.product_variants?.map((variant) => {
                const variantStock = Number(variant.stock_available || 0)
                const variantPrice = Number(variantPickerProduct.price || 0) + Number(variant.price_adjustment || 0)
                return (
                  <button
                    key={variant.id}
                    disabled={!variantPickerProduct.allow_sell_without_stock && variantStock <= 0}
                    className="group flex w-full items-center justify-between rounded-2xl border border-brand-border bg-brand-gray p-4 text-left transition-all hover:border-brand-primary active:scale-95 disabled:opacity-50"
                    onClick={() => {
                      if (!variantPickerProduct.allow_sell_without_stock && variantStock <= 0) {
                        notifyError(`Estoque insuficiente para o item ${variantPickerProduct.name} - ${variant.variant_name}`)
                        return
                      }
                      addToCart(variantPickerProduct, variant.id)
                      setVariantPickerProduct(null)
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-brand-dark">{variant.variant_name}</p>
                      <p className="mt-0.5 text-xs font-medium text-brand-inactive-text">Disponível: {variantStock}</p>
                    </div>
                    <span className="rounded-xl border border-brand-border bg-white px-3 py-1.5 font-bold text-brand-dark group-hover:border-brand-primary">
                      {formatCurrency(variantPrice)}
                    </span>
                  </button>
                )
              })}
            </div>
            <Button variant="outline" className="mt-6 h-12 w-full rounded-full font-bold" onClick={() => setVariantPickerProduct(null)}>
              Fechar
            </Button>
          </div>
        </div>
      )}

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

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Quantidade"
                name="editQty"
                type="number"
                value={editQty}
                onChange={(e: any) => setEditQty(Number(e.target.value))}
              />
              <MoneyInput
                label="Desconto"
                value={editDiscount}
                onChange={(value: number) => setEditDiscount(value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <MoneyInput
                label="Valor unitário"
                value={editPrice}
                onChange={(value: number) => setEditPrice(value)}
              />
              <Input
                label="Sub total"
                readOnly
                value={formatCurrency(
                  (editDiscountType === "fixed"
                    ? Math.max(0, editPrice - editDiscount)
                    : Math.max(0, editPrice * (1 - editDiscount / 100))) * editQty
                )}
                className="flex-1 w-full"
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
            <Button className="flex-1" onClick={() => {
              if (editDiscountType === "fixed") {
                setDiscountAmount(editDiscount)
              } else {
                setDiscountAmount(total * (editDiscount / 100))
              }
              setIsGlobalDiscountModalOpen(false)
            }}>
              Aplicar
            </Button>
          </div>
        }
      >
        <div className="space-y-6 pt-2">
          <InfoCard color="green" title="Valor total de itens" message={formatCurrency(total)} />
          <MoneyInput
            label="Desconto do pedido"
            value={editDiscount}
            onChange={(value: number) => setEditDiscount(value)}
          />
        </div>
      </DefaultModal>

      {isNotesSheetOpen && (
        <DefaultModal
          isOpen={isNotesSheetOpen}
          onClose={() => setIsNotesSheetOpen(false)}
          title="Adicionar Observação"
          footer={
            <div className="flex w-full items-center gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsNotesSheetOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={() => setIsNotesSheetOpen(false)}>
                Confirmar
              </Button>
            </div>
          }
        >
          <div className="pt-2">
            <textarea
              className="h-32 w-full resize-none rounded-xl border border-brand-border bg-[#F5F6F7] p-4 text-brand-dark focus:border-brand-primary focus:outline-none dark:border-dark-border dark:bg-dark-gray dark:text-dark-text"
              placeholder="Digite alguma observação que sairá no pedido..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </DefaultModal>
      )}

      <SelectCustomerSheet
        isOpen={isSelectCustomerOpen}
        onClose={() => setIsSelectCustomerOpen(false)}
        onSelect={(customer) => {
          setSelectedCustomerId(customer.id)
          setIsSelectCustomerOpen(false)
        }}
        partnerId={partnerId}
      />

      <SelectSellerSheet
        isOpen={isSelectSellerOpen}
        onClose={() => setIsSelectSellerOpen(false)}
        onSelect={(seller) => {
          setSelectedSellerId(seller.id)
          setIsSelectSellerOpen(false)
        }}
      />

      <AlertModal
        isOpen={isResetAlertOpen}
        onClose={() => setIsResetAlertOpen(false)}
        onConfirm={() => {
          clearCurrentOrder()
          setIsResetAlertOpen(false)
        }}
        title="Limpar pedido?"
        description="Todos os itens adicionados serão removidos do pedido atual."
        confirmText="Limpar"
        cancelText="Cancelar"
        variant="warning"
      />
    </motion.div>
  )
}
