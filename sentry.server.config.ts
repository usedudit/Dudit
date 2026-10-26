import events from "node:events"
import * as Sentry from "@sentry/nextjs"
import { getSentryOptions } from "./lib/sentry/config"

// Next.js 16 + Sentry attaches 11 close listeners to ServerResponse during request lifecycle
events.defaultMaxListeners = 25

Sentry.init(getSentryOptions())

