'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TrashIcon, UploadIcon, Package, XIcon } from "@/lib/icons"
import { Input, Button, IconPlaceholder, Spinner } from "@/components/reusable"
import { MoneyInput } from "@/components/reusable/Inputs/MoneyInput"
import { TagsInput } from "@/components/reusable/TagsInput"
import { Switch } from "@/components/reusable/Switch"
import { QuantitySelector } from "@/components/reusable/QuantitySelector"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import ImageCropperModal from "@/components/ImageCropperModal"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { createProductVariantsBatchAction, getProductVariantsAction } from "@/app/actions/erp/products"
import { useNotification } from "@/hooks/use-notification"
import { useToast } from "@/hooks/use-toast"
import { isGifFile } from "@/lib/security/file-validator"
import { fetchWithCSRF } from "@/lib/utils/fetch-with-csrf"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { optimizeImageForUpload } from "@/lib/utils/variant-image-optimizer"
import QuickStockMovementSheet from "./QuickStockMovementSheet"

interface AddVariantSheetProps {
    isOpen: boolean
    onClose: () => void
    product: any
    onSaveSuccess?: () => void
    onSavePendingVariants?: (variants: any[]) => void
}

interface VariantCard {
    id: number
    type: string
    values: string[]
    useImage: boolean
}

interface CropContext {
    type: 'row' | 'config'
    id: string | number
    value?: string
    variantIndex?: number
}

// Helper para formatar parte do SKU (ex: "Azul Marinho" -> "AZUL")
const formatForSku = (text: string) => {
    if (!text) return ""
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "") // Remove espaços e chars especiais
        .toUpperCase()
        .substring(0, 4) // Limita a 4 chars por variação
}

// --- COMPONENTE DE UPLOAD CORRIGIDO E OTIMIZADO ---
const VariantImageUpload = React.memo(({
    image,
    onSelectFile,
    onRemove,
    size = "md"
}: {
    image: string | File | null,
    onSelectFile: (file: File) => void,
    onRemove?: () => void,
    size?: "sm" | "md"
}) => {
    const { toast } = useToast()
    const inputRef = useRef<HTMLInputElement>(null)
    const [preview, setPreview] = useState<string | null>(null)

    useEffect(() => {
        if (!image) {
            setPreview(null)
            return
        }
        if (typeof image === 'string') {
            setPreview(getR2ImageUrl(image))
        } else if (image instanceof File) {
            const url = URL.createObjectURL(image)
            setPreview(url)
            return () => URL.revokeObjectURL(url)
        }
    }, [image])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            if (isGifFile(file)) {
                toast({ description: "Arquivos GIF não são permitidos no sistema." })
                if (inputRef.current) inputRef.current.value = ""
                return
            }
            onSelectFile(file)
            if (inputRef.current) inputRef.current.value = ""
        }
    }

    const containerClasses = size === "sm" ? "w-10 h-10 rounded-lg" : "w-24 h-24 rounded-xl"
    const iconClasses = size === "sm" ? "w-4 h-4" : "w-6 h-6"

    return (
        <div
            className={`${containerClasses} relative group shrink-0 select-none`}
            onClick={(e) => {
                // Se já tem imagem, o clique no container não deve fazer nada (botão de remover faz)
                // Se não tem imagem, abre o seletor
                if (!preview) inputRef.current?.click()
            }}
        >
            <input
                type="file"
                className="hidden"
                ref={inputRef}
                accept="image/png, image/jpeg, image/webp, image/avif"
                onChange={handleFileChange}
            />

            {preview ? (
                <div className={`w-full h-full relative overflow-hidden border border-brand-border dark:border-dark-border ${size === "sm" ? "rounded-lg" : "rounded-xl"}`}>
                    <img
                        src={preview || "https://img.dudit.com.br/static/Placeholder.png"}
                        alt="Variant"
                        className="w-full h-full object-cover"
                    />

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                        <Button
                            variant="destructive"
                            onClick={(e) => {
                                e.stopPropagation()
                                e.preventDefault()
                                onRemove?.()
                            }}
                            className={`flex items-center justify-center ${size === 'md' ? 'w-8 h-8' : 'w-6 h-6'}`}
                            title="Remover imagem"
                        >
                            <TrashIcon className={size === 'md' ? "w-4 h-4" : "w-3 h-3"} />
                        </Button>
                    </div>
                </div>
            ) : (
                <div
                    className={`w-full h-full border border-dashed border-brand-border dark:border-dark-border flex items-center justify-center bg-brand-gray dark:bg-dark-border/30 hover:bg-brand-gray dark:hover:bg-dark-border/50 transition-colors cursor-pointer ${size === "sm" ? "rounded-lg" : "rounded-xl"}`}
                >
                    <UploadIcon className={`${iconClasses} text-brand-inactive-text dark:text-dark-body`} />
                </div>
            )}
        </div>
    )
})
VariantImageUpload.displayName = "VariantImageUpload"

const AddVariantSheet: React.FC<AddVariantSheetProps> = ({ isOpen, onClose, product, onSaveSuccess, onSavePendingVariants }) => {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { success: notifySuccess, error: notifyError } = useNotification()

    // z-index dinâmico: este modal abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)

    const [isSaving, setIsSaving] = useState(false)
    const [savingStatusText, setSavingStatusText] = useState("Salvando variações...")
    const [variants, setVariants] = useState<VariantCard[]>([
        { id: Date.now(), type: "", values: [], useImage: false },
    ])

    // Estado para armazenar imagens que foram deletadas (keys)
    const [deletedImageKeys, setDeletedImageKeys] = useState<Set<string>>(new Set())
    const [existingVariants, setExistingVariants] = useState<any[]>([])
    const [isLoadingVariants, setIsLoadingVariants] = useState(false)

    const [excludedRowIds, setExcludedRowIds] = useState<Set<string>>(new Set())
    const [rowImages, setRowImages] = useState<Record<string, File | string | null>>({})
    const [configImages, setConfigImages] = useState<Record<string, File | string | null>>({})

    // Overrides de dados da tabela (preço, estoque, sku manual)
    const [rowOverrides, setRowOverrides] = useState<Record<string, any>>({})

    // Estado para rastrear quais variantes tiveram imagem modificada
    const [modifiedImageRows, setModifiedImageRows] = useState<Set<string>>(new Set())

    // Estados do Cropper e Modal
    const [showImageCropper, setShowImageCropper] = useState(false)
    const [selectedImageForCrop, setSelectedImageForCrop] = useState<File | null>(null)
    const [cropContext, setCropContext] = useState<CropContext | null>(null)

    // Estado para exclusão
    const [imageToDelete, setImageToDelete] = useState<{ key: string, type: 'config' | 'row' } | null>(null)
    const [isDeletingImage, setIsDeletingImage] = useState(false) // Declare the variable here

    const [confirmAction, setConfirmAction] = useState<{
        title: string
        message: string
        onConfirm: () => void
    } | null>(null)

    const [selectedVariantForAdjustment, setSelectedVariantForAdjustment] = useState<any | null>(null)

    // Scroll
    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, [])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, variants, excludedRowIds])

    // --- SEMPRE PUXAR DADOS DO BANCO QUANDO ABRIR ---
    useEffect(() => {
        if (!isOpen || !product?.id) return

        const loadVariantsFromDB = async () => {
            setIsLoadingVariants(true)
            try {
                const result = await getProductVariantsAction(product.id)
                if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                    const dbVariants = result.data
                    // dbVariants shape: { id, name, type, value, sku, price, stock, image, status, color, size }

                    // Agrupar variantes por tipo (ex: "Cor", "Tamanho", "Material")
                    const variantsByType: Record<string, Set<string>> = {}
                    const typesOrder: string[] = []

                    dbVariants.forEach((v: any) => {
                        if (!v.type || !v.value) return
                        const types = v.type.split(" / ").map((t: string) => t.trim())
                        const values = v.value.split(" / ").map((val: string) => val.trim())
                        types.forEach((trimmedType: string, idx: number) => {
                            const trimmedValue = values[idx]
                            if (!trimmedType || !trimmedValue) return
                            if (!variantsByType[trimmedType]) {
                                variantsByType[trimmedType] = new Set()
                                typesOrder.push(trimmedType)
                            }
                            variantsByType[trimmedType].add(trimmedValue)
                        })
                    })

                    const typeIdMap = new Map<string, number>()
                    const newVariants: VariantCard[] = typesOrder.map((type, idx) => {
                        const variantId = Date.now() + idx
                        typeIdMap.set(type, variantId)
                        return {
                            id: variantId,
                            type,
                            values: Array.from(variantsByType[type]),
                            useImage: false,
                        }
                    })

                    // Identificar qual tipo de variação usa imagem e mapear para configImages
                    const configImgs: Record<string, any> = {}
                    const variantTypeImagesCount: Record<string, number> = {}

                    typesOrder.forEach((type, typeIdx) => {
                        dbVariants.forEach((v: any) => {
                            if (v.image && v.value) {
                                const values = v.value.split(" / ").map((val: string) => val.trim())
                                const valForType = values[typeIdx]
                                if (valForType) {
                                    const variantId = typeIdMap.get(type)!
                                    const configKey = `${variantId}_${valForType}`
                                    if (!configImgs[configKey]) {
                                        configImgs[configKey] = v.image
                                        variantTypeImagesCount[type] = (variantTypeImagesCount[type] || 0) + 1
                                    }
                                }
                            }
                        })
                    })

                    // Encontrar o tipo que possui imagens (ex: "Cor") e marcar useImage = true
                    let hasImageOption = false
                    newVariants.forEach((v) => {
                        if ((variantTypeImagesCount[v.type] || 0) > 0 && !hasImageOption) {
                            v.useImage = true
                            hasImageOption = true
                        }
                    })

                    // Preencher overrides (sku, price, stock, active) para as linhas da tabela
                    const overrides: Record<string, any> = {}
                    const images: Record<string, string | File> = {}

                    dbVariants.forEach((v: any) => {
                        if (!v.value) return
                        const rowId = v.value.split(" / ").map((val: string) => val.trim()).join("-")

                        overrides[rowId] = {
                            sku: v.sku,
                            price: v.price != null ? String(v.price) : "0",
                            stock: v.stock != null ? Number(v.stock) : 0,
                            active: v.status !== false,
                        }

                        // Se não tem imagem na config (nenhum tipo com useImage), coloca na row
                        if (!hasImageOption && v.image) {
                            images[rowId] = v.image
                        }
                    })

                    setVariants(newVariants)
                    setRowOverrides(overrides)
                    setRowImages(images)
                    setConfigImages(configImgs)
                    setDeletedImageKeys(new Set())
                    setExcludedRowIds(new Set())
                    setExistingVariants(dbVariants)
                }
            } catch (error) {
                console.error("Erro ao carregar variações:", error)
            } finally {
                setIsLoadingVariants(false)
            }
        }

        loadVariantsFromDB()
    }, [isOpen, product?.id])

    // --- RESETAR ESTADOS AO FECHAR ---
    useEffect(() => {
        if (!isOpen) {
            // Limpar todos os estados
            setVariants([{ id: Date.now(), type: "", values: [], useImage: false }])
            setExcludedRowIds(new Set())
            setRowImages({})
            setConfigImages({})
            setRowOverrides({})
            setDeletedImageKeys(new Set())
            setExistingVariants([])
            setModifiedImageRows(new Set())
        }
    }, [isOpen])

    // --- LÓGICA DE GERAÇÃO DA TABELA (MEMOIZED) ---
    const tableRows = useMemo(() => {
        const validVariants = variants.filter((v) => v.values.length > 0)
        if (validVariants.length === 0) return []

        // Produto Cartesiano
        const cartesian = (a: any[], b: any[]): any[] => ([] as any[]).concat(...a.map((d: any) => b.map((e: any) => ([] as any[]).concat(d, e))))
        let combinations = validVariants[0].values.map((v) => [v])

        for (let i = 1; i < validVariants.length; i++) {
            combinations = cartesian(combinations, validVariants[i].values)
        }

        const baseSku = product?.sku || "PRD"

        const rows = combinations.map((combo) => {
            const comboArray = Array.isArray(combo) ? combo : [combo]
            const id = comboArray.join("-")

            // SKU GERADO: PARENT + VARIANTS (EX: CAM-001-AZUL-G)
            const variantSuffix = comboArray.map(formatForSku).join("-")
            const generatedSku = `${baseSku}-${variantSuffix}`

            return {
                id: id,
                name: comboArray.join(" / "),
                values: comboArray,
                sku: generatedSku, // SKU Semântico Padrão
                price: product?.price || "0",
                stock: 0,
            }
        })

        return rows.filter(row => !excludedRowIds.has(row.id))
    }, [variants, product?.sku, product?.price, excludedRowIds])

    // Helper para obter a imagem correta de uma linha
    const getRowImage = useCallback((rowValues: string[], rowId: string) => {
        // 1. Prioridade: Imagem específica da linha (upload direto na tabela)
        if (rowImages[rowId] !== undefined && rowImages[rowId] !== null) {
            return rowImages[rowId]
        }

        // 2. Fallback: Imagem da configuração de qualquer variante com useImage ativo
        if (variants.length > 0 && rowValues.length > 0) {
            for (let i = 0; i < variants.length; i++) {
                const variant = variants[i]
                if (variant.useImage && rowValues[i]) {
                    const primaryValue = rowValues[i]
                    const configKey = `${variant.id}_${primaryValue}`
                    if (configImages[configKey] !== undefined && configImages[configKey] !== null) {
                        return configImages[configKey]
                    }
                }
            }
        }
        return null
    }, [rowImages, configImages, variants])

    const updateRow = useCallback((id: string, field: string, value: any) => {
        setRowOverrides((prev) => ({
            ...prev,
            [id]: { ...prev[id], [field]: value },
        }))
    }, [])

    // Combina os dados base com os overrides
    const getDisplayData = useCallback((baseRow: any) => {
        const override = rowOverrides[baseRow.id]
        return override ? { ...baseRow, ...override } : baseRow
    }, [rowOverrides])


    // --- HANDLERS DE CROPPER E SINCRONIZAÇÃO ---
    const handleInitiateCrop = (file: File, context: CropContext) => {
        setSelectedImageForCrop(file)
        setCropContext(context)
        setShowImageCropper(true)
    }

    const handleCropComplete = async (croppedImageUrl: string) => {
        try {
            const response = await fetch(croppedImageUrl)
            const blob = await response.blob()
            const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.split('/')[1] || "png"
            const file = new File([blob], `cropped-variant.${extension}`, { type: blob.type })

            if (cropContext) {
                let configKey = ""
                let variantIdToEnable = -1

                if (cropContext.type === 'config' && cropContext.value) {
                    configKey = `${cropContext.id}_${cropContext.value}`
                    variantIdToEnable = Number(cropContext.id)

                    // Limpar overrides antigos em string das linhas que compartilham este valor
                    const variantIdx = variants.findIndex(v => v.id === variantIdToEnable)
                    if (variantIdx >= 0) {
                        setRowImages(prev => {
                            const next = { ...prev }
                            tableRows.forEach(r => {
                                if (r.values[variantIdx] === cropContext.value && typeof next[r.id] === 'string') {
                                    delete next[r.id]
                                }
                            })
                            return next
                        })
                    }
                } else if (cropContext.type === 'row') {
                    const row = tableRows.find(r => r.id === cropContext.id)
                    const imgVariantIdx = variants.findIndex(v => v.useImage)
                    const targetIdx = imgVariantIdx >= 0 ? imgVariantIdx : 0
                    const activeVariant = variants[targetIdx]

                    if (row && activeVariant) {
                        const activeValue = row.values[targetIdx]
                        if (activeValue) {
                            configKey = `${activeVariant.id}_${activeValue}`
                            variantIdToEnable = activeVariant.id

                            // Limpar overrides antigos das linhas com o mesmo valor
                            setRowImages(prev => {
                                const next = { ...prev }
                                tableRows.forEach(r => {
                                    if (r.values[targetIdx] === activeValue && typeof next[r.id] === 'string') {
                                        delete next[r.id]
                                    }
                                })
                                next[cropContext.id] = file
                                return next
                            })
                        }
                    } else {
                        setRowImages(prev => ({ ...prev, [cropContext.id]: file }))
                    }
                    setModifiedImageRows(prev => new Set(prev).add(String(cropContext.id)))
                }

                if (configKey) {
                    setConfigImages(prev => ({ ...prev, [configKey]: file }))
                    setVariants(prev => prev.map(v => {
                        if (v.id === variantIdToEnable && !v.useImage) return { ...v, useImage: true }
                        return v
                    }))
                }
            }
            setShowImageCropper(false)
            setSelectedImageForCrop(null)
            setCropContext(null)
        } catch (error) {
            console.error("Erro ao processar imagem", error)
        }
    }

    // --- HANDLERS DE VARIANTES ---
    const addVariant = () => {
        if (variants.length < 3) {
            setVariants([...variants, { id: Date.now(), type: "", values: [], useImage: false }])
        }
    }

    const removeVariant = (id: number) => {
        setVariants(variants.filter((v) => v.id !== id))
        setExcludedRowIds(new Set())
        setRowOverrides({}) // Limpa overrides ao resetar estrutura
        setModifiedImageRows(new Set()) // Resetar tracked modified images
    }

    const handleRemoveVariantClick = (id: number, typeName: string) => {
        setConfirmAction({
            title: "Remover Opção",
            message: `Tem certeza que deseja remover a opção "${typeName || 'Opção'}"? Todas as combinações e personalizações associadas serão perdidas.`,
            onConfirm: () => {
                removeVariant(id)
            }
        })
    }

    const updateVariant = (id: number, field: keyof VariantCard, value: any) => {
        setVariants(prev => prev.map((v) => v.id === id ? { ...v, [field]: value } : v))
    }

    const handleTagsChange = (variantId: number, currentValues: string[], nextValues: string[]) => {
        if (nextValues.length < currentValues.length) {
            setConfirmAction({
                title: "Remover Valor",
                message: "Tem certeza que deseja remover este valor? Isso irá recalcular as combinações de variações.",
                onConfirm: () => {
                    updateVariant(variantId, "values", nextValues)
                }
            })
        } else {
            updateVariant(variantId, "values", nextValues)
        }
    }

    const handleRemoveRow = (rowId: string) => {
        setExcludedRowIds(prev => new Set(prev).add(rowId))
    }

    const handleRemoveRowClick = (rowId: string, rowName: string) => {
        setConfirmAction({
            title: "Remover Variação",
            message: `Tem certeza que deseja remover a variação "${rowName}" da tabela?`,
            onConfirm: () => {
                handleRemoveRow(rowId)
            }
        })
    }

    // --- DELETAR IMAGENS ---
    const confirmDeleteImage = () => {
        if (!imageToDelete) return
        const { type, key } = imageToDelete

        if (type === 'config') {
            setConfigImages(prev => {
                const next = { ...prev }
                const imageToRemove = prev[key]
                if (typeof imageToRemove === 'string' && imageToRemove.trim()) {
                    setDeletedImageKeys(d => new Set(d).add(imageToRemove.trim()))
                }
                delete next[key]
                return next
            })

            const [varIdStr, ...valParts] = key.split("_")
            const varId = Number(varIdStr)
            const val = valParts.join("_")
            const variantIdx = variants.findIndex(v => v.id === varId)
            if (variantIdx >= 0) {
                setRowImages(prev => {
                    const next = { ...prev }
                    tableRows.forEach(r => {
                        if (r.values[variantIdx] === val) {
                            if (typeof next[r.id] === 'string' && next[r.id]) {
                                setDeletedImageKeys(d => new Set(d).add(next[r.id] as string))
                            }
                            delete next[r.id]
                        }
                    })
                    return next
                })
            }
        } else if (type === 'row') {
            if (rowImages[key]) {
                setRowImages(prev => {
                    const next = { ...prev }
                    const imageToRemove = prev[key]
                    if (typeof imageToRemove === 'string' && imageToRemove.trim()) {
                        setDeletedImageKeys(d => new Set(d).add(imageToRemove.trim()))
                    }
                    delete next[key]
                    return next
                })
                setModifiedImageRows(prev => new Set(prev).add(key))
            } else {
                const row = tableRows.find(r => r.id === key)
                const imgVariantIdx = variants.findIndex(v => v.useImage)
                const targetIdx = imgVariantIdx >= 0 ? imgVariantIdx : 0
                if (row && variants[targetIdx]) {
                    const targetVal = row.values[targetIdx]
                    const targetConfigKey = `${variants[targetIdx].id}_${targetVal}`
                    setConfigImages(prev => {
                        const next = { ...prev }
                        const imageToRemove = prev[targetConfigKey]
                        if (typeof imageToRemove === 'string' && imageToRemove.trim()) {
                            setDeletedImageKeys(d => new Set(d).add(imageToRemove.trim()))
                        }
                        delete next[targetConfigKey]
                        return next
                    })
                }
            }
        }
        setImageToDelete(null)
    }

    const formatDate = (dateString?: string) => {
        if (!dateString) return "-"
        return new Date(dateString).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    }

    const uploadVariantImage = async (file: File): Promise<string | null> => {
        try {
            const formData = new FormData()
            const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
            formData.append("file", file, `variant-image.${extension}`)

            // Passar productId na query para cache específico do produto
            const uploadUrl = new URL("/api/upload-image", window.location.origin)
            if (product?.id) {
                uploadUrl.searchParams.set("productId", product.id)
            }

            const response = await fetchWithCSRF(uploadUrl.toString(), { method: "POST", body: formData })
            const result = await response.json()

            if (result.success && result.key) {
                return result.key
            }
            return null
        } catch {
            return null
        }
    }

    // Handle save variants
    const handleSaveVariants = async () => {
        if (tableRows.length === 0) {
            notifyError("Adicione pelo menos uma variação para salvar.")
            return
        }

        // Validar limite de 30 valores por tipo e limites de 30 caracteres
        for (const variant of variants) {
            if (variant.type.length > 30) {
                notifyError(`O nome do tipo de variação "${variant.type}" não pode ter mais de 30 caracteres.`)
                return
            }
            if (variant.values.length > 30) {
                notifyError(`O tipo "${variant.type || 'Opção'}" excede o limite máximo de 30 valores (possui ${variant.values.length}).`)
                return
            }
            const tooLongValue = variant.values.find(val => val.length > 30)
            if (tooLongValue) {
                notifyError(`O valor "${tooLongValue}" excede o limite máximo de 30 caracteres.`)
                return
            }
        }

        setIsSaving(true)
        setSavingStatusText("Processando variações...")

        try {
            // 1. Identificar e deduplicar arquivos de imagem únicos antes do upload para máxima performance
            const uniqueFiles = new Set<File>()
            tableRows.forEach((rawRow) => {
                const row = getDisplayData(rawRow)
                const activeImage = getRowImage(row.values, row.id)
                if (activeImage instanceof File) {
                    uniqueFiles.add(activeImage)
                }
            })
            Object.values(configImages).forEach(img => {
                if (img instanceof File) {
                    uniqueFiles.add(img)
                }
            })

            // 2. Comprimir e fazer upload paralelo apenas das imagens distintas
            const fileUploadMap = new Map<File, string | null>()
            if (uniqueFiles.size > 0) {
                setSavingStatusText("Salvando variantes...")
                const uniqueFilesArray = Array.from(uniqueFiles)
                await Promise.all(
                    uniqueFilesArray.map(async (rawFile) => {
                        const optimized = await optimizeImageForUpload(rawFile, {
                            maxWidth: 1200,
                            maxHeight: 1200,
                            quality: 0.85,
                            preferredFormat: "image/webp"
                        })
                        const uploadedKey = await uploadVariantImage(optimized)
                        fileUploadMap.set(rawFile, uploadedKey)
                    })
                )
            }

            setSavingStatusText("Salvando variações...")

            // Get CSRF token
            const csrfResponse = await fetchWithCSRF("/api/csrf-token", { method: "GET" })
            const { token: csrfToken } = await csrfResponse.json()

            // 3. Montar variações vinculando a chave de imagem correspondente sem repetições
            const usedSkusInBatch = new Set<string>()

            const variantsToSave = tableRows.map((rawRow) => {
                const row = getDisplayData(rawRow)
                const activeImage = getRowImage(row.values, row.id)

                let imagePublicId: string | null = null
                if (activeImage instanceof File) {
                    imagePublicId = fileUploadMap.get(activeImage) || null
                } else if (typeof activeImage === 'string' && activeImage.trim() !== "") {
                    imagePublicId = activeImage.trim()
                }

                // SKU UNIQUENESS LOGIC
                const rowVariantType = variants.map(v => v.type).join(" / ")
                const rowVariantValue = row.values.join(" / ")
                const matchingExisting = existingVariants.find(ev => ev.value === rowVariantValue && ev.type === rowVariantType)

                let finalSku: string
                if (matchingExisting) {
                    finalSku = matchingExisting.sku || row.sku || ""
                } else {
                    finalSku = row.sku || ""
                    let counter = 2
                    while (usedSkusInBatch.has(finalSku.toLowerCase())) {
                        finalSku = `${row.sku}-${counter}`
                        counter++
                    }
                }
                usedSkusInBatch.add(finalSku.toLowerCase())

                const variantParts = row.values as string[]
                const variantType = variants.map(v => v.type).join(" / ")
                const variantValue = variantParts.join(" / ")

                return {
                    variantName: row.name,
                    variantType: variantType,
                    variantValue: variantValue,
                    sku: finalSku, // Use the unique SKU
                    price: Number(row.price) || 0,
                    stockQuantity: row.stock || 0,
                    image: imagePublicId,
                    isActive: row.active !== false,
                }
            })

            if (!product?.id) {
                if (onSavePendingVariants) {
                    onSavePendingVariants(variantsToSave)
                    notifySuccess(`${variantsToSave.length} variações preparadas para salvar!`)
                    onClose()
                } else {
                    notifyError("Não foi possível preparar as variações para salvar.")
                }
                return
            }

            const activeImageKeys = new Set(variantsToSave.map(v => v.image).filter(Boolean) as string[])
            const safeDeletedImages = Array.from(deletedImageKeys).filter(img => img && !activeImageKeys.has(img))

            const result = await createProductVariantsBatchAction({
                productId: product.id,
                variants: variantsToSave,
                csrf_token: csrfToken,
                deletedImages: safeDeletedImages,
            })

            if (result.success) {
                notifySuccess(`${variantsToSave.length} variações salvas com sucesso!`)
                onSaveSuccess?.()
                onClose()
            } else {
                notifyError(result.error || "Erro ao salvar variações")
            }
        } catch (err) {
            console.error("Error saving variants:", err)
            notifyError("Erro ao salvar variação")
        } finally {
            setIsSaving(false)
        }
    }

    const showImageColumn = variants.some(v => v.useImage)

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface w-full">
            {/* HEADER */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Adicionar variações</h2>
                <Button variant="filled" onClick={onClose} className="hidden lg:flex w-[40px] h-[40px]">
                    <XIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                {isLoadingVariants ? (
                    <div className="flex items-center justify-center h-full min-h-96">
                        <div className="flex flex-col items-center gap-3">
                            <Spinner size={18} />
                            <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Carregando variações...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* DETALHES DO PRODUTO */}
                        <div className="mb-8">
                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-4">Detalhes do Produto</h3>
                            <div className="bg-brand-gray dark:bg-dark-border/50 rounded-xl p-5 border border-brand-border dark:border-dark-border">
                                <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-1">{product?.name || "Produto sem nome"}</h4>
                                <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-5">SKU Base: {product?.sku || "N/A"}</p>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-6 border-t border-brand-border dark:border-dark-border pt-5">
                                    <div><span className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Categoria</span><span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{product?.category || "-"}</span></div>
                                    <div><span className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Marca</span><span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{product?.brand || "-"}</span></div>
                                    <div><span className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Criado em</span><span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatDate(product?.created_at)}</span></div>
                                    <div><span className="block text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-1">Editado em</span><span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatDate(product?.updated_at)}</span></div>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-brand-border dark:border-dark-border mb-8"></div>

                        {/* CONFIGURAÇÃO DE VARIANTES */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading">Configuração</h3>
                                {variants.length < 3 && (
                                    <Button variant="link" onClick={addVariant}>
                                        + Adicionar tipo
                                    </Button>
                                )}
                            </div>

                            <div className="space-y-6">
                                <AnimatePresence initial={false} mode="popLayout">
                                    {variants.map((variant, index) => (
                                        <motion.div
                                            layout
                                            key={variant.id}
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                                            transition={{ duration: 0.2, ease: "easeInOut" }}
                                            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-6 relative overflow-hidden"
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="text-base font-bold text-brand-dark dark:text-dark-heading">Variação {index + 1}</h4>
                                                {variants.length > 1 && (
                                                    <Button variant="ghostred" onClick={() => handleRemoveVariantClick(variant.id, variant.type)} className="w-8 h-8 flex items-center justify-center p-0">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-6">
                                                <div className="md:col-span-3">
                                                    <Input
                                                        label="Tipo"
                                                        placeholder="Ex: Cor"
                                                        value={variant.type}
                                                        onChange={(e) => updateVariant(variant.id, "type", e.target.value)}
                                                        className="mb-0"
                                                        error={variant.type.length > 30}
                                                        errorMessage="Máximo 30 caracteres."
                                                        maxLength={30}
                                                        showCharacterCount={true}
                                                    />
                                                </div>
                                                <div className="md:col-span-9">
                                                    <TagsInput
                                                        label="Valores"
                                                        placeholder="Digite e Enter (ex: P, M, G)"
                                                        tags={variant.values}
                                                        onChange={(vals) => handleTagsChange(variant.id, variant.values, vals)}
                                                        className="w-full"
                                                        error={variant.values.some(v => v.length > 30)}
                                                        errorMessage="Valores não podem exceder 30 caracteres."
                                                    />
                                                </div>
                                            </div>

                                            <AnimatePresence>
                                                {variant.values.length > 0 && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <Switch checked={variant.useImage} onCheckedChange={(checked) => updateVariant(variant.id, "useImage", checked)} />
                                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Usar imagens para esta variação</span>
                                                        </div>

                                                        <motion.div
                                                            initial={false}
                                                            animate={{ height: variant.useImage ? "auto" : 0, opacity: variant.useImage ? 1 : 0 }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar pt-1">
                                                                {variant.values.map((val, idx) => {
                                                                    const configKey = `${variant.id}_${val}`
                                                                    return (
                                                                        <div key={idx} className="flex flex-col items-center gap-2">
                                                                            <VariantImageUpload
                                                                                size="md"
                                                                                image={configImages[configKey] || null}
                                                                                onSelectFile={(file) => handleInitiateCrop(file, { type: 'config', id: variant.id, value: val })}
                                                                                onRemove={() => setImageToDelete({ type: 'config', key: configKey })}
                                                                            />
                                                                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">{val}</span>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </motion.div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* PREVIEW DA TABELA */}
                        <div>
                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading mb-4">Tabela de variações</h3>

                            {tableRows.length === 0 ? (
                                <div className="border border-brand-border dark:border-dark-border rounded-xl p-12 flex flex-col items-center justify-center text-center bg-white dark:bg-dark-surface">
                                    <IconPlaceholder
                                        icon={Package}
                                        title="Nenhuma variação"
                                        subtitle="Adicione opções acima para gerar as variações."
                                    />
                                </div>
                            ) : (
                                <div className="w-full overflow-hidden rounded-xl relative">
                                    <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-surface to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                    <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-surface to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                    <div className="overflow-x-auto custom-scrollbar pb-4" ref={tableContainerRef} onScroll={checkScroll}>
                                        <table className="w-full text-left border-collapse min-w-[900px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    {[
                                                        ...(showImageColumn ? [{ label: "Imagem", width: "80px", first: true }] : []),
                                                        { label: "Variação", width: "auto", first: !showImageColumn },
                                                        { label: "Preço", width: "150px" },
                                                        { label: "Estoque", width: "160px" },
                                                        { label: "SKU", width: "200px" },
                                                        { label: "Status", width: "100px", align: "center" },
                                                        { label: "", width: "60px", last: true },
                                                    ].map((col, idx) => (
                                                        <th
                                                            key={col.label || idx}
                                                            className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body relative bg-brand-gray dark:bg-dark-border/50 align-middle ${col.first ? "rounded-l-lg pl-4" : ""} ${col.last ? "rounded-r-lg" : ""}`}
                                                            style={{ width: col.width }}
                                                        >
                                                            {!col.last && (
                                                                <>
                                                                    <div className={`flex items-center gap-1 ${col.align === "center" ? "justify-center" : ""}`}>{col.label}</div>
                                                                </>
                                                            )}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-dark-surface">
                                                <AnimatePresence mode="popLayout">
                                                    {tableRows.map((rawRow, idx) => {
                                                        const row = getDisplayData(rawRow)
                                                        const activeImage = getRowImage(row.values, row.id)
                                                        const matchingExisting = existingVariants.find(ev => {
                                                            if (!ev.value) return false
                                                            const evRowId = ev.value.split(" / ").map((val: string) => val.trim()).join("-")
                                                            return evRowId === row.id
                                                        })

                                                        return (
                                                            <motion.tr
                                                                key={row.id}
                                                                layout
                                                                initial={{ opacity: 0 }}
                                                                animate={{ opacity: 1 }}
                                                                exit={{ opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="border-b border-brand-border dark:border-dark-border last:border-0 group hover:bg-brand-gray dark:hover:bg-dark-border/20 transition-colors"
                                                            >
                                                                {showImageColumn && (
                                                                    <td className="p-2 pl-4 border-b border-brand-border dark:border-dark-border align-middle">
                                                                        <VariantImageUpload
                                                                            size="sm"
                                                                            image={activeImage}
                                                                            onSelectFile={(file) => handleInitiateCrop(file, { type: 'row', id: row.id })}
                                                                            onRemove={() => setImageToDelete({ type: 'row', key: row.id })}
                                                                        />
                                                                    </td>
                                                                )}
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border align-middle">
                                                                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading block">{row.name}</span>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border align-middle">
                                                                    <div className="w-32">
                                                                        <MoneyInput value={row.price} onChange={(val) => updateRow(row.id, "price", val)} />
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border align-middle">
                                                                    {product?.id && matchingExisting ? (
                                                                        <div className="flex items-center gap-1.5 min-w-[120px]">
                                                                            <div className="flex-1 bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border rounded-lg h-[34px] px-2.5 flex items-center justify-between text-xs text-brand-dark dark:text-dark-heading font-medium">
                                                                                <span>{row.stock}</span>
                                                                                {matchingExisting.stock_reserved > 0 && (
                                                                                    <span className="text-[10px] text-brand-orange font-semibold" title={`Reservado: ${matchingExisting.stock_reserved}`}>
                                                                                        ({matchingExisting.stock_reserved} res.)
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                className="h-[34px] px-2.5 text-[11px] border border-brand-border hover:bg-brand-gray dark:border-dark-border dark:hover:bg-dark-border/50 text-brand-dark dark:text-dark-heading rounded-lg font-medium shrink-0"
                                                                                onClick={() => {
                                                                                    setSelectedVariantForAdjustment({
                                                                                        id: matchingExisting.id,
                                                                                        name: row.name,
                                                                                        sku: row.sku,
                                                                                        image: typeof activeImage === 'string' ? activeImage : null,
                                                                                        stock: row.stock,
                                                                                        reservedStock: matchingExisting.stock_reserved || 0,
                                                                                        availableStock: matchingExisting.stock_available,
                                                                                        rowId: row.id
                                                                                    })
                                                                                }}
                                                                                data-unsaved-changes-ignore="true"
                                                                            >
                                                                                Ajustar
                                                                            </Button>
                                                                        </div>
                                                                    ) : (
                                                                        <QuantitySelector value={row.stock} onChange={(val) => updateRow(row.id, "stock", val)} min={0} size="md" />
                                                                    )}
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border align-middle">
                                                                    <div className="w-full">
                                                                        <Input
                                                                            name={`sku-${idx}`}
                                                                            value={row.sku}
                                                                            onChange={(e) => updateRow(row.id, "sku", e.target.value)}
                                                                            className="text-xs"
                                                                        />
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 border-b border-brand-border dark:border-dark-border align-middle text-center">
                                                                    <div className="flex justify-center">
                                                                        <Switch checked={row.active !== false} onCheckedChange={(val) => updateRow(row.id, "active", val)} />
                                                                    </div>
                                                                </td>
                                                                <td className="p-2 pr-4 border-b border-brand-border dark:border-dark-border align-middle text-center">
                                                                    <Button
                                                                        variant="outlinered"
                                                                        onClick={() => handleRemoveRowClick(row.id, row.name)}
                                                                        className="w-8 h-8 p-0"
                                                                        leftIcon={<TrashIcon size={18} />}
                                                                    />
                                                                </td>
                                                            </motion.tr>
                                                        )
                                                    })}
                                                </AnimatePresence>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="p-6 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border flex justify-between items-center relative z-20">
                <div className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                    Saiba mais sobre <a href="https://dudit.com.br/ajuda/produtos-estoque/como-trabalhar-com-variacoes" target="_blank" rel="noopener noreferrer" className="text-brand-green cursor-pointer hover:underline">Variações</a>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving} className="px-6 bg-transparent">Cancelar</Button>
                    <Button
                        onClick={handleSaveVariants}
                        disabled={isSaving || tableRows.length === 0}
                        className="px-8"
                    >
                        {isSaving ? (
                            <>
                                <Spinner size={18} />
                                Salvando...
                            </>
                        ) : (
                            "Salvar Variações"
                        )}
                    </Button>
                </div>
            </div>

            {showImageCropper && selectedImageForCrop && (
                <ImageCropperModal
                    isOpen={showImageCropper}
                    onClose={() => {
                        setShowImageCropper(false)
                        setSelectedImageForCrop(null)
                        setCropContext(null)
                    }}
                    imageFile={selectedImageForCrop}
                    onCropComplete={handleCropComplete}
                />
            )}

            <AlertModal
                isOpen={!!imageToDelete}
                onClose={() => setImageToDelete(null)}
                onConfirm={confirmDeleteImage}
                title="Remover Imagem"
                message="Tem certeza que deseja remover esta imagem? Essa ação pode afetar variações vinculadas."
                confirmText="Remover"
                variant="danger"
                icon={<TrashIcon />}
            />

            <AlertModal
                isOpen={!!confirmAction}
                onClose={() => setConfirmAction(null)}
                onConfirm={() => {
                    confirmAction?.onConfirm()
                    setConfirmAction(null)
                }}
                title={confirmAction?.title || "Confirmar Ação"}
                message={confirmAction?.message || ""}
                confirmText="Confirmar"
                variant="danger"
                icon={<TrashIcon />}
            />

            <QuickStockMovementSheet
                isOpen={!!selectedVariantForAdjustment}
                product={{
                    id: product.id,
                    name: product.name,
                    sku: product.sku,
                    image: (typeof product.images?.[0] === 'string' ? product.images[0] : (product.image || null)),
                    stock: Number(product.stock || 0),
                    unit: product.unit || "UN"
                }}
                variant={selectedVariantForAdjustment ? {
                    id: selectedVariantForAdjustment.id,
                    name: selectedVariantForAdjustment.name,
                    sku: selectedVariantForAdjustment.sku,
                    image: selectedVariantForAdjustment.image,
                    stock: Number(selectedVariantForAdjustment.stock || 0),
                    reservedStock: Number(selectedVariantForAdjustment.reservedStock || 0),
                    availableStock: selectedVariantForAdjustment.availableStock,
                    unit: product.unit || "UN"
                } : null}
                onClose={() => setSelectedVariantForAdjustment(null)}
                onSaveSuccess={(newStock, newReservedStock) => {
                    updateRow(selectedVariantForAdjustment.rowId, "stock", newStock)
                    setExistingVariants(prev => prev.map(ev => {
                        if (ev.id === selectedVariantForAdjustment.id) {
                            return {
                                ...ev,
                                stock: newStock,
                                stock_reserved: newReservedStock !== undefined ? newReservedStock : ev.stock_reserved,
                                stock_available: newReservedStock !== undefined ? newStock - newReservedStock : ev.stock_available
                            }
                        }
                        return ev
                    }))
                    onSaveSuccess?.()
                }}
            />

            <SavingStatusModal isOpen={isSaving} text={savingStatusText} />
        </div>
    )

    if (isMobile) {
        return <BottomSheet isOpen={isOpen} onClose={onClose}>{content}</BottomSheet>
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                style={{ zIndex }}
                onClick={onClose}
            >
                <div className={`fixed right-4 top-4 bottom-4 w-full md:w-[850px] bg-white dark:bg-dark-surface shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`} onClick={(e) => e.stopPropagation()}>
                    {content}
                </div>
            </div>
        </Portal>
    )
}

export default AddVariantSheet
