/**
 * Configuração e validação do Sightengine
 */

export const SIGHTENGINE_CONFIG = {
  apiUser: process.env.SIGHTENGINE_API_USER,
  apiSecret: process.env.SIGHTENGINE_API_SECRET,
  enabled: !!process.env.SIGHTENGINE_API_USER && !!process.env.SIGHTENGINE_API_SECRET,
}

export function validateSightengineConfig(): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!process.env.SIGHTENGINE_API_USER) {
    errors.push('SIGHTENGINE_API_USER is not set')
  }

  if (!process.env.SIGHTENGINE_API_SECRET) {
    errors.push('SIGHTENGINE_API_SECRET is not set')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Log das env vars necessárias
 * Remova isso em produção se preferir
 */
if (process.env.NODE_ENV === 'development') {
  const validation = validateSightengineConfig()
  if (!validation.valid) {
    console.warn('[SIGHTENGINE CONFIG] Missing environment variables:')
    console.warn('  - SIGHTENGINE_API_USER: Your API user from dashboard.sightengine.com')
    console.warn('  - SIGHTENGINE_API_SECRET: Your API secret from dashboard.sightengine.com')
    console.warn('\nGet your credentials at: https://dashboard.sightengine.com/api')
  }
}
