"use client"

import { useCallback, useState, useRef } from "react"
import type { SignedUrlResponse } from "@/lib/r2/server"
import {
  ALL_ALLOWED_MIME_TYPES,
  DANGEROUS_EXTENSIONS,
  getUploadValidationRules,
  getUploadKindFromMimeType,
} from "@/lib/r2/config"

export interface UseR2UploadOptions {
  prefix?: string
  endpoint?: string
  allowedTypes?: string[]
  maxSize?: number
  onSuccess?: (result: SignedUrlResponse & { fileName: string }) => void
  onError?: (error: Error) => void
}

export interface UseR2UploadReturn {
  uploadFile: (file: File) => Promise<SignedUrlResponse & { fileName: string }>
  cancelUpload: () => void
  isLoading: boolean
  error: Error | null
  progress: number
}

export function useR2Upload(options?: UseR2UploadOptions): UseR2UploadReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState(0)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const cancelUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort()
    }
  }, [])

  const uploadFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    setProgress(0)

    try {
      const resolvedKind = getUploadKindFromMimeType(file.type)
      const rules = resolvedKind ? getUploadValidationRules(resolvedKind) : null

      const allowedTypes = (options?.allowedTypes || ALL_ALLOWED_MIME_TYPES) as readonly string[]
      const maxSize = options?.maxSize || rules?.maxSize || 5 * 1024 * 1024 // 5MB fallback

      if (!allowedTypes.includes(file.type)) {
        throw new Error(`Tipo de arquivo não permitido: ${file.type}.`)
      }

      if (file.size > maxSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
        const maxMB = (maxSize / (1024 * 1024)).toFixed(0)
        throw new Error(`Arquivo muito grande (${sizeMB}MB). Limite: ${maxMB}MB.`)
      }

      if (file.size === 0) throw new Error("Arquivo vazio não é permitido")

      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf("."))
      if (DANGEROUS_EXTENSIONS.includes(ext as any)) {
        throw new Error(`Extensão de arquivo não permitida: ${ext}`)
      }

      const endpoint = options?.endpoint || "/api/r2/get-signed-url"
      let signedUrlResponse: Response

      if (endpoint.endsWith("get-signed-url")) {
        const queryObj: Record<string, string> = {
          fileName: file.name,
          fileType: file.type,
        }
        if (options?.prefix) {
          queryObj.prefix = options.prefix
        }
        const searchParams = new URLSearchParams(queryObj)
        signedUrlResponse = await fetch(`${endpoint}?${searchParams}`, { method: "GET" })
      } else {
        signedUrlResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            fileSize: file.size,
          }),
        })
      }

      if (!signedUrlResponse.ok) {
        const errorData = await signedUrlResponse.json().catch(() => ({}))
        throw new Error(errorData.error || "Falha ao gerar URL de upload")
      }

      const signedUrlData = (await signedUrlResponse.json()) as SignedUrlResponse

      // Real upload progress tracking using XMLHttpRequest
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      const uploadPromise = new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100)
            setProgress(pct)
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Erro no upload para storage: ${xhr.statusText || xhr.status}`))
          }
        }

        xhr.onerror = () => reject(new Error("Erro de conexão durante o upload"))
        xhr.onabort = () => reject(new Error("Upload cancelado pelo usuário"))

        xhr.open("PUT", signedUrlData.uploadUrl)
        xhr.setRequestHeader("Content-Type", signedUrlData.contentType || file.type)
        xhr.send(file)
      })

      await uploadPromise

      setProgress(100)
      const result = {
        ...signedUrlData,
        fileName: file.name,
      }
      options?.onSuccess?.(result)
      return result
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error("Erro desconhecido no upload")
      setError(errorObj)
      options?.onError?.(errorObj)
      throw errorObj
    } finally {
      setIsLoading(false)
      xhrRef.current = null
    }
  }, [options])

  return { uploadFile, cancelUpload, isLoading, error, progress }
}
