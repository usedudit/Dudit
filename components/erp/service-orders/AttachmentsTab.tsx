"use client"

import React, { useState, useRef } from "react"
import { Button } from "@/components/reusable"
import { UploadIcon, TrashIcon, FileIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import {
  getPresignedUploadUrlAction,
  saveAttachmentAction,
  deleteAttachmentAction,
} from "@/app/actions/erp/service-orders"
import { R2_PREFIXES, MAX_FILE_SIZE } from "@/lib/r2/config"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import AlertModal from "@/components/reusable/AlertModal"

const CDN_URL = r2PublicConfig.cdnUrl || "https://img.dudit.com.br"

const buildImageUrl = (key: string) => key.startsWith("http") ? key : `${CDN_URL}/${key}`

interface AttachmentsTabProps {
  partnerId: string
  serviceOrderId: string
  attachments: any[]
  onMutation?: () => void
}

export default function AttachmentsTab({ partnerId, serviceOrderId, attachments, onMutation }: AttachmentsTabProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      toast({ description: "Arquivo muito grande. Máximo: 5MB." })
      return
    }

    setUploading(true)

    try {
      const urlRes = await getPresignedUploadUrlAction(
        partnerId,
        R2_PREFIXES.serviceOrderAttachments,
        file.name,
        file.type,
        file.size,
      )

      if (!urlRes.success) {
        throw new Error(urlRes.error || "Erro ao gerar URL de upload")
      }

      const uploadRes = await fetch(urlRes.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })

      if (!uploadRes.ok) {
        throw new Error("Erro ao fazer upload do arquivo")
      }

      const saveRes = await saveAttachmentAction(partnerId, serviceOrderId, urlRes.key, file.name, file.type, file.size)
      if (!saveRes.success) {
        throw new Error(saveRes.error || "Erro ao salvar anexo")
      }

      toast({ description: "Arquivo anexado com sucesso!" })
      onMutation?.()
    } catch (err: any) {
      toast({ description: err.message || "Erro ao anexar arquivo" })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await deleteAttachmentAction(partnerId, deleteTarget.id, serviceOrderId)
    if (res.success) {
      toast({ description: "Anexo removido" })
      onMutation?.()
    } else {
      toast({ description: res.error || "Erro ao remover anexo" })
    }
    setDeleteTarget(null)
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="link" onClick={() => fileInputRef.current?.click()} isLoading={uploading}>
            <UploadIcon className="w-4 h-4 mr-1" />
            {uploading ? "Enviando..." : "Adicionar Arquivo"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {attachments?.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {attachments.map((att: any) => (
              <div
                key={att.id}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-3 group relative"
              >
                {att.file_type?.startsWith("image/") ? (
                  <img
                    src={buildImageUrl(att.file_key)}
                    alt={att.file_name || ""}
                    className="w-full h-32 object-cover rounded-lg mb-2"
                  />
                ) : (
                  <div className="w-full h-32 bg-brand-gray dark:bg-dark-border rounded-lg mb-2 flex items-center justify-center">
                    <FileIcon className="w-8 h-8 text-brand-inactive-text" />
                  </div>
                )}
                <p className="text-[11px] font-medium text-brand-dark dark:text-dark-heading truncate">
                  {att.file_name || "Sem nome"}
                </p>
                <button
                  onClick={() => setDeleteTarget(att)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg hover:bg-red-600"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-brand-inactive-text bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl">
            Nenhum anexo
          </div>
        )}
      </div>

      {deleteTarget && (
        <AlertModal
          isOpen={!!deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
          title="Remover anexo"
          description={`Tem certeza que deseja remover "${deleteTarget.file_name || "este anexo"}"?`}
          confirmText="Remover"
          cancelText="Cancelar"
        />
      )}
    </>
  )
}
