import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/authorization'
import { moderateImageWithBase64 } from '@/lib/moderation/sightengine-moderation'
import {
  calculateImageHash,
  getImageFromCache,
  cacheImageModeration,
} from '@/lib/moderation/image-cache'
import { decideImageStatus } from '@/lib/moderation/image-decision'
import { Buffer } from 'buffer'

/**
 * Server action para moderar imagem via Sightengine
 * Chamada APÓS o upload na função assíncrona
 * Usa cache global por hash para evitar chamadas repetidas à API
 */
export async function POST(req: NextRequest) {
  try {
    console.log('[MODERATION API] Image moderation request received')

    const user = await getCurrentUser()
    if (!user) {
      console.warn('[MODERATION API] User not authenticated')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { imageBase64, imageKey } = await req.json()

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'No image data provided' },
        { status: 400 }
      )
    }

    // =============================
    // Calcular hash e verificar cache
    // =============================
    const base64Data = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64
    const buffer = Buffer.from(base64Data, 'base64')
    const imageHash = await calculateImageHash(buffer)

    const cachedResult = await getImageFromCache(imageHash)

    if (cachedResult) {
      console.log('[MODERATION API] Using cached result for:', imageKey, {
        status: cachedResult.status,
        hash: imageHash.slice(0, 12) + '...',
      })

      return NextResponse.json({
        success: true,
        fromCache: true,
        analysis: {
          riskLevel: cachedResult.riskLevel,
          confidence: cachedResult.confidence,
          categories: cachedResult.categories,
        },
      })
    }

    // =============================
    // Moderar imagem com Sightengine (sem cache)
    // =============================
    console.log('[MODERATION API] Starting moderation for:', imageKey)

    const analysis = await moderateImageWithBase64(base64Data)

    console.log('[MODERATION API] Moderation complete:', {
      riskLevel: analysis.riskLevel,
      confidence: analysis.confidence,
    })

    // Salvar resultado em cache global
    const decision = decideImageStatus(analysis)
    await cacheImageModeration(
      imageHash,
      analysis.riskLevel,
      analysis.confidence,
      analysis.categories,
      decision.status as 'APPROVED' | 'FLAGGED' | 'BLOCKED',
    )

    return NextResponse.json({
      success: true,
      fromCache: false,
      analysis,
    })
  } catch (error) {
    console.error('[MODERATION API] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Moderation failed', success: false },
      { status: 500 }
    )
  }
}
