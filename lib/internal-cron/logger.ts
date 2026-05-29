import "server-only"

/**
 * Correlation context for structured cron/job logging.
 * All fields are optional — pass whichever IDs are relevant to the current operation.
 */
export interface CronCorrelation {
  jobId?: string
  messageId?: string
  appointmentId?: string
  quoteId?: string
  orderId?: string
  deliveryId?: string
  partnerId?: string
  taskId?: string
  executionId?: string
  [key: string]: unknown
}

interface CronLogEntry {
  timestamp: string
  level: "info" | "warn" | "error"
  job: string
  message: string
  durationMs?: number
  correlation?: CronCorrelation
  data?: Record<string, unknown>
}

function formatEntry(entry: CronLogEntry): string {
  return JSON.stringify(entry)
}

/**
 * Structured logger for internal cron job execution.
 *
 * All log output is JSON-formatted for easy parsing in Railway, Vercel, and other log aggregators.
 * Every log entry includes the job name and optional correlation IDs for production debugging.
 */
export const cronLogger = {
  /**
   * Log the start of a cron job execution.
   */
  start(jobName: string, correlation?: CronCorrelation) {
    const entry: CronLogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      job: jobName,
      message: "Job execution started",
      correlation,
    }
    console.info(formatEntry(entry))
  },

  /**
   * Log successful completion of a cron job.
   */
  success(jobName: string, result: Record<string, unknown>, durationMs?: number, correlation?: CronCorrelation) {
    const entry: CronLogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      job: jobName,
      message: "Job execution completed",
      durationMs,
      correlation,
      data: result,
    }
    console.info(formatEntry(entry))
  },

  /**
   * Log a cron job error.
   */
  error(jobName: string, message: string, data?: Record<string, unknown>, correlation?: CronCorrelation) {
    const entry: CronLogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      job: jobName,
      message,
      correlation,
      data,
    }
    console.error(formatEntry(entry))
  },

  /**
   * Log a warning (e.g. lock active, skipped execution).
   */
  warn(jobName: string, message: string, data?: Record<string, unknown>, correlation?: CronCorrelation) {
    const entry: CronLogEntry = {
      timestamp: new Date().toISOString(),
      level: "warn",
      job: jobName,
      message,
      correlation,
      data,
    }
    console.warn(formatEntry(entry))
  },

  /**
   * Log informational data during job execution.
   */
  info(jobName: string, message: string, data?: Record<string, unknown>, correlation?: CronCorrelation) {
    const entry: CronLogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      job: jobName,
      message,
      correlation,
      data,
    }
    console.info(formatEntry(entry))
  },
}
