"use client"

import { useEffect, useRef, useState } from "react"
import JsBarcode from "jsbarcode"
import { type LabelPreset, type LabelContentConfig } from "@/lib/labels/presets"
import { detectBarcodeFormat } from "@/lib/utils/barcode"
import { formatCurrency } from "@/lib/utils"

export interface LabelProduct {
  id: string
  name: string
  sku: string | null
  gtin: string | null
  price: number
  promotionalPrice: number | null
  internalCode: string | null
  labelQuantity: number
}

interface LabelSheetProps {
  products: LabelProduct[]
  preset: LabelPreset
  contentConfig: LabelContentConfig
  printMode?: boolean
}

export function LabelSheet({ products, preset, contentConfig, printMode = false }: LabelSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [barcodesReady, setBarcodesReady] = useState(false)

  const allLabels = products.flatMap((product) =>
    Array.from({ length: product.labelQuantity }, (_, index) => ({
      ...product,
      barcodeValue: product.gtin || product.sku || `PROD-${product.id.substring(0, 8)}`,
      key: `${product.id}-${index}`,
    })),
  )

  const labelsPerPage = preset.cols * preset.rows
  const totalPages = Math.max(1, Math.ceil(allLabels.length / labelsPerPage))

  const renderBarcodeRef = useRef<(() => void) | null>(null)
  renderBarcodeRef.current = () => {
    const elements = containerRef.current?.querySelectorAll("[data-barcode-id]")
    if (!elements) return
    elements.forEach((el) => {
      const id = el.getAttribute("data-barcode-id")
      const value = el.getAttribute("data-barcode-value")
      if (!id || !value || el.querySelector("svg")) return
      try {
        JsBarcode(el, value, {
          format: detectBarcodeFormat(value),
          width: 1.2,
          height: 24,
          fontSize: 8,
          margin: 1,
          displayValue: true,
        })
      } catch {
        /* ignore */
      }
    })
    setBarcodesReady(true)
  }

  useEffect(() => {
    setBarcodesReady(false)
    const timer = setTimeout(() => renderBarcodeRef.current?.(), 150)
    return () => clearTimeout(timer)
  }, [allLabels, preset])

  const labelStyle: React.CSSProperties = {
    width: `${preset.labelWidth}mm`,
    height: `${preset.labelHeight}mm`,
    border: `0.5px solid ${printMode ? "transparent" : "#d0d0d0"}`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "1.5mm",
    fontSize: "7.5px",
    overflow: "hidden",
    boxSizing: "border-box",
    position: "relative",
  }

  return (
    <div ref={containerRef}>
      {Array.from({ length: totalPages }, (_, pageIdx) => {
        const pageLabels = allLabels.slice(pageIdx * labelsPerPage, (pageIdx + 1) * labelsPerPage)

        return (
          <div
            key={pageIdx}
            className={printMode ? "pdf-print-page" : ""}
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: `${preset.marginTop}mm ${preset.marginRight}mm ${preset.marginBottom}mm ${preset.marginLeft}mm`,
              margin: printMode ? "0 auto" : "0 auto",
              backgroundColor: "#ffffff",
              boxSizing: "border-box",
              display: "grid",
              gridTemplateColumns: `repeat(${preset.cols}, ${preset.labelWidth}mm)`,
              gridTemplateRows: `repeat(${preset.rows}, ${preset.labelHeight}mm)`,
              gap: `${preset.spacingY}mm ${preset.spacingX}mm`,
              alignContent: "start",
              justifyContent: "center",
            }}
          >
            {Array.from({ length: labelsPerPage }, (_, i) => {
              const label = pageLabels[i]
              if (!label) {
                return <div key={`empty-${i}`} style={labelStyle} />
              }

              return (
                <div key={label.key} style={labelStyle}>
                  {contentConfig.showName && (
                    <div
                      style={{
                        textAlign: "center",
                        fontWeight: 600,
                        fontSize: "7px",
                        lineHeight: 1.2,
                        maxHeight: "14mm",
                        overflow: "hidden",
                        wordBreak: "break-word",
                      }}
                    >
                      {label.name}
                    </div>
                  )}

                  {(contentConfig.showSku || contentConfig.showInternalCode) && (
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "6px",
                        color: "#666",
                        marginTop: "0.5mm",
                      }}
                    >
                      {contentConfig.showSku && label.sku && `SKU: ${label.sku}`}
                      {contentConfig.showSku && label.sku && contentConfig.showInternalCode && label.internalCode && " | "}
                      {contentConfig.showInternalCode && label.internalCode && `Cód: ${label.internalCode}`}
                    </div>
                  )}

                  {contentConfig.showBarcode && label.barcodeValue && (
                    <div
                      data-barcode-id={`bc-${label.key}`}
                      data-barcode-value={label.barcodeValue}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        margin: "0.5mm 0",
                        overflow: "hidden",
                      }}
                    />
                  )}

                  {contentConfig.showPrice && (
                    <div
                      style={{
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: "8px",
                        color: "#222",
                        marginTop: "0.5mm",
                      }}
                    >
                      {contentConfig.showPromotionalPrice && label.promotionalPrice != null ? (
                        <>
                          <span style={{ textDecoration: "line-through", color: "#999", fontSize: "7px", marginRight: "1mm" }}>
                            {formatCurrency(label.price)}
                          </span>
                          <span style={{ color: "#c00" }}>
                            {formatCurrency(label.promotionalPrice)}
                          </span>
                        </>
                      ) : (
                        formatCurrency(label.price)
                      )}
                    </div>
                  )}

                  {contentConfig.showInstallment && (
                    <div style={{ textAlign: "center", fontSize: "6px", color: "#555", marginTop: "0.3mm" }}>
                      ou {contentConfig.installmentText}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
