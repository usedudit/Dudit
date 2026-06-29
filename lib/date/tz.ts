export function getDefaultTimezone(): string {
  return process.env.APP_DEFAULT_TIMEZONE || "America/Sao_Paulo"
}
