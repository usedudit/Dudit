/**
 * Wrappers reutilizáveis para Server Actions
 * Fase 2: Abstrações e Padrões
 */

import { getCurrentUser, requirePartnerOwnership } from "@/lib/auth/authorization"
import type { ActionResponse } from "@/lib/types/action-response"
import { AUTH_MESSAGES, GENERIC_MESSAGES } from "@/lib/constants/messages"
import { z } from "zod"
import { validateCSRFForAction } from "@/lib/security/csrf-middleware"
import { captureError } from "@/lib/monitoring/sentry"

/**
 * Wrapper para validação CSRF em actions
 * Extrai o token do primeiro argumento se for um objeto com csrf_token
 */
export function withCSRF<TArgs extends unknown[], TReturn>(
  action: (...args: TArgs) => Promise<TReturn>,
  options?: { requireCSRF?: boolean },
) {
  return async (...args: TArgs): Promise<ActionResponse<TReturn>> => {
    try {
      // CSRF validation is optional by default (can be disabled for public actions)
      if (options?.requireCSRF !== false) {
        // Try to extract CSRF token from first argument if it's an object
        let csrfToken: string | undefined

        if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
          const firstArg = args[0] as Record<string, unknown>
          if ("csrf_token" in firstArg && typeof firstArg.csrf_token === "string") {
            csrfToken = firstArg.csrf_token
            // Remove csrf_token from the object to avoid passing it to the action
            delete firstArg.csrf_token
          }
        }

        if (csrfToken) {
          const csrfValidation = await validateCSRFForAction(csrfToken)
          if (!csrfValidation.valid) {
            return {
              success: false,
              error: csrfValidation.error || "Token CSRF inválido",
            }
          }
        } else if (options?.requireCSRF === true) {
          // If CSRF is explicitly required but not provided
          return {
            success: false,
            error: "Token CSRF obrigatório",
          }
        }
      }

      const result = await action(...args)
      return { success: true, data: result }
    } catch (error) {
      console.error("Erro em withCSRF:", error)
      return {
        success: false,
        error: GENERIC_MESSAGES.INTERNAL_ERROR,
        details: error,
      }
    }
  }
}

/**
 * Wrapper para ações que requerem autenticação
 */
export function withAuth<TArgs extends unknown[], TReturn>(
  action: (userId: string, ...args: TArgs) => Promise<TReturn>,
) {
  return async (...args: TArgs): Promise<ActionResponse<TReturn>> => {
    try {
      const user = await getCurrentUser()

      if (!user) {
        return { success: false, error: AUTH_MESSAGES.NOT_AUTHENTICATED }
      }

      const result = await action(user.id, ...args)
      return { success: true, data: result }
    } catch (error) {
      console.error("Erro em withAuth:", error)
      return {
        success: false,
        error: GENERIC_MESSAGES.INTERNAL_ERROR,
        details: error,
      }
    }
  }
}

/**
 * Wrapper para ações que requerem verificação de ownership de parceiro
 */
export function withPartnerAuth<TArgs extends unknown[], TReturn>(
  action: (userId: string, partnerId: string, ...args: TArgs) => Promise<TReturn>,
  options?: { errorMessage?: string },
) {
  return async (partnerId: string, ...args: TArgs): Promise<ActionResponse<TReturn>> => {
    try {
      const user = await getCurrentUser()

      if (!user) {
        return { success: false, error: AUTH_MESSAGES.NOT_AUTHENTICATED }
      }

      // SECURITY FIX (LOW-01): Use requirePartnerOwnership which checks partner_users table
      // (supports team members), not just partners.user_id (owner-only).
      await requirePartnerOwnership(partnerId)

      const result = await action(user.id, partnerId, ...args)
      return { success: true, data: result }
    } catch (error) {
      console.error("Erro em withPartnerAuth:", error)
      return {
        success: false,
        error: GENERIC_MESSAGES.INTERNAL_ERROR,
        details: error,
      }
    }
  }
}

/**
 * Wrapper para validação Zod em actions
 */
export function withValidation<TSchema extends z.ZodType, TReturn>(
  schema: TSchema,
  action: (data: z.infer<TSchema>) => Promise<TReturn>,
) {
  return async (data: unknown): Promise<ActionResponse<TReturn>> => {
    try {
      const validated = schema.parse(data)
      const result = await action(validated)
      return { success: true, data: result }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: GENERIC_MESSAGES.VALIDATION_ERROR,
          details: (error as any).errors,
        }
      }

      console.error("Erro em withValidation:", error)
      return {
        success: false,
        error: GENERIC_MESSAGES.INTERNAL_ERROR,
        details: error,
      }
    }
  }
}

/**
 * Combina múltiplos wrappers em um só
 */
export function composeWrappers<TArgs extends unknown[], TReturn>(
  ...wrappers: Array<(fn: (...args: TArgs) => Promise<TReturn>) => (...args: TArgs) => Promise<ActionResponse<TReturn>>>
) {
  return (action: (...args: TArgs) => Promise<TReturn>) => {
    return wrappers.reduceRight((wrappedFn, wrapper) => wrapper(wrappedFn as any) as any, action as any)
  }
}

/**
 * Helper para criar respostas de sucesso
 */
export function successResponse<T>(data: T): ActionResponse<T> {
  return { success: true, data }
}

/**
 * Helper para criar respostas de erro
 */
export function errorResponse(error: string, details?: unknown): ActionResponse<never> {
  return { success: false, error, details }
}

/**
 * Wrapper para tratar erros de banco de dados
 */
export async function handleDatabaseOperation<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  errorMessage?: string,
): Promise<ActionResponse<T>> {
  try {
    const { data, error } = await operation()

    if (error) {
      console.error("Erro de banco de dados:", error)
      captureError(error, {
        module: "database",
        action: "handle_database_operation",
        errorCode: error?.code,
        metadata: { details: error?.details, hint: error?.hint },
      })
      return {
        success: false,
        error: errorMessage || GENERIC_MESSAGES.DATABASE_ERROR,
        details: error,
      }
    }

    if (!data) {
      return {
        success: false,
        error: errorMessage || GENERIC_MESSAGES.DATABASE_ERROR,
      }
    }

    return { success: true, data }
  } catch (error) {
    console.error("Erro em handleDatabaseOperation:", error)
    captureError(error, {
      module: "database",
      action: "handle_database_operation",
    })
    return {
      success: false,
      error: GENERIC_MESSAGES.INTERNAL_ERROR,
      details: error,
    }
  }
}
