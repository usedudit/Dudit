"use client"

import type React from "react"
import { useState, useRef, useCallback } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button, Spinner } from "@/components/reusable"
import { UploadIcon, SparklesIcon, XIcon, ImageIcon } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import { isGifFile } from "@/lib/security/file-validator"

interface Props {
    isOpen: boolean
    onClose: () => void
    onAnalyze: (images: Array<{ base64: string; mimeType: string; file: File }>) => Promise<void>
    isLoading?: boolean
    maxImages?: number
}

const MAX_IMAGES = 3
const MAX_IMAGE_SIZE_MB = 5

export const ImageAnalysisModal: React.FC<Props> = ({
    isOpen,
    onClose,
    onAnalyze,
    isLoading = false,
    maxImages = MAX_IMAGES,
}) => {
    const { warning: notifyWarning } = useNotification()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])

        // Filtrar GIFs
        const validFiles = files.filter((f) => {
            if (isGifFile(f)) {
                notifyWarning("Arquivos GIF não são permitidos.")
                return false
            }
            return true
        })

        // Validar tamanho
        const tooLarge = validFiles.filter((f) => f.size > MAX_IMAGE_SIZE_MB * 1024 * 1024)
        if (tooLarge.length > 0) {
            notifyWarning(`Imagem muito grande. Limite de ${MAX_IMAGE_SIZE_MB}MB por arquivo.`)
            return
        }

        // Limitar quantidade
        const remainingSlots = maxImages - selectedFiles.length
        const newFiles = [...selectedFiles, ...validFiles.slice(0, remainingSlots)]

        setSelectedFiles(newFiles)

        // Gerar previews
        const newUrls = [...previewUrls]
        validFiles.slice(0, remainingSlots).forEach((file) => {
            newUrls.push(URL.createObjectURL(file))
        })
        setPreviewUrls(newUrls)

        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const handleRemoveImage = (index: number) => {
        const newFiles = [...selectedFiles]
        const newUrls = [...previewUrls]

        URL.revokeObjectURL(newUrls[index])
        newFiles.splice(index, 1)
        newUrls.splice(index, 1)

        setSelectedFiles(newFiles)
        setPreviewUrls(newUrls)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()

        const files = Array.from(e.dataTransfer.files || [])
        if (files.length > 0) {
            handleFileSelect({ target: { files } } as any)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleAnalyze = async () => {
        if (selectedFiles.length === 0) {
            notifyWarning("Atenção", "Adicione pelo menos uma imagem.")
            return
        }

        const imagesWithBase64 = await Promise.all(
            selectedFiles.map(async (file) => {
                return new Promise<{ base64: string; mimeType: string; file: File }>((resolve) => {
                    const reader = new FileReader()
                    reader.onloadend = () => {
                        const result = reader.result as string
                        const base64 = result.split(",")[1] || ""
                        resolve({
                            base64,
                            mimeType: file.type || "image/jpeg",
                            file,
                        })
                    }
                    reader.readAsDataURL(file)
                })
            })
        )

        await onAnalyze(imagesWithBase64)
    }

    const handleClose = () => {
        // Limpar URLs de preview
        previewUrls.forEach((url) => URL.revokeObjectURL(url))
        setPreviewUrls([])
        setSelectedFiles([])
        onClose()
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={handleClose}
            title="Analisar Imagem com IA"
            maxWidth="lg"
        >
            <div className="space-y-6 pt-4 pb-2">
                {/* Área de Drop */}
                <div
                    className="border-2 border-dashed border-brand-border dark:border-dark-border rounded-lg p-8 text-center cursor-pointer hover:border-brand-purple hover:bg-brand-purple/5 transition-colors"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <UploadIcon className="w-8 h-8 mx-auto mb-3 text-brand-inactive-text dark:text-dark-body" />
                    <p className="text-sm text-brand-dark dark:text-dark-heading font-medium mb-1">
                        Arraste imagens ou clique para selecionar
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                        Suporte: PNG, JPG, WEBP, AVIF (máx. {MAX_IMAGE_SIZE_MB}MB cada)
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                        Máximo de {maxImages} imagens (analisamos todas para melhor precisão)
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png, image/jpeg, image/webp, image/avif"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                </div>

                {/* Previews */}
                {selectedFiles.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                        {previewUrls.map((url, index) => (
                            <div key={index} className="relative group">
                                <img
                                    src={url}
                                    alt={`Preview ${index + 1}`}
                                    className="w-full h-24 object-cover rounded-lg border border-brand-border dark:border-dark-border"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleRemoveImage(index)}
                                    className="absolute -top-2 -right-2 w-6 h-6 bg-brand-red rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <XIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                    <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleAnalyze}
                        disabled={isLoading || selectedFiles.length === 0}
                        leftIcon={isLoading ? <Spinner size={18} /> : <SparklesIcon size={18} />}
                    >
                        {isLoading ? "Analisando..." : `Analisar com IA`}
                    </Button>
                </div>
            </div>
        </DefaultModal>
    )
}

export default ImageAnalysisModal
