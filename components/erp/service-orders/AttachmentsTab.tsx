"use client"

import React, { useState, useRef } from "react"
import { Button, Badge } from "@/components/reusable"
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

const CATEGORY_META: Record<string, { label: string; variant: "gray" | "orange" | "green" }> = {
  normal: { label: "Normal", variant: "gray" },
  antes: { label: "Antes", variant: "orange" },
  depois: { label: "Depois", variant: "green" },
}

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
  const [selectedCategory, setSelectedCategory] = useState<"normal" | "antes" | "depois">("normal")

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

      const saveRes = await saveAttachmentAction(partnerId, serviceOrderId, urlRes.key, file.name, file.type, file.size, selectedCategory)
      if (!saveRes.success) {
        throw new Error(saveRes.error || "Erro ao salvar anexo")
      }

      toast({ description: "Arquivo anexado com sucesso!" })
      setSelectedCategory("normal")
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

  const grouped: Record<string, any[]> = { normal: [], antes: [], depois: [] }
  for (const att of attachments || []) {
    const cat = att.category || "normal"
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(att)
  }
  const hasBeforeAfter = grouped.antes.length > 0 || grouped.depois.length > 0

  const renderAttachmentGrid = (items: any[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {items.map((att: any) => {
        const catMeta = CATEGORY_META[att.category || "normal"] || CATEGORY_META.normal
        return (
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
            <div className="flex items-center justify-between gap-1">
              <p className="text-[11px] font-medium text-brand-dark dark:text-dark-heading truncate flex-1">
                {att.file_name || "Sem nome"}
              </p>
              {att.category && att.category !== "normal" && (
                <Badge variant={catMeta.variant} className="shrink-0 text-[10px] px-1.5 py-0">
                  {catMeta.label}
                </Badge>
              )}
            </div>
            <button
              onClick={() => setDeleteTarget(att)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg hover:bg-red-600"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            {(["normal", "antes", "depois"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition-colors ${
                  selectedCategory === cat
                    ? "bg-brand-dark text-white border-brand-dark dark:bg-dark-heading dark:border-dark-heading"
                    : "bg-white dark:bg-dark-surface text-brand-inactive-text border-brand-border dark:border-dark-border hover:border-brand-dark"
                }`}
              >
                {CATEGORY_META[cat].label}
              </button>
            ))}
          </div>
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
          <div className="space-y-6">
            {hasBeforeAfter && grouped.antes.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  Antes
                </h4>
                {renderAttachmentGrid(grouped.antes)}
              </div>
            )}
            {hasBeforeAfter && grouped.depois.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Depois
                </h4>
                {renderAttachmentGrid(grouped.depois)}
              </div>
            )}
            {grouped.normal.length > 0 && (
              <div>
                {hasBeforeAfter && (
                  <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    Outros
                  </h4>
                )}
                {renderAttachmentGrid(grouped.normal)}
              </div>
            )}
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
