"use client"

import type React from "react"
import { useMemo, useRef, useState } from "react"
import { Button, FormDropdown, Input } from "@/components/reusable"
import { Progress } from "@/components/ui/progress"
import { TrashIcon, UploadIcon } from "@/lib/icons"
import {
  bytesToBase64,
  compressVideoIfNeeded,
  generateVideoThumbnail,
  validateVideoFile,
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

function putWithProgress(url: string, file: File, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload interrompido"))
    xhr.onerror = () => reject(new Error("Upload interrompido"))
    xhr.onabort = () => reject(new Error("Upload interrompido"))
    xhr.send(file)
  })
}

function getPreviewUrl(video: VideoMetadata) {
  if (video.video_type === "youtube" && video.video_provider_id) {
    return `https://www.youtube.com/embed/${video.video_provider_id}`
  }
  if (video.video_type === "vimeo" && video.video_provider_id) {
    return `https://player.vimeo.com/video/${video.video_provider_id}`
  }
  return video.video_url || ""
}

export default function ProductVideoSection({ itemType, itemId, video, onChange, isEditing }: ProductVideoSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<VideoType>((video.video_type || "upload") as VideoType)
  const [urlValue, setUrlValue] = useState(video.video_type === "youtube" || video.video_type === "vimeo" ? video.video_url || "" : "")
  const [error, setError] = useState("")
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  const hasVideo = !!video.video_type && !!video.video_url
  const previewUrl = useMemo(() => getPreviewUrl(video), [video])

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setError("")
    setProgress(1)
    setIsUploading(true)

    try {
      const validation = await validateVideoFile(file)
      const uploadFile = await compressVideoIfNeeded(file, validation.duration, (p) => setProgress(Math.min(30, p)))
      const secondValidation = await validateVideoFile(uploadFile)
      const thumbnail = await generateVideoThumbnail(uploadFile)

      const res = await fetch("/api/r2/video-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemType,
          itemId,
          filename: uploadFile.name,
          contentType: uploadFile.type,
          fileSize: uploadFile.size,
          duration: secondValidation.duration,
          firstBytesBase64: bytesToBase64(secondValidation.firstBytes),
        }),
      })
      const signed = await res.json()
      if (!res.ok) throw new Error(signed.error || "Erro ao preparar upload")

      await putWithProgress(signed.thumbnail.uploadUrl, thumbnail, (p) => setProgress(30 + Math.round(p * 0.2)))
      await putWithProgress(signed.video.uploadUrl, uploadFile, (p) => setProgress(50 + Math.round(p * 0.5)))

      onChange({
        video_type: "upload",
        video_url: signed.video.publicUrl,
        video_thumbnail: signed.thumbnail.publicUrl,
        video_duration: Math.round(secondValidation.duration),
        video_provider_id: null,
      })
      setProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar vídeo")
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const handleUrlPreview = async () => {
    setError("")
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL inválida")
    }
  }

  return (
    <div className="mt-6 border-t border-brand-border dark:border-dark-border pt-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3 className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">Vídeo opcional</h3>
        {hasVideo && isEditing && (
          <button type="button" onClick={() => onChange(EMPTY_VIDEO)} className="text-sm text-brand-red-dark hover:underline inline-flex items-center gap-1">
            <TrashIcon className="w-4 h-4" />
            Remover vídeo
          </button>
        )}
      </div>

      {hasVideo && (
        <div className="mb-4 w-full max-w-[520px] aspect-video overflow-hidden rounded-lg border border-brand-border dark:border-dark-border bg-black">
          {video.video_type === "upload" ? (
            <video src={previewUrl} poster={video.video_thumbnail || undefined} controls preload="metadata" playsInline className="w-full h-full object-contain" />
          ) : (
            <iframe src={previewUrl} title="Preview do vídeo" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen className="w-full h-full" />
          )}
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
              <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" className="hidden" disabled={isUploading} onChange={(e) => handleUpload(e.target.files?.[0])} />
            </label>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Input label={source === "youtube" ? "URL do YouTube" : "URL do Vimeo"} value={urlValue} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setUrlValue(e.target.value)} placeholder={source === "youtube" ? "https://youtube.com/watch?v=..." : "https://vimeo.com/..."} />
              <Button type="button" onClick={handleUrlPreview} className="sm:self-end">Pré-visualizar</Button>
            </div>
          )}

          {progress > 0 && isUploading && <Progress value={progress} className="h-2" />}
          {error && <p className="text-sm text-brand-red-dark">{error}</p>}
        </div>
      )}
    </div>
  )
}
