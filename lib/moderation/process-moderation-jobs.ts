/**
 * Moderação de produtos - funcionalidade removida.
 * Retorna métricas vazias para não quebrar imports.
 */

export async function processPendingModerationJobs(): Promise<{ processed: number; failed: number; retried: number; skipped: number; elapsed_ms: number }> {
  return { processed: 0, failed: 0, retried: 0, skipped: 0, elapsed_ms: 0 }
}
