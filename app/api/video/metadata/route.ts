import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/authorization"
import {
  assertVideoDuration,
  getVimeoOembed,
  getYouTubeDurationSeconds,
  parseVimeoUrl,
  parseYouTubeUrl,
} from "@/lib/video/shared"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    await requireUser()
    const body = await req.json()
    const source = body.source as string
    const url = String(body.url || "").trim()

    if (!url) {
      return NextResponse.json({ error: "URL obrigatória" }, { status: 400 })
    }

    if (source === "youtube") {
      const parsed = parseYouTubeUrl(url)
      if (!parsed) return NextResponse.json({ error: "URL do YouTube inválida" }, { status: 400 })

      const duration = await getYouTubeDurationSeconds(parsed.id)
      if (duration === null) {
        return NextResponse.json({ error: "Não foi possível obter a duração do vídeo do YouTube" }, { status: 400 })
      }

      try {
        assertVideoDuration(duration)
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Duração inválida" }, { status: 400 })
      }

      return NextResponse.json({
        video_type: "youtube",
        video_url: parsed.url,
        video_thumbnail: parsed.thumbnail,
        video_duration: Math.round(duration),
        video_provider_id: parsed.id,
      })
    }

    if (source === "vimeo") {
      const parsed = parseVimeoUrl(url)
      if (!parsed) return NextResponse.json({ error: "URL do Vimeo inválida" }, { status: 400 })

      const oembed = await getVimeoOembed(parsed.url)
      const duration = oembed?.duration
      if (duration === undefined || duration === null) {
        return NextResponse.json({ error: "Não foi possível obter a duração do vídeo do Vimeo" }, { status: 400 })
      }

      try {
        assertVideoDuration(duration)
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Duração inválida" }, { status: 400 })
      }

      return NextResponse.json({
        video_type: "vimeo",
        video_url: parsed.url,
        video_thumbnail: oembed?.thumbnail_url || null,
        video_duration: Math.round(duration),
        video_provider_id: parsed.id,
      })
    }

    return NextResponse.json({ error: "Fonte de vídeo inválida" }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao validar vídeo"
    const status = message.includes("Unauthorized") || message.includes("Não autenticado") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
