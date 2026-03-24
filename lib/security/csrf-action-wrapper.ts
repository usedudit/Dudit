/**
 * Helper to extract and validate CSRF token from FormData in server actions
 */

import { validateCSRFForAction } from "./csrf-middleware"

/**
 * Extract CSRF token from FormData
 */
export function extractCSRFTokenFromFormData(formData: FormData): string | null {
    return formData.get("csrf_token")?.toString() || null
}

/**
 * Extract CSRF token from object (for server actions that receive objects)
 */
export function extractCSRFTokenFromObject(data: Record<string, unknown>): string | null {
    if (typeof data.csrf_token === "string") {
        return data.csrf_token
    }
    return null
}

/**
 * Validate CSRF token in server action
 * Use this at the beginning of server actions that need CSRF protection
 */
export async function requireCSRF(token: string | null | undefined): Promise<{ valid: boolean; error?: string }> {
    if (!token) {
        return {
            valid: false,
            error: "Token CSRF não fornecido",
        }
    }

    const validation = await validateCSRFForAction(token)
    return validation
}
