export type InsightTone = "positive" | "negative" | "warning" | "info" | "neutral"

export interface Insight {
  id: string
  message: string
  tone: InsightTone
  category?: string
  priority?: number
}
