// ============================================================================
// CONSTANTES DE TAGS (Para evitar strings mágicas)
// NÃO tem "use server" - é um arquivo de constantes puro
// ============================================================================

export const TAGS = {
  products: (partnerId?: string) => partnerId ? `partner-${partnerId}-products` : 'products',
  product: (productId: string) => `product-${productId}`,
  storeProducts: (partnerId: string, storeId: string) => `partner-${partnerId}-store-${storeId}-products`,
  orders: (partnerId?: string) => partnerId ? `partner-${partnerId}-orders` : 'orders',
  storeOrders: (partnerId: string, storeId: string) => `partner-${partnerId}-store-${storeId}-orders`,
  coupons: (partnerId?: string) => partnerId ? `partner-${partnerId}-coupons` : "coupons",
  orderHistory: (orderId: string) => `order-${orderId}-history`,
  transactionHistory: (transactionId: string) => `transaction-${transactionId}-history`,
  customers: (partnerId?: string) => partnerId ? `partner-${partnerId}-customers` : 'customers',
  storeCustomers: (partnerId: string, storeId: string) => `partner-${partnerId}-store-${storeId}-customers`,
  suppliers: (partnerId?: string) => partnerId ? `partner-${partnerId}-suppliers` : 'suppliers',
  services: (partnerId?: string) => partnerId ? `partner-${partnerId}-services` : 'services',
  appointments: (partnerId?: string) => partnerId ? `partner-${partnerId}-appointments` : 'appointments',
  storeAppointments: (partnerId: string, storeId: string) => `partner-${partnerId}-store-${storeId}-appointments`,
  serviceOrders: (partnerId?: string) => partnerId ? `partner-${partnerId}-service-orders` : 'service-orders',
  cashSessions: (partnerId?: string) => partnerId ? `partner-${partnerId}-cash-sessions` : 'cash-sessions',
  financialCategories: (partnerId?: string) => partnerId ? `partner-${partnerId}-financial-categories` : 'financial-categories',
  financeAccounts: (partnerId?: string) => partnerId ? `partner-${partnerId}-finance-accounts` : 'finance-accounts',
  recurringTransactions: (partnerId?: string) => partnerId ? `partner-${partnerId}-recurring-transactions` : 'recurring-transactions',
  storeSuppliers: (partnerId: string, storeId: string) => `partner-${partnerId}-store-${storeId}-suppliers`,
  quotes: (partnerId?: string) => partnerId ? `partner-${partnerId}-quotes` : 'quotes',
  storeQuotes: (partnerId: string, storeId: string) => `partner-${partnerId}-store-${storeId}-quotes`,
  quoteHistory: (quoteId: string) => `quote-${quoteId}-history`,
  entityTimeline: (entityType: string, entityId: string) => `timeline-${entityType}-${entityId}`,
  stockMovements: (partnerId?: string) => partnerId ? `partner-${partnerId}-stock-movements` : 'stock-movements',
  storeStockMovements: (partnerId: string, storeId: string) => `partner-${partnerId}-store-${storeId}-stock-movements`,
  transactions: (partnerId?: string) => partnerId ? `partner-${partnerId}-transactions` : 'transactions',
  storeTransactions: (partnerId: string, storeId: string) => `partner-${partnerId}-store-${storeId}-transactions`,
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
  teamMembers: (partnerId: string) => `partner-${partnerId}-team-members`,

  // Platform advertising
  advertisements: "advertisements",

  // Collections
  colecoes: 'colecoes',
  colecao: (id: string) => `colecao-${id}`,

  // Community Videos
  communityVideos: 'community-videos',
  communityVideo: (id: string) => `community-video-${id}`,

  // Reports
  report: (partnerId: string, category: string) => `report-${category}:${partnerId}`,
  reportGeneral: (partnerId: string) => `report-visao-geral:${partnerId}`,
  reportSales: (partnerId: string) => `report-vendas:${partnerId}`,
  reportProducts: (partnerId: string) => `report-produtos:${partnerId}`,
  reportServices: (partnerId: string) => `report-servicos:${partnerId}`,
  reportDeliveries: (partnerId: string) => `report-entregas:${partnerId}`,
  reportServiceOrders: (partnerId: string) => `report-os:${partnerId}`,
  reportFinancial: (partnerId: string) => `report-financeiro:${partnerId}`,
  reportCustomers: (partnerId: string) => `report-clientes:${partnerId}`,
  reportMarketing: (partnerId: string) => `report-marketing:${partnerId}`,
  reportProductivity: (partnerId: string) => `report-produtividade:${partnerId}`,
  reportReturns: (partnerId: string) => `report-trocas:${partnerId}`,
}
