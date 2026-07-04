"use client"

import React, { useState } from "react"
import { Button } from "@/components/reusable"
import { DownloadIcon } from "@/lib/icons"
import { Spinner } from "@/components/reusable"

interface ReportExportButtonProps {
  onExport: (format: "csv" | "xlsx") => Promise<void>
  label?: string
  variant?: "default" | "outline"
  size?: "sm" | "default"
}

export function ReportExportButton({
  onExport,
  label = "Exportar",
  variant = "outline",
  size = "sm",
}: ReportExportButtonProps) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleExport = async (format: "csv" | "xlsx") => {
    setLoading(format)
    try {
      await onExport(format)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={variant}
        size={size}
        leftIcon={loading === "csv" ? <Spinner className="h-4 w-4" /> : <DownloadIcon size={14} />}
        disabled={loading !== null}
        onClick={() => handleExport("csv")}
      >
        {loading === "csv" ? "Exportando..." : "CSV"}
      </Button>
      <Button
        variant={variant}
        size={size}
        leftIcon={loading === "xlsx" ? <Spinner className="h-4 w-4" /> : <DownloadIcon size={14} />}
        disabled={loading !== null}
        onClick={() => handleExport("xlsx")}
      >
        {loading === "xlsx" ? "Exportando..." : "Excel"}
      </Button>
    </div>
  )
}
