"use client"

/**
 * Hook para processar imagens para moderação
 * Executa no client, depois passa dados processados para server action
 */

import { useCallback, useState } from "react"
import {
  processImagesForModeration,
} from "@/lib/utils/image-processing"
import type { UseImageModerationResult } from "@/lib/types/moderation"

export function useImageModeration(): UseImageModerationResult {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processImages = useCallback(
    async (imageUrls: string[] | undefined): Promise<any[]> => {
      try {
        setIsProcessing(true)
        setError(null)

        if (!imageUrls || imageUrls.length === 0) {
          return []
        }

        const processed = await processImagesForModeration(imageUrls, 2)
        return processed
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erro ao processar imagens"
        setError(message)
        console.error("[Image Moderation Hook] Error:", err)
        return []
      } finally {
        setIsProcessing(false)
      }
    },
    []
  )

  return {
    processImages,
    isProcessing,
    error,
  }
}
