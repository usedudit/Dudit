"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button } from "@/components/reusable/Button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable/Tabs"
import { ImageOffIcon } from "@/lib/icons"
import ImageCropperModal from "@/components/ImageCropperModal"
import { useR2Upload } from "@/hooks/use-r2-upload"
import { planStarIconForTarget } from "@/components/erp/subscription/PlanUpgradeModal"

interface InsertImageModalProps {
  isOpen: boolean
  onClose: () => void
  onInsert: (url: string, alt: string, width: string, height: string) => void
  imageCount: number
  imageUploadBlocked: boolean
  onUpgradeClick?: () => void
}

const MAX_IMAGES = 5
const MAX_DIMENSION = 900
const DEFAULT_WIDTH = 512

export const InsertImageModal: React.FC<InsertImageModalProps> = ({
  isOpen, onClose, onInsert, imageCount, imageUploadBlocked, onUpgradeClick,
}) => {
  const [tab, setTab] = useState("url")
  const [url, setUrl] = useState("")
  const [alt, setAlt] = useState("")
  const [width, setWidth] = useState(String(DEFAULT_WIDTH))
  const [height, setHeight] = useState("")

  const [uploadedUrl, setUploadedUrl] = useState("")
  const [showCropper, setShowCropper] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { uploadFile } = useR2Upload()

  useEffect(() => {
    if (isOpen) {
      setTab("url")
      setUrl("")
      setAlt("")
      setWidth(String(DEFAULT_WIDTH))
      setHeight("")
      setUploadedUrl("")
      setUploadError("")
    }
  }, [isOpen])

  const handleInsert = () => {
    const finalUrl = tab === "upload" ? uploadedUrl : url
    if (!finalUrl) return
    const w = Math.min(Number(width) || DEFAULT_WIDTH, MAX_DIMENSION)
    const h = height ? Math.min(Number(height), MAX_DIMENSION) : 0
    onInsert(finalUrl, alt, String(w), h ? String(h) : "")
    onClose()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setShowCropper(true)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleCropComplete = useCallback(async (croppedImage: string) => {
    setShowCropper(false)
    setIsUploading(true)
    setUploadError("")
    try {
      const res = await fetch(croppedImage)
      const blob = await res.blob()
      const filename = `editor-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
      const file = new File([blob], filename, { type: "image/png" })
      const result = await uploadFile(file)
      if (result?.publicUrl) {
        setUploadedUrl(result.publicUrl)
      } else {
        setUploadError("Erro ao fazer upload da imagem")
      }
    } catch {
      setUploadError("Erro ao processar a imagem")
    } finally {
      setIsUploading(false)
    }
  }, [uploadFile])

  const handleTabChange = (newTab: string) => {
    if (newTab === "upload" && imageUploadBlocked) {
      onUpgradeClick?.()
      return
    }
    setTab(newTab)
  }

  const atLimit = imageCount >= MAX_IMAGES
  const canInsert = (tab === "upload" && !!uploadedUrl) || (tab === "url" && !!url)

  return (
    <>
      <DefaultModal isOpen={isOpen} onClose={onClose} title="Inserir imagem" maxWidth="md">
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="url">URL</TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-1.5">
              Upload
              {imageUploadBlocked && (
                <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="flex flex-col gap-4">
            <div className="relative border border-brand-border dark:border-dark-border rounded-lg overflow-hidden bg-gray-50 dark:bg-dark-border/50 min-h-[120px] flex items-center justify-center">
              {url ? (
                <img
                  src={url}
                  alt="Preview"
                  className="max-h-48 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                />
              ) : (
                <ImageOffIcon className="w-8 h-8 text-brand-dark/30 dark:text-dark-body/30" />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1">Link da imagem</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
              />
            </div>
          </TabsContent>

          <TabsContent value="upload" className="flex flex-col gap-4">
            <div className="relative border border-brand-border dark:border-dark-border rounded-lg overflow-hidden bg-gray-50 dark:bg-dark-border/50 min-h-[120px] flex items-center justify-center">
              {uploadedUrl ? (
                <img src={uploadedUrl} alt="Preview" className="max-h-48 object-contain" />
              ) : isUploading ? (
                <div className="text-sm text-brand-dark/60 dark:text-dark-body/60">Enviando imagem...</div>
              ) : (
                <ImageOffIcon className="w-8 h-8 text-brand-dark/30 dark:text-dark-body/30" />
              )}
            </div>
            {imageUploadBlocked ? (
              <div className="text-sm text-brand-dark/60 dark:text-dark-body/60 p-3 bg-gray-50 dark:bg-dark-border/20 rounded-lg text-center">
                Faça upgrade para fazer upload de imagens.
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                  className="block w-full text-sm text-brand-dark dark:text-dark-body file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-green/10 file:text-brand-green hover:file:bg-brand-green/20 cursor-pointer file:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {uploadError && (
                  <div className="mt-2 text-sm text-red-500">{uploadError}</div>
                )}
                {uploadedUrl && (
                  <div className="mt-2 text-sm text-brand-green">Imagem enviada com sucesso!</div>
                )}
                <p className="mt-1.5 text-xs text-brand-dark/50 dark:text-dark-body/50">
                  Selecione uma imagem para recortar e enviar.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1">
              Texto alternativo (alt)
            </label>
            <input
              type="text"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Descrição da imagem"
              className="w-full px-3 py-2 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1">Largura (px)</label>
              <input
                type="number"
                min={50}
                max={MAX_DIMENSION}
                value={width}
                onChange={(e) => setWidth(String(Math.min(MAX_DIMENSION, Math.max(50, Number(e.target.value) || 50))))}
                className="w-full px-3 py-2 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1">Altura (px)</label>
              <input
                type="number"
                min={0}
                max={MAX_DIMENSION}
                value={height}
                onChange={(e) => setHeight(e.target.value ? String(Math.min(MAX_DIMENSION, Number(e.target.value))) : "")}
                placeholder="Automático"
                className="w-full px-3 py-2 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/30"
              />
            </div>
          </div>

          {atLimit && (
            <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2.5 rounded-lg">
              Limite de {MAX_IMAGES} imagens atingido. Remova uma imagem existente para adicionar outra.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleInsert} disabled={!canInsert || atLimit || isUploading}>Inserir</Button>
          </div>
        </div>
      </DefaultModal>

      <ImageCropperModal
        isOpen={showCropper}
        onClose={() => setShowCropper(false)}
        onCropComplete={handleCropComplete}
        imageFile={selectedFile}
      />
    </>
  )
}

export default InsertImageModal
