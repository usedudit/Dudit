"use client"

import type React from "react"
import { useRef, useState, useEffect } from "react"
import { TrashIcon, UploadIcon, StarIcon, AlertTriangleIcon } from "@/lib/icons"
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import AlertModal from "@/components/reusable/AlertModal"
import { Badge, Tooltip, Spinner } from "@/components/reusable"
import { isGifFile } from "@/lib/security/file-validator"
import { useToast } from "@/hooks/use-toast"

interface ProductImagesSectionProps {
    images: (string | File)[]
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
    onRemoveImage: (index: number) => void
    onSetPrimaryImage: (index: number) => void
    isEditing: boolean
    uploadingImages?: Set<number>
    blockedImages?: Set<number>
    isSaving?: boolean
    moderationStatus?: 'approved' | 'pending_moderation' | 'rejected'
    onImageClick?: (index: number) => void
}

function ProductImagesSection({
    images,
    onImageUpload,
    onRemoveImage,
    onSetPrimaryImage,
    isEditing,
    uploadingImages = new Set(),
    blockedImages = new Set(),
    isSaving = false,
    moderationStatus,
}: ProductImagesSectionProps) {
    const { toast } = useToast()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
    const [imageToDelete, setImageToDelete] = useState<number | null>(null)

    // Manage object URLs for file previews
    const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({})

    useEffect(() => {
        const newPreviewUrls: Record<number, string> = {}

        images.forEach((img, index) => {
            if (img instanceof File) {
                newPreviewUrls[index] = URL.createObjectURL(img)
            }
        })

        setPreviewUrls(newPreviewUrls)

        // Cleanup function to revoke URLs when component unmounts or images change
        return () => {
            Object.values(newPreviewUrls).forEach(url => URL.revokeObjectURL(url))
        }
    }, [images])

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (files) {
            const fileArr = Array.from(files)
            if (fileArr.some(f => isGifFile(f))) {
                toast({ description: "Arquivos GIF não são permitidos no sistema." })
            }
        }
        onImageUpload(e)
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const confirmDeleteImage = () => {
        if (imageToDelete !== null) {
            onRemoveImage(imageToDelete)
        }
        setImageToDelete(null)
    }

    // Helper to get image source
    const getImageSource = (image: string | File, index: number) => {
        if (image instanceof File) {
            return previewUrls[index] || "https://img.dudit.com.br/static/Placeholder.png"
        }
        if (typeof image === 'string') {
            if (image.startsWith("data:") || image.startsWith("blob:")) return image
            return getR2ImageUrl(image) || "https://img.dudit.com.br/static/Placeholder.png"
        }
        return "https://img.dudit.com.br/static/Placeholder.png"
    }

    // Classes para a borda pontilhada externa
    const dropzoneClasses = `
    shrink-0 border-2 border-dashed border-brand-border dark:border-dark-border 
    rounded-lg flex flex-col items-center justify-center transition-colors
    ${isEditing
            ? "cursor-pointer hover:border-brand-green dark:hover:border-brand-green"
            : "opacity-50 cursor-not-allowed select-none"
        }
`

    return (
        <>
            <div className="bg-white dark:bg-dark-surface">
                {!images || images.length === 0 ? (
                    // CASO 1: Estado Vazio Inicial
                    <label className={`w-48 h-48 ${dropzoneClasses}`}>
                        <IconPlaceholder
                            icon={UploadIcon}
                            iconSize="w-8 h-8"
                            title="Enviar imagem"
                            subtitle="Clique para adicionar"
                        />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png, image/jpeg, image/webp, image/avif"
                            multiple
                            onChange={handleImageUpload}
                            disabled={!isEditing}
                            className="hidden"
                        />
                    </label>
                ) : (
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-brand-border dark:scrollbar-thumb-dark-border scrollbar-track-transparent">
                        {images.map((image, index) => (
                            <div
                                key={index}
                                className={`
                relative shrink-0 w-48 h-48 rounded-lg bg-brand-gray 
                border border-brand-border dark:border-dark-border 
                overflow-hidden transition-all group
                ${isEditing
                                        ? "cursor-pointer hover:border-brand-green dark:hover:border-brand-green"
                                        : "opacity-50 cursor-not-allowed"
                                    }
              `}
                                 onClick={(e) => {
                                        e.stopPropagation()
                                        onImageClick?.(index)
                                    }}
                                    onMouseEnter={() => setHoveredIndex(index)}
                                onMouseLeave={() => setHoveredIndex(null)}
                            >
                                {uploadingImages.has(index) ? (
                                    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-dark-border">
                                        <Spinner size={18} color="white" />
                                    </div>
                                ) : (
                                    <img
                                        src={getImageSource(image, index)}
                                        alt={`Imagem ${index + 1}`}
                                        className="w-full h-full object-cover"
                                    />
                                )}

                                {index === 0 && !uploadingImages.has(index) && (
                                    <div className="absolute top-2 right-2 bg-brand-green rounded-full p-1.5 shadow-lg">
                                        <StarIcon className="w-4 h-4 text-white fill-white" />
                                    </div>
                                )}

                                {/* Badge de Moderação Bloqueada - só aparece se a imagem foi bloqueada */}
                                {blockedImages.has(index) && !uploadingImages.has(index) && (
                                    <div className={`absolute top-2 ${index === 0 ? "right-10" : "right-2"} z-10`}>
                                        <Tooltip text="Aguardando aprovação pela moderação para exibição na vitrine online.">
                                            <div className="bg-orange-50 dark:bg-orange-900/40 rounded-full p-1.5 shadow-lg border border-orange-100 dark:border-orange-900/50 flex items-center justify-center">
                                                <AlertTriangleIcon className="w-4 h-4 text-brand-orange dark:text-orange-400" />
                                            </div>
                                        </Tooltip>
                                    </div>
                                )}

                                {isEditing && hoveredIndex === index && !uploadingImages.has(index) && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2">
                                        {index !== 0 && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onSetPrimaryImage(index)
                                                }}
                                                className="bg-white hover:bg-brand-green hover:text-white text-brand-dark rounded-full p-2 transition-colors"
                                            >
                                                <StarIcon className="w-5 h-5" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setImageToDelete(index)
                                            }}
                                            className="bg-white hover:bg-brand-red-dark hover:text-white text-brand-dark rounded-full p-2 transition-colors"
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}

                        {images.length < 10 && (
                            // CASO 2: Botão "Adicionar Mais"
                            <label className={`w-48 h-48 ${dropzoneClasses}`}>
                                <IconPlaceholder
                                    icon={UploadIcon}
                                    iconSize="w-8 h-8"
                                    title="Enviar imagem"
                                    subtitle="Clique para adicionar"
                                />
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png, image/jpeg, image/webp, image/avif"
                                    multiple
                                    onChange={handleImageUpload}
                                    disabled={!isEditing}
                                    className="hidden"
                                />
                            </label>
                        )}
                    </div>
                )}
            </div>

            {/* Confirm Delete Modal */}
            <AlertModal
                isOpen={imageToDelete !== null}
                onClose={() => setImageToDelete(null)}
                title="Remover Imagem"
                description="Tem certeza que deseja remover esta imagem? Esta ação não pode ser desfeita."
                confirmText="Remover"
                cancelText="Cancelar"
                onConfirm={confirmDeleteImage}
                variant="danger"
            />
        </>
    )
}

export default ProductImagesSection

