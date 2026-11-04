export type ResizeOptions = {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  mimeType?: "image/jpeg" | "image/webp" | "image/png"
}

export async function resizeImage(
  file: File | Blob,
  {
    maxWidth = 512,
    maxHeight = 512,
    quality = 0.7,
    mimeType = "image/jpeg",
  }: ResizeOptions = {}
): Promise<Blob> {
  // ───────────────────────────────────────────────
  // LOAD IMAGE
  // ───────────────────────────────────────────────
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = URL.createObjectURL(file)
  })

  // ───────────────────────────────────────────────
  // CALCULATE SIZE (KEEP ASPECT RATIO)
  // ───────────────────────────────────────────────
  let { width, height } = img

  const scale = Math.min(
    maxWidth / width,
    maxHeight / height,
    1 // nunca upscale
  )

  width = Math.round(width * scale)
  height = Math.round(height * scale)

  // ───────────────────────────────────────────────
  // DRAW CANVAS
  // ───────────────────────────────────────────────
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")

  ctx.drawImage(img, 0, 0, width, height)

  // ───────────────────────────────────────────────
  // EXPORT
  // ───────────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject("Failed to resize image")),
      mimeType,
      quality
    )
  })
}

/**
 * Converte dataURL base64 diretamente para File em memória de forma síncrona.
 * Evita o overhead de fetch() e preserva o tipo MIME e extensão corretos (ex: image/webp).
 */
export function dataUrlToFile(dataUrl: string, filenamePrefix: string): File {
  const arr = dataUrl.split(",")
  const mimeMatch = arr[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : "image/webp"
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp"
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], `${filenamePrefix}-${Date.now()}.${ext}`, { type: mime })
}
