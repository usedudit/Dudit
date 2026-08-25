/**
 * IDs of templates created in the SMTP2GO dashboard.
 *
 * Template IDs are not secrets, so they live in backend source configuration
 * instead of environment variables. Add new templates here by purpose.
 */
export const SMTP2GO_TEMPLATE_IDS = {
  // Set this after copying the ID from the SMTP2GO template API snippet.
  deliveryDriverInvitation: "6330851",
  accountDeletionCode: "7653185",
} as const
