import {
  MAX_VIDEO_DURATION_SECONDS,
  MIN_VIDEO_DURATION_SECONDS,
} from "@/lib/r2/config"

export type VideoType = "upload" | "youtube" | "vimeo"

export interface VideoMetadata {
  video_type: VideoType | null
  video_url: string | null
  video_thumbnail: string | null
  video_duration: number | null
  video_provider_id: string | null
}

export const EMPTY_VIDEO_METADATA: VideoMetadata = {
  video_type: null,
  video_url: null,
  video_thumbnail: null,
  video_duration: null,
  video_provider_id: null,
}

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/
const VIMEO_ID_RE = /^[0-9]{6,12}$/

export function assertVideoDuration(duration: number) {
  if (!Number.isFinite(duration) || duration < MIN_VIDEO_DURATION_SECONDS || duration > MAX_VIDEO_DURATION_SECONDS) {
    throw new Error("Vídeo deve ter entre 10 e 60 segundos")
  }
}

export function parseYouTubeUrl(input: string): { id: string; url: string; thumbnail: string } | null {
  try {
    const url = new URL(input.trim())
    const host = url.hostname.replace(/^www\./, "")
    let id: string | null = null

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v")
      else if (url.pathname.startsWith("/shorts/")) id = url.pathname.split("/").filter(Boolean)[1] || null
    } else if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || null
    }

    if (!id || !YOUTUBE_ID_RE.test(id)) return null

    return {
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    }
  } catch {
    return null
  }
}

export function parseVimeoUrl(input: string): { id: string; url: string } | null {
  try {
    const url = new URL(input.trim())
    const host = url.hostname.replace(/^www\./, "")
    if (host !== "vimeo.com" && !host.endsWith(".vimeo.com")) return null
    const id = url.pathname.split("/").filter(Boolean).find((part) => VIMEO_ID_RE.test(part))
    if (!id) return null
    return { id, url: `https://vimeo.com/${id}` }
  } catch {
    return null
  }
}

export async function getVimeoOembed(videoUrl: string): Promise<{ thumbnail_url?: string; duration?: number } | null> {
  try {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(videoUrl)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      thumbnail_url: typeof data.thumbnail_url === "string" ? data.thumbnail_url : undefined,
      duration: typeof data.duration === "number" ? data.duration : undefined,
    }
  } catch {
    return null
  }
}

export async function getVimeoThumbnail(videoUrl: string): Promise<string | null> {
  const data = await getVimeoOembed(videoUrl)
  return data?.thumbnail_url || null
}

export async function getYouTubeDurationSeconds(videoId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Dudit/1.0)",
        "Accept-Language": "en",
      },
      cache: "no-store",
    })
    if (!res.ok) return null
    const html = await res.text()
    const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/)
    if (lengthMatch) return Number(lengthMatch[1])
    const msMatch = html.match(/"approxDurationMs":"(\d+)"/)
    if (msMatch) return Math.round(Number(msMatch[1]) / 1000)
  } catch {
    return null
  }
  return null
}

export async function normalizeVideoMetadata(input: Partial<VideoMetadata>): Promise<VideoMetadata> {
  if (!input.video_type) return EMPTY_VIDEO_METADATA

  if (input.video_type === "youtube") {
    const parsed = input.video_url ? parseYouTubeUrl(input.video_url) : null
    if (!parsed) throw new Error("URL do YouTube inválida")
    const durationSeconds = await getYouTubeDurationSeconds(parsed.id)
    if (durationSeconds === null) {
      throw new Error("Não foi possível obter a duração do vídeo do YouTube. Verifique se o link está público.")
    }
    assertVideoDuration(durationSeconds)
    return {
      video_type: "youtube",
      video_url: parsed.url,
      video_thumbnail: parsed.thumbnail,
      video_duration: Math.round(durationSeconds),
      video_provider_id: parsed.id,
    }
  }

  if (input.video_type === "vimeo") {
    const parsed = input.video_url ? parseVimeoUrl(input.video_url) : null
    if (!parsed) throw new Error("URL do Vimeo inválida")
    const oembed = await getVimeoOembed(parsed.url)
    const durationSeconds = oembed?.duration
    if (durationSeconds === undefined || durationSeconds === null) {
      throw new Error("Não foi possível obter a duração do vídeo do Vimeo. Verifique se o link está público.")
    }
    assertVideoDuration(durationSeconds)
    return {
      video_type: "vimeo",
      video_url: parsed.url,
      video_thumbnail: oembed?.thumbnail_url || null,
      video_duration: Math.round(durationSeconds),
      video_provider_id: parsed.id,
    }
  }

  if (input.video_type === "upload") {
    if (!input.video_url || !input.video_thumbnail || !input.video_duration) {
      throw new Error("Metadados do vídeo enviados estão incompletos")
    }
    assertVideoDuration(Number(input.video_duration))
    return {
      video_type: "upload",
      video_url: input.video_url,
      video_thumbnail: input.video_thumbnail,
      video_duration: Math.round(Number(input.video_duration)),
      video_provider_id: null,
    }
  }

  throw new Error("Plataforma de vídeo não suportada")
}

