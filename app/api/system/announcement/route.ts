import { NextResponse } from "next/server"
import { getGlobalAnnouncementConfig } from "@/lib/services/system-settings.service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const announcement = await getGlobalAnnouncementConfig()
    return NextResponse.json(announcement, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    })
  } catch {
    return NextResponse.json({ active: false })
  }
}
