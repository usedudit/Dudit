import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import {
  calculateImageHash,
  calculatePerceptualHash,
  calculateHammingDistance,
  DEFAULT_MAX_HAMMING_DISTANCE,
} from '../image-cache'

describe('Image Moderation Cache - Layer 2 (Perceptual Hashing)', () => {
  describe('calculateHammingDistance', () => {
    it('should return 0 for identical hashes', () => {
      const hash = 'a1b2c3d4e5f60718'
      expect(calculateHammingDistance(hash, hash)).toBe(0)
    })

    it('should return 1 when exactly one bit differs', () => {
      const h1 = '0000000000000000'
      const h2 = '0000000000000001'
      expect(calculateHammingDistance(h1, h2)).toBe(1)
    })

    it('should return 64 when all 64 bits differ', () => {
      const h1 = '0000000000000000'
      const h2 = 'ffffffffffffffff'
      expect(calculateHammingDistance(h1, h2)).toBe(64)
    })

    it('should gracefully handle invalid inputs without throwing', () => {
      expect(calculateHammingDistance('invalid', '0000000000000000')).toBe(64)
    })
  })

  describe('calculateImageHash (SHA-256)', () => {
    it('should generate a 64-character hex string', async () => {
      const buffer = Buffer.from('test-image-content')
      const hash = await calculateImageHash(buffer)
      expect(hash).toHaveLength(64)
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true)
    })
  })

  describe('calculatePerceptualHash (dHash)', () => {
    it('should return null on invalid image buffer without crashing', async () => {
      const invalidBuffer = Buffer.from('not an image')
      const phash = await calculatePerceptualHash(invalidBuffer)
      expect(phash).toBeNull()
    })

    it('should generate a 16-char hex pHash (64 bits) for a valid image', async () => {
      const imgBuffer = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 120, g: 140, b: 160 },
        },
      })
        .png()
        .toBuffer()

      const phash = await calculatePerceptualHash(imgBuffer)
      expect(phash).not.toBeNull()
      expect(phash).toHaveLength(16)
      expect(/^[0-9a-f]{16}$/.test(phash!)).toBe(true)
    })

    it('should recognize recompressed / altered variations within DEFAULT_MAX_HAMMING_DISTANCE', async () => {
      // Cria imagem original com formato geométrico distinto
      const svgGraphic = '<svg width="300" height="300"><polygon points="150,20 280,260 20,260" fill="yellow"/></svg>'
      const baseImg = await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 3,
          background: { r: 40, g: 60, b: 100 },
        },
      })
        .composite([{ input: Buffer.from(svgGraphic), top: 0, left: 0 }])
        .png()
        .toBuffer()

      // Variação 1: Re-comprimida em JPEG qualidade média (como WhatsApp)
      const jpegVariation = await sharp(baseImg).jpeg({ quality: 65 }).toBuffer()

      // Variação 2: Redimensionada para 200x200
      const resizedVariation = await sharp(baseImg).resize(200, 200).toBuffer()

      // Variação 3: Leve corte na borda (crop de 3%)
      const croppedVariation = await sharp(baseImg)
        .extract({ left: 6, top: 6, width: 288, height: 288 })
        .toBuffer()

      // Imagem totalmente diferente
      const differentImg = await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer()

      const [hashBase, hashSha256Base] = await Promise.all([
        calculatePerceptualHash(baseImg),
        calculateImageHash(baseImg),
      ])

      const [hashJpeg, hashSha256Jpeg] = await Promise.all([
        calculatePerceptualHash(jpegVariation),
        calculateImageHash(jpegVariation),
      ])

      const [hashResized, hashSha256Resized] = await Promise.all([
        calculatePerceptualHash(resizedVariation),
        calculateImageHash(resizedVariation),
      ])

      const [hashCropped, hashSha256Cropped] = await Promise.all([
        calculatePerceptualHash(croppedVariation),
        calculateImageHash(croppedVariation),
      ])

      const hashDiff = await calculatePerceptualHash(differentImg)

      expect(hashBase).not.toBeNull()
      expect(hashJpeg).not.toBeNull()
      expect(hashResized).not.toBeNull()
      expect(hashCropped).not.toBeNull()
      expect(hashDiff).not.toBeNull()

      // 1. Prova que o SHA-256 FALHA em variações (são strings diferentes)
      expect(hashSha256Base).not.toEqual(hashSha256Jpeg)
      expect(hashSha256Base).not.toEqual(hashSha256Resized)
      expect(hashSha256Base).not.toEqual(hashSha256Cropped)

      // 2. Prova que o pHash RECONHECE as variações com distância de Hamming <= DEFAULT_MAX_HAMMING_DISTANCE
      const distJpeg = calculateHammingDistance(hashBase!, hashJpeg!)
      const distResized = calculateHammingDistance(hashBase!, hashResized!)
      const distCropped = calculateHammingDistance(hashBase!, hashCropped!)
      const distDiff = calculateHammingDistance(hashBase!, hashDiff!)

      expect(distJpeg).toBeLessThanOrEqual(DEFAULT_MAX_HAMMING_DISTANCE)
      expect(distResized).toBeLessThanOrEqual(DEFAULT_MAX_HAMMING_DISTANCE)
      expect(distCropped).toBeLessThanOrEqual(DEFAULT_MAX_HAMMING_DISTANCE)

      // 3. Imagem diferente tem distância muito maior (não gera falso positivo)
      expect(distDiff).toBeGreaterThan(DEFAULT_MAX_HAMMING_DISTANCE)
    })

    it('should mathematically guarantee at least 1 identical chunk when distance <= 7 (Pigeonhole Principle)', () => {
      const h1 = 'a1b2c3d4e5f60718'
      // Flip 7 bits randomly across h1
      let b2 = BigInt('0x' + h1)
      const one = BigInt(1)
      b2 ^= (one << BigInt(0))
      b2 ^= (one << BigInt(9))
      b2 ^= (one << BigInt(18))
      b2 ^= (one << BigInt(27))
      b2 ^= (one << BigInt(36))
      b2 ^= (one << BigInt(45))
      b2 ^= (one << BigInt(54))
      const h2 = b2.toString(16).padStart(16, '0')

      expect(calculateHammingDistance(h1, h2)).toBe(7)

      // Divide em 8 chunks de 8 bits (2 caracteres hex cada)
      let sharedChunkFound = false
      for (let i = 0; i < 8; i++) {
        const chunk1 = h1.slice(i * 2, i * 2 + 2)
        const chunk2 = h2.slice(i * 2, i * 2 + 2)
        if (chunk1 === chunk2) {
          sharedChunkFound = true
          break
        }
      }

      expect(sharedChunkFound).toBe(true)
    })
  })
})
