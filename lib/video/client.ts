"use client"

import {
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_FILE_SIZE,
} from "@/lib/r2/config"
import { assertVideoDuration } from "./shared"

const VIDEO_MAGIC_BYTES: Record<string, (bytes: Uint8Array) => boolean> = {
  "video/mp4": (bytes) => bytes.length > 11 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70,
  "video/quicktime": (bytes) => bytes.length > 11 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70,
  "video/webm": (bytes) => bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3,
}

export async function readFirstBytes(file: File, length = 32) {
  return new Uint8Array(await file.slice(0, length).arrayBuffer())
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function validateVideoExtension(file: File) {
  const dot = file.name.lastIndexOf(".")
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ""
  if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext as any)) {
    throw new Error("Formato não suportado")
  }
}

function validateVideoMagicBytes(file: File, bytes: Uint8Array) {
  const checker = VIDEO_MAGIC_BYTES[file.type]
  if (!checker || !checker(bytes)) throw new Error("Arquivo de vídeo inválido")
}

export async function getVideoDuration(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.src = url

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error("Vídeo corrompido ou inválido"))
    })

    return video.duration
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function generateVideoThumbnail(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.playsInline = true
    video.src = url

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error("Não foi possível gerar a miniatura do vídeo"))
    })

    video.currentTime = Math.min(1, Math.max(0, video.duration / 2))
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error("Não foi possível gerar a miniatura do vídeo"))
    })

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Não foi possível gerar a miniatura do vídeo")
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return await new Promise<File>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error("Não foi possível gerar a miniatura do vídeo"))
        else resolve(new File([blob], "video-thumbnail.jpg", { type: "image/jpeg" }))
      }, "image/jpeg", 0.82)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function validateVideoFile(file: File) {
  if (!file || file.size <= 0) throw new Error("Arquivo vazio não é permitido")
  if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.type as any)) throw new Error("Formato não suportado")
  validateVideoExtension(file)
  const firstBytes = await readFirstBytes(file)
  validateVideoMagicBytes(file, firstBytes)
  const duration = await getVideoDuration(file)
  assertVideoDuration(duration)
  return { duration, firstBytes }
}

export async function compressVideoIfNeeded(file: File, duration: number, onProgress?: (progress: number) => void) {
  if (file.size <= MAX_VIDEO_FILE_SIZE) return file

  const { FFmpeg } = await import("@ffmpeg/ffmpeg")
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util")
  const ffmpeg = new FFmpeg()

  ffmpeg.on("progress", ({ progress }) => onProgress?.(Math.min(95, Math.max(5, Math.round(progress * 90)))))

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd"
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  })

  const inputName = `input.${file.name.split(".").pop() || "mp4"}`
  const outputName = "output.mp4"
  const targetVideoKbps = Math.max(450, Math.floor(((24 * 1024 * 1024 * 8) / Math.max(1, duration)) / 1000) - 96)

  await ffmpeg.writeFile(inputName, await fetchFile(file))
  await ffmpeg.exec([
    "-i", inputName,
    "-vf", "scale='min(1280,iw)':-2",
    "-c:v", "libx264",
    "-b:v", `${targetVideoKbps}k`,
    "-preset", "veryfast",
    "-c:a", "aac",
    "-b:a", "96k",
    "-movflags", "faststart",
    outputName,
  ])

  const data = await ffmpeg.readFile(outputName)
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data as any)
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const compressed = new File([arrayBuffer as any], file.name.replace(/\.[^.]+$/, ".mp4"), { type: "video/mp4" })
  if (compressed.size > MAX_VIDEO_FILE_SIZE) throw new Error("Vídeo excede limite")
  onProgress?.(100)
  return compressed
}
