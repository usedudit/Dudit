import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/authorization'
import { moderateImageWithBase64 } from '@/lib/moderation/sightengine-moderation'
import {
  calculateImageHash,
  calculatePerceptualHash,
  findSimilarImageInCache,
  getImageFromCache,
  cacheImageModeration,
} from '@/lib/moderation/image-cache'
import { decideImageStatus } from '@/lib/moderation/image-decision'
import { sendModerationImageFlagged } from '@/lib/services/discord-marketplace-webhook.service'
import { Buffer } from 'buffer'

/**
 * Endpoint para moderar imagem via Sightengine (com fail-open se indisponível)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const base64 = body.base64 || body.image
    if (!base64 || typeof base64 !== 'string') {
      return NextResponse.json({
        success: true,
        fromCache: false,
        analysis: { riskLevel: 'low', confidence: 0, categories: [] },
      })
    }

    const imageBuffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    const [hash, phash] = await Promise.all([
      calculateImageHash(imageBuffer),
      calculatePerceptualHash(imageBuffer),
    ])

    let cached = await getImageFromCache(hash)
    if (!cached && phash) {
      const visualMatch = await findSimilarImageInCache(phash)
      if (visualMatch) {
        cached = visualMatch.cached
      }
    }
    if (cached) {
      return NextResponse.json({
        success: true,
        fromCache: true,
        status: cached.status === 'BLOCKED' ? 'FLAGGED' : cached.status,
        analysis: {
          riskLevel: cached.riskLevel,
          confidence: cached.confidence,
          categories: cached.categories,
        },
      })
    }

    const analysis = await moderateImageWithBase64(base64)
    const decision = analysis.isUnavailable
      ? { status: 'APPROVED' as const, message: 'Imagem aprovada.', shouldSaveToR2: true }
      : decideImageStatus(analysis)

    await cacheImageModeration(
      hash,
      analysis.riskLevel,
      analysis.confidence,
      analysis.categories,
      decision.status === 'FLAGGED' ? 'FLAGGED' : 'APPROVED',
      phash,
    )

    // Webhook Discord: notificar quando imagem é marcada (fail-open, não bloqueia fluxo)
    if (decision.status === 'FLAGGED' && !analysis.isUnavailable) {
      sendModerationImageFlagged({
        imageUrl: `hash:${hash.slice(0, 16)}`,
        imageHash: hash,
        categories: analysis.categories.map(c => c.name),
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel as "medium" | "high",
        entityType: body.entityType,
        entityId: body.entityId,
        partnerId: body.partnerId,
        userId: body.userId,
      }).catch(err => console.warn('[CHECK-IMAGE] Discord webhook failed (non-blocking):', err))
    }

    return NextResponse.json({
      success: true,
      fromCache: false,
      status: decision.status,
      analysis,
    })
  } catch (err) {
    console.warn('[CHECK-IMAGE] Error during check, failing open:', err)
    return NextResponse.json({
      success: true,
      fromCache: false,
      status: 'APPROVED',
      analysis: { riskLevel: 'low', confidence: 0, categories: [] },
    })
  }
}
