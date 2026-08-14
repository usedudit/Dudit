import { beforeSend, beforeSendSpan, beforeSendTransaction, sanitizeBreadcrumb } from "./sanitize"

export function getSentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || undefined
}

export function getSentryOptions() {
  const dsn = getSentryDsn()
  const isProduction = process.env.NODE_ENV === "production"

  return {
    dsn,
    enabled: Boolean(dsn) && process.env.SENTRY_DISABLED !== "true",
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    tracesSampleRate: isProduction ? 0.1 : 0,
    maxBreadcrumbs: 20,
    enableLogs: false,
    beforeSend,
    beforeSendTransaction,
    beforeSendSpan,
    beforeBreadcrumb: sanitizeBreadcrumb,
  }
}

