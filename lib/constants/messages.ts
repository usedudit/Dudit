/**
 * Mensagens centralizadas para manter consistência
 * Fase 1: Consolidação e Limpeza
 */

export const AUTH_MESSAGES = {
  NOT_AUTHENTICATED: "Não autenticado",
  NO_PERMISSION: "Você não tem permissão para realizar esta ação",
  SESSION_EXPIRED: "Sua sessão expirou. Por favor, faça login novamente",
  INVALID_CREDENTIALS: "Credenciais inválidas",
} as const

export const PRODUCT_MESSAGES = {
  CREATED: "Produto criado com sucesso",
  UPDATED: "Produto atualizado com sucesso",
  DELETED: "Produto excluído com sucesso",
  NOT_FOUND: "Produto não encontrado",
  NO_PERMISSION_CREATE: "Você não tem permissão para criar produtos neste parceiro",
  NO_PERMISSION_UPDATE: "Você não tem permissão para atualizar este produto",
  NO_PERMISSION_DELETE: "Você não tem permissão para excluir este produto",
  BATCH_DELETED: (count: number) => `${count} produto(s) excluído(s) com sucesso`,
} as const

export const ORDER_MESSAGES = {
  CREATED: "Pedido criado com sucesso",
  UPDATED: "Pedido atualizado com sucesso",
  DELETED: "Pedido excluído com sucesso",
  NOT_FOUND: "Pedido não encontrado",
  NO_PERMISSION: "Você não tem permissão para acessar este pedido",
  STATUS_UPDATED: "Status do pedido atualizado com sucesso",
} as const

export const CUSTOMER_MESSAGES = {
  CREATED: "Cliente criado com sucesso",
  UPDATED: "Cliente atualizado com sucesso",
  DELETED: "Cliente excluído com sucesso",
  NOT_FOUND: "Cliente não encontrado",
  NO_PERMISSION: "Você não tem permissão para gerenciar este cliente",
  DUPLICATE_EMAIL: "Já existe um cliente com este e-mail",
  DUPLICATE_CPF: "Já existe um cliente com este CPF",
} as const

export const SUPPLIER_MESSAGES = {
  CREATED: "Fornecedor criado com sucesso",
  UPDATED: "Fornecedor atualizado com sucesso",
  DELETED: "Fornecedor excluído com sucesso",
  NOT_FOUND: "Fornecedor não encontrado",
  NO_PERMISSION: "Você não tem permissão para gerenciar este fornecedor",
  DUPLICATE_CNPJ: "Já existe um fornecedor com este CNPJ",
} as const

export const STORE_MESSAGES = {
  CREATED: "Loja criada com sucesso",
  UPDATED: "Loja atualizada com sucesso",
  DELETED: "Loja excluída com sucesso",
  NOT_FOUND: "Loja não encontrada",
  NO_PERMISSION: "Você não tem permissão para gerenciar esta loja",
} as const

export const GENERIC_MESSAGES = {
  INTERNAL_ERROR: "Erro interno do servidor",
  VALIDATION_ERROR: "Erro de validação",
  DATABASE_ERROR: "Erro ao acessar o banco de dados",
  NETWORK_ERROR: "Erro de conexão",
  UNKNOWN_ERROR: "Erro desconhecido",
} as const

export const SUBSCRIPTION_MESSAGES = {
  LIMIT_REACHED: (resource: string, limit: number) =>
    `Limite do plano atingido: máximo de ${limit} ${resource}`,
  FEATURE_NOT_AVAILABLE: (feature: string) =>
    `Recurso "${feature}" não disponível no seu plano atual`,
  UPGRADE_REQUIRED: "Faça upgrade do seu plano para acessar este recurso",
  ALREADY_SUBSCRIBED: "Você já possui uma assinatura ativa",
  SUBSCRIPTION_NOT_FOUND: "Assinatura não encontrada",
  SUBSCRIPTION_CANCELLED: "Assinatura cancelada com sucesso",
  PLAN_NOT_FOUND: "Plano não encontrado",
  DOWNGRADE_SCHEDULED: "Downgrade agendado para o próximo ciclo de faturamento",
  UPGRADE_SUCCESS: "Plano atualizado com sucesso",
} as const

