"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button, Spinner } from "@/components/reusable"
import { UploadIcon, TrashIcon, FileIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { useR2Upload } from "@/hooks/use-r2-upload"
import {
  getOrderAttachmentsAction,
  getOrderAttachmentUrlAction,
  saveOrderAttachmentAction,
  deleteOrderAttachmentAction
} from "@/app/actions/erp/orders"

interface OrderAttachmentsTabProps {
  orderId: string
  partnerId: string
}

export function OrderAttachmentsTab({ orderId, partnerId }: OrderAttachmentsTabProps) {
  const { toast } = useToast()
  const { planSlug } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()
  const docInputRef = useRef<HTMLInputElement>(null)

  const [attachments, setAttachments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const advancedEnabled = hasMinimumPlan(planSlug, "crescer")

  const loadAttachments = async () => {
    setLoading(true)
    try {
      const res = await getOrderAttachmentsAction(orderId)
      if (res.success && res.data) {
        setAttachments(res.data)
      } else {
        toast({ description: "Erro ao carregar anexos do pedido." })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAttachments()
  }, [orderId])

  const handleDownloadDoc = async (fileKey: string) => {
    try {
      const res = await getOrderAttachmentUrlAction(orderId, fileKey, partnerId)
      if (res.success) {
        window.open(res.downloadUrl, "_blank")
      } else {
        toast({ description: res.error || "Erro ao obter arquivo." })
      }
    } catch (err) {
      toast({ description: "Erro ao abrir documento." })
    }
  }

  const handleDeleteDoc = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este anexo?")) return
    try {
      const res = await deleteOrderAttachmentAction(partnerId, id, orderId)
      if (res.success) {
        toast({ description: "Anexo removido com sucesso." })
        loadAttachments()
      } else {
        toast({ description: res.error || "Erro ao remover anexo." })
      }
    } catch (err) {
      toast({ description: "Erro ao excluir anexo." })
    }
  }

  // Upload handler using useR2Upload hook
  const { uploadFile, isLoading: isUploading, progress } = useR2Upload({
    endpoint: "/api/r2/presigned-url",
    onSuccess: async (urlRes) => {
      try {
        // Calculate SHA-256 on client for integrity check
        let fileHash = ""
        if (docInputRef.current?.files?.[0]) {
          const file = docInputRef.current.files[0]
          const buffer = await file.arrayBuffer()
          const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
          const hashArray = Array.from(new Uint8Array(hashBuffer))
          fileHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
        }

        const saveRes = await saveOrderAttachmentAction(
          partnerId,
          orderId,
          urlRes.key,
          urlRes.fileName,
          urlRes.contentType,
          docInputRef.current?.files?.[0]?.size || 0,
          fileHash
        )
        if (saveRes.success) {
          toast({ description: "Anexo enviado com sucesso." })
          loadAttachments()
        } else {
          toast({ description: saveRes.error || "Erro ao salvar anexo no banco." })
        }
      } catch (err: any) {
        toast({ description: err.message || "Erro ao processar anexo." })
      }
    },
    onError: (err) => {
      toast({ description: err.message || "Erro ao fazer upload." })
    }
  })

  const handleUploadClick = () => {
    if (!advancedEnabled) {
      openPlanUpgrade("crescer")
      return
    }
    docInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadFile(file)
    } catch (err) {
      // Handled in onError
    } finally {
      if (docInputRef.current) docInputRef.current.value = ""
    }
  }

  return (
    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Anexos do Pedido</h3>
          <p className="text-xs text-brand-inactive-text dark:text-dark-body">Gerencie contratos, faturas, ordens ou comprovantes deste pedido.</p>
        </div>
        <div>
          <input
            type="file"
            ref={docInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.odt,.ppt,.pptx,image/jpeg,image/png,image/webp,image/avif"
          />
          <Button
            type="button"
            onClick={handleUploadClick}
            disabled={isUploading}
            className="flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <Spinner className="w-4 h-4 text-white animate-spin" />
                <span>Enviando ({progress}%)</span>
              </>
            ) : (
              <>
                <UploadIcon className="w-4 h-4" />
                <span>Adicionar Anexo</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="w-8 h-8 text-brand-primary animate-spin" />
        </div>
      ) : attachments.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-brand-border dark:border-dark-border rounded-xl">
          <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum anexo encontrado para este pedido.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 p-3 bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl group relative"
            >
              <div
                onClick={() => handleDownloadDoc(att.file_key)}
                className="w-10 h-10 rounded-lg bg-white dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border shrink-0 cursor-pointer hover:bg-brand-gray/50"
              >
                <FileIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                  {att.file_name || "Anexo"}
                </p>
                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                  {att.file_size ? `${(att.file_size / 1024).toFixed(0)} KB` : "Tamanho desconhecido"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteDoc(att.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg absolute -top-2.5 -right-2.5 z-10"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
