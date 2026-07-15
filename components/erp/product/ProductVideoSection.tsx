"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, FormDropdown, IconPlaceholder, Input } from "@/components/reusable"
import { Progress } from "@/components/ui/progress"
import { TrashIcon, UploadIcon, LockIcon } from "@/lib/icons"
import {
    bytesToBase64,
    compressVideoIfNeeded,
    prepareVideoClientPreview,
} from "@/lib/video/client"
import type { VideoMetadata, VideoType } from "@/lib/video/shared"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"

interface ProductVideoSectionProps {
    itemType: "product" | "service"
    itemId: string
    video: VideoMetadata
    onChange: (video: VideoMetadata) => void
    isEditing: boolean
    videoPlanBlocked?: boolean
}

const EMPTY_VIDEO: VideoMetadata = {
    video_type: null,
    video_url: null,
    video_thumbnail: null,
    video_duration: null,
    video_provider_id: null,
}

type LocalPreviewState = {
    sessionId: number
    previewUrl: string
    thumbnailDataUrl: string | null
    duration: number | null
}

function putWithProgress(
    url: string,
    file: File,
    signedContentType: string,
    onProgress: (progress: number) => void,
) {
    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", url)
        xhr.setRequestHeader("Content-Type", signedContentType)
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new Error(`Upload interrompido (${xhr.status})`))
        }
        xhr.onerror = () => reject(new Error("Upload interrompido (rede ou CORS)"))
        xhr.onabort = () => reject(new Error("Upload interrompido"))
        xhr.send(file)
    })
}

function getEmbedPreviewUrl(video: VideoMetadata) {
    if (video.video_type === "youtube" && video.video_provider_id) {
        return `https://www.youtube.com/embed/${video.video_provider_id}`
    }
    if (video.video_type === "vimeo" && video.video_provider_id) {
        return `https://player.vimeo.com/video/${video.video_provider_id}`
    }
    return null
}

export default function ProductVideoSection({ itemType, itemId, video, onChange, isEditing, videoPlanBlocked = false }: ProductVideoSectionProps) {
    const { openPlanUpgrade } = usePlanUpgrade()
    const currentFileRef = useRef<File | null>(null)
    const objectUrlRef = useRef<string | null>(null)
    const uploadSessionRef = useRef(0)

    const [source, setSource] = useState<VideoType>((video.video_type || "upload") as VideoType)
    const [urlValue, setUrlValue] = useState(video.video_type === "youtube" || video.video_type === "vimeo" ? video.video_url || "" : "")
    const [error, setError] = useState("")
    const [progress, setProgress] = useState(0)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadingFile, setUploadingFile] = useState<File | null>(null)
    const [localPreview, setLocalPreview] = useState<LocalPreviewState | null>(null)

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return "0 Bytes"
        const k = 1024
        const sizes = ["Bytes", "KB", "MB", "GB"]
        const i = Math.log(bytes) / Math.log(k)
        const index = Math.floor(i >= 0 ? i : 0)
        const boundedIndex = Math.min(index, sizes.length - 1)
        return parseFloat((bytes / Math.pow(k, boundedIndex)).toFixed(2)) + " " + sizes[boundedIndex]
    }

    const revokeObjectUrl = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current)
            objectUrlRef.current = null
        }
    }, [])

    const clearLocalPreviewState = useCallback(() => {
        revokeObjectUrl()
        setLocalPreview(null)
        currentFileRef.current = null
    }, [revokeObjectUrl])

    const handleRemoveVideo = useCallback(() => {
        uploadSessionRef.current += 1
        clearLocalPreviewState()
        setError("")
        setProgress(0)
        setUrlValue("")
        onChange(EMPTY_VIDEO)
        console.log("[VideoDebug]", {
            hasVideo: false,
            duration: null,
            thumbnailCreated: false,
            previewUrl: null,
        })
    }, [clearLocalPreviewState, onChange])

    useEffect(() => () => revokeObjectUrl(), [revokeObjectUrl])

    useEffect(() => {
        if (video.video_type === "upload" && video.video_url && localPreview && !isUploading) {
            clearLocalPreviewState()
        }
    }, [video.video_url, video.video_type, localPreview, isUploading, clearLocalPreviewState])

    const hasVideo = !!video.video_type && !!video.video_url
    const embedUrl = useMemo(() => getEmbedPreviewUrl(video), [video])

    const uploadPlayback = useMemo(() => {
        if (localPreview) {
            return {
                src: localPreview.previewUrl,
                poster: localPreview.thumbnailDataUrl || video.video_thumbnail || undefined,
                duration: localPreview.duration ?? video.video_duration,
                sessionKey: `local-${localPreview.sessionId}`,
            }
        }
        if (video.video_type === "upload" && video.video_url) {
            return {
                src: video.video_url,
                poster: video.video_thumbnail || undefined,
                duration: video.video_duration,
                sessionKey: `saved-${video.video_url}`,
            }
        }
        return null
    }, [video, localPreview])

    const handleUpload = async (file: File | undefined) => {
        if (!file || isUploading) return

        const sessionId = ++uploadSessionRef.current
        clearLocalPreviewState()
        currentFileRef.current = file
        setError("")
        setProgress(1)
        setUploadingFile(file)
        setIsUploading(true)

        try {
            const initial = await prepareVideoClientPreview(file)
            if (uploadSessionRef.current !== sessionId || currentFileRef.current !== file) return

            objectUrlRef.current = initial.previewObjectUrl
            setLocalPreview({
                sessionId,
                previewUrl: initial.previewObjectUrl,
                thumbnailDataUrl: initial.thumbnailDataUrl,
                duration: initial.duration,
            })

            const uploadFile = await compressVideoIfNeeded(file, initial.duration, (p) => setProgress(Math.min(25, p)))
            if (uploadSessionRef.current !== sessionId || currentFileRef.current !== file) return

            let duration = initial.duration
            let thumbnailFile = initial.thumbnailFile
            let resolvedMime = initial.resolvedMime
            let firstBytes = initial.firstBytes
            let previewObjectUrl = initial.previewObjectUrl

            if (uploadFile !== file) {
                revokeObjectUrl()
                const compressedMeta = await prepareVideoClientPreview(uploadFile)
                if (uploadSessionRef.current !== sessionId || currentFileRef.current !== file) {
                    URL.revokeObjectURL(compressedMeta.previewObjectUrl)
                    return
                }
                duration = compressedMeta.duration
                thumbnailFile = compressedMeta.thumbnailFile
                resolvedMime = compressedMeta.resolvedMime
                firstBytes = compressedMeta.firstBytes
                previewObjectUrl = compressedMeta.previewObjectUrl
                objectUrlRef.current = previewObjectUrl
                setLocalPreview({
                    sessionId,
                    previewUrl: previewObjectUrl,
                    thumbnailDataUrl: compressedMeta.thumbnailDataUrl,
                    duration,
                })
            }

            if (!thumbnailFile) {
                throw new Error("Não foi possível gerar a miniatura do vídeo. Tente outro arquivo.")
            }

            const res = await fetch("/api/r2/video-upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemType,
                    itemId,
                    filename: uploadFile.name,
                    contentType: resolvedMime,
                    fileSize: uploadFile.size,
                    duration,
                    firstBytesBase64: bytesToBase64(firstBytes),
                }),
            })
            const signed = await res.json()
            if (!res.ok) throw new Error(signed.error || "Erro ao preparar upload")
            if (uploadSessionRef.current !== sessionId || currentFileRef.current !== file) return

            const thumbnailContentType = signed.thumbnail?.contentType || signed.signedThumbnailContentType || "image/jpeg"
            const videoContentType = signed.video?.contentType || signed.signedVideoContentType || resolvedMime

            await putWithProgress(signed.thumbnail.uploadUrl, thumbnailFile, thumbnailContentType, (p) => setProgress(30 + Math.round(p * 0.2)))
            await putWithProgress(signed.video.uploadUrl, uploadFile, videoContentType, (p) => setProgress(50 + Math.round(p * 0.5)))

            if (uploadSessionRef.current !== sessionId || currentFileRef.current !== file) return

            clearLocalPreviewState()
            onChange({
                video_type: "upload",
                video_url: signed.video.publicUrl,
                video_thumbnail: signed.thumbnail.publicUrl,
                video_duration: Math.round(duration),
                video_provider_id: null,
            })

            console.log("[VideoDebug]", {
                hasVideo: true,
                duration: Math.round(duration),
                thumbnailCreated: true,
                previewUrl: signed.video.publicUrl,
            })

            setProgress(100)
        } catch (err) {
            if (uploadSessionRef.current === sessionId) {
                setError(err instanceof Error ? err.message : "Erro ao enviar vídeo")
            }
        } finally {
            if (uploadSessionRef.current === sessionId) {
                setIsUploading(false)
                setUploadingFile(null)
            }
        }
    }

    const handleUrlPreview = async () => {
        setError("")
        clearLocalPreviewState()
        try {
            if (source !== "youtube" && source !== "vimeo") return

            const res = await fetch("/api/video/metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source, url: urlValue }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "URL inválida")

            onChange({
                video_type: data.video_type,
                video_url: data.video_url,
                video_thumbnail: data.video_thumbnail,
                video_duration: data.video_duration,
                video_provider_id: data.video_provider_id,
            })

            console.log("[VideoDebug]", {
                hasVideo: true,
                duration: data.video_duration,
                thumbnailCreated: !!data.video_thumbnail,
                previewUrl: data.video_url,
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : "URL inválida")
        }
    }

    const showPreviewPanel = !!uploadPlayback || !!embedUrl

    if (videoPlanBlocked) {
        return (
            <div className="flex flex-col items-center">
                <IconPlaceholder
                    icon={LockIcon}
                    title="Vídeo"
                    subtitle={"Adicione vídeos aos seus " + (itemType === "product" ? "produtos" : "serviços") + " para aumentar o engajamento. Disponível nos planos Crescer e Escalar."}
                    itemButton={{
                        text: "Fazer upgrade",
                        action: () => openPlanUpgrade("crescer"),
                        variant: "outline"
                    }}
                />
            </div>
        )
    }

    return (
        <div>
            <div className="flex items-center justify-between gap-4 mb-4">
                {(hasVideo || localPreview) && isEditing && (
                    <Button variant="outlinered" onClick={handleRemoveVideo}>
                        <TrashIcon className="w-4 h-4" />
                        Remover vídeo
                    </Button>
                )}
            </div>

            {showPreviewPanel && (
                <div className="mb-4 w-full aspect-video overflow-hidden rounded-lg border border-brand-border dark:border-dark-border bg-black">
                    {uploadPlayback ? (
                        <video
                            key={uploadPlayback.sessionKey}
                            src={uploadPlayback.src}
                            poster={uploadPlayback.poster}
                            controls
                            preload="metadata"
                            playsInline
                            className="w-full h-full object-contain bg-black"
                        />
                    ) : embedUrl ? (
                        <iframe src={embedUrl} title="Preview do vídeo" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen className="w-full h-full" />
                    ) : null}
                </div>
            )}

            {isEditing && (
                <div className="space-y-4">
                    <FormDropdown
                        label="Fonte do vídeo"
                        value={source}
                        setValue={(value) => {
                            setSource(value as VideoType)
                            setError("")
                        }}
                        options={[
                            { value: "upload", label: "Upload" },
                            { value: "youtube", label: "YouTube" },
                            { value: "vimeo", label: "Vimeo" },
                        ]}
                        width="w-full"
                    />

                    {source === "upload" ? (
                        isUploading && uploadingFile ? (
                            <div className="flex items-center gap-4 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-border/10 max-w-[520px]">
                                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-brand-primary/10 text-brand-primary shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                                            {uploadingFile.name}
                                        </span>
                                        <span className="text-gray-300 dark:text-gray-600">•</span>
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body whitespace-nowrap">
                                            {formatFileSize(uploadingFile.size)}
                                        </span>
                                    </div>
                                    {progress > 0 && (
                                        <div className="flex items-center gap-3">
                                            <Progress value={progress} className="h-1.5 flex-1" />
                                            <span className="text-xs font-semibold text-brand-primary min-w-[30px] text-right">
                                                {progress}%
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : !localPreview ? (
                            <div className="w-full flex-col flex items-center justify-center mt-10">
                                <IconPlaceholder
                                    icon={UploadIcon}
                                    title={hasVideo ? "Substituir vídeo" : "Selecionar MP4, WebM ou MOV"}
                                    subtitle={hasVideo ? "Clique para fazer upload de um novo vídeo" : "Arraste e solte aqui ou clique para selecionar"}
                                    itemButton={{
                                        text: hasVideo ? "Substituir vídeo" : "Selecionar vídeo",
                                        type: "file",
                                        accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
                                        onChange: (e) => {
                                            const selected = e.target.files?.[0]
                                            if (selected) void handleUpload(selected)
                                        },
                                        disabled: isUploading,
                                        variant: "outline",
                                    }}
                                />
                            </div>
                        ) : null
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Input label={source === "youtube" ? "URL do YouTube" : "URL do Vimeo"} value={urlValue} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setUrlValue(e.target.value)} placeholder={source === "youtube" ? "https://youtube.com/watch?v=..." : "https://vimeo.com/..."} />
                            <Button type="button" onClick={handleUrlPreview} className="sm:self-end">Pré-visualizar</Button>
                        </div>
                    )}

                    {uploadPlayback?.duration != null && uploadPlayback.duration > 0 && !isUploading && (
                        <p className="text-sm text-brand-inactive-text">Duração: {Math.round(uploadPlayback.duration)}s</p>
                    )}

                    {error && <p className="text-sm text-brand-red-dark">{error}</p>}
                </div>
            )}
        </div>
    )
}
