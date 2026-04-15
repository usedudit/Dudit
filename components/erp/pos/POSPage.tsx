"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { SearchIcon, PlusIcon, MinusIcon, TrashIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button, Input, Combobox, MoneyInput } from "@/components/reusable"
import { useMediaQuery } from "@/components/erp/hooks"
import { useNotification } from "@/hooks/use-notification"
import {
  deletePreSaleDraftAction,
  finalizePreSaleAction,
  upsertPreSaleDraftAction,
} from "@/app/actions/erp/pos"

type Product = {
  id: string
  name: string
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

export default function POSPage({ partnerId, initialData }: Props) {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const isMobile = useMediaQuery("(max-width: 1024px)")

  const [products] = useState<Product[]>(initialData.products || [])
  const [customers] = useState<Customer[]>(initialData.customers || [])
  const [accounts] = useState<FinanceAccount[]>(initialData.financeAccounts || [])
  const [preSales, setPreSales] = useState<PreSale[]>(initialData.preSales || [])

  const [search, setSearch] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined)
  const [financeAccountId, setFinanceAccountId] = useState<string | undefined>(
    accounts.find((account) => account.is_default)?.id || accounts[0]?.id
  )
  const [discountAmount, setDiscountAmount] = useState(0)
  const [notes, setNotes] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [activePreSaleId, setActivePreSaleId] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null)

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return products
    return products.filter((product) =>
      `${product.name} ${product.sku || ""}`.toLowerCase().includes(term)
    )
  }, [products, search])

  const itemCount = useMemo(() => cart.reduce((acc, item) => acc + item.qty, 0), [cart])
  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + (item.price * item.qty), 0),
    [cart]
  )
  const total = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount])

  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers]
  )
  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.name })),
    [accounts]
  )

  const getCartItemStock = (item: CartItem) => {
    const product = products.find((p) => p.id === item.productId)
    if (!product) return 0
    if (item.variantId) {
      const variant = product.product_variants?.find((v) => v.id === item.variantId)
      return Number(variant?.stock_available || 0)
    }
    return Number(product.stock_available || 0)
  }

  const addToCart = (product: Product, variantId?: string | null) => {
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
  }

  const changeQty = (itemId: string, delta: number) => {
    setCart((prev) => prev
      .map((item) => {
        if (item.id !== itemId) return item
        const nextQty = Math.max(0, item.qty + delta)
        const product = products.find((p) => p.id === item.productId)
        const availableStock = getCartItemStock(item)
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
  }

  const removeItem = (itemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId))
  }

  const persistDraft = async () => {
    if (cart.length === 0) return null
    setIsSavingDraft(true)
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
    setIsSavingDraft(false)
    if (!result.success) {
      notifyError(result.error || "Falha ao salvar pré-venda.")
      return null
    }
    const saved = result.data as PreSale
    setActivePreSaleId(saved.id)
    setPreSales((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)].slice(0, 20))
    return saved.id
  }

  useEffect(() => {
    if (cart.length === 0) return
    const timer = setTimeout(() => {
      persistDraft()
    }, 800)
    return () => clearTimeout(timer)
  }, [cart, selectedCustomerId, discountAmount, notes]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPreSale = (preSale: PreSale) => {
    const items = (Array.isArray(preSale.items) ? preSale.items : []).map((item: any) => ({
      id: crypto.randomUUID(),
      productId: item.product_id ?? item.productId ?? null,
      variantId: item.variant_id ?? item.variantId ?? null,
      variantName: item.variant_name || item.variantName || null,
      name: item.name,
      price: Number(item.unit_price ?? item.price || 0),
      qty: Number(item.quantity ?? item.qty || 0),
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
    let preSaleIdToFinalize = activePreSaleId
    if (!preSaleIdToFinalize) {
      const createdDraftId = await persistDraft()
      if (!createdDraftId) {
        notifyError("Não foi possível gerar a pré-venda.")
        return
      }
      setActivePreSaleId(createdDraftId)
      preSaleIdToFinalize = createdDraftId
    }

    setIsFinalizing(true)
    const result = await finalizePreSaleAction({
      partnerId,
      preSaleId: preSaleIdToFinalize as string,
      financeAccountId: financeAccountId || null,
      paidAmount: total,
      paymentMethod: "PDV",
      paymentBreakdown: [{ method: "PDV", amount: total }],
    })
    setIsFinalizing(false)
    if (!result.success) {
      notifyError(result.error || "Não foi possível finalizar a venda.")
      return
    }

    notifySuccess("Venda finalizada com sucesso.")
    setPreSales((prev) => prev.filter((draft) => draft.id !== activePreSaleId))
    clearCurrentOrder()
    setMobileOpen(false)
  }

  const cartPanel = (
    <div className="rounded-3xl border border-brand-border bg-[#F5F6F7] p-4 md:p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-brand-dark font-bold text-2xl">Detail Transaction</h3>
        <div className="text-xs text-brand-inactive-text">{isSavingDraft ? "Salvando..." : "Auto-save ativo"}</div>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
        {cart.map((item) => (
          <div key={item.id} className="bg-white rounded-2xl border border-brand-border p-3">
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
                  <button className="w-7 h-7 rounded-full border border-brand-border flex items-center justify-center" onClick={() => changeQty(item.id, -1)}>
                    <MinusIcon size={14} />
                  </button>
                  <span className="min-w-8 text-center font-bold">{String(item.qty).padStart(2, "0")}</span>
                  <button className="w-7 h-7 rounded-full bg-brand-primary text-white flex items-center justify-center" onClick={() => changeQty(item.id, 1)}>
                    <PlusIcon size={14} />
                  </button>
                </div>
              </div>
              <div className="text-right">
                <button className="w-8 h-8 rounded-full text-red-500 bg-red-50 flex items-center justify-center ml-auto mb-2" onClick={() => removeItem(item.id)}>
                  <TrashIcon size={14} />
                </button>
                <p className="text-xs text-brand-inactive-text">Total</p>
                <p className="font-bold text-brand-dark">{formatCurrency(item.price * item.qty)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-brand-border bg-white p-3 space-y-3">
        <Combobox
          label="Cliente"
          value={selectedCustomerId}
          onChange={setSelectedCustomerId}
          options={customerOptions}
        />
        <Combobox
          label="Conta financeira"
          value={financeAccountId}
          onChange={setFinanceAccountId}
          options={accountOptions}
        />
        <MoneyInput label="Desconto" value={discountAmount} onChange={setDiscountAmount} />
        <Input label="Observações" value={notes} onChange={(e: any) => setNotes(e.target.value)} />
        <div className="pt-2 border-t border-brand-border">
          <div className="flex justify-between text-brand-inactive-text"><span>Sub-Total</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-brand-inactive-text"><span>Desconto</span><span>-{formatCurrency(discountAmount)}</span></div>
          <div className="flex justify-between mt-2 text-xl font-black text-brand-dark"><span>Total</span><span>{formatCurrency(total)}</span></div>
        </div>
        <Button className="w-full h-12" onClick={finalizeSale} isLoading={isFinalizing}>Continue</Button>
      </div>
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 min-h-0 flex-1">
        <div className="xl:col-span-8 min-h-0 flex flex-col">
          <div className="rounded-3xl border border-brand-border bg-white p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <Input
                label=""
                placeholder="Search product..."
                value={search}
                onChange={(e: any) => setSearch(e.target.value)}
                prefix={<SearchIcon size={16} />}
                className="mb-0"
              />
              {isMobile && (
                <Button className="md:hidden" onClick={() => setMobileOpen(true)}>
                  Ver Pedido ({itemCount})
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 overflow-y-auto pr-1">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => {
                  if (product.product_variants && product.product_variants.length > 0) {
                    setVariantPickerProduct(product)
                    return
                  }
                  addToCart(product)
                }}
                className="rounded-2xl border border-brand-border p-2 bg-white text-left hover:shadow-sm transition"
              >
                <div className="relative">
                  <img
                    src={getR2ImageUrl(product.images?.[0] || null, "thumbnail")}
                    alt={product.name}
                    className="w-full h-28 rounded-xl object-cover bg-brand-gray"
                  />
                  <span className="absolute left-1.5 top-1.5 px-1.5 py-0.5 text-[11px] bg-brand-dark text-white rounded-md">
                    {Math.max(0, Number(product.stock_available || 0))} Stock
                  </span>
                </div>
                <div className="pt-2">
                  <p className="font-bold text-brand-dark truncate">{product.name}</p>
                  {product.product_variants && product.product_variants.length > 0 && (
                    <p className="text-xs text-brand-inactive-text">{product.product_variants.length} variação(ões)</p>
                  )}
                  <p className="font-black text-brand-dark">{formatCurrency(Number(product.price || 0))}</p>
                  <div className="mt-2">
                    <span className="text-sm text-brand-primary font-semibold">+ Add to Cart</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-brand-border bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-2xl text-brand-dark">Pedidos em pré-venda</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {preSales.map((preSale, index) => (
                <div key={preSale.id} className="rounded-xl border border-brand-border p-3">
                  <button className="w-full text-left" onClick={() => loadPreSale(preSale)}>
                    <p className="font-bold text-brand-dark">Nº {index + 1}</p>
                    <p className="text-sm text-brand-inactive-text truncate">{customers.find((c) => c.id === preSale.customer_id)?.name || "Cliente Balcão"}</p>
                    <p className="font-black text-brand-primary mt-1">{formatCurrency(Number(preSale.total_amount || 0))}</p>
                    <p className="text-xs text-brand-inactive-text">{new Date(preSale.created_at).toLocaleString("pt-BR")}</p>
                  </button>
                  <button
                    className="mt-2 text-xs text-red-500"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeDraft(preSale.id)
                    }}
                  >
                    Excluir
                  </button>
                </div>
              ))}
              {preSales.length === 0 && (
                <p className="text-sm text-brand-inactive-text">Nenhuma pré-venda salva no momento.</p>
              )}
            </div>
          </div>
        </div>

        {!isMobile && <div className="xl:col-span-4 min-h-0">{cartPanel}</div>}
      </div>

      {isMobile && itemCount > 0 && (
        <button
          className="fixed bottom-4 left-4 right-4 h-14 rounded-2xl bg-brand-primary text-white font-bold z-40 flex items-center justify-between px-4"
          onClick={() => setMobileOpen(true)}
        >
          <span>{itemCount}</span>
          <span>Ver Pedido</span>
          <span>{formatCurrency(total)}</span>
        </button>
      )}

      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 p-2" onClick={() => setMobileOpen(false)}>
          <div className="bg-white rounded-t-3xl h-[92vh] p-3" onClick={(e) => e.stopPropagation()}>
            {cartPanel}
          </div>
        </div>
      )}

      {variantPickerProduct && (
        <div className="fixed inset-0 z-[70] bg-black/40 p-3" onClick={() => setVariantPickerProduct(null)}>
          <div className="bg-white rounded-2xl max-w-md mx-auto mt-10 p-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="font-bold text-lg text-brand-dark mb-1">{variantPickerProduct.name}</h4>
            <p className="text-sm text-brand-inactive-text mb-3">Escolha uma variação</p>
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {(variantPickerProduct.product_variants || []).map((variant) => {
                const variantPrice = Number(variantPickerProduct.price || 0) + Number(variant.price_adjustment || 0)
                const variantStock = Number(variant.stock_available || 0)
                return (
                  <button
                    key={variant.id}
                    className="w-full rounded-xl border border-brand-border p-3 text-left hover:bg-brand-gray/30 transition"
                    onClick={() => {
                      if (!variantPickerProduct.allow_sell_without_stock && variantStock <= 0) {
                        notifyError(`Estoque insuficiente para o item ${variantPickerProduct.name} - ${variant.variant_name}`)
                        return
                      }
                      addToCart(variantPickerProduct, variant.id)
                      setVariantPickerProduct(null)
                    }}
                  >
                    <p className="font-bold text-brand-dark">{variant.variant_name}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-brand-inactive-text">Estoque: {variantStock}</span>
                      <span className="font-semibold text-brand-dark">{formatCurrency(variantPrice)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
            <Button variant="outline" className="w-full mt-3" onClick={() => setVariantPickerProduct(null)}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
