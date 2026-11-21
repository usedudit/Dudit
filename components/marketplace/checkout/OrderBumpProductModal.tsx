"use client"

import { useEffect, useMemo, useState } from "react"
import { Button, DefaultModal, FormDropdown } from "@/components/reusable"
import { CheckCircleIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const PLACEHOLDER = "https://img.dudit.com.br/static/Placeholder.png"

export interface OrderBumpVariant {
  id: string
  variant_name?: string | null
  variant_type?: string | null
  variant_value?: string | null
  price_adjustment?: number | string | null
  stock_available?: number | null
  stock_quantity?: number | null
  variant_options?: Record<string, any> | string | null
  image_url?: string | null
  is_active?: boolean | null
}

export interface OrderBumpProduct {
  id: string
  name: string
  price: number
  promotional_price?: number | null
  images?: string[] | null
  stock_available?: number | null
  stock_quantity?: number | null
  availability_value?: number | null
  availability_unit?: string | null
  unit?: string | null
  product_variants?: OrderBumpVariant[] | null
}

interface OrderBumpProductModalProps {
  isOpen: boolean
  product: OrderBumpProduct | null
  loading?: boolean
  onClose: () => void
  onConfirm: (selection: {
    product: OrderBumpProduct
    variantId: string
    variantLabel: string
    price: number
    image: string
    quantity: number
  }) => void | Promise<void>
}

function parseVariantAttributes(variant: OrderBumpVariant): Record<string, string> {
  let opts: any = variant.variant_options
  if (typeof opts === "string") {
    try {
      opts = JSON.parse(opts)
    } catch {
      opts = null
    }
  }
  if (opts && typeof opts === "object") {
    const attrs: Record<string, string> = {}
    Object.keys(opts).forEach((k) => {
      if (k !== "image" && opts[k]) attrs[k] = String(opts[k])
    })
    if (Object.keys(attrs).length > 0) return attrs
  }
  const types = (variant.variant_type || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
  const values = (variant.variant_name || variant.variant_value || "")
    .split("/")
    .map((s) => s.trim())
  const attrs: Record<string, string> = {}
  types.forEach((t, i) => {
    if (t && values[i]) attrs[t] = values[i]
  })
  if (Object.keys(attrs).length === 0 && (variant.variant_name || variant.variant_value)) {
    attrs["Opção"] = String(variant.variant_name || variant.variant_value)
  }
  return attrs
}

function getQuantityLabel(qty: number, unit?: string | null): string {
  const normalized = (unit || "").trim().toLowerCase()
  if (!normalized || normalized === "un" || normalized === "un." || normalized === "unidade") {
    return qty === 1 ? "1 unidade" : `${qty} unidades`
  }
  return `${qty} ${unit}`
}

export function OrderBumpProductModal({
  isOpen,
  product,
  loading = false,
  onClose,
  onConfirm,
}: OrderBumpProductModalProps) {
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState<number>(1)

  const processedVariants = useMemo(() => {
    const list = (product?.product_variants || []).filter((v) => v && v.is_active !== false)
    return list.map((v) => {
      let opts: any = v.variant_options
      if (typeof opts === "string") {
        try {
          opts = JSON.parse(opts)
        } catch {
          opts = null
        }
      }
      const rawImg = v.image_url || opts?.image
      const hasDbImage = Boolean(rawImg && String(rawImg).length > 5)
      const fullImgUrl = hasDbImage ? getR2ImageUrl(String(rawImg)) : PLACEHOLDER
      const stock = Math.max(0, Number(v.stock_available ?? v.stock_quantity ?? 0))
      return {
        ...v,
        attributes: parseVariantAttributes(v),
        hasDbImage,
        fullImgUrl,
        stock,
      }
    })
  }, [product])

  const attributeKeys = useMemo(() => {
    const keys = new Set<string>()
    processedVariants.forEach((v) => {
      Object.keys(v.attributes).forEach((k) => keys.add(k))
    })
    return Array.from(keys)
  }, [processedVariants])

  // Initialize default selection (first in-stock variant) whenever product changes or modal opens
  useEffect(() => {
    if (!isOpen || !product || processedVariants.length === 0) return
    const firstAvailable = processedVariants.find((v) => v.stock > 0) || processedVariants[0]
    setSelectedAttributes({ ...firstAvailable.attributes })
    setQuantity(1)
  }, [isOpen, product?.id, processedVariants])

  const selectedVariant = useMemo(() => {
    if (processedVariants.length === 0) return null
    return (
      processedVariants.find((v) =>
        attributeKeys.every((key) => !selectedAttributes[key] || v.attributes[key] === selectedAttributes[key]),
      ) || null
    )
  }, [processedVariants, attributeKeys, selectedAttributes])

  const maxStock = useMemo(() => {
    if (selectedVariant) return selectedVariant.stock
    return Math.max(0, Number(product?.stock_available ?? product?.stock_quantity ?? 0))
  }, [selectedVariant, product])

  useEffect(() => {
    if (maxStock > 0 && quantity > maxStock) {
      setQuantity(maxStock)
    }
  }, [maxStock, quantity])

  const handleAttributeSelect = (type: string, value: string) => {
    const next = { ...selectedAttributes, [type]: value }
    // If exact combination is out of stock or missing, pick the first available variant matching the newly selected value
    const exact = processedVariants.find(
      (v) => v.stock > 0 && attributeKeys.every((k) => v.attributes[k] === next[k]),
    )
    if (exact) {
      setSelectedAttributes(next)
      return
    }
    const fallback = processedVariants.find((v) => v.attributes[type] === value && v.stock > 0)
    if (fallback) {
      setSelectedAttributes({ ...fallback.attributes })
    } else {
      setSelectedAttributes(next)
    }
  }

  if (!product) return null

  const basePrice = Number(product.price || 0)
  const promoPrice =
    product.promotional_price && Number(product.promotional_price) > 0 && Number(product.promotional_price) < basePrice
      ? Number(product.promotional_price)
      : null
  const variantPrice =
    selectedVariant?.price_adjustment != null && Number(selectedVariant.price_adjustment) > 0
      ? Number(selectedVariant.price_adjustment)
      : null
  const displayPrice = variantPrice ?? promoPrice ?? basePrice
  const showOriginalPrice = !variantPrice && promoPrice !== null

  const mainImage =
    (selectedVariant?.hasDbImage ? selectedVariant.fullImgUrl : null) ||
    (product.images?.[0] ? getR2ImageUrl(product.images[0]) : PLACEHOLDER)

  const isOutOfStock = !selectedVariant || maxStock <= 0
  const variantLabel = attributeKeys
    .map((k) => selectedAttributes[k])
    .filter(Boolean)
    .join(" / ")

  const quantityOptions = isOutOfStock
    ? []
    : Array.from({ length: Math.min(10, maxStock) }, (_, i) => ({
        value: String(i + 1),
        label: getQuantityLabel(i + 1, product.unit),
      }))

  const handleConfirm = () => {
    if (!selectedVariant || isOutOfStock || loading) return
    void onConfirm({
      product,
      variantId: selectedVariant.id,
      variantLabel,
      price: displayPrice,
      image: mainImage,
      quantity,
    })
  }

  return (
    <DefaultModal
      isOpen={isOpen}
      onClose={onClose}
      title="Escolha as opções"
      maxWidth="sm"
      footer={
        <div className="flex w-full gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isOutOfStock || loading}
            isLoading={loading}
            className="flex-1"
          >
            Adicionar ao pedido
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Imagem do produto (sem botões de voltar/compartilhar/favoritar) */}
        <div className="w-full aspect-square max-h-[260px] rounded-xl bg-brand-gray/40 dark:bg-dark-border/30 flex items-center justify-center overflow-hidden p-4">
          <img
            src={mainImage}
            alt={product.name}
            className="w-full h-full object-contain"
          />
        </div>

        {/* Nome e Preço (sem badge de vendidos e sem 'Ver opções de pagamento') */}
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-snug">
            {product.name}
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
              {formatCurrency(displayPrice)}
            </span>
            {showOriginalPrice && (
              <span className="text-sm text-brand-inactive-text dark:text-dark-body line-through">
                {formatCurrency(basePrice)}
              </span>
            )}
          </div>
        </div>

        {/* Seletores de Variantes */}
        <div className="space-y-5">
          {attributeKeys.map((type) => {
            const uniqueValues = Array.from(
              new Set(processedVariants.map((v) => v.attributes[type])),
            ).filter(Boolean)
            const groupHasImage = uniqueValues.some((val) =>
              processedVariants.some((v) => v.attributes[type] === val && v.hasDbImage),
            )
            return (
              <div key={type}>
                <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading mb-2.5">
                  {type}:{" "}
                  <span className="font-normal text-gray-600 dark:text-dark-body ml-1">
                    {selectedAttributes[type]}
                  </span>
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {uniqueValues.map((value) => {
                    const isSelected = selectedAttributes[type] === value
                    const isAvailable = processedVariants.some(
                      (v) => v.attributes[type] === value && v.stock > 0,
                    )
                    const variantWithImg = processedVariants.find(
                      (v) => v.attributes[type] === value && v.hasDbImage,
                    )
                    if (groupHasImage) {
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => isAvailable && handleAttributeSelect(type, value)}
                          disabled={!isAvailable}
                          title={!isAvailable ? `${value} (Indisponível)` : value}
                          className={`w-14 h-14 rounded-md relative focus:outline-none transition-all overflow-hidden bg-white dark:bg-dark-border/50
                            ${isSelected && isAvailable ? "ring-1 ring-offset-1 ring-brand-green" : ""}
                            ${!isSelected && isAvailable ? "ring-1 ring-gray-200 hover:ring-gray-300 dark:ring-dark-border dark:hover:ring-dark-border/50" : ""}
                            ${!isAvailable ? "opacity-60 cursor-not-allowed border border-dashed border-brand-border ring-0 grayscale" : ""}`}
                        >
                          <img
                            src={variantWithImg?.fullImgUrl || PLACEHOLDER}
                            alt={value}
                            className={`w-full h-full object-cover ${!isAvailable ? "opacity-50" : ""}`}
                          />
                          {isSelected && isAvailable && (
                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                              <div className="bg-white rounded-full p-0.5 shadow-sm">
                                <CheckCircleIcon size={12} className="text-brand-green stroke-[4]" />
                              </div>
                            </div>
                          )}
                          {!isAvailable && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                              <div className="w-[150%] h-[1.5px] bg-red-500 rotate-45 transform origin-center shadow-sm" />
                            </div>
                          )}
                        </button>
                      )
                    }
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleAttributeSelect(type, value)}
                        disabled={!isAvailable}
                        className={`h-10 min-w-[3rem] px-3 rounded-lg text-sm font-bold transition-all border focus:outline-none
                          ${isSelected && isAvailable ? "border-brand-green text-brand-green bg-green-50 dark:bg-brand-green/10" : ""}
                          ${!isSelected && isAvailable ? "border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading hover:border-brand-green/50 bg-white dark:bg-dark-surface" : ""}
                          ${!isAvailable ? "border-brand-border dark:border-dark-border text-brand-inactive-text dark:text-dark-body bg-brand-gray dark:bg-dark-border/30 opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {value}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Quantidade */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                Quantidade
              </label>
              <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium leading-none">
                ({maxStock} {maxStock === 1 ? "disponível" : "disponíveis"})
              </span>
            </div>
            <FormDropdown
              options={quantityOptions}
              value={String(quantity)}
              setValue={(v) => setQuantity(Math.max(1, Number(v) || 1))}
              disabled={isOutOfStock}
              width="w-full"
            />
          </div>
        </div>
      </div>
    </DefaultModal>
  )
}
