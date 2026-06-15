"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input, Checkbox } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { PrinterIcon } from "@/lib/icons"
import { LABEL_PRESETS } from "@/lib/labels/presets"
import { LabelPrintModal } from "@/components/erp/labels/LabelPrintModal"
import type { LabelProduct } from "@/components/erp/labels/LabelSheet"

interface Product {
  id: string
  name: string
  sku: string | null
  gtin: string | null
  price: number
  promotional_price: number | null
  description: string | null
}

interface SelectedProduct {
  productId: string
  quantity: number
}

export function LabelGenerator({ products }: { products: Product[] }) {
  const [search, setSearch] = useState("")
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([])
  const [showPrintModal, setShowPrintModal] = useState(false)

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.gtin?.toLowerCase().includes(search.toLowerCase()),
  )

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) => {
      const existing = prev.find((p) => p.productId === productId)
      if (existing) {
        return prev.filter((p) => p.productId !== productId)
      } else {
        return [...prev, { productId, quantity: 1 }]
      }
    })
  }

  const updateQuantity = (productId: string, quantity: number) => {
    setSelectedProducts((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, quantity: Math.max(1, quantity) } : p)),
    )
  }

  const fillFromStock = () => {
    setSelectedProducts((prev) =>
      prev.map((p) => {
        const product = products.find((pr) => pr.id === p.productId)
        return product ? { ...p, quantity: Math.max(1, product.promotional_price ?? 1) } : p
      }),
    )
  }

  const labelProducts: LabelProduct[] = selectedProducts
    .map((sp) => {
      const product = products.find((p) => p.id === sp.productId)
      if (!product) return null
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        gtin: product.gtin,
        price: product.price,
        promotionalPrice: product.promotional_price,
        internalCode: product.sku,
        labelQuantity: sp.quantity,
      }
    })
    .filter(Boolean) as LabelProduct[]

  const totalLabels = selectedProducts.reduce((sum, p) => sum + p.quantity, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Seleção de Produtos */}
      <div className="lg:col-span-1 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Buscar Produtos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Input
                id="search"
                name="search"
                placeholder="Buscar por nome, SKU ou GTIN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto encontrado</p>
              ) : (
                filteredProducts.map((product) => {
                  const isSelected = selectedProducts.some((p) => p.productId === product.id)
                  return (
                    <div key={product.id} className="flex items-start space-x-2 p-2 hover:bg-accent rounded">
                      <Checkbox
                        id={product.id}
                        name={product.id}
                        checked={isSelected}
                        onChange={() => toggleProductSelection(product.id)}
                      />
                      <label htmlFor={product.id} className="flex-1 cursor-pointer text-sm">
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          SKU: {product.sku || "-"} | {formatCurrency(product.price)}
                        </p>
                      </label>
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configurações e Preview */}
      <div className="lg:col-span-2 space-y-4">
        {selectedProducts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quantidade de Etiquetas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {labelProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const current = selectedProducts.find((p) => p.productId === product.id)?.quantity || 1
                        updateQuantity(product.id, current - 1)
                      }}
                    >
                      −
                    </Button>
                    <Input
                      id={`quantity-${product.id}`}
                      name={`quantity-${product.id}`}
                      type="number"
                      min="1"
                      max="100"
                      value={selectedProducts.find((p) => p.productId === product.id)?.quantity || 1}
                      onChange={(e) => updateQuantity(product.id, Number.parseInt(e.target.value) || 1)}
                      className="w-16 text-center"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const current = selectedProducts.find((p) => p.productId === product.id)?.quantity || 1
                        updateQuantity(product.id, current + 1)
                      }}
                    >
                      +
                    </Button>
                  </div>
                </div>
              ))}

              <div className="pt-3 border-t flex items-center justify-between">
                <p className="text-sm font-semibold">Total de etiquetas: {totalLabels}</p>
                <Button variant="outline" size="sm" onClick={fillFromStock}>
                  Preencher estoque
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedProducts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Modelos disponíveis</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                {LABEL_PRESETS.map((p) => (
                  <li key={p.id}>
                    ✓ {p.name} — {p.description}
                  </li>
                ))}
                <li>✓ Customizado — definir medidas manualmente</li>
              </ul>
              <Button onClick={() => setShowPrintModal(true)} className="w-full mt-4" size="lg">
                <PrinterIcon className="mr-2 h-4 w-4" />
                Visualizar e Imprimir
              </Button>
            </CardContent>
          </Card>
        )}

        {selectedProducts.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Selecione produtos para gerar etiquetas</p>
            </CardContent>
          </Card>
        )}
      </div>

      {showPrintModal && (
        <LabelPrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          products={labelProducts}
        />
      )}
    </div>
  )
}
