import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// This endpoint is intentionally disabled unless explicitly enabled in a safe environment.
export async function GET() {
  if (process.env.SENTRY_TEST_MODE !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const eventId = Sentry.captureException(
    new Error("Safe Sentry integration test: API route"),
    { tags: { sentry_test: "api_route" } },
  );
  await Sentry.flush(2000);

  return NextResponse.json({ ok: true, eventId });
}
