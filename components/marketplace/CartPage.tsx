"use client"

import { useState, useRef } from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getPartnerUrl, getProductUrl } from "@/lib/utils/url-generator"
import { MinusIcon, PlusIcon, TrashIcon, ChevronLeftIcon, ChevronUpIcon, ChevronDownIcon } from "@/lib/icons"
import { AnimatePresence, motion } from "framer-motion"
import { MarketplaceHeader } from "./MarketplaceHeader"
import { MarketplaceFooter } from "./MarketplaceFooter"
import { updateCartQuantityAction, removeFromCartAction, toggleCartSelectionAction, checkoutCartAction, toggleCartPartnerSelectionAction } from "@/app/actions/marketplace/cart"
import { CheckoutWrapper } from "@/components/marketplace/CheckoutWrapper"
import { PaymentWrapper } from "@/components/PaymentWrapper"
import { Button, Checkbox, IconPlaceholder, AlertModal, DefaultModal } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { useNotification } from "@/hooks/use-notification"
import { invalidateCartCache } from "@/hooks/use-cart"

interface CartPageClientProps {
  itemsByPartner: any
  userId: string
}

export function CartPageClient({ itemsByPartner, userId }: CartPageClientProps) {
  const router = useRouter()
  const { user } = useSupabase()
  const [isVendorExpanded, setIsVendorExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; cartItemId: string | null }>({ open: false, cartItemId: null })
  const [checkoutPartner, setCheckoutPartner] = useState<string | null>(null)
  const [showPixModal, setShowPixModal] = useState(false)
  const [pixPaymentData, setPixPaymentData] = useState<any>(null)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const isActionInProgress = useRef(false)

  // Optimistic overrides for instant UI feedback (selection + quantity)
  const [optimisticItems, setOptimisticItems] = useState<Record<string, { selected?: boolean; quantity?: number }>>({})

  const getImageUrl = (path: string) => getR2ImageUrl(path)
  const isExpanded = (partnerId: string) => isVendorExpanded[partnerId] !== false
  const toggleVendor = (partnerId: string) =>
    setIsVendorExpanded(prev => ({ ...prev, [partnerId]: !prev[partnerId] }))

  const getItemPrice = (item: any) => {
    if (item.variant_id && item.product_variants) {
      const variantPrice = Number(item.product_variants.price_adjustment)
      if (variantPrice > 0) return variantPrice
    }
    const basePrice = Number(item.products.price)
    const promoPrice = item.products.promotional_price ? Number(item.products.promotional_price) : 0
    return promoPrice > 0 && promoPrice < basePrice ? promoPrice : basePrice
  }

  const getItemImage = (item: any) => {
    if (item.variant_id && item.product_variants?.variant_options) {
      const opts = typeof item.product_variants.variant_options === "string"
        ? JSON.parse(item.product_variants.variant_options)
        : item.product_variants.variant_options
      if (opts?.image) return getImageUrl(opts.image)
    }
    return getImageUrl(item.products.images?.[0]) || "https://img.dudit.com.br/static/Placeholder.png"
  }

  const getItemName = (item: any) =>
    item.variant_id && item.product_variants
      ? `${item.products.name} - ${item.product_variants.variant_name}`
      : item.products.name

  // Resolve optimistic overrides per item
  const getItemSelected = (item: any): boolean =>
    optimisticItems[item.id]?.selected ?? (item.selected !== false)

  const getItemQuantity = (item: any): number =>
    optimisticItems[item.id]?.quantity ?? item.quantity

  const getCsrfToken = async (): Promise<string> => {
    const { token } = await (await fetch("/api/csrf-token")).json()
    return token
  }

  const updateQty = async (cartItemId: string, delta: number, currentQty: number) => {
    if (loading || isActionInProgress.current) return
    isActionInProgress.current = true
    const newQty = Math.max(1, currentQty + delta)
    setOptimisticItems(prev => ({ ...prev, [cartItemId]: { ...prev[cartItemId], quantity: newQty } }))
    setLoading(cartItemId)
    try {
      const token = await getCsrfToken()
      await updateCartQuantityAction(cartItemId, newQty, token)
      invalidateCartCache()
      // Removed router.refresh() — optimistic state update handles UI
    } catch {
      setOptimisticItems(prev => ({ ...prev, [cartItemId]: { ...prev[cartItemId], quantity: currentQty } }))
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
      // Removed router.refresh() — item removal is handled by server action revalidation
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
      // Removed router.refresh() — optimistic state update handles UI
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

    // Optimistically update all items
    const updates: Record<string, { selected: boolean }> = {}
    items.forEach(item => {
      updates[item.id] = { ...optimisticItems[item.id], selected: newState }
    })
    setOptimisticItems(prev => ({ ...prev, ...updates }))

    try {
      const token = await getCsrfToken()
      await toggleCartPartnerSelectionAction(partnerId, newState, token)
      invalidateCartCache()
      // Removed router.refresh() — optimistic state update handles UI
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

    // Check if any item is selected for this partner
    const partnerData = itemsByPartner[partnerId]
    const hasSelected = partnerData?.items.some((item: any) => getItemSelected(item))

    if (!hasSelected) {
      setShowErrorModal(true)
      return
    }

    setCheckoutPartner(partnerId)
  }

  const { success: notifySuccess, error: notifyError } = useNotification()

  const handleCheckout = async (data: any) => {
    if (!checkoutPartner || isActionInProgress.current) return
    isActionInProgress.current = true
    const partnerData = itemsByPartner[checkoutPartner]
    const partnerItems = partnerData.items.filter((item: any) => getItemSelected(item))

    if (!partnerItems.length) {
      notifyError("Erro", "Por favor, selecione pelo menos um item para finalizar o pedido")
      isActionInProgress.current = false
      return
    }

    if (data.useMercadoPago) {
      const amount = partnerItems.reduce((total: number, item: any) => total + getItemPrice(item) * getItemQuantity(item), 0)
      setPixPaymentData({
        orderId: "temp-" + Date.now(),
        amount,
        orderDetails: {
          items: partnerItems.map((item: any) => ({
            id: item.product_id,
            variant_id: item.variant_id || undefined,
            name: getItemName(item),
            price: getItemPrice(item),
            quantity: getItemQuantity(item),
            image: getItemImage(item),
          })),
          deliveryType: data.deliveryType,
          deliveryAddress: data.deliveryAddress,
          notes: data.notes,
          cartItemIds: partnerItems.map((item: any) => item.id),
        },
        buyerId: userId,
        useMercadoPago: true,
        partnerId: checkoutPartner,
        mpPublicKey: partnerData.partner?.mp_public_key,
        userEmail: user?.email || "",
        userName: user?.user_metadata?.full_name || user?.email?.split("@")[0] || "",
      })
      setShowPixModal(true)
      setCheckoutPartner(null)
      isActionInProgress.current = false
      return
    }

    try {
      const token = await getCsrfToken()
      const result = await checkoutCartAction(
        partnerItems.map((item: any) => ({
          cartItemId: item.id,
          productId: item.product_id,
          variantId: item.variant_id || undefined,
          quantity: getItemQuantity(item),
        })),
        data.deliveryType, data.deliveryAddress, data.paymentMethod, data.notes, false, token
      )
      if (result.error) {
        notifyError("Erro ao finalizar pedido", result.error)
        return
      }
      notifySuccess("Pedido realizado", "Seu pedido foi criado com sucesso!")
      setCheckoutPartner(null)
      router.push("/my-orders")
    } catch {
      notifyError("Erro", "Erro ao finalizar pedido.")
    } finally {
      isActionInProgress.current = false
    }
  }

  // Total only counts selected items (with optimistic overrides)
  const globalTotal = Object.values(itemsByPartner).reduce((acc: number, partner: any) =>
    acc + partner.items
      .filter((item: any) => getItemSelected(item))
      .reduce((sum: number, item: any) => sum + getItemPrice(item) * getItemQuantity(item), 0), 0)

  const getPartnerSelectedTotal = (items: any[]) =>
    items
      .filter((item: any) => getItemSelected(item))
      .reduce((sum: number, item: any) => sum + getItemPrice(item) * getItemQuantity(item), 0)

  const getPartnerCheckoutProducts = (partnerId: string) =>
    itemsByPartner[partnerId].items
      .filter((item: any) => getItemSelected(item))
      .map((item: any) => ({
        id: item.variant_id || item.product_id,
        name: item.products.name,
        variant: item.variant_id && item.product_variants ? `${item.product_variants.variant_type}: ${item.product_variants.variant_name}` : undefined,
        price: getItemPrice(item),
        quantity: getItemQuantity(item),
        image: getItemImage(item),
      }))

  const multiplePartners = Object.keys(itemsByPartner).length > 1

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300">
      <MarketplaceHeader />

      <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-6 max-w-[1300px] w-full pt-6 md:pt-10 pb-20 mt-[68px] lg:mt-[108px]">
        <div className="flex items-center mb-8">
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
                const partnerSelectedTotal = getPartnerSelectedTotal(data.items)
                const expanded = isExpanded(partnerId)
                const allSelected = data.items.every((item: any) => getItemSelected(item))
                const sellerImage = data.partner?.store_image_url

                return (
                  <div key={partnerId} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div className="lg:col-span-8 bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border overflow-hidden">
                      {/* Header do vendedor — clicável para expand/collapse */}
                      <div
                        className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-gray cursor-pointer"
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
                              className="w-6 h-6 rounded-full object-cover"
                              onClick={e => { e.stopPropagation(); router.push(getPartnerUrl(data.partner)) }}
                            />
                            <h3
                              className="text-[16px] font-bold text-brand-dark hover:text-brand-green transition-colors"
                              onClick={e => { e.stopPropagation(); router.push(getPartnerUrl(data.partner)) }}
                            >
                              {data.partner?.store_name || "Loja"}
                            </h3>
                          </div>
                        </div>
                        <button className="text-brand-dark hover:bg-white/50 rounded-full transition-colors">
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
                            <div className="px-4 md:px-6 pt-6 pb-6">
                              {data.items.map((item: any, index: number) => {
                                const itemSelected = getItemSelected(item)
                                const itemQty = getItemQuantity(item)

                                return (
                                  <div key={item.id} className={`pb-6 ${index !== data.items.length - 1 ? "border-b border-brand-border mb-6" : "mb-2"}`}>

                                    {/* Mobile/Tablet Layout (< md) */}
                                    <div className="flex md:hidden gap-3">
                                      <div className="flex items-start pt-1 shrink-0">
                                        <Checkbox
                                          id={`cart-item-mob-${item.id}`}
                                          checked={itemSelected}
                                          onChange={() => toggleItemSelection(item.id, itemSelected)}
                                          disabled={loading === item.id}
                                        />
                                      </div>

                                      <Link
                                        href={getProductUrl({ ...item.products, id: item.product_id }, data.partner)}
                                        prefetch={true}
                                        className="w-[68px] h-[68px] rounded-[8px] overflow-hidden border border-brand-border shrink-0 cursor-pointer block"
                                      >
                                        <img src={getItemImage(item)} alt={item.products.name} className="w-full h-full object-cover" />
                                      </Link>

                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                          <Link
                                            href={getProductUrl({ ...item.products, id: item.product_id }, data.partner)}
                                            prefetch={true}
                                            className="text-[14px] font-medium text-brand-dark line-clamp-2 cursor-pointer hover:text-brand-green leading-snug"
                                          >
                                            {item.products.name}
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
                                            {item.product_variants.variant_type}: <span className="font-medium text-brand-dark">{item.product_variants.variant_name}</span>
                                          </p>
                                        )}

                                        <div className="flex items-center justify-between mt-2">
                                          <div className="flex items-center border border-brand-border rounded-[6px] h-[32px]">
                                            <button onClick={() => updateQty(item.id, -1, itemQty)} className="w-8 h-full flex items-center justify-center hover:bg-brand-gray" disabled={loading === item.id || itemQty <= 1}><MinusIcon size={13} /></button>
                                            <span className="w-7 text-center text-[13px] font-medium">{itemQty}</span>
                                            <button onClick={() => updateQty(item.id, 1, itemQty)} className="w-8 h-full flex items-center justify-center hover:bg-brand-gray" disabled={loading === item.id}><PlusIcon size={13} /></button>
                                          </div>
                                          <span className="text-[15px] font-semibold text-brand-dark">R$ {(getItemPrice(item) * itemQty).toFixed(2)}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Desktop Layout (>= md) */}
                                    <div className="hidden md:flex gap-4">
                                      <div className="flex items-center shrink-0">
                                        <Checkbox
                                          id={`cart-item-${item.id}`}
                                          checked={itemSelected}
                                          onChange={() => toggleItemSelection(item.id, itemSelected)}
                                          disabled={loading === item.id}
                                        />
                                      </div>

                                      <div className="flex-1 flex md:justify-between md:items-center gap-4">
                                        <Link
                                          href={getProductUrl({ ...item.products, id: item.product_id }, data.partner)}
                                          prefetch={true}
                                          className="w-[68px] h-[68px] rounded-[8px] overflow-hidden border border-brand-border shrink-0 cursor-pointer block"
                                        >
                                          <img src={getItemImage(item)} alt={item.products.name} className="w-full h-full object-cover" />
                                        </Link>

                                        <div className="flex-1">
                                          <Link
                                            href={getProductUrl({ ...item.products, id: item.product_id }, data.partner)}
                                            prefetch={true}
                                            className="text-[16px] font-medium text-brand-dark mb-1 line-clamp-2 cursor-pointer hover:text-brand-green block"
                                          >
                                            {item.products.name}
                                          </Link>
                                          {item.variant_id && item.product_variants && (
                                            <p className="text-[13px] text-brand-inactive-text mb-1">
                                              {item.product_variants.variant_type}: <span className="font-medium text-brand-dark">{item.product_variants.variant_name}</span>
                                            </p>
                                          )}
                                          <p className="text-[15px] font-semibold text-brand-dark">R$ {getItemPrice(item).toFixed(2)}</p>
                                        </div>

                                        <div className="flex items-center justify-end gap-4">
                                          <div className="flex items-center border border-brand-border rounded-[6px] h-[36px]">
                                            <button onClick={() => updateQty(item.id, -1, itemQty)} className="w-9 h-full flex items-center justify-center hover:bg-brand-gray" disabled={loading === item.id || itemQty <= 1}><MinusIcon size={14} /></button>
                                            <span className="w-8 text-center text-[14px] font-medium">{itemQty}</span>
                                            <button onClick={() => updateQty(item.id, 1, itemQty)} className="w-9 h-full flex items-center justify-center hover:bg-brand-gray" disabled={loading === item.id}><PlusIcon size={14} /></button>
                                          </div>
                                          <div className="text-right min-w-[80px] font-semibold">R$ {(getItemPrice(item) * itemQty).toFixed(2)}</div>
                                          <button onClick={() => setDeleteModal({ open: true, cartItemId: item.id })} className="text-brand-red p-2 hover:bg-brand-red/15 rounded-full transition-colors" disabled={loading === item.id}><TrashIcon size={18} /></button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}

                              {/* Mobile/Tablet: resumo inline + botão */}
                              <div className="mt-4 pt-4 border-t border-brand-border md:hidden space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-brand-inactive-text">Total dos itens</span>
                                  <span className="font-semibold">R$ {partnerSelectedTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-brand-inactive-text">Entrega</span>
                                  <span className="text-brand-green font-semibold">Grátis</span>
                                </div>
                                <div className="h-[1px] bg-gray-100 w-full" />
                                <div className="flex justify-between items-center text-base font-bold text-brand-dark">
                                  <span>Total</span>
                                  <span>R$ {partnerSelectedTotal.toFixed(2)}</span>
                                </div>
                                <Button
                                  onClick={() => handleOpenCheckout(partnerId)}
                                  className="w-full"
                                  disabled={partnerSelectedTotal === 0}
                                >
                                  Finalizar Pedido desta Loja
                                </Button>
                              </div>

                              {/* Desktop: "Escolher mais itens" abaixo do separator */}
                              <div className="hidden md:block mt-4 pt-4 border-t border-brand-border">
                                <Link
                                  href={getPartnerUrl(data.partner)}
                                  prefetch={true}
                                  className="flex items-center gap-2 text-brand-green hover:underline font-medium text-[14px]"
                                >
                                  <ChevronLeftIcon size={16} />Escolher mais itens
                                </Link>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Desktop sidebar para esta loja especificamente */}
                    <div className="hidden lg:block lg:col-span-4 self-start">
                      <div className="border border-brand-border rounded-[12px] overflow-hidden bg-white dark:bg-dark-surface sticky top-[100px]">
                        <div className="bg-brand-gray px-6 py-4 border-b border-brand-border font-bold text-brand-dark">
                          Resumo do Pedido{!expanded && partnerSelectedTotal > 0 && (
                            <span className="text-brand-green font-semibold ml-1">(R$ {partnerSelectedTotal.toFixed(2)})</span>
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
                                <div className="flex justify-between items-center text-sm font-medium">
                                  <span className="text-brand-inactive-text">Total dos itens</span>
                                  <span className="text-brand-dark">R$ {partnerSelectedTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-medium">
                                  <span className="text-brand-inactive-text">Entrega</span>
                                  <span className="text-brand-green font-semibold">Grátis</span>
                                </div>
                                <div className="h-[1px] bg-gray-100 w-full" />
                                <div className="flex justify-between items-center font-bold text-xl text-brand-dark dark:text-dark-heading">
                                  <span>Total Geral</span>
                                  <span>R$ {partnerSelectedTotal.toFixed(2)}</span>
                                </div>
                                <Button
                                  onClick={() => handleOpenCheckout(partnerId)}
                                  className="w-full h-[46px]"
                                  disabled={partnerSelectedTotal === 0}
                                >
                                  Finalizar Pedido
                                </Button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {index !== array.length - 1 && (
                      <div className="lg:col-span-12 w-full h-[1px] bg-brand-border my-4" />
                    )}
                  </div>
                )
              })}

              {/* Mobile: "Voltar para as compras" abaixo de tudo */}
              <Link
                href="/"
                prefetch={true}
                className="flex items-center gap-2 text-brand-green hover:underline font-medium text-[14px] mt-2 md:hidden"
              >
                <ChevronLeftIcon size={18} />Voltar para as compras
              </Link>

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

      {checkoutPartner && itemsByPartner[checkoutPartner] && (
        <CheckoutWrapper
          open={true}
          onClose={() => setCheckoutPartner(null)}
          partnerId={checkoutPartner}
          products={getPartnerCheckoutProducts(checkoutPartner)}
          partnerInfo={{
            address: itemsByPartner[checkoutPartner].partner?.addresses?.[0] || {},
            paymentMethods: itemsByPartner[checkoutPartner].paymentMethods || ["Dinheiro"],
            mpConnected: !!itemsByPartner[checkoutPartner].partner?.mp_user_id,
            mpPublicKey: itemsByPartner[checkoutPartner].partner?.mp_public_key,
          }}
          onSubmit={handleCheckout}
        />
      )}

      {pixPaymentData && (
        <PaymentWrapper
          open={showPixModal}
          onClose={() => { setShowPixModal(false); setPixPaymentData(null) }}
          pixData={pixPaymentData.pixData}
          orderId={pixPaymentData.orderId}
          amount={pixPaymentData.amount}
          orderDetails={pixPaymentData.orderDetails}
          orderNumber={pixPaymentData.orderId}
          sellerName={pixPaymentData.partnerId ? itemsByPartner[pixPaymentData.partnerId]?.partner?.store_name : undefined}
          useMercadoPago={pixPaymentData.useMercadoPago}
          partnerId={pixPaymentData.partnerId}
          mpPublicKey={pixPaymentData.mpPublicKey}
          userEmail={pixPaymentData.userEmail}
          userName={pixPaymentData.userName}
          buyerId={userId}
        />
      )}

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