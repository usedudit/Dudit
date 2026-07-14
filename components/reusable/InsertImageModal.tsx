"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button } from "@/components/reusable/Button"
import { ImageOffIcon } from "@/lib/icons"
import ImageCropperModal from "@/components/ImageCropperModal"
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
  const [tab, setTab] = useState<"upload" | "url">("url")
  const [url, setUrl] = useState("")
  const [alt, setAlt] = useState("")
  const [width, setWidth] = useState(String(DEFAULT_WIDTH))
  const [height, setHeight] = useState("")

  const [uploadedSrc, setUploadedSrc] = useState("")
  const [showCropper, setShowCropper] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTab("url")
      setUrl("")
      setAlt("")
      setWidth(String(DEFAULT_WIDTH))
      setHeight("")
      setUploadedSrc("")
    }
  }, [isOpen])

  const handleInsert = () => {
    const finalUrl = tab === "upload" ? uploadedSrc : url
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

  const handleCropComplete = useCallback((croppedImage: string) => {
    setShowCropper(false)
    setUploadedSrc(croppedImage)
  }, [])

  const handleTabChange = (newTab: "upload" | "url") => {
    if (newTab === "upload" && imageUploadBlocked) {
      onUpgradeClick?.()
      return
    }
    setTab(newTab)
  }

  const atLimit = imageCount >= MAX_IMAGES
  const canInsert = (tab === "upload" && !!uploadedSrc) || (tab === "url" && !!url)

  return (
    <>
      <DefaultModal isOpen={isOpen} onClose={onClose} title="Inserir imagem" maxWidth="md">
        <div className="flex gap-1 mb-4 border-b border-brand-border dark:border-dark-border">
          <button
            type="button"
            onClick={() => handleTabChange("url")}
            className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === "url"
                ? "border-brand-green text-brand-green"
                : "border-transparent text-brand-dark/60 dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
            }`}
          >
            URL
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("upload")}
            className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              tab === "upload"
                ? "border-brand-green text-brand-green"
                : "border-transparent text-brand-dark/60 dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
            }`}
          >
            Upload
            {imageUploadBlocked && (
              <img src={planStarIconForTarget("crescer")!} alt="" className="w-3.5 h-3.5 object-contain" />
            )}
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="relative border border-brand-border dark:border-dark-border rounded-lg overflow-hidden bg-gray-50 dark:bg-dark-border/50 min-h-[120px] flex items-center justify-center">
            {(tab === "url" && url) || (tab === "upload" && uploadedSrc) ? (
              <img
                src={tab === "url" ? url : uploadedSrc}
                alt="Preview"
                className="max-h-48 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none"
                }}
              />
            ) : (
              <ImageOffIcon className="w-8 h-8 text-brand-dark/30 dark:text-dark-body/30" />
            )}
          </div>

          {tab === "url" && (
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
          )}

          {tab === "upload" && (
            <div>
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
                    className="block w-full text-sm text-brand-dark dark:text-dark-body file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-green/10 file:text-brand-green hover:file:bg-brand-green/20 cursor-pointer file:cursor-pointer"
                  />
                  {uploadedSrc && (
                    <div className="mt-2 text-sm text-brand-green">Imagem carregada com sucesso!</div>
                  )}
                  <p className="mt-1.5 text-xs text-brand-dark/50 dark:text-dark-body/50">
                    Selecione uma imagem para recortar.
                  </p>
                </div>
              )}
            </div>
          )}

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
              <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1">
                Largura (px)
              </label>
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
              <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1">
                Altura (px)
              </label>
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
            <Button onClick={handleInsert} disabled={!canInsert || atLimit}>
              Inserir
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
