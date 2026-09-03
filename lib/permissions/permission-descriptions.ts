import type { PermissionTemplate, RoleId } from "./rbac-types"

/**
 * Mapeamento em português de todos os módulos/recursos do sistema.
 */
export const RESOURCE_NAMES: Record<keyof PermissionTemplate | string, string> = {
  pdv: "PDV (Ponto de Venda)",
  orders: "Pedidos",
  quotes: "Orçamentos",
  products: "Produtos",
  stock_movements: "Estoque",
  customers: "Clientes",
  suppliers: "Fornecedores",
  financial: "Financeiro",
  services: "Serviços",
  service_orders: "Ordens de Serviço",
  appointments: "Agendamentos",
  categories: "Categorias",
  coupons: "Cupons",
  goals: "Metas",
  reports: "Relatórios",
  dashboard: "Painel Principal",
  delivery: "Entregas",
  stores: "Lojas",
  recurring_plans: "Planos de Assinatura",
  recurring_subscriptions: "Assinaturas Recorrentes",
  productivity: "Produtividade",
  community_videos: "Vídeos da Comunidade",
  colecoes: "Coleções",
  payment_methods: "Métodos de Pagamento",
  commissions: "Comissões",
  settings: "Configurações",
}

/**
 * Nomes legíveis dos cargos no sistema.
 */
export const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  operator: "Operador",
  delivery: "Entregador",
}

/**
 * Frases diretas e amigáveis para cada combinação de recurso e ação.
 * Mantidas simples, diretas e sem termos técnicos para o usuário final.
 */
const SPECIFIC_PERMISSION_MESSAGES: Record<string, string> = {
  // PDV
  "pdv.can_apply_discount": "Você não possui permissão para aplicar desconto no PDV.",
  "pdv.can_add_delivery": "Você não possui permissão para adicionar taxa de entrega no PDV.",
  "pdv.sell": "Você não possui permissão para realizar vendas no PDV.",
  "pdv.open_pdv": "Você não possui permissão para abrir o caixa do PDV.",
  "pdv.close_pdv": "Você não possui permissão para fechar o caixa do PDV.",
  "pdv.sangria": "Você não possui permissão para realizar sangria de caixa.",
  "pdv.reforco": "Você não possui permissão para realizar reforço de caixa.",
  "pdv.view": "Você não possui permissão para acessar o PDV.",

  // Pedidos
  "orders.can_apply_discount": "Você não possui permissão para aplicar desconto em pedidos.",
  "orders.can_add_delivery": "Você não possui permissão para adicionar taxa de entrega em pedidos.",
  "orders.can_refund": "Você não possui permissão para realizar estornos ou reembolsos.",
  "orders.cancel": "Você não possui permissão para cancelar pedidos.",
  "orders.delete": "Você não possui permissão para excluir pedidos.",
  "orders.create": "Você não possui permissão para criar pedidos.",
  "orders.edit": "Você não possui permissão para editar pedidos.",
  "orders.view": "Você não possui permissão para visualizar pedidos.",
  "orders.list": "Você não possui permissão para listar pedidos.",

  // Orçamentos
  "quotes.can_apply_discount": "Você não possui permissão para aplicar desconto em orçamentos.",
  "quotes.create": "Você não possui permissão para criar orçamentos.",
  "quotes.edit": "Você não possui permissão para editar orçamentos.",
  "quotes.delete": "Você não possui permissão para excluir orçamentos.",
  "quotes.view": "Você não possui permissão para visualizar orçamentos.",

  // Financeiro
  "financial.create": "Você não possui permissão para criar lançamentos financeiros.",
  "financial.edit": "Você não possui permissão para editar lançamentos financeiros.",
  "financial.cancel": "Você não possui permissão para cancelar transações financeiras.",
  "financial.can_settle": "Você não possui permissão para liquidar ou baixar contas a pagar/receber.",
  "financial.view": "Você não possui permissão para acessar o módulo financeiro.",

  // Produtos & Estoque
  "products.create": "Você não possui permissão para cadastrar novos produtos.",
  "products.edit": "Você não possui permissão para editar produtos.",
  "products.delete": "Você não possui permissão para excluir produtos.",
  "products.view": "Você não possui permissão para visualizar produtos.",
  "products.view_cost_price": "Você não possui permissão para visualizar o preço de custo dos produtos.",
  "stock_movements.create": "Você não possui permissão para realizar movimentações de estoque.",
  "stock_movements.undo": "Você não possui permissão para estornar movimentações de estoque.",
  "stock_movements.view": "Você não possui permissão para visualizar o histórico de estoque.",

  // Clientes & Fornecedores
  "customers.create": "Você não possui permissão para cadastrar clientes.",
  "customers.edit": "Você não possui permissão para editar dados de clientes.",
  "customers.delete": "Você não possui permissão para excluir clientes.",
  "customers.view": "Você não possui permissão para visualizar clientes.",
  "customers.export": "Você não possui permissão para exportar a base de clientes.",
  "customers.view_fiscal_data": "Você não possui permissão para visualizar dados fiscais de clientes.",
  "customers.view_personal_data": "Você não possui permissão para visualizar dados pessoais de clientes.",
  "suppliers.create": "Você não possui permissão para cadastrar fornecedores.",
  "suppliers.edit": "Você não possui permissão para editar fornecedores.",
  "suppliers.delete": "Você não possui permissão para excluir fornecedores.",
  "suppliers.view": "Você não possui permissão para visualizar fornecedores.",

  // Serviços e Ordens de Serviço
  "services.create": "Você não possui permissão para cadastrar serviços.",
  "services.edit": "Você não possui permissão para editar serviços.",
  "services.delete": "Você não possui permissão para excluir serviços.",
  "services.view": "Você não possui permissão para visualizar serviços.",
  "service_orders.create": "Você não possui permissão para criar ordens de serviço.",
  "service_orders.edit": "Você não possui permissão para editar ordens de serviço.",
  "service_orders.delete": "Você não possui permissão para excluir ordens de serviço.",
  "service_orders.view": "Você não possui permissão para visualizar ordens de serviço.",
  "service_orders.can_assign_technician": "Você não possui permissão para atribuir técnicos em ordens de serviço.",
  "service_orders.can_change_status": "Você não possui permissão para alterar o status de ordens de serviço.",
  "service_orders.can_generate_invoice": "Você não possui permissão para faturar ou emitir nota fiscal para ordens de serviço.",

  // Agendamentos
  "appointments.create": "Você não possui permissão para criar agendamentos.",
  "appointments.edit": "Você não possui permissão para editar agendamentos.",
  "appointments.delete": "Você não possui permissão para cancelar ou excluir agendamentos.",
  "appointments.view": "Você não possui permissão para visualizar agendamentos.",

  // Cupons & Metas
  "coupons.create": "Você não possui permissão para criar cupons de desconto.",
  "coupons.edit": "Você não possui permissão para editar cupons de desconto.",
  "coupons.delete": "Você não possui permissão para excluir cupons de desconto.",
  "coupons.view": "Você não possui permissão para visualizar cupons de desconto.",
  "goals.create": "Você não possui permissão para criar metas.",
  "goals.edit": "Você não possui permissão para editar metas.",
  "goals.delete": "Você não possui permissão para excluir metas.",
  "goals.view": "Você não possui permissão para visualizar metas.",

  // Relatórios
  "reports.view_basic": "Você não possui permissão para visualizar relatórios.",
  "reports.view_advanced": "Você não possui permissão para visualizar relatórios avançados.",
  "reports.export_dre": "Você não possui permissão para exportar relatórios contábeis / DRE.",

  // Entregas & Lojas
  "delivery.create": "Você não possui permissão para despachar entregas.",
  "delivery.edit": "Você não possui permissão para editar dados de entrega.",
  "delivery.update_status": "Você não possui permissão para atualizar o status de entregas.",
  "delivery.view": "Você não possui permissão para acessar o painel de entregas.",
  "stores.create": "Você não possui permissão para criar novas lojas.",
  "stores.edit": "Você não possui permissão para alterar dados da loja.",
  "stores.delete": "Você não possui permissão para excluir lojas.",
  "stores.manage_members": "Você não possui permissão para gerenciar membros da loja.",
  "stores.view": "Você não possui permissão para visualizar dados da loja.",

  // Configurações
  "settings.view": "Você não possui permissão para acessar as configurações.",
  "settings.settings_negocio": "Você não possui permissão para alterar os dados da empresa.",
  "settings.settings_team": "Você não possui permissão para gerenciar membros da equipe.",
  "settings.settings_plan": "Você não possui permissão para alterar planos ou assinaturas.",
  "settings.settings_payments": "Você não possui permissão para alterar configurações de pagamento.",
  "settings.settings_comissions": "Você não possui permissão para alterar configurações de comissão.",
  "settings.settings_returns": "Você não possui permissão para alterar configurações de devoluções.",
  "settings.settings_vitrine": "Você não possui permissão para alterar configurações da vitrine.",
  "settings.settings_os": "Você não possui permissão para alterar configurações de ordens de serviço.",
  "settings.settings_messages": "Você não possui permissão para alterar mensagens automáticas.",
  "settings.settings_delivery": "Você não possui permissão para alterar configurações de entrega.",
  "settings.settings_integrations": "Você não possui permissão para gerenciar integrações.",
  "settings.settings_system": "Você não possui permissão para alterar configurações do sistema.",
  "settings.settings_resources": "Você não possui permissão para gerenciar recursos do sistema.",
  "settings.settings_logs": "Você não possui permissão para visualizar os logs do sistema.",
}

/**
 * Retorna uma mensagem de erro simples, amigável e direta em português para a UI.
 */
export function getPermissionErrorMessage(resource: string, action: string): string {
  const key = `${resource}.${action}`
  if (SPECIFIC_PERMISSION_MESSAGES[key]) {
    return SPECIFIC_PERMISSION_MESSAGES[key]
  }

  const resourceLabel = RESOURCE_NAMES[resource] || resource
  switch (action) {
    case "view":
    case "read":
    case "list":
      return `Você não possui permissão para acessar ${resourceLabel}.`
    case "create":
      return `Você não possui permissão para criar novos registros em ${resourceLabel}.`
    case "edit":
    case "update":
      return `Você não possui permissão para editar ${resourceLabel}.`
    case "delete":
      return `Você não possui permissão para excluir registros em ${resourceLabel}.`
    case "cancel":
      return `Você não possui permissão para cancelar itens em ${resourceLabel}.`
    case "can_apply_discount":
      return `Você não possui permissão para aplicar desconto em ${resourceLabel}.`
    default:
      return `Você não possui permissão para realizar esta ação em ${resourceLabel}.`
  }
}

/**
 * Retorna o nome formatado do cargo para logs internos do servidor.
 */
export function getRoleLabel(roleId?: string | RoleId | null): string {
  if (!roleId) return "Desconhecido"
  const normalized = String(roleId).toLowerCase()
  return ROLE_LABELS[normalized] || roleId
}
