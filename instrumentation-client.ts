// Next.js 16 loads this file once for browser instrumentation.
// The shared options intentionally disable PII, Replay, logs, bodies and headers.
import * as Sentry from "@sentry/nextjs"
import { getSentryOptions } from "./lib/sentry/config"

Sentry.init(getSentryOptions())

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
