"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button } from "@/components/reusable/Button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/reusable/Tabs"
import { ImageIcon, ImageOffIcon } from "@/lib/icons"
import ImageCropperModal from "@/components/ImageCropperModal"
import { useR2Upload } from "@/hooks/use-r2-upload"
import { planStarIconForTarget } from "@/components/erp/subscription/PlanUpgradeModal"
import { isGifFile } from "@/lib/security/file-validator"
import { WebsiteInput } from "./Inputs/WebsiteInput"
import Input from "./Input"
import { InfoCard } from "./InfoCard"
import IconPlaceholder from "./IconPlaceholder"
import { Spinner } from "./Spinner"

interface EditImageData {
  url: string
  alt: string
  width: string
  height: string
}

interface InsertImageModalProps {
  isOpen: boolean
  onClose: () => void
  onInsert: (url: string, alt: string, width: string, height: string) => void
  imageCount: number
  imageUploadBlocked: boolean
  onUpgradeClick?: () => void
  editImageData?: EditImageData | null
  onEdit?: (url: string, alt: string, width: string, height: string) => void
}

const MAX_IMAGES = 5
const MAX_DIMENSION = 900
const DEFAULT_WIDTH = 500

export const InsertImageModal: React.FC<InsertImageModalProps> = ({
  isOpen, onClose, onInsert, imageCount, imageUploadBlocked, onUpgradeClick, editImageData, onEdit,
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
  const [editMode, setEditMode] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (editImageData) {
        setEditMode(true)
        setTab("url")
        setUrl(editImageData.url)
        setAlt(editImageData.alt)
        setWidth(editImageData.width)
        setHeight(editImageData.height)
        setUploadedUrl("")
        setUploadError("")
      } else {
        setEditMode(false)
        setTab("url")
        setUrl("")
        setAlt("")
        setWidth(String(DEFAULT_WIDTH))
        setHeight("")
        setUploadedUrl("")
        setUploadError("")
      }
    }
  }, [isOpen, editImageData])

  const handleWidthBlur = () => {
    if (!width) return
    const num = Number(width)
    if (isNaN(num)) {
      setWidth(String(DEFAULT_WIDTH))
      return
    }
    if (num < 50) {
      setWidth("50")
    } else if (num > MAX_DIMENSION) {
      setWidth(String(MAX_DIMENSION))
    }
  }

  const handleHeightBlur = () => {
    if (!height) return
    const num = Number(height)
    if (isNaN(num) || num <= 0) {
      setHeight("")
      return
    }
    if (num > MAX_DIMENSION) {
      setHeight(String(MAX_DIMENSION))
    }
  }

  const handleConfirm = () => {
    const finalUrl = tab === "upload" ? uploadedUrl : url
    if (!finalUrl) return
    const numW = width ? Number(width) : DEFAULT_WIDTH
    const w = Math.min(MAX_DIMENSION, Math.max(50, numW || DEFAULT_WIDTH))
    const numH = height ? Number(height) : 0
    const h = numH ? Math.min(MAX_DIMENSION, Math.max(0, numH)) : 0
    if (editMode && onEdit) {
      onEdit(finalUrl, alt, String(w), h ? String(h) : "")
    } else {
      onInsert(finalUrl, alt, String(w), h ? String(h) : "")
    }
    onClose()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (isGifFile(file)) {
        setUploadError("Arquivos GIF não são permitidos no sistema.")
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }
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

  const atLimit = !editMode && imageCount >= MAX_IMAGES
  const canConfirm = (tab === "upload" && !!uploadedUrl) || (tab === "url" && !!url)

  return (
    <>
      <DefaultModal isOpen={isOpen} onClose={onClose} title={editMode ? "Editar imagem" : "Inserir imagem"} maxWidth="md">
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
              <WebsiteInput
                label="Link da imagem"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full"
              />
            </div>
          </TabsContent>

          <TabsContent value="upload" className="flex flex-col gap-4">
            {imageUploadBlocked ? (
              <div className="text-sm text-brand-dark/60 dark:text-dark-body/60 p-4 bg-gray-50 dark:bg-dark-border/20 rounded-lg text-center">
                Faça upgrade para fazer upload de imagens.
              </div>
            ) : uploadedUrl ? (
              <div className="flex flex-col gap-2">
                <div className="relative border border-brand-border dark:border-dark-border rounded-lg overflow-hidden bg-gray-50 dark:bg-dark-border/50 min-h-[140px] flex items-center justify-center">
                  <img src={uploadedUrl} alt="Preview" className="max-h-48 object-contain" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Trocar imagem
                  </Button>
                  <Button
                    type="button"
                    variant="ghostred"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setUploadedUrl("")
                      if (fileInputRef.current) fileInputRef.current.value = ""
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ) : isUploading ? (
              <div className="border border-brand-border dark:border-dark-border rounded-lg min-h-[160px] flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-dark-border/50">
                <Spinner size={24} className="text-brand-green" />
                <span className="text-sm text-brand-dark/60 dark:text-dark-body/60">Enviando imagem...</span>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-brand-border dark:border-dark-border hover:border-brand-green dark:hover:border-brand-green rounded-lg py-8 px-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-gray-50/50 dark:bg-dark-border/20 group"
              >
                <IconPlaceholder
                  icon={ImageIcon}
                  title="Upload de imagem"
                  subtitle="Clique para selecionar"
                />
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp, image/avif"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="hidden"
            />

            {uploadError && (
              <div className="text-sm text-red-500 text-center">{uploadError}</div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-4 mt-4">
          <div>
            <Input
              label="Texto alternativo (alt)"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Descrição da imagem"
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Largura (px)"
                type="number"
                min={50}
                max={MAX_DIMENSION}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                onBlur={handleWidthBlur}
                placeholder="500"
                className="w-full"
              />
            </div>
            <div>
              <Input
                label="Altura (px)"
                type="number"
                min={0}
                max={MAX_DIMENSION}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                onBlur={handleHeightBlur}
                placeholder="Automático"
                className="w-full"
              />
            </div>
          </div>

          {atLimit && (
            <InfoCard message={`Limite de ${MAX_IMAGES} imagens atingido.`} color="red" />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={!canConfirm || (atLimit && !editMode) || isUploading}>
              {editMode ? "Salvar" : "Inserir"}
            </Button>
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
