"use client"

import React from "react"
import { GenericAttachmentsTab } from "@/components/erp/shared/GenericAttachmentsTab"

interface OrderAttachmentsTabProps {
  orderId: string
  partnerId: string
}

export function formatFileSize(size: any): string {
  if (size === undefined || size === null) return "Tamanho desconhecido"
  const bytes = Number(size)
  if (isNaN(bytes)) return "Tamanho desconhecido"
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

export function OrderAttachmentsTab({ orderId, partnerId }: OrderAttachmentsTabProps) {
  return (
    <GenericAttachmentsTab
      entityId={orderId}
      partnerId={partnerId}
      entityType="order"
      title="Documentos e Anexos"
      subtitle="Selecione e envie os arquivos desejados para este pedido"
    />
  )
}
