/**
 * Tipos padronizados para respostas de Server Actions
 * Fase 1: Padronização de Respostas
 */

export type ActionResponse<T = void> = { success: true; data: T } | { success: false; error: string; details?: unknown }

export type ValidationError = {
  field: string
  message: string
}

export type ActionResponseWithValidation<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; validationErrors?: ValidationError[]; details?: unknown }
