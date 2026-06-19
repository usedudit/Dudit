/**
 * Usage examples for Unosend email integration
 * These examples show common patterns for sending emails
 *
 * @module unosend.examples
 */

import { sendEmailAction } from "@/app/actions/emails"
import { UnosendService } from "@/lib/services/unosend.service"
import type { InternalEmailRequest } from "@/lib/types/unosend.types"

// ============================================================================
// EXAMPLE 1: Send simple welcome email
// ============================================================================

export async function exampleWelcomeEmail(userEmail: string) {
  const result = await sendEmailAction({
    to: userEmail,
    subject: "Bem-vindo ao nosso serviço!",
    html: `
      <h1>Bem-vindo!</h1>
      <p>Obrigado por se cadastrar.</p>
      <a href="https://example.com/dashboard">Acessar Dashboard</a>
    `,
    text: `Bem-vindo!\n\nObrigado por se cadastrar.\nAcesse sua conta em https://example.com/dashboard`,
  })

  return result
}

// ============================================================================
// EXAMPLE 2: Send email to multiple recipients
// ============================================================================

export async function exampleMultipleRecipients() {
  const result = await sendEmailAction({
    to: [
      "user1@example.com",
      "user2@example.com",
      "user3@example.com",
    ],
    subject: "Atualização importante",
    html: "<h2>Temos novidades para você!</h2><p>Confira o novo recurso...</p>",
  })

  return result
}

// ============================================================================
// EXAMPLE 3: Send order confirmation with dynamic content
// ============================================================================

export async function exampleOrderConfirmation(
  userEmail: string,
  orderId: string,
  items: Array<{ name: string; price: number; quantity: number }>,
) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>R$ ${item.price.toFixed(2)}</td>
      <td>R$ ${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `,
    )
    .join("")

  const result = await sendEmailAction({
    to: userEmail,
    subject: `Pedido confirmado #${orderId}`,
    html: `
      <h2>Pedido Confirmado!</h2>
      <p>Seu pedido <strong>#${orderId}</strong> foi confirmado.</p>
      
      <table>
        <tr>
          <th>Produto</th>
          <th>Qtd</th>
          <th>Preço</th>
          <th>Subtotal</th>
        </tr>
        ${itemsHtml}
        <tr>
          <td colspan="3"><strong>Total</strong></td>
          <td><strong>R$ ${total.toFixed(2)}</strong></td>
        </tr>
      </table>
      
      <p>Rastreie seu pedido em: https://example.com/orders/${orderId}</p>
    `,
    text: `Pedido confirmado!\n\nSeu pedido #${orderId} foi confirmado.\nTotal: R$ ${total.toFixed(2)}\n\nRastreie em: https://example.com/orders/${orderId}`,
  })

  return result
}

// ============================================================================
// EXAMPLE 4: Send notification to partner about new order
// ============================================================================

export async function examplePartnerNotification(
  partnerEmail: string,
  partnerId: string,
  buyerName: string,
  productName: string,
) {
  const result = await sendEmailAction({
    to: partnerEmail,
    subject: `Novo pedido de ${buyerName}`,
    html: `
      <h3>Novo pedido recebido</h3>
      <p>Você recebeu um pedido de <strong>${buyerName}</strong></p>
      <p><strong>Produto:</strong> ${productName}</p>
      <p>Acesse sua loja para mais detalhes: https://example.com/erp/orders</p>
    `,
    text: `Novo pedido recebido!\n\nComprador: ${buyerName}\nProduto: ${productName}\n\nAcesse: https://example.com/erp/orders`,
    partnerId,
  })

  return result
}

// ============================================================================
// EXAMPLE 6: Send bulk emails with rate limit handling
// ============================================================================

export async function exampleBulkEmailWithRetry(
  recipients: Array<{ email: string; name: string }>,
  subject: string,
  html: string,
) {
  const results = []

  for (const recipient of recipients) {
    try {
      const result = await sendEmailAction({
        to: recipient.email,
        toName: recipient.name,
        subject,
        html,
      })

      results.push({
        email: recipient.email,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      })

      // Add small delay between sends to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      results.push({
        email: recipient.email,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return results
}

// ============================================================================
// EXAMPLE 7: Send email with error handling
// ============================================================================

export async function exampleEmailWithErrorHandling(userEmail: string) {
  try {
    const result = await sendEmailAction({
      to: userEmail,
      subject: "Test Email",
      html: "<p>Test</p>",
    })

    if (result.success) {
      console.log("✓ Email sent:", result.messageId)
      return { success: true }
    } else {
      console.error("✗ Failed to send:", result.error)
      // Handle error based on user preference or retry logic
      return { success: false, error: result.error }
    }
  } catch (error) {
    console.error("✗ Exception:", error instanceof Error ? error.message : error)
    return { success: false, error: "Unexpected error" }
  }
}

// ============================================================================
// EXAMPLE 8: Send email via API route (from frontend)
// ============================================================================

export async function exampleClientSideEmailRequest() {
  try {
    const response = await fetch("/api/emails/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: "user@example.com",
        subject: "Hello",
        html: "<h1>Hello</h1>",
        text: "Hello",
      }),
    })

    const data = await response.json()

    if (response.ok) {
      console.log("✓ Email sent:", data.messageId)
      return { success: true, messageId: data.messageId }
    } else {
      console.error("✗ Error:", data.error)
      return { success: false, error: data.error }
    }
  } catch (error) {
    console.error("✗ Network error:", error)
    return { success: false, error: "Network error" }
  }
}

// ============================================================================
// EXAMPLE 9: Send direct via UnosendService (for internal use)
// ============================================================================

export async function exampleDirectService() {
  const request: InternalEmailRequest = {
    to: [
      { email: "user1@example.com", name: "User 1" },
      { email: "user2@example.com", name: "User 2" },
    ],
    subject: "Test",
    html: "<h1>Test Email</h1>",
    text: "Test Email",
    userId: "user-123", // for logging
    partnerId: "partner-456", // optional
  }

  const result = await UnosendService.sendEmail(request)

  if (result.success) {
    console.log("✓ Email sent:", result.messageId, `(${result.attempts} attempt(s))`)
  } else {
    console.error("✗ Failed:", result.error?.message, `(${result.attempts} attempt(s))`)
  }

  return result
}

// ============================================================================
// EXAMPLE 10: Send templated email (using variables)
// ============================================================================

interface EmailTemplate {
  subject: string
  html: (vars: Record<string, any>) => string
  text: (vars: Record<string, any>) => string
}

const orderConfirmationTemplate: EmailTemplate = {
  subject: "Seu pedido foi confirmado",
  html: (vars) => `
    <h2>Obrigado pela compra, ${vars.customerName}!</h2>
    <p>Seu pedido <strong>#${vars.orderId}</strong> foi confirmado.</p>
    <p><strong>Total:</strong> R$ ${vars.total.toFixed(2)}</p>
    <p>Rastreie seu pedido: <a href="${vars.trackingUrl}">${vars.trackingUrl}</a></p>
  `,
  text: (vars) => `
Obrigado pela compra, ${vars.customerName}!

Seu pedido #${vars.orderId} foi confirmado.
Total: R$ ${vars.total.toFixed(2)}

Rastreie seu pedido: ${vars.trackingUrl}
  `,
}

export async function exampleTemplatedEmail() {
  const templateVars = {
    customerName: "João Silva",
    orderId: "ORD-12345",
    total: 299.99,
    trackingUrl: "https://example.com/orders/ORD-12345/tracking",
  }

  const result = await sendEmailAction({
    to: "joao@example.com",
    subject: orderConfirmationTemplate.subject,
    html: orderConfirmationTemplate.html(templateVars),
    text: orderConfirmationTemplate.text(templateVars),
  })

  return result
}
