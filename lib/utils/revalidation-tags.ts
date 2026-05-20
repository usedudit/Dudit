// ============================================================================
// CONSTANTES DE TAGS (Para evitar strings mágicas)
// NÃO tem "use server" - é um arquivo de constantes puro
// ============================================================================

export const TAGS = {
  products: (partnerId?: string) => partnerId ? `partner-${partnerId}-products` : 'products',
  product: (productId: string) => `product-${productId}`,
  orders: (partnerId?: string) => partnerId ? `partner-${partnerId}-orders` : 'orders',
  coupons: (partnerId?: string) => partnerId ? `partner-${partnerId}-coupons` : "coupons",
  orderHistory: (orderId: string) => `order-${orderId}-history`,
  transactionHistory: (transactionId: string) => `transaction-${transactionId}-history`,
  customers: (partnerId?: string) => partnerId ? `partner-${partnerId}-customers` : 'customers',
  suppliers: (partnerId?: string) => partnerId ? `partner-${partnerId}-suppliers` : 'suppliers',
  quotes: (partnerId?: string) => partnerId ? `partner-${partnerId}-quotes` : 'quotes',
  quoteHistory: (quoteId: string) => `quote-${quoteId}-history`,
  entityTimeline: (entityType: string, entityId: string) => `timeline-${entityType}-${entityId}`,
  stockMovements: (partnerId?: string) => partnerId ? `partner-${partnerId}-stock-movements` : 'stock-movements',
  transactions: (partnerId?: string) => partnerId ? `partner-${partnerId}-transactions` : 'transactions',
  marketplace: 'marketplace',
  categories: 'marketplace-categories',

  // Cart
  cart: (userId?: string) => userId ? `cart-${userId}` : 'cart',

  // Addresses
  addresses: (entityType: string, entityId: string) => `addresses-${entityType}-${entityId}`,

  // Partner profile / status
  partnerProfile: (partnerId: string) => `partner-profile-${partnerId}`,
  partner: (partnerId: string) => `partner-${partnerId}`,
  partnerStatus: 'partner-status',

  // Auth / Permissions
  userAccess: (userId: string) => `user-access-${userId}`,

  // Team / Invitations
  partnerInvitations: (partnerId: string) => `partner-${partnerId}-invitations`,
}
