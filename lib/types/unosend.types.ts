/**
 * Type definitions for Unosend email service integration
 * @module unosend.types
 */

/**
 * Email recipient with optional name
 */
export interface EmailRecipient {
  email: string
  name?: string
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  filename: string
  content: string // base64 encoded
  contentType: string
}

/**
 * Request to send an email via Unosend
 */
export interface UnosendEmailRequest {
  from: string
  to: EmailRecipient[] | string[]
  cc?: EmailRecipient[] | string[]
  bcc?: EmailRecipient[] | string[]
  subject: string
  /** HTML email body (opcional se usar template_id) */
  html?: string
  text?: string
  /** ID do template criado no painel do Unosend */
  template_id?: string
  /** Variáveis para preencher o template {{variavel}} */
  variables?: Record<string, any>
  attachments?: EmailAttachment[]
  replyTo?: string
  headers?: Record<string, string>
  idempotencyKey?: string
  tags?: string[]
}

/**
 * Response from Unosend API when sending email
 */
export interface UnosendEmailResponse {
  id: string
  from: string
  to: string[]
  subject: string
  status: "sent" | "queued"
  createdAt: string
}

/**
 * Unosend API error response
 */
export interface UnosendErrorResponse {
  message: string
  code?: string
  details?: Record<string, any>
}

/**
 * Configuration for email sending service
 */
export interface UnosendConfig {
  apiKey: string
  baseUrl: string
  timeout: number
  maxRetries: number
}

/**
 * Internal email sending request (with metadata)
 */
export interface InternalEmailRequest {
  to: EmailRecipient[]
  subject: string
  /** Agora opcional, pois podemos usar template_id */
  html?: string
  text?: string
  template_id?: string
  variables?: Record<string, any>
  from?: string
  userId?: string
  partnerId?: string
  attachments?: EmailAttachment[]
  headers?: Record<string, string>
}

/**
 * Result of sending an email
 */
export interface EmailSendResult {
  success: boolean
  messageId?: string
  error?: {
    code: string
    message: string
    retryable: boolean
  }
  timestamp: Date
  attempts: number
}

/**
 * Webhook event from Unosend
 */
export interface UnosendWebhookEvent {
  id: string
  type: "email.sent" | "email.delivered" | "email.bounced" | "email.opened" | "email.clicked"
  data: {
    id: string
    from: string
    to: string
    subject: string
    timestamp: string
    [key: string]: any
  }
}