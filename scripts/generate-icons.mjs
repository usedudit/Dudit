import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const ICONS_DIR = path.resolve("public/icons")
const SOURCE = path.join(ICONS_DIR, "Favicon.png")
const BACKGROUND = "#004337"

const ANY_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
const MASKABLE_SIZES = [192, 512]
const APPLE_TOUCH_SIZE = 180

// The maskable safe zone is the inner 80% circle. Rendering the artwork at
// ~66% of the canvas keeps it fully visible after the launcher applies its mask.
const MASKABLE_CONTENT_RATIO = 0.66

async function renderAny(source, size) {
  return sharp(source)
    .flatten({ background: BACKGROUND })
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function renderMaskable(source, size) {
  const innerSize = Math.round(size * MASKABLE_CONTENT_RATIO)
  const inner = await renderAny(source, innerSize)
  const offset = Math.round((size - innerSize) / 2)

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite([{ input: inner, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function writeIcon(fileName, buffer, expectedSize) {
  const filePath = path.join(ICONS_DIR, fileName)
  await fs.writeFile(filePath, buffer)
  const { width, height } = await sharp(filePath).metadata()
  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(
      `${fileName}: expected ${expectedSize}x${expectedSize}, got ${width}x${height}`
    )
  }
  const { size } = await fs.stat(filePath)
  console.log(`${fileName} -> ${width}x${height} (${size} bytes)`)
}

const sourceMetadata = await sharp(SOURCE).metadata()
if (!sourceMetadata.width || !sourceMetadata.height) {
  throw new Error("Could not read the source icon dimensions")
}

for (const size of ANY_SIZES) {
  const buffer = await renderAny(SOURCE, size)
  await writeIcon(`icon-${size}x${size}.png`, buffer, size)
}

for (const size of MASKABLE_SIZES) {
  const buffer = await renderMaskable(SOURCE, size)
  await writeIcon(`icon-maskable-${size}x${size}.png`, buffer, size)
}

const appleTouch = await renderAny(SOURCE, APPLE_TOUCH_SIZE)
await writeIcon("apple-touch-icon.png", appleTouch, APPLE_TOUCH_SIZE)

console.log("Icons generated from", path.relative(process.cwd(), SOURCE))
