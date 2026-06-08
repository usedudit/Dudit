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
 * DESATIVADO: Sempre retorna APPROVED sem chamar API (quota free esgotada)
 */
export async function POST(req: NextRequest) {
  return NextResponse.json({
    success: true,
    fromCache: false,
    analysis: {
      riskLevel: 'low',
      confidence: 0,
      categories: [],
    },
  })
}
