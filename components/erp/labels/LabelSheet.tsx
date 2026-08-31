"use client"

import { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"
import { type LabelPreset, type LabelContentConfig, getPageSize } from "@/lib/labels/presets"
import { detectBarcodeFormat } from "@/lib/utils/barcode"
import { formatCurrency } from "@/lib/utils"

export interface LabelVariant {
  type: string
  name: string
}

export interface LabelProduct {
  id: string
  name: string
  sku: string | null
  gtin: string | null
  barcodeValue: string
  price: number
  promotionalPrice: number | null
  internalCode: string | null
  labelQuantity: number
  variant?: LabelVariant
}

interface LabelSheetProps {
  products: LabelProduct[]
  preset: LabelPreset
  contentConfig: LabelContentConfig
  printMode?: boolean
  maxInstallments?: number
}

function BarcodeCell({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format: detectBarcodeFormat(value),
        width: 1,
        height: 18,
        fontSize: 7,
        margin: 1,
        displayValue: true,
      })
    } catch {
      /* ignore */
    }
  }, [value])

  return (
    <div style={{ width: "100%", display: "flex", justifyContent: "center", margin: "0.3mm 0", maxHeight: "10mm", overflow: "hidden" }}>
      <svg ref={ref} style={{ maxWidth: "80%", height: "auto" }} />
    </div>
  )
}

export function LabelSheet({ products, preset, contentConfig, printMode = false, maxInstallments }: LabelSheetProps) {
  const allLabels = products.flatMap((product) =>
    Array.from({ length: product.labelQuantity }, (_, index) => ({
      ...product,
      key: `${product.id}-${index}`,
    })),
  )

  const labelsPerPage = preset.cols * preset.rows
  const totalPages = Math.max(1, Math.ceil(allLabels.length / labelsPerPage))
  const pageSize = getPageSize(preset)

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
    <div>
      {Array.from({ length: totalPages }, (_, pageIdx) => {
        const pageLabels = allLabels.slice(pageIdx * labelsPerPage, (pageIdx + 1) * labelsPerPage)

        return (
          <div
            key={pageIdx}
            className={printMode ? "pdf-print-page" : ""}
            style={{
              width: `${pageSize.width}mm`,
              minHeight: `${pageSize.height}mm`,
              padding: `${preset.marginTop}mm ${preset.marginRight}mm ${preset.marginBottom}mm ${preset.marginLeft}mm`,
              margin: printMode ? "0 auto" : "0 auto",
              marginBottom: printMode ? 0 : "16px",
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

                  {label.variant && (
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "6px",
                        color: "#666",
                        marginTop: "0.3mm",
                      }}
                    >
                      {label.variant.type}: {label.variant.name}
                    </div>
                  )}

                  {contentConfig.showInternalCode && label.internalCode && (
                    <div
                      style={{
                        textAlign: "center",
                        fontSize: "6px",
                        color: "#666",
                        marginTop: "0.5mm",
                      }}
                    >
                      Cód: {label.internalCode}
                    </div>
                  )}

                  {contentConfig.showBarcode && label.barcodeValue && (
                    <BarcodeCell value={label.barcodeValue} />
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

                  {contentConfig.showInstallment && maxInstallments && maxInstallments > 1 && (
                    <div style={{ textAlign: "center", fontSize: "6px", color: "#555", marginTop: "0.3mm" }}>
                      ou {maxInstallments}x de {formatCurrency(label.price / maxInstallments)}
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
