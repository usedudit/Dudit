"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, FormDropdown, Input } from "@/components/reusable"
import { Progress } from "@/components/ui/progress"
import { TrashIcon, UploadIcon } from "@/lib/icons"
import {
  bytesToBase64,
  compressVideoIfNeeded,
  prepareVideoClientPreview,
} from "@/lib/video/client"
import type { VideoMetadata, VideoType } from "@/lib/video/shared"

interface ProductVideoSectionProps {
  itemType: "product" | "service"
  itemId: string
  video: VideoMetadata
  onChange: (video: VideoMetadata) => void
  isEditing: boolean
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

export default function ProductVideoSection({ itemType, itemId, video, onChange, isEditing }: ProductVideoSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const currentFileRef = useRef<File | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const uploadSessionRef = useRef(0)

  const [source, setSource] = useState<VideoType>((video.video_type || "upload") as VideoType)
  const [urlValue, setUrlValue] = useState(video.video_type === "youtube" || video.video_type === "vimeo" ? video.video_url || "" : "")
  const [error, setError] = useState("")
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [localPreview, setLocalPreview] = useState<LocalPreviewState | null>(null)

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
    if (inputRef.current) inputRef.current.value = ""
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
    if (video.video_type === "upload" && video.video_url && localPreview) {
      clearLocalPreviewState()
    }
  }, [video.video_url, video.video_type, localPreview, clearLocalPreviewState])

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
    currentFileRef.current = file
    clearLocalPreviewState()
    setError("")
    setProgress(1)
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
        if (inputRef.current) inputRef.current.value = ""
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

  return (
    <div className="mt-6 border-t border-brand-border dark:border-dark-border pt-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">Vídeo opcional</h3>
        {(hasVideo || localPreview) && isEditing && (
          <button type="button" onClick={handleRemoveVideo} className="text-sm text-brand-red-dark hover:underline inline-flex items-center gap-1">
            <TrashIcon className="w-4 h-4" />
            Remover vídeo
          </button>
        )}
      </div>

      {showPreviewPanel && (
        <div className="mb-4 w-full max-w-[520px] aspect-video overflow-hidden rounded-lg border border-brand-border dark:border-dark-border bg-black">
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
        <div className="space-y-4 max-w-[520px]">
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
            <label className="h-28 rounded-lg border-2 border-dashed border-brand-border dark:border-dark-border flex items-center justify-center cursor-pointer hover:border-brand-green transition-colors">
              <div className="flex items-center gap-3 text-brand-inactive-text">
                <UploadIcon className="w-5 h-5" />
                <span className="text-sm font-medium">{isUploading ? "Enviando vídeo..." : "Selecionar MP4, WebM ou MOV"}</span>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                className="hidden"
                disabled={isUploading}
                onChange={(e) => {
                  const selected = e.target.files?.[0]
                  if (selected) void handleUpload(selected)
                }}
              />
            </label>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Input label={source === "youtube" ? "URL do YouTube" : "URL do Vimeo"} value={urlValue} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setUrlValue(e.target.value)} placeholder={source === "youtube" ? "https://youtube.com/watch?v=..." : "https://vimeo.com/..."} />
              <Button type="button" onClick={handleUrlPreview} className="sm:self-end">Pré-visualizar</Button>
            </div>
          )}

          {uploadPlayback?.duration != null && uploadPlayback.duration > 0 && (
            <p className="text-sm text-brand-inactive-text">Duração: {Math.round(uploadPlayback.duration)}s</p>
          )}

          {progress > 0 && isUploading && <Progress value={progress} className="h-2" />}
          {error && <p className="text-sm text-brand-red-dark">{error}</p>}
        </div>
      )}
    </div>
  )
}
