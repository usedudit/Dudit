import crypto from 'crypto'
import sharp from 'sharp'
import { redis } from "@/lib/redis"

export interface ImageCache {
  hash: string
  phash?: string | null
  riskLevel: 'low' | 'medium' | 'high'
  confidence: number
  categories: { name: string; confidence: number }[]
  status: 'APPROVED' | 'FLAGGED' | 'BLOCKED'
}

const CACHE_TTL = 60 * 60 * 24 * 30 // 30 dias em segundos
export const DEFAULT_MAX_HAMMING_DISTANCE = 7 // Tolerância para considerar a mesma imagem visualmente (~89% similaridade, limite do pigeonhole de 8 chunks)

/**
 * Calcula hash SHA256 de um buffer de imagem (mais rápido e seguro que MD5)
 */
export async function calculateImageHash(buffer: Buffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Calcula o Perceptual Hash (dHash) de 64 bits de uma imagem usando sharp.
 * Redimensiona para 9x8 em tons de cinza e compara os gradientes de pixels adjacentes.
 * É imune a recompressão (WhatsApp/JPEG/WebP), leves cortes e redimensionamento.
 * Retorna string hexadecimal de 16 caracteres (64 bits) ou null em caso de erro.
 */
export async function calculatePerceptualHash(buffer: Buffer): Promise<string | null> {
  try {
    const pixels = await sharp(buffer)
      .resize(9, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer()

    let hash = BigInt(0)
    let bitIndex = 0
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = pixels[row * 9 + col]
        const right = pixels[row * 9 + (col + 1)]
        if (left > right) {
          hash |= (BigInt(1) << BigInt(bitIndex))
        }
        bitIndex++
      }
    }
    return hash.toString(16).padStart(16, '0')
  } catch (error) {
    console.warn('[PERCEPTUAL HASH] Failed to compute dHash, skipping visual hash:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Calcula a Distância de Hamming entre dois hashes hexadecimais de 64 bits.
 * Retorna o número de bits diferentes (0 a 64).
 */
export function calculateHammingDistance(hex1: string, hex2: string): number {
  try {
    const zero = BigInt(0)
    const one = BigInt(1)
    let x = BigInt('0x' + hex1) ^ BigInt('0x' + hex2)
    let count = 0
    while (x > zero) {
      if (x & one) count++
      x >>= one
    }
    return count
  } catch {
    return 64
  }
}

/**
 * Verifica se imagem já foi moderada antes no Redis (GLOBAL por hash SHA-256)
 * Camada 1: Custo zero, match exato de bytes
 */
export async function getImageFromCache(hash: string): Promise<ImageCache | null> {
  try {
    const cacheKey = `moderation:image:v3:${hash}`
    const cached = await redis.get(cacheKey)

    if (cached) {
      console.log('Image found in Redis cache (SHA256 exact match):', {
        hash: hash.slice(0, 12) + '...',
        status: (cached as any).status,
      })
      return cached as ImageCache
    }

    return null
  } catch (error) {
    console.error('Error reading from Redis cache:', error)
    return null
  }
}

/**
 * Busca por imagem visualmente similar no Redis usando Perceptual Hash (pHash/dHash).
 * Camada 2: Utiliza o Princípio da Casa dos Pombos (8 chunks de 8 bits) para encontrar
 * candidatos em O(1) e verifica a Distância de Hamming.
 * Evita chamadas repetidas à API do Sightengine para variações da mesma imagem.
 */
export async function findSimilarImageInCache(
  phash: string,
  maxDistance: number = DEFAULT_MAX_HAMMING_DISTANCE
): Promise<{ cached: ImageCache; distance: number } | null> {
  try {
    if (!phash || phash.length !== 16) return null

    // Consulta os 8 chunks em pipeline no Redis
    const pipeline = redis.pipeline()
    for (let i = 0; i < 8; i++) {
      const chunk = phash.slice(i * 2, i * 2 + 2)
      pipeline.smembers(`moderation:phash:v1:c${i}:${chunk}`)
    }
    const results = await pipeline.exec<string[][]>()

    const candidates = new Set<string>()
    for (const res of results) {
      if (Array.isArray(res)) {
        for (const item of res) {
          if (typeof item === 'string' && item.includes(':')) {
            candidates.add(item)
          }
        }
      }
    }

    if (candidates.size === 0) {
      return null
    }

    let bestCandidateSha256: string | null = null
    let lowestDistance = maxDistance + 1

    for (const candidate of candidates) {
      const [candPhash, candSha256] = candidate.split(':')
      if (!candPhash || !candSha256) continue

      const distance = calculateHammingDistance(phash, candPhash)
      if (distance <= maxDistance && distance < lowestDistance) {
        lowestDistance = distance
        bestCandidateSha256 = candSha256
      }
    }

    if (bestCandidateSha256) {
      const cached = await getImageFromCache(bestCandidateSha256)
      if (cached) {
        console.log('[MODERATION] Visual match found in Redis via pHash:', {
          distance: lowestDistance,
          maxAllowed: maxDistance,
          matchedHash: bestCandidateSha256.slice(0, 12) + '...',
          status: cached.status,
        })
        return { cached, distance: lowestDistance }
      }
    }

    return null
  } catch (error) {
    console.error('[PERCEPTUAL CACHE] Error searching similar image in Redis:', error)
    return null
  }
}

/**
 * Salva resultado de moderação no Redis com TTL (GLOBAL por hash SHA-256 e opcionalmente pHash)
 * Qualquer upload futuro da mesma imagem ou de variações visuais reaproveita o resultado
 */
export async function cacheImageModeration(
  hash: string,
  riskLevel: 'low' | 'medium' | 'high',
  confidence: number,
  categories: { name: string; confidence: number }[],
  status: 'APPROVED' | 'FLAGGED' | 'BLOCKED',
  phash?: string | null,
): Promise<void> {
  try {
    const cacheKey = `moderation:image:v3:${hash}`

    const cacheData: ImageCache = {
      hash,
      phash: phash || null,
      riskLevel,
      confidence,
      categories,
      status,
    }

    const pipeline = redis.pipeline()
    pipeline.setex(cacheKey, CACHE_TTL, cacheData)

    // Se temos o pHash, indexamos os 8 chunks no Redis para busca visual
    if (phash && phash.length === 16) {
      const candidateValue = `${phash}:${hash}`
      for (let i = 0; i < 8; i++) {
        const chunk = phash.slice(i * 2, i * 2 + 2)
        const chunkKey = `moderation:phash:v1:c${i}:${chunk}`
        pipeline.sadd(chunkKey, candidateValue)
        pipeline.expire(chunkKey, CACHE_TTL)
      }
    }

    await pipeline.exec()

    console.log('Image moderation cached in Redis:', {
      status,
      hasPHash: !!(phash && phash.length === 16),
      ttl: CACHE_TTL
    })
  } catch (error) {
    console.error('Error writing to Redis cache:', error)
    // Se falhar, não quebra o upload - apenas não cacheou
  }
}
