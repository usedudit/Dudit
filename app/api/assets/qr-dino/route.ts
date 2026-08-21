import { NextResponse } from "next/server"

const SOURCE_URL = "https://img.dudit.com.br/static/mascots/QRDino.png"

export const revalidate = 3600

/**
 * Same-origin image endpoint for the QR poster canvas.
 *
 * The source CDN intentionally does not expose CORS headers. Keeping this
 * endpoint restricted to this fixed asset avoids creating an open proxy while
 * allowing the browser to draw the image into a canvas.
 */
export async function GET() {
  const response = await fetch(SOURCE_URL, {
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
  if (contentType !== "image/png") {
    return NextResponse.json(
      { error: "Imagem do poster inválida." },
      { status: 502 },
    )
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
