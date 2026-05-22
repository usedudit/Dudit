"use client"

import { useCallback, useState } from "react"
import type { SignedUrlResponse } from "@/lib/r2/server"

const CLIENT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"]
const CLIENT_MAX_SIZE = 5 * 1024 * 1024
const CLIENT_DANGEROUS_EXTENSIONS = [
  ".exe", ".dll", ".bat", ".cmd", ".sh", ".js", ".html", ".htm",
  ".php", ".svg", ".py", ".rb", ".msi", ".com", ".scr", ".vbs",
]

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
  isLoading: boolean
  error: Error | null
  progress: number
}

export function useR2Upload(options?: UseR2UploadOptions): UseR2UploadReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState(0)

  const uploadFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    setProgress(0)

    try {
      const allowedTypes = options?.allowedTypes || CLIENT_ALLOWED_TYPES
      const maxSize = options?.maxSize || CLIENT_MAX_SIZE

      if (!allowedTypes.includes(file.type)) {
        throw new Error(`Tipo de arquivo nao permitido: ${file.type}.`)
      }

      if (file.size > maxSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
        throw new Error(`Arquivo muito grande (${sizeMB}MB).`)
      }

      if (file.size === 0) throw new Error("Arquivo vazio nao e permitido")

      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf("."))
      if (CLIENT_DANGEROUS_EXTENSIONS.includes(ext)) {
        throw new Error(`Extensao de arquivo nao permitida: ${ext}`)
      }

      const endpoint = options?.endpoint || "/api/r2/get-signed-url"
      let signedUrlResponse: Response

      if (endpoint.endsWith("get-signed-url")) {
        const searchParams = new URLSearchParams({
          fileName: file.name,
          fileType: file.type,
        })
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
      setProgress(10)

      const uploadResponse = await fetch(signedUrlData.uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": signedUrlData.contentType || file.type,
        },
      })

      if (!uploadResponse.ok) {
        throw new Error(`Erro no upload: ${uploadResponse.statusText}`)
      }

      setProgress(100)

      const result = {
        ...signedUrlData,
        fileName: file.name,
      }
      options?.onSuccess?.(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Erro desconhecido no upload")
      setError(error)
      options?.onError?.(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [options])

  return { uploadFile, isLoading, error, progress }
}
