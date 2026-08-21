import "server-only"

import { NextResponse } from "next/server"
import { cronLogger } from "./logger"
import { getTrustedClientIP } from "@/lib/security/client-ip"

/**
 * Result of cron request validation.
 * If `error` is present, return it immediately from the route handler.
 */
export type CronAuthResult =
  | { ok: true; error?: never }
  | { ok: false; error: NextResponse }

/**
 * Validates an internal cron request from cron-job.org.
 *
 * Checks:
 * 1. HTTP method must be POST
 * 2. Authorization header must contain Bearer INTERNAL_CRON_SECRET
 * 3. INTERNAL_CRON_SECRET must be configured in env
 *
 * @param req - The incoming Request object
 * @param jobName - Name of the job for logging context
 * @returns CronAuthResult - either { ok: true } or { ok: false, error: NextResponse }
 */
export function validateCronRequest(req: Request, jobName: string): CronAuthResult {
  // 1. Method validation
  if (req.method !== "POST") {
    cronLogger.warn(jobName, "Invalid HTTP method", { method: req.method })
    return {
      ok: false,
      error: NextResponse.json(
        { success: false, error: "Method not allowed" },
        { status: 405 },
      ),
    }
  }

  // 2. Secret must be configured
  const secret = process.env.INTERNAL_CRON_SECRET
  if (!secret) {
    cronLogger.error(jobName, "INTERNAL_CRON_SECRET not configured")
    return {
      ok: false,
      error: NextResponse.json(
        { success: false, error: "Server misconfiguration" },
        { status: 500 },
      ),
    }
  }

  // 3. Bearer token validation
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization")
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    cronLogger.warn(jobName, "Unauthorized cron request", {
      hasHeader: !!authHeader,
      ip: getTrustedClientIP(req.headers),
    })
    return {
      ok: false,
      error: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      ),
    }
  }

  return { ok: true }
}
