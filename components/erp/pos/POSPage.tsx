"use client"

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  SaveIcon,
  UserIcon,
  TagIcon,
  ClockIcon,
  EditIcon,
  ThreeDotsIcon,
  ChevronRightIcon
} from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import {
  Button,
  Input,
  IconPlaceholder,
  AlertModal,
  DefaultModal,
  MoneyInput,
  InfoCard,
} from "@/components/reusable"
import Dropdown from "@/components/reusable/Dropdown"
import DropdownItem from "@/components/reusable/DropdownItem"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useNotification } from "@/hooks/use-notification"
import {
  deletePreSaleDraftAction,
  finalizePreSaleAction,
  upsertPreSaleDraftAction,
} from "@/app/actions/erp/pos"
import { getTeamMembers } from "@/app/actions/erp/team"
import SelectCustomerSheet from "@/components/erp/clientes/SelectCustomerSheet"
import SelectSellerSheet from "@/components/erp/pos/SelectSellerSheet"

type Product = {
  id: string
  name: string
  category?: string | null
  sku?: string | null
  price: number
  stock_available: number
  allow_sell_without_stock?: boolean
  images?: string[] | null
  product_variants?: Array<{
    id: string
    variant_name: string
    sku?: string | null
    price_adjustment?: number | null
    stock_available?: number | null
    variant_options?: Record<string, any> | null
  }>
}

type PreSale = {
  id: string
  customer_id: string | null
  subtotal: number
  discount_amount: number
  total_amount: number
  notes: string | null
  status: "draft" | "completed"
  items: any[]
  created_at: string
  updated_at: string
}

type Customer = { id: string; name: string }
type FinanceAccount = { id: string; name: string; is_default?: boolean; is_active?: boolean }
type CartItem = {
  id: string
  productId: string | null
  variantId: string | null
  name: string
  variantName: string | null
  price: number
  qty: number
  image: string | null
}

interface Props {
  partnerId: string
  initialData: {
    products: Product[]
    customers: Customer[]
    financeAccounts: FinanceAccount[]
    preSales: PreSale[]
  }
}

// Extracted memoized component to avoid unnecessary re-renders
const CartItemCard = memo(function CartItemCard({
  item,
  onChangeQty,
  onRemove,
  onEdit,
}: {
  item: CartItem
  onChangeQty: (itemId: string, delta: number) => void
  onRemove: (itemId: string) => void
  onEdit: (item: CartItem) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-brand-border p-3">
      <div className="flex items-center gap-3">
        <img
          src={getR2ImageUrl(item.image, "thumbnail")}
          alt={item.name}
          className="w-16 h-16 rounded-xl object-cover bg-brand-gray"
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-brand-dark truncate">{item.name}</p>
          {item.variantName && (
            <p className="text-xs text-brand-inactive-text truncate">{item.variantName}</p>
          )}
          <p className="text-sm text-brand-inactive-text">{formatCurrency(item.price)}</p>
          <div className="mt-2 flex items-center gap-2">
            <button className="w-7 h-7 rounded-full border border-brand-border flex items-center justify-center" onClick={() => onChangeQty(item.id, -1)}>
              <MinusIcon size={14} />
            </button>
            <span className="min-w-8 text-center font-bold">{String(item.qty).padStart(2, "0")}</span>
            <button className="w-7 h-7 rounded-full bg-brand-primary text-white flex items-center justify-center" onClick={() => onChangeQty(item.id, 1)}>
              <PlusIcon size={14} />
            </button>
          </div>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
          <div className="flex gap-1.5">
            <button
              className="w-8 h-8 rounded-full text-brand-inactive-text bg-[#F5F6F7] flex items-center justify-center hover:bg-brand-gray transition-colors"
              onClick={() => onEdit(item)}
            >
              <EditIcon size={14} />
            </button>
            <button
              className="w-8 h-8 rounded-full text-red-500 bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors"
              onClick={() => onRemove(item.id)}
            >
              <TrashIcon size={14} />
            </button>
          </div>
          <div className="mt-1">
            <p className="text-[10px] text-brand-inactive-text uppercase font-bold tracking-wider">Total</p>
            <p className="font-bold text-brand-dark">{formatCurrency(item.price * item.qty)}</p>
          </div>
        </div>
      </div>
    </div>
  )
})

const PreSaleCard = ({ preSale, index, customers, onClick }: { preSale: PreSale, index: number, customers: Customer[], onClick: () => void }) => (
  <button
    onClick={onClick}
    className="bg-white dark:bg-dark-surface rounded-[20px] border border-brand-border dark:border-dark-border p-4 flex flex-col gap-3 group text-left min-w-[280px]"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
          <ClockIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
        </div>
        <span className="font-bold text-brand-dark dark:text-dark-text text-lg">Nº {index + 1}</span>
      </div>
      <div className="bg-brand-gray dark:bg-dark-border/50 px-3 py-0.5 rounded-full">
        <span className="text-[11px] font-medium text-brand-inactive-text">
          {new Date(preSale.created_at).toLocaleString("pt-BR", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', ' às')}
        </span>
      </div>
    </div>
    <div className="flex items-center justify-between mt-1">
      <span className="text-sm font-medium text-brand-inactive-text truncate max-w-[150px]">
        {customers.find((c) => c.id === preSale.customer_id)?.name || "Cliente Balcão"}
      </span>
      <span className="text-brand-primary font-bold text-lg">
        {formatCurrency(Number(preSale.total_amount || 0))}
      </span>
    </div>
  </button>
)

const MorePreSalesCard = ({ count, onClick }: { count: number, onClick: () => void }) => (
  <button
    onClick={onClick}
    className="bg-white rounded-[20px] border border-brand-border p-4 flex items-center justify-center hover:shadow-md transition-shadow min-w-[100px] h-full"
  >
    <span className="text-brand-primary font-bold text-2xl">+{count}</span>
  </button>
)

export default function POSPage({ partnerId, initialData }: Props) {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const isMobile = useMediaQuery("(max-width: 1024px)")

  const [products] = useState<Product[]>(initialData.products || [])
  const [customers] = useState<Customer[]>(initialData.customers || [])
  const [accounts] = useState<FinanceAccount[]>(initialData.financeAccounts || [])
  const [preSales, setPreSales] = useState<PreSale[]>(initialData.preSales || [])
  const [teamMembers, setTeamMembers] = useState<any[]>([])

  const [isCashierOpen, setIsCashierOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("All Product")
  const [search, setSearch] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined)
  const [selectedSellerId, setSelectedSellerId] = useState<string | undefined>(undefined)
  const [financeAccountId, setFinanceAccountId] = useState<string | undefined>(
    accounts.find((account) => account.is_default)?.id || accounts[0]?.id
  )
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed')
  const [shippingFee, setShippingFee] = useState(0)
  const [otherCosts, setOtherCosts] = useState(0)
  const [notes, setNotes] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [activePreSaleId, setActivePreSaleId] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null)
  const [isSelectCustomerOpen, setIsSelectCustomerOpen] = useState(false)
  const [isSelectSellerOpen, setIsSelectSellerOpen] = useState(false)
  const [isResetAlertOpen, setIsResetAlertOpen] = useState(false)
  const [isPreSaleSheetOpen, setIsPreSaleSheetOpen] = useState(false)
  const [itemToRemoveId, setItemToRemoveId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<CartItem | null>(null)

  // States for Editing Item Modal
  const [editQty, setEditQty] = useState(1)
  const [editPrice, setEditPrice] = useState(0)
  const [editDiscount, setEditDiscount] = useState(0)
  const [editDiscountType, setEditDiscountType] = useState<"fixed" | "percentage">("fixed")

  const [isGlobalDiscountModalOpen, setIsGlobalDiscountModalOpen] = useState(false)

  // Breakpoints for responsive pre-sale list
  const isXL = useMediaQuery("(min-width: 1280px)")
  const isLG = useMediaQuery("(min-width: 1024px)")
  const isMD = useMediaQuery("(min-width: 768px)")

  const preSaleLimit = useMemo(() => {
    if (isXL) return 4
    if (isLG) return 3
    if (isMD) return 2
    return 1
  }, [isXL, isLG, isMD])

  // Categories extraction
  const categories = useMemo(() => {
    const cats = new Set<string>()
    products.forEach((p) => {
      if (p.category) cats.add(p.category)
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

  // Refs for concurrency guards
  const isFinalizingRef = useRef(false)
  const isSavingDraftRef = useRef(false)

  const filteredProducts = useMemo(() => {
    let result = products
    const term = search.trim().toLowerCase()

    if (selectedCategory !== "All Product") {
      result = result.filter(p => p.category === selectedCategory)
    }

    if (term) {
      result = result.filter((product) =>
        `${product.name} ${product.sku || ""}`.toLowerCase().includes(term)
      )
    }
    return result
  }, [products, search, selectedCategory])

  const itemCount = useMemo(() => cart.reduce((acc, item) => acc + item.qty, 0), [cart])
  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + (item.price * item.qty), 0),
    [cart]
  )

  const discountVal = useMemo(() => {
    if (discountType === 'percentage') {
      return (subtotal * discountAmount) / 100
    }
    return discountAmount
  }, [subtotal, discountAmount, discountType])

  const total = useMemo(() => {
    return Math.max(0, subtotal - discountVal + shippingFee + otherCosts)
  }, [subtotal, discountVal, shippingFee, otherCosts])

  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers]
  )
  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.name })),
    [accounts]
  )

  const getCartItemStock = useCallback((item: CartItem) => {
    const product = products.find((p) => p.id === item.productId)
    if (!product) return 0
    if (item.variantId) {
      const variant = product.product_variants?.find((v) => v.id === item.variantId)
      return Number(variant?.stock_available || 0)
    }
    return Number(product.stock_available || 0)
  }, [products])

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
  }, [products, notifyError])

  const changeQty = useCallback((itemId: string, delta: number) => {
    setCart((prev) => prev
      .map((item) => {
        if (item.id !== itemId) return item
        const nextQty = Math.max(0, item.qty + delta)
        const product = products.find((p) => p.id === item.productId)
        const variant = item.variantId ? product?.product_variants?.find((v) => v.id === item.variantId) : null
        const availableStock = variant ? Number(variant.stock_available || 0) : Number(product?.stock_available || 0)
        if (
          product &&
          !product.allow_sell_without_stock &&
          nextQty > availableStock
        ) {
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
      setPreSales((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)].slice(0, 20))
      return saved.id
    } finally {
      setIsSavingDraft(false)
      isSavingDraftRef.current = false
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      if (cart.length > 0) {
        persistDraft()
      }
    }, 60000) // Changed to 1 minute
    return () => clearInterval(timer)
  }, [cart, selectedCustomerId, discountAmount, notes, persistDraft])
  // eslint-disable-line react-hooks/exhaustive-deps

  const loadPreSale = (preSale: PreSale) => {
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
    setMobileOpen(true)
  }

  const clearCurrentOrder = () => {
    setActivePreSaleId(null)
    setSelectedCustomerId(undefined)
    setDiscountAmount(0)
    setNotes("")
    setCart([])
  }

  const removeDraft = async (preSaleId: string) => {
    const result = await deletePreSaleDraftAction(partnerId, preSaleId)
    if (!result.success) {
      notifyError(result.error || "Não foi possível excluir a pré-venda.")
      return
    }
    setPreSales((prev) => prev.filter((item) => item.id !== preSaleId))
    if (activePreSaleId === preSaleId) clearCurrentOrder()
  }

  const finalizeSale = async () => {
    if (cart.length === 0) {
      notifyError("Adicione itens para finalizar.")
      return
    }
    // Prevent double-click finalization via ref guard
    if (isFinalizingRef.current) return
    isFinalizingRef.current = true

    let preSaleIdToFinalize = activePreSaleId
    if (!preSaleIdToFinalize) {
      const createdDraftId = await persistDraft()
      if (!createdDraftId) {
        isFinalizingRef.current = false
        notifyError("Não foi possível gerar a pré-venda.")
        return
      }
      setActivePreSaleId(createdDraftId)
      preSaleIdToFinalize = createdDraftId
    }

    setIsFinalizing(true)
    try {
      const result = await finalizePreSaleAction({
        partnerId,
        preSaleId: preSaleIdToFinalize as string,
        financeAccountId: financeAccountId || null,
        paidAmount: total,
        paymentMethod: "PDV",
        paymentBreakdown: [{ method: "PDV", amount: total }],
      })
      if (!result.success) {
        notifyError(result.error || "Não foi possível finalizar a venda.")
        return
      }

      notifySuccess("Venda finalizada com sucesso.")
      setPreSales((prev) => prev.filter((draft) => draft.id !== activePreSaleId))
      clearCurrentOrder()
      setMobileOpen(false)
    } finally {
      setIsFinalizing(false)
      isFinalizingRef.current = false
    }
  }

  useEffect(() => {
    if (editingItem) {
      setEditQty(editingItem.qty)
      setEditPrice(editingItem.price)
      setEditDiscount(0) // Reset discount when opening
      setEditDiscountType('fixed')
    }
  }, [editingItem])

  const saveEditedItem = () => {
    if (!editingItem) return
    let finalUnitPrice = editPrice
    if (editDiscount > 0) {
      if (editDiscountType === 'fixed') {
        finalUnitPrice = Math.max(0, editPrice - editDiscount)
      } else {
        finalUnitPrice = Math.max(0, editPrice * (1 - editDiscount / 100))
      }
    }

    setCart((prev) => prev.map(it => it.id === editingItem.id ? { ...it, qty: editQty, price: finalUnitPrice } : it))
    setEditingItem(null)
    notifySuccess("Item atualizado.")
  }

  const cartPanel = (
    <div className="rounded-3xl border border-brand-border bg-[#F5F6F7] p-4 md:p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-brand-dark font-bold text-2xl">Detail Transaction</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-white rounded-full px-4 h-9 font-bold text-brand-dark"
            onClick={persistDraft}
            isLoading={isSavingDraft}
          >
            <SaveIcon size={16} className="mr-2" /> Salvar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-white rounded-full px-4 h-9 font-bold text-brand-red border-brand-border"
            onClick={() => setIsResetAlertOpen(true)}
          >
            <TrashIcon size={16} className="mr-2" /> Reset Order
          </Button>
        </div>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
        {cart.map((item) => (
          <CartItemCard
            key={item.id}
            item={item}
            onChangeQty={changeQty}
            onRemove={(id) => setItemToRemoveId(id)}
            onEdit={(item) => setEditingItem(item)}
          />
        ))}
      </div>

      <div className="mt-4 rounded-3xl border border-brand-border bg-white p-3 space-y-3">
        {/* Dropdown for options replaced separate inputs */}
        <div className="p-1 space-y-2">
          <div className="flex justify-between items-center text-sm text-brand-inactive-text font-medium">
            <span>Subtotal</span>
            <span className="font-bold text-brand-dark">{formatCurrency(subtotal)}</span>
          </div>

          {discountVal > 0 && (
            <div className="flex justify-between items-center text-sm text-brand-inactive-text font-medium">
              <span>Desconto</span>
              <span className="font-bold text-brand-red">-{formatCurrency(discountVal)}</span>
            </div>
          )}

          {shippingFee > 0 && (
            <div className="flex justify-between items-center text-sm text-brand-inactive-text font-medium">
              <span>Frete</span>
              <span className="font-bold text-brand-dark">{formatCurrency(shippingFee)}</span>
            </div>
          )}

          {otherCosts > 0 && (
            <div className="flex justify-between items-center text-sm text-brand-inactive-text font-medium">
              <span>Outros Custos</span>
              <span className="font-bold text-brand-dark">{formatCurrency(otherCosts)}</span>
            </div>
          )}

          <div className="border-t border-dashed border-brand-border pt-3 mt-2">
            <div className="flex justify-between items-end">
              <span className="text-lg font-bold text-brand-dark tracking-tight">Total a Pagar</span>
              <span className="text-2xl font-bold text-brand-dark leading-none tracking-tighter">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Button
            className="flex-1 h-12"
            onClick={finalizeSale}
            isLoading={isFinalizing}
            disabled={isFinalizing || cart.length === 0}
          >
            Continue
          </Button>

          <Dropdown
            trigger={
              <Button variant="outline" className="w-12 h-12 p-0 rounded-full flex items-center justify-center border-brand-border bg-white shrink-0">
                <ThreeDotsIcon size={20} className="text-brand-dark" />
              </Button>
            }
            showChevron={false}
            width="w-64"
            align="right"
          >
            <DropdownItem onClick={() => setIsSelectCustomerOpen(true)}>
              <UserIcon size={16} /> Adicionar Cliente
            </DropdownItem>
            <DropdownItem onClick={() => setIsGlobalDiscountModalOpen(true)}>
              <TagIcon size={16} /> Aplicar Desconto
            </DropdownItem>
            <DropdownItem onClick={() => {
              const fee = prompt("Valor do frete:")
              if (fee) setShippingFee(Number(fee))
            }}>
              <ClockIcon size={16} /> Adicionar Frete
            </DropdownItem>
            <DropdownItem onClick={() => {
              const obs = prompt("Observação:")
              if (obs) setNotes(obs)
            }}>
              <PlusIcon size={16} /> Adicionar Observação
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
    </div>
  )

  if (!isCashierOpen) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <IconPlaceholder
          imageSrc="https://img.dudit.com.br/static/mascots/PDV.png"
          title="Abrir Caixa"
          itemButton={{
            text: "Abrir o Caixa",
            action: () => setIsCashierOpen(true),
            variant: "filled",
            className: "h-12 px-10 rounded-full font-bold text-md"
          }}
        />
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-0 flex-1">
        <div className="xl:col-span-8 min-h-0 flex flex-col">
          {/* HEADER: Combined Row */}
          <div className="flex items-center gap-3 mb-6">
            {/* Search Part */}
            <div className="flex-1 relative min-w-[200px]">
              <Input
                label=""
                placeholder="Buscar produtos..."
                value={search}
                variant="full-rounded"
                onChange={(e: any) => setSearch(e.target.value)}
                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                className="mb-0 border-transparent bg-transparent"
              />
            </div>

            {/* Carousel Part (Visible on Desktop) */}
            {!isMobile && (
              <div className="flex-1 relative overflow-hidden group border-l border-brand-border dark:border-dark-border px-4">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${selectedCategory === cat
                        ? "bg-brand-dark text-white border-brand-dark"
                        : "bg-[#F5F6F7] text-brand-inactive-text border-transparent hover:border-brand-border"
                        }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selectors Part */}
            <div className="flex items-center gap-6 shrink-0 border-l border-brand-border dark:border-dark-border pl-6">
              {isMobile ? (
                <>
                  <button onClick={() => setIsGlobalDiscountModalOpen(true)} className="w-10 h-10 rounded-full bg-[#F5F6F7] dark:bg-dark-gray border border-brand-border dark:border-dark-border flex items-center justify-center text-brand-dark dark:text-dark-text shadow-none">
                    <TagIcon size={18} />
                  </button>
                  <button onClick={() => setIsSelectCustomerOpen(true)} className="w-10 h-10 rounded-full bg-[#F5F6F7] dark:bg-dark-gray border border-brand-border dark:border-dark-border flex items-center justify-center text-brand-dark dark:text-dark-text shadow-none">
                    <UserIcon size={18} />
                  </button>
                  <button onClick={() => setIsSelectSellerOpen(true)} className="w-10 h-10 rounded-full bg-[#F5F6F7] dark:bg-dark-gray border border-brand-border dark:border-dark-border flex items-center justify-center text-brand-dark dark:text-dark-text shadow-none">
                    <ClockIcon size={18} />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-8">
                  {/* Customer Selector */}
                  <button
                    onClick={() => setIsSelectCustomerOpen(true)}
                    className="flex items-center gap-3 group transition-colors shadow-none"
                  >
                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                      {selectedCustomerId ? (
                        <span className="font-bold text-lg">{customers.find(c => c.id === selectedCustomerId)?.name.charAt(0).toUpperCase()}</span>
                      ) : (
                        <UserIcon size={20} />
                      )}
                    </div>
                    <div className="flex flex-col text-left min-w-[100px]">
                      <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Cliente</span>
                      <span className="text-sm font-bold text-brand-inactive-text dark:text-dark-body truncate max-w-[150px]">
                        {selectedCustomerId ? customers.find(c => c.id === selectedCustomerId)?.name : "Consumidor Final"}
                      </span>
                    </div>
                    <ChevronRightIcon size={16} className="text-brand-inactive-text group-hover:text-brand-dark transition-colors" />
                  </button>

                  <div className="w-[1px] h-10 bg-brand-border dark:bg-dark-border" />

                  {/* Seller Selector */}
                  <button
                    onClick={() => setIsSelectSellerOpen(true)}
                    className="flex items-center gap-3 group transition-colors shadow-none"
                  >
                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                      <ClockIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                    </div>
                    <div className="flex flex-col text-left min-w-[100px]">
                      <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Vendedor</span>
                      <span className="text-sm font-bold text-brand-inactive-text dark:text-dark-body truncate max-w-[150px]">
                        {selectedSellerId ? teamMembers.find(t => t.id === selectedSellerId)?.fullName : "Selecionar"}
                      </span>
                    </div>
                    <ChevronRightIcon size={16} className="text-brand-inactive-text group-hover:text-brand-dark transition-colors" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Product Grid - Fixed Items (No stretch) */}
          <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 overflow-y-auto pr-1 no-scrollbar pb-6 items-start content-start">
            {filteredProducts
              .slice(0, (cart.length === 0 && preSales.length > 0) ? (preSaleLimit === 4 ? 8 : preSaleLimit === 3 ? 6 : preSaleLimit === 2 ? 4 : 2) : undefined)
              .map((product) => (
                <div
                  key={product.id}
                  className="rounded-3xl border border-brand-border p-3 bg-white text-left transition-all"
                >
                  <div className="relative aspect-square mb-2 overflow-hidden rounded-2xl">
                    <img
                      src={getR2ImageUrl(product.images?.[0] || null, "thumbnail")}
                      alt={product.name}
                      className="w-full h-full object-cover bg-brand-gray"
                    />
                    <span className="absolute left-2 top-2 px-2 py-1 text-[11px] font-bold bg-brand-dark/80 backdrop-blur-sm text-white rounded-lg">
                      {Math.max(0, Number(product.stock_available || 0))} Stock
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-brand-dark truncate text-sm">{product.name}</p>
                    {product.product_variants && product.product_variants.length > 0 && (
                      <p className="text-[11px] text-brand-inactive-text">{product.product_variants.length} variação(ões)</p>
                    )}
                    <p className="text-brand-dark font-bold mt-0.5">{formatCurrency(Number(product.price || 0))}</p>

                    <Button
                      variant="outline"
                      className="w-full mt-3 h-9 rounded-full text-xs font-bold border-brand-border text-brand-dark hover:bg-brand-gray"
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

          {/* Pre-sales list (Visible only if cart is empty) */}
          <AnimatePresence>
            {cart.length === 0 && preSales.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-6 pt-6 border-t border-brand-border"
              >
                <h4 className="font-bold text-xl text-brand-dark mb-4 tracking-tight">Pedidos em pré-venda</h4>
                <div className="flex items-stretch gap-4 pb-2 overflow-x-auto no-scrollbar">
                  {preSales.slice(0, preSaleLimit).map((preSale, index) => (
                    <div key={preSale.id} className="relative group">
                      <PreSaleCard
                        preSale={preSale}
                        index={index}
                        customers={customers}
                        onClick={() => loadPreSale(preSale)}
                      />
                    </div>
                  ))}
                  {preSales.length > preSaleLimit && (
                    <MorePreSalesCard
                      count={preSales.length - preSaleLimit}
                      onClick={() => setIsPreSaleSheetOpen(true)}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!isMobile && <div className="xl:col-span-4 min-h-0">{cartPanel}</div>}
      </div>

      {isMobile && itemCount > 0 && (
        <button
          className="fixed bottom-4 left-4 right-4 h-14 rounded-2xl bg-brand-primary text-white font-bold z-40 flex items-center justify-between px-4 shadow-xl"
          onClick={() => setMobileOpen(true)}
        >
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">{itemCount}</span>
            <span>Ver Pedido</span>
          </div>
          <span>{formatCurrency(total)}</span>
        </button>
      )}

      {/* MODALS & SHEETS */}
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {cartPanel}
          </div>
        </div>
      )}

      <BottomSheet
        isOpen={isPreSaleSheetOpen}
        onClose={() => setIsPreSaleSheetOpen(false)}
        title="Pedidos em Pré-venda"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
          {preSales.map((preSale, index) => (
            <div key={preSale.id} className="relative group">
              <PreSaleCard
                preSale={preSale}
                index={index}
                customers={customers}
                onClick={() => {
                  loadPreSale(preSale)
                  setIsPreSaleSheetOpen(false)
                }}
              />
              <button
                className="absolute top-4 right-4 text-brand-red opacity-0 group-hover:opacity-100 transition-opacity"
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

      {variantPickerProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] w-full max-w-sm p-6 shadow-2xl">
            <h4 className="text-xl font-bold text-brand-dark mb-4 tracking-tight">Selecionar Variação</h4>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 no-scrollbar">
              {variantPickerProduct.product_variants?.map((variant) => {
                const variantStock = Number(variant.stock_available || 0)
                const variantPrice = Number(variantPickerProduct.price || 0) + Number(variant.price_adjustment || 0)
                return (
                  <button
                    key={variant.id}
                    disabled={!variantPickerProduct.allow_sell_without_stock && variantStock <= 0}
                    className="w-full bg-brand-gray border border-brand-border rounded-2xl p-4 text-left hover:border-brand-primary active:scale-95 transition-all disabled:opacity-50 flex items-center justify-between group"
                    onClick={() => {
                      if (!variantPickerProduct.allow_sell_without_stock && variantStock <= 0) {
                        notifyError(`Estoque insuficiente para o item ${variantPickerProduct.name} - ${variant.variant_name}`)
                        return
                      }
                      addToCart(variantPickerProduct, variant.id)
                      setVariantPickerProduct(null)
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-brand-dark truncate">{variant.variant_name}</p>
                      <p className="text-xs text-brand-inactive-text font-medium mt-0.5">Disponível: {variantStock}</p>
                    </div>
                    <span className="font-bold text-brand-dark bg-white px-3 py-1.5 rounded-xl border border-brand-border group-hover:border-brand-primary">
                      {formatCurrency(variantPrice)}
                    </span>
                  </button>
                )
              })}
            </div>
            <Button variant="outline" className="w-full mt-6 h-12 rounded-full font-bold" onClick={() => setVariantPickerProduct(null)}>
              Fechar
            </Button>
          </div>
        </div>
      )}



      {/* Item Removal Confirmation */}
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

      {/* Edit Item Modal */}
      <DefaultModal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title="Editar dados do produto"
        footer={
          <div className="flex items-center gap-3 w-full">
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
                label="Desconto (R$)"
                value={editDiscount}
                onChange={(v: number) => setEditDiscount(v)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <MoneyInput
                label="Valor unitário"
                value={editPrice}
                onChange={(v: number) => setEditPrice(v)}
              />
              <div>
                <p className="text-xs font-bold text-brand-dark mb-2">Sub total</p>
                <div className="h-[42px] flex items-center px-4 bg-[#F5F6F7] dark:bg-dark-gray rounded-lg border border-brand-border dark:border-dark-border">
                  <p className="font-bold text-brand-dark dark:text-dark-text">
                    {formatCurrency(
                      (editDiscountType === 'fixed'
                        ? Math.max(0, editPrice - editDiscount)
                        : Math.max(0, editPrice * (1 - editDiscount / 100))) * editQty
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </DefaultModal>

      {/* Global Discount Modal */}
      <DefaultModal
        isOpen={isGlobalDiscountModalOpen}
        onClose={() => setIsGlobalDiscountModalOpen(false)}
        title="Aplicar Desconto"
        footer={
          <div className="flex items-center gap-3 w-full">
            <Button variant="outline" className="flex-1" onClick={() => setIsGlobalDiscountModalOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={() => {
              if (editDiscountType === 'fixed') {
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

          {editDiscountType === 'fixed' ? (
            <MoneyInput
              label="Desconto do pedido"
              value={editDiscount}
              onChange={(v: number) => setEditDiscount(v)}
              suffix={
                <div className="flex items-center gap-2 pr-2">
                  <div className="h-6 w-[1px] bg-brand-border dark:bg-dark-border" />
                  <Dropdown
                    trigger={
                      <button className="text-brand-dark dark:text-dark-text font-bold text-sm min-w-[30px]">
                        R$
                      </button>
                    }
                    showChevron={false}
                    align="right"
                    width="w-40"
                  >
                    <DropdownItem onClick={() => setEditDiscountType('fixed')}>
                      $ R$ (Reais)
                    </DropdownItem>
                    <DropdownItem onClick={() => {
                      setEditDiscount(0)
                      setEditDiscountType('percentage')
                    }}>
                      % % (Porcentagem)
                    </DropdownItem>
                  </Dropdown>
                </div>
              }
            />
          ) : (
            <Input
              label="Desconto do pedido"
              name="globalDiscount"
              type="number"
              min="0"
              max="100"
              value={editDiscount || ""}
              onChange={(e: any) => {
                let val = Number(e.target.value)
                if (val > 100) val = 100
                if (val < 0) val = 0
                setEditDiscount(val)
              }}
              suffix={
                <div className="flex items-center gap-2 pr-2">
                  <div className="h-6 w-[1px] bg-brand-border dark:bg-dark-border" />
                  <Dropdown
                    trigger={
                      <button className="text-brand-dark dark:text-dark-text font-bold text-sm min-w-[30px]">
                        %
                      </button>
                    }
                    showChevron={false}
                    align="right"
                    width="w-40"
                  >
                    <DropdownItem onClick={() => {
                      setEditDiscount(0)
                      setEditDiscountType('fixed')
                    }}>
                      $ R$ (Reais)
                    </DropdownItem>
                    <DropdownItem onClick={() => setEditDiscountType('percentage')}>
                      % % (Porcentagem)
                    </DropdownItem>
                  </Dropdown>
                </div>
              }
            />
          )}

          <div className="flex flex-wrap gap-2">
            {[5, 10, 20, 50, 100].map(amt => (
              <button
                key={amt}
                onClick={() => setEditDiscount(amt)}
                className="px-4 py-2 bg-brand-gray dark:bg-dark-border/30 rounded-xl text-xs font-bold text-brand-dark dark:text-dark-heading hover:bg-brand-border/10 transition-colors border border-transparent shadow-none"
              >
                {editDiscountType === 'fixed' ? `R$ ${amt}` : `${amt}%`}
              </button>
            ))}
          </div>
        </div>
      </DefaultModal>
      <SelectCustomerSheet
        isOpen={isSelectCustomerOpen}
        onClose={() => setIsSelectCustomerOpen(false)}
        partnerId={partnerId}
        onSelect={(customer: any) => {
          setSelectedCustomerId(customer.id)
          setIsSelectCustomerOpen(false)
        }}
      />

      <SelectSellerSheet
        isOpen={isSelectSellerOpen}
        onClose={() => setIsSelectSellerOpen(false)}
        onSelect={(seller: any) => {
          setSelectedSellerId(seller.id)
          setIsSelectSellerOpen(false)
        }}
      />

      {isResetAlertOpen && (
        <AlertModal
          isOpen={isResetAlertOpen}
          onClose={() => setIsResetAlertOpen(false)}
          onConfirm={() => {
            clearCurrentOrder()
            setIsResetAlertOpen(false)
            notifySuccess("Pedido limpo com sucesso.")
          }}
          title="Limpar Pedido?"
          description="Isso irá remover todos os itens do carrinho e resetar as informações do pedido. Esta ação não pode ser desfeita."
          confirmText="Sim, Limpar"
          cancelText="Cancelar"
          variant="danger"
        />
      )}
    </motion.div>
  )
}
