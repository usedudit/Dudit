import "server-only"

type LogLevel = "error" | "warn" | "info"

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  user_id?: string
  context?: Record<string, any>
}

const sensitivePatterns = [
  /password/gi,
  /token/gi,
  /secret/gi,
  /api[_-]?key/gi,
  /authorization/gi,
  /cpf/gi,
  /cnpj/gi,
  /credit[_-]?card/gi,
  /card[_-]?number/gi,
  /cvv/gi,
  /cvc/gi,
  /ssn/gi,
  /bearer/gi,
  /access[_-]?token/gi,
  /refresh[_-]?token/gi,
  /private[_-]?key/gi,
  /mp_access_token/gi,
  /mp_refresh_token/gi,
]

function maskSensitiveData(obj: any): any {
  if (typeof obj !== "object" || obj === null) {
    return obj
  }

  const masked = { ...obj }

  for (const [key, value] of Object.entries(masked)) {
    if (sensitivePatterns.some((pattern) => pattern.test(key))) {
      masked[key] = "[REDACTED]"
    } else if (typeof value === "string" && sensitivePatterns.some((pattern) => pattern.test(value))) {
      masked[key] = "[REDACTED]"
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskSensitiveData(value)
    }
  }

  return masked
}

interface ExternalLogger {
  log(entry: LogEntry): Promise<void>
}

let externalLogger: ExternalLogger | null = null

export class SecureLogger {
  static setExternalLogger(logger: ExternalLogger) {
    externalLogger = logger
  }

  static async log(level: LogLevel, message: string, context?: Record<string, any>) {
    const logEntry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: context ? maskSensitiveData(context) : undefined,
    }

    const logFn = level === "error" ? console.error : level === "warn" ? console.warn : console.info
    logFn(`[SECURE_LOGGER][${level.toUpperCase()}] ${message}`, logEntry.context || "")

    if (process.env.NODE_ENV === "production" && externalLogger) {
      try {
        await externalLogger.log(logEntry)
      } catch (error) {
        // Falha silenciosa para não quebrar a aplicação
        console.error("[SecureLogger] Failed to send log to external service")
      }
    }
  }

  static error(message: string, context?: Record<string, any>) {
    this.log("error", message, context)
  }

  static warn(message: string, context?: Record<string, any>) {
    this.log("warn", message, context)
  }

  static info(message: string, context?: Record<string, any>) {
    this.log("info", message, context)
  }
}
