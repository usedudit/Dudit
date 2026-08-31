import { NextResponse } from "next/server"
import { getGlobalAnnouncementConfig } from "@/lib/services/system-settings.service"

export const dynamic = "force-dynamic"
export const revalidate = 60 // 1 minute edge cache

export async function GET() {
  try {
    const announcement = await getGlobalAnnouncementConfig()
    return NextResponse.json(announcement, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    })
  } catch {
    return NextResponse.json({ active: false })
  }
}
