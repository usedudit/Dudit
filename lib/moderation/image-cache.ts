import crypto from 'crypto'
import { redis } from "@/lib/redis"

export interface ImageCache {
  hash: string
  riskLevel: 'low' | 'medium' | 'high'
  confidence: number
  categories: { name: string; confidence: number }[]
  status: 'APPROVED' | 'FLAGGED' | 'BLOCKED'
}

const CACHE_TTL = 60 * 60 * 24 * 30 // 30 dias em segundos

/**
 * Calcula hash SHA256 de um buffer de imagem (mais rápido e seguro que MD5)
 */
export async function calculateImageHash(buffer: Buffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Verifica se imagem já foi moderada antes no Redis (GLOBAL por hash)
 * Retorna:
 * - { cached: true, status: 'BLOCKED', ... } = Imagem bloqueada antes, bloqueia dnv
 * - { cached: true, status: 'FLAGGED', ... } = Imagem com alerta
 * - { cached: true, status: 'APPROVED', ... } = Imagem aprovada
 * - null = Primeira vez vendo essa imagem
 */
export async function getImageFromCache(hash: string): Promise<ImageCache | null> {
  try {
    const cacheKey = `moderation:image:v3:${hash}`
    const cached = await redis.get(cacheKey)

    if (cached) {
      console.log('Image found in Redis cache:', {
        hash: hash.slice(0, 12) + '...',
        status: (cached as any).status,
      })
      return cached as ImageCache
    }

    console.log('Image NOT in cache, will need moderation')
    return null
  } catch (error) {
    console.error('Error reading from Redis cache:', error)
    // Se falhar, retorna null para fazer moderação normal
    return null
  }
}

/**
 * Salva resultado de moderação no Redis com TTL (GLOBAL por hash)
 * Qualquer upload futuro da mesma imagem reaproveita o resultado
 */
export async function cacheImageModeration(
  hash: string,
  riskLevel: 'low' | 'medium' | 'high',
  confidence: number,
  categories: { name: string; confidence: number }[],
  status: 'APPROVED' | 'FLAGGED' | 'BLOCKED',
): Promise<void> {
  try {
    const cacheKey = `moderation:image:v3:${hash}`

    const cacheData: ImageCache = {
      hash,
      riskLevel,
      confidence,
      categories,
      status,
    }

    await redis.setex(cacheKey, CACHE_TTL, cacheData)

    console.log('Image moderation cached in Redis:', {
      status,
      ttl: CACHE_TTL
    })
  } catch (error) {
    console.error('Error writing to Redis cache:', error)
    // Se falhar, não quebra o upload - apenas não cacheou
  }
}
