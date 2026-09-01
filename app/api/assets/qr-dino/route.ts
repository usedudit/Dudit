import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const MASCOTS: Record<string, string> = {
  qrdino: "https://img.dudit.com.br/static/mascots/QRDino.png",
  cavalete: "https://img.dudit.com.br/static/mascots/QRDino.png",
  happydino: "https://img.dudit.com.br/static/mascots/HappyDino.png",
  vender: "https://img.dudit.com.br/static/mascots/PlanoVender.png",
  logo: "https://img.dudit.com.br/static/Logo.png",
  icon: "https://img.dudit.com.br/static/Icon.png",
}

const DEFAULT_SOURCE_URL = MASCOTS.qrdino

export const revalidate = 3600

/**
 * Same-origin image endpoint for the QR poster canvas.
 *
 * The source CDN intentionally does not expose CORS headers. Keeping this
 * endpoint restricted to this fixed asset whitelist avoids creating an open proxy while
 * allowing the browser to draw the image into a canvas.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mascotKey = (searchParams.get("mascot") || "qrdino").toLowerCase()

  // Se for qrdino ou cavalete e existir localmente, entrega direto do filesystem local
  if (mascotKey === "qrdino" || mascotKey === "cavalete") {
    try {
      const localPath = path.join(process.cwd(), "public", "images", "dino-cavalete.png")
      if (fs.existsSync(localPath)) {
        const fileBuffer = await fs.promises.readFile(localPath)
        return new NextResponse(fileBuffer, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
            "X-Content-Type-Options": "nosniff",
          },
        })
      }
    } catch {
      // Fallback para fetch remoto se houver erro ao ler localmente
    }
  }

  const sourceUrl = MASCOTS[mascotKey] || DEFAULT_SOURCE_URL

  const response = await fetch(sourceUrl, {
    cache: "force-cache",
    redirect: "error",
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: "Imagem do poster indisponível." },
      { status: 502 },
    )
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]
  if (contentType !== "image/png" && contentType !== "image/jpeg" && contentType !== "image/webp") {
    return NextResponse.json(
      { error: "Imagem do poster inválida." },
      { status: 502 },
    )
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      "Content-Type": contentType || "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
