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
