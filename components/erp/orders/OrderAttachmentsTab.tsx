"use client"

import React from "react"
import { GenericAttachmentsTab } from "@/components/erp/shared/GenericAttachmentsTab"

interface OrderAttachmentsTabProps {
  orderId?: string
  partnerId: string
  isEditing?: boolean
  readOnly?: boolean
  isNew?: boolean
  stagedFiles?: File[]
  onStagedFilesChange?: (files: File[]) => void
  stagedImages?: (string | File)[]
  onStagedImagesChange?: (images: (string | File)[]) => void
  onMutation?: () => void
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

export function OrderAttachmentsTab({
  orderId,
  partnerId,
  isEditing = true,
  readOnly = false,
  isNew,
  stagedFiles,
  onStagedFilesChange,
  stagedImages,
  onStagedImagesChange,
  onMutation
}: OrderAttachmentsTabProps) {
  return (
    <GenericAttachmentsTab
      entityId={orderId}
      partnerId={partnerId}
      entityType="order"
      title="Documentos e Anexos"
      subtitle="Selecione e envie os arquivos desejados para este pedido"
      isEditing={isEditing}
      readOnly={readOnly}
      isNew={isNew}
      stagedFiles={stagedFiles}
      onStagedFilesChange={onStagedFilesChange}
      stagedImages={stagedImages}
      onStagedImagesChange={onStagedImagesChange}
      onMutation={onMutation}
    />
  )
}

