/**
 * Client-side image processing for moderation
 * - Resize to small dimensions for faster processing
 * - Convert to uint8 array (pixel data)
 * - Keep payload < 500KB
 */

import type { ProcessedImage } from "@/lib/types/moderation"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const MAX_DIMENSION = 256 // LLaVA works best with ~256px
const MAX_BYTES = 500_000 // 500KB limit

/**
 * Resize image using canvas (client-side only)
 */
function resizeImageCanvas(
  canvas: HTMLCanvasElement,
  maxDim: number
): HTMLCanvasElement {
  const { width, height } = canvas
  let newWidth = width
  let newHeight = height

  if (width > height) {
    newWidth = maxDim
    newHeight = Math.round((height * maxDim) / width)
  } else {
    newHeight = maxDim
    newWidth = Math.round((width * maxDim) / height)
  }

  const resized = document.createElement("canvas")
  resized.width = newWidth
  resized.height = newHeight

  const ctx = resized.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")

  ctx.drawImage(canvas, 0, 0, newWidth, newHeight)
  return resized
}

/**
 * Load image from URL into canvas
 */
function loadImageToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      if (!ctx) reject(new Error("Canvas context unavailable"))
      else {
        ctx.drawImage(img, 0, 0)
        resolve(canvas)
      }
    }
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = url
  })
}

/**
 * Extract pixel data as uint8 array
 */
function canvasToUint8Array(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return Array.from(imageData.data)
}

/**
 * Process single image for moderation
 * Accepts either full URL or R2 key
 * Returns resized pixel data or null if error
 */
export async function processImageForModeration(
  imageInput: string
): Promise<ProcessedImage | null> {
  try {
    if (!imageInput || typeof imageInput !== "string") {
      console.warn("[Image Processing] Invalid image input")
      return null
    }

    // Convert R2 key to full URL if needed
    let imageUrl = imageInput
    if (!imageInput.startsWith("http://") && !imageInput.startsWith("https://")) {
      imageUrl = getR2ImageUrl(imageInput)
    }

    // Validate URL format
    try {
      new URL(imageUrl)
    } catch {
      console.warn("[Image Processing] Invalid URL format:", imageUrl)
      return null
    }

    console.log("[Image Processing] Loading image:", imageUrl.slice(0, 100))

    // Load image
    const canvas = await loadImageToCanvas(imageUrl)

    // Resize
    const resized = resizeImageCanvas(canvas, MAX_DIMENSION)

    // Extract pixel data
    const array = canvasToUint8Array(resized)

    // Validate size
    if (array.length > MAX_BYTES) {
      console.warn("[Image Processing] Array too large:", array.length)
      return null
    }

    console.log("[Image Processing] Successfully processed image:", {
      size: array.length,
      width: resized.width,
      height: resized.height,
    })

    return {
      array,
      width: resized.width,
      height: resized.height,
      mimeType: "image/rgba",
    }
  } catch (err) {
    console.error("[Image Processing] Error:", err)
    return null
  }
}

/**
 * Batch process multiple images
 * Limit to N images per request
 */
export async function processImagesForModeration(
  imageInputs: string[],
  limit: number = 2
): Promise<ProcessedImage[]> {
  if (!imageInputs || imageInputs.length === 0) {
    console.log("[Image Processing] No images to process")
    return []
  }

  const results: ProcessedImage[] = []
  const processed = new Set<string>()

  for (const input of imageInputs.slice(0, limit)) {
    if (!input || processed.has(input)) continue

    console.log("[Image Processing] Processing image:", input.slice(0, 50))
    const processed_img = await processImageForModeration(input)
    if (processed_img) {
      results.push(processed_img)
      processed.add(input)
      console.log("[Image Processing] Image added to batch, total:", results.length)
    } else {
      console.warn("[Image Processing] Failed to process image:", input.slice(0, 50))
    }

    // Avoid hammering the server
    if (results.length >= limit) break
  }

  console.log("[Image Processing] Batch complete, processed:", results.length, "images")
  return results
}
