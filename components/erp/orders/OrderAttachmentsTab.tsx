"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button, Spinner, DefaultModal, IconPlaceholder, AlertModal, FormSection } from "@/components/reusable"
import { UploadIcon, TrashIcon, FileIcon, XIcon, CheckCircleIcon, AlertCircleIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import {
  getOrderAttachmentsAction,
  getOrderAttachmentUrlAction,
  saveOrderAttachmentAction,
  deleteOrderAttachmentAction,
  getOrderPresignedUploadUrlAction
} from "@/app/actions/erp/orders"

interface OrderAttachmentsTabProps {
  orderId: string
  partnerId: string
}

interface PendingFile {
  id: string
  file: File
  name: string
  size: number
  progress: number
  status: "pending" | "uploading" | "completed" | "failed"
  error?: string
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
  const { toast } = useToast()
  const { planSlug } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const [attachments, setAttachments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const advancedEnabled = hasMinimumPlan(planSlug, "crescer")
  const planLimit = planSlug === "crescer" ? 2 : planSlug === "escalar" ? 5 : 0

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

  const requestDeleteDoc = (id: string) => {
    setDeletingId(id)
    setDeleteModalOpen(true)
  }

  const confirmDeleteDoc = async () => {
    if (!deletingId) return
    try {
      const res = await deleteOrderAttachmentAction(partnerId, deletingId, orderId)
      if (res.success) {
        toast({ description: "Anexo removido com sucesso." })
        loadAttachments()
      } else {
        toast({ description: res.error || "Erro ao remover anexo." })
      }
    } catch (err) {
      toast({ description: "Erro ao excluir anexo." })
    } finally {
      setDeleteModalOpen(false)
      setDeletingId(null)
    }
  }

  const handleUploadClick = () => {
    if (!advancedEnabled) {
      openPlanUpgrade("crescer")
      return
    }
    setPendingFiles([])
    setIsModalOpen(true)
  }

  const addFilesToPending = (files: FileList) => {
    const totalCurrent = attachments.length
    const totalPending = pendingFiles.length
    const newFilesList: PendingFile[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Strict whitelisting check
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
      const allowedExts = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".odt", ".ppt", ".pptx", ".jpg", ".jpeg", ".png", ".webp", ".avif"]
      if (!allowedExts.includes(ext)) {
        toast({ description: `Tipo de arquivo não permitido: ${file.name}` })
        continue
      }

      // Check size limit (10MB for documents, 5MB for images)
      const isImg = file.type.startsWith("image/")
      const maxSize = isImg ? 5 * 1024 * 1024 : 10 * 1024 * 1024
      if (file.size > maxSize) {
        toast({ description: `Arquivo muito grande (${formatFileSize(file.size)}). Máximo: ${isImg ? "5MB" : "10MB"}.` })
        continue
      }

      if (totalCurrent + totalPending + newFilesList.length >= planLimit) {
        toast({ description: `Você atingiu o limite de ${planLimit} anexos para o seu plano.` })
        break
      }

      newFilesList.push({
        id: `pending-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: "pending"
      })
    }

    if (newFilesList.length > 0) {
      setPendingFiles((prev) => [...prev, ...newFilesList])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFilesToPending(e.target.files)
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files) {
      addFilesToPending(e.dataTransfer.files)
    }
  }

  const handleRemovePending = (id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleSaveUploads = async () => {
    if (pendingFiles.length === 0) return
    setIsSaving(true)

    const uploadPromises = pendingFiles.map(async (pending, index) => {
      if (pending.status === "completed") return

      // Update state to uploading
      setPendingFiles((prev) =>
        prev.map((f) => (f.id === pending.id ? { ...f, status: "uploading", progress: 5 } : f))
      )

      try {
        // 1. Get presigned upload URL from server
        const urlRes = await getOrderPresignedUploadUrlAction(
          partnerId,
          pending.name,
          pending.file.type,
          pending.file.size
        )
        if (!urlRes.success) throw new Error(urlRes.error || "Erro ao gerar URL de upload")

        // Calculate client-side hash
        let fileHash = ""
        try {
          const buffer = await pending.file.arrayBuffer()
          const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
          const hashArray = Array.from(new Uint8Array(hashBuffer))
          fileHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
        } catch (hashErr) {
          console.error("Erro ao calcular hash no cliente:", hashErr)
        }

        // 2. Perform direct R2 upload using XMLHttpRequest to track real progress
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const pct = Math.round((event.loaded / event.total) * 100)
              setPendingFiles((prev) =>
                prev.map((f) => (f.id === pending.id ? { ...f, progress: Math.max(5, pct) } : f))
              )
            }
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              reject(new Error(`Erro upload R2: ${xhr.statusText || xhr.status}`))
            }
          }
          xhr.onerror = () => reject(new Error("Erro de conexão no upload"))
          xhr.onabort = () => reject(new Error("Upload cancelado"))

          xhr.open("PUT", urlRes.uploadUrl)
          xhr.setRequestHeader("Content-Type", pending.file.type || "application/octet-stream")
          xhr.send(pending.file)
        })

        // 3. Save attachment metadata to backend database
        const saveRes = await saveOrderAttachmentAction(
          partnerId,
          orderId,
          urlRes.key,
          pending.name,
          pending.file.type || "application/octet-stream",
          pending.file.size,
          fileHash
        )
        if (!saveRes.success) throw new Error(saveRes.error || "Erro ao salvar no banco")

        setPendingFiles((prev) =>
          prev.map((f) => (f.id === pending.id ? { ...f, status: "completed", progress: 100 } : f))
        )
      } catch (err: any) {
        console.error(err)
        setPendingFiles((prev) =>
          prev.map((f) => (f.id === pending.id ? { ...f, status: "failed", error: err.message || "Erro no upload" } : f))
        )
      }
    })

    await Promise.all(uploadPromises)
    setIsSaving(false)

    // Check if all files succeeded
    const currentPending = pendingFiles
    const hasFailures = currentPending.some((f) => f.status === "failed")
    if (!hasFailures) {
      toast({ description: "Todos os anexos foram enviados com sucesso." })
      setIsModalOpen(false)
      loadAttachments()
    } else {
      toast({ description: "Alguns arquivos falharam no upload. Verifique os erros e tente novamente." })
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <FormSection
          title="Anexos do Pedido"
          description="Gerencie contratos, faturas, ordens ou comprovantes deste pedido."
        >
          <div>
            <Button
              type="button"
              onClick={handleUploadClick}
              className="flex items-center gap-2"
            >
              <UploadIcon className="w-4 h-4" />
              <span>Adicionar Anexo</span>
            </Button>
          </div>
        </FormSection>
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
                  {formatFileSize(att.file_size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => requestDeleteDoc(att.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg absolute -top-2.5 -right-2.5 z-10"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload files modal */}
      {isModalOpen && (
        <DefaultModal
          isOpen={isModalOpen}
          onClose={() => !isSaving && setIsModalOpen(false)}
          title="Upload de arquivos"
          maxWidth="md"
        >
          <div className="space-y-6">
            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
              Selecione e envie os arquivos desejados para este pedido. Limites do seu plano: máximo de {planLimit} anexos.
            </p>

            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-brand-border dark:border-dark-border hover:border-brand-primary dark:hover:border-brand-primary rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer bg-brand-gray/30 dark:bg-dark-border/10 hover:bg-brand-gray/50 transition-colors"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.odt,.ppt,.pptx,image/jpeg,image/png,image/webp,image/avif"
              />
              <IconPlaceholder icon={UploadIcon} title="Upload de arquivos" subtitle="Formatos suportados: PDF, Word, Excel, CSV, Imagens. Até 10MB por arquivo." />
            </div>

            {/* List of files selected */}
            {pendingFiles.length > 0 && (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {pendingFiles.map((pf) => (
                  <div
                    key={pf.id}
                    className="p-3 border border-brand-border dark:border-dark-border rounded-xl bg-brand-gray/10 dark:bg-dark-border/5 relative"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border shrink-0">
                        <FileIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                      </div>
                      <div className="flex-1 min-w-0 pr-6">
                        <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                          {pf.name}
                        </p>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-1.5 mt-0.5">
                          <span>{formatFileSize(pf.size)}</span>
                          {pf.status === "uploading" && (
                            <span className="text-brand-primary animate-pulse flex items-center gap-1">
                              • Enviando ({pf.progress}%)
                            </span>
                          )}
                          {pf.status === "completed" && (
                            <span className="text-brand-green flex items-center gap-0.5">
                              • <CheckCircleIcon className="w-3.5 h-3.5 inline" /> Concluído
                            </span>
                          )}
                          {pf.status === "failed" && (
                            <span className="text-brand-red flex items-center gap-0.5">
                              • <AlertCircleIcon className="w-3.5 h-3.5 inline" /> {pf.error || "Falhou"}
                            </span>
                          )}
                        </p>
                      </div>
                      {!isSaving && pf.status !== "completed" && (
                        <button
                          type="button"
                          onClick={() => handleRemovePending(pf.id)}
                          className="text-brand-inactive-text hover:text-brand-red p-1 rounded-full transition-colors absolute top-3 right-3"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {pf.status === "uploading" && (
                      <div className="w-full bg-brand-border dark:bg-dark-border rounded-full h-1 mt-2.5 overflow-hidden">
                        <div
                          className="bg-brand-primary h-1 rounded-full transition-all duration-300"
                          style={{ width: `${pf.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setIsModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={isSaving || pendingFiles.length === 0}
                onClick={handleSaveUploads}
                className="flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Spinner className="w-4 h-4 text-white animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar Anexos</span>
                )}
              </Button>
            </div>
          </div>
        </DefaultModal>
      )}

      {deleteModalOpen && (
        <AlertModal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={confirmDeleteDoc}
          title="Excluir Anexo"
          message="Tem certeza que deseja excluir este anexo? Esta ação não pode ser desfeita."
          confirmText="Excluir"
          variant="danger"
        />
      )}
    </div>
  )
}
