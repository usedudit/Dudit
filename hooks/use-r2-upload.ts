'use client';

/**
 * Hook para upload direto ao Cloudflare R2
 * Gerencia o fluxo de obtenção de signed URL e upload do arquivo
 *
 * SECURITY:
 * - Client-side pre-validation (type, extension, size) before requesting signed URL
 * - Server enforces all validation authoritatively
 */

import { useCallback, useState } from 'react'
import type { SignedUrlResponse } from '@/lib/r2/server'

// Client-side constants (defense-in-depth, server is authoritative)
const CLIENT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const CLIENT_MAX_SIZE = 5 * 1024 * 1024 // 5MB
const CLIENT_DANGEROUS_EXTENSIONS = [
  '.exe', '.dll', '.bat', '.cmd', '.sh', '.js', '.html', '.htm',
  '.php', '.svg', '.py', '.rb', '.msi', '.com', '.scr', '.vbs',
]

export interface UseR2UploadOptions {
  prefix?: string
  onSuccess?: (result: SignedUrlResponse & { fileName: string }) => void
  onError?: (error: Error) => void
}

export interface UseR2UploadReturn {
  uploadFile: (file: File) => Promise<SignedUrlResponse & { fileName: string }>
  isLoading: boolean
  error: Error | null
  progress: number
}

/**
 * Hook customizado para upload de arquivos ao R2
 *
 * @example
 * const { uploadFile, isLoading, error, progress } = useR2Upload({
 *   onSuccess: (result) => console.log('Upload bem-sucedido:', result),
 * })
 *
 * const handleFileChange = async (file: File) => {
 *   try {
 *     const result = await uploadFile(file)
 *     console.log('URL pública:', result.publicUrl)
 *   } catch (err) {
 *     console.error('Erro:', err)
 *   }
 * }
 */
export function useR2Upload(options?: UseR2UploadOptions): UseR2UploadReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState(0)

  const uploadFile = useCallback(
    async (file: File) => {
      setIsLoading(true)
      setError(null)
      setProgress(0)

      try {
        // ── Client-side pre-validation (defense-in-depth) ──

        // Check file type
        if (!CLIENT_ALLOWED_TYPES.includes(file.type)) {
          throw new Error(
            `Tipo de arquivo não permitido: ${file.type}. Permitidos: ${CLIENT_ALLOWED_TYPES.join(', ')}`
          )
        }

        // Check file size
        if (file.size > CLIENT_MAX_SIZE) {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
          throw new Error(
            `Arquivo muito grande (${sizeMB}MB). Máximo: ${(CLIENT_MAX_SIZE / (1024 * 1024)).toFixed(0)}MB`
          )
        }

        if (file.size === 0) {
          throw new Error('Arquivo vazio não é permitido')
        }

        // Check extension
        const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
        if (CLIENT_DANGEROUS_EXTENSIONS.includes(ext)) {
          throw new Error(`Extensão de arquivo não permitida: ${ext}`)
        }

        // 1. Obter signed URL do backend
        const searchParams = new URLSearchParams({
          fileName: file.name,
          fileType: file.type,
        })

        const signedUrlResponse = await fetch(
          `/api/r2/get-signed-url?${searchParams}`,
          { method: 'GET' }
        )

        if (!signedUrlResponse.ok) {
          const errorData = await signedUrlResponse.json()
          throw new Error(errorData.error || 'Falha ao gerar URL de upload')
        }

        const signedUrlData = (await signedUrlResponse.json()) as SignedUrlResponse

        // 2. Fazer upload direto do arquivo ao R2 via PUT
        setProgress(10)

        const signedContentType = signedUrlData.contentType || file.type

        const uploadResponse = await fetch(signedUrlData.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': signedContentType,
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

        // Callback de sucesso
        options?.onSuccess?.(result)

        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Erro desconhecido no upload')
        setError(error)
        options?.onError?.(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [options]
  )

  return {
    uploadFile,
    isLoading,
    error,
    progress,
  }
}
