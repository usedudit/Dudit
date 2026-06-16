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

function generateBarcodeDataUri(value: string): string | null {
  try {
    const div = document.createElement("div")
    JsBarcode(div, value, {
      format: detectBarcodeFormat(value),
      width: 1.5,
      height: 30,
      fontSize: 10,
      margin: 2,
      displayValue: true,
    })
    const svg = div.querySelector("svg")
    if (!svg) return null
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    const svgString = new XMLSerializer().serializeToString(svg)
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString)
  } catch {
    return null
  }
}

function BarcodeCell({ value }: { value: string }) {
  const [dataUri, setDataUri] = useState<string | null>(null)

  useEffect(() => {
    setDataUri(generateBarcodeDataUri(value))
  }, [value])

  if (!dataUri) {
    return (
      <div style={{ fontSize: "7px", fontFamily: "monospace", textAlign: "center", margin: "0.5mm 0" }}>
        {value}
      </div>
    )
  }

  return (
    <div style={{ width: "100%", display: "flex", justifyContent: "center", margin: "0.5mm 0" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUri} alt={value} style={{ maxWidth: "100%", height: "auto", display: "block" }} />
    </div>
  )
}

export function LabelSheet({ products, preset, contentConfig, printMode = false }: LabelSheetProps) {
  const allLabels = products.flatMap((product) =>
    Array.from({ length: product.labelQuantity }, (_, index) => ({
      ...product,
      barcodeValue: product.gtin || product.sku || `PROD-${product.id.substring(0, 8)}`,
      key: `${product.id}-${index}`,
    })),
  )

  const labelsPerPage = preset.cols * preset.rows
  const totalPages = Math.max(1, Math.ceil(allLabels.length / labelsPerPage))

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
              width: "210mm",
              minHeight: "297mm",
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
