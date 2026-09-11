"use client"

import React, { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"
import clsx from "clsx"
import { detectBarcodeFormat } from "@/lib/utils/barcode"

interface BarcodeProps {
  value: string
  format?: "EAN13" | "EAN8" | "UPC" | "CODE128" | "auto"
  width?: number
  height?: number
  displayValue?: boolean
  fontSize?: number
  margin?: number
  className?: string
  background?: string
  lineColor?: string
}

export const Barcode: React.FC<BarcodeProps> = ({
  value,
  format = "auto",
  width = 1.8,
  height = 50,
  displayValue = true,
  fontSize = 11,
  margin = 8,
  className,
  background = "#ffffff",
  lineColor = "#000000",
}) => {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !value) return

    const targetFormat = format === "auto" ? detectBarcodeFormat(value) : format

    try {
      JsBarcode(svgRef.current, value, {
        format: targetFormat,
        width,
        height,
        displayValue,
        fontSize,
        margin,
        background,
        lineColor,
      })
    } catch (error) {
      console.error("Failed to render barcode with value:", value, "and format:", targetFormat, error)
    }
  }, [value, format, width, height, displayValue, fontSize, margin, background, lineColor])

  if (!value) {
    return (
      <div className="text-xs text-brand-red p-2 border border-dashed border-brand-red/50 rounded-lg text-center bg-red-50/20">
        Nenhum código para gerar código de barras
      </div>
    )
  }

  return (
    <div
      className={clsx(
        "flex items-center justify-center select-none",
        className
      )}
    >
      <svg ref={svgRef} className="max-w-full h-auto" />
    </div>
  )
}
