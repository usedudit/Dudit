// Tipos do módulo de Ordem de Serviço

export type ServiceOrderStatus =
  | "aberta"
  | "aguardando_aprovacao"
  | "aprovada"
  | "em_andamento"
  | "aguardando_peca"
  | "concluida"
  | "entregue"
  | "cancelada"

export interface ServiceOrder {
  id: string
  partner_id: string
  store_id: string | null
  order_number: string
  customer_id: string | null
  customer_snapshot: any
  status: ServiceOrderStatus
  title: string
  description: string | null
  diagnosis: string | null
  internal_notes: string | null
  expected_completion_date: string | null
  completed_at: string | null
  created_by: string | null
  assigned_user_id: string | null
  public_token: string
  signature_image_key: string | null
  signed_at: string | null
  total_service_amount: number
  total_product_amount: number
  total_amount: number
  transaction_id: string | null
  sale_id: string | null
  created_at: string
  updated_at: string
}

export interface ServiceOrderServiceItem {
  id: string
  service_order_id: string
  service_id: string | null
  service_name: string
  service_price: number
  quantity: number
  total_price: number
  assigned_user_id: string | null
  sort_order: number
  created_at: string
}

export interface ServiceOrderProductItem {
  id: string
  service_order_id: string
  product_id: string | null
  variant_id: string | null
  product_name: string
  unit_price: number
  quantity: number
  total_price: number
  sort_order: number
  created_at: string
}

export interface ServiceOrderAttachment {
  id: string
  service_order_id: string
  file_key: string
  file_name: string | null
  file_type: string | null
  file_size: number | null
  uploaded_by: string | null
  category: "normal" | "antes" | "depois"
  created_at: string
}

export type ServiceOrderListCursor = { createdAt: string; id: string } | null

export interface ServiceOrderInput {
  store_id?: string
  title: string
  description?: string
  diagnosis?: string
  internal_notes?: string
  customer_id?: string
  expected_completion_date?: string
  assigned_user_id?: string
  status?: ServiceOrderStatus
  services?: { service_id: string; quantity?: number }[]
  products?: { product_id: string; quantity?: number; variant_id?: string }[]
}

export const SERVICE_ORDER_STATUS_META: Record<ServiceOrderStatus, { label: string; variant: "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray" }> = {
  aberta:             { label: "Aberta",             variant: "blue" },
  aguardando_aprovacao: { label: "Aguardando Aprov.", variant: "orange" },
  aprovada:           { label: "Aprovada",           variant: "cyan" },
  em_andamento:       { label: "Em Andamento",       variant: "blue" },
  aguardando_peca:    { label: "Aguardando Peça",    variant: "orange" },
  concluida:          { label: "Concluída",          variant: "green" },
  entregue:           { label: "Entregue",           variant: "green" },
  cancelada:          { label: "Cancelada",          variant: "red" },
}

export const PAYMENT_STATUS_META: Record<string, { label: string; variant: "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray" }> = {
  paid:             { label: "Pago",             variant: "green" },
  partially_paid:   { label: "Parcialmente Pago", variant: "orange" },
  unpaid:           { label: "Não Pago",         variant: "gray" },
}

// Ordem canônica do fluxo operacional (usada para detectar retrocessos).
export const SERVICE_ORDER_STATUS_ORDER: ServiceOrderStatus[] = [
  "aberta",
  "aguardando_aprovacao",
  "aprovada",
  "em_andamento",
  "aguardando_peca",
  "concluida",
  "entregue",
]

// Transições permitidas por status. Estados terminais não possuem saída.
export const SERVICE_ORDER_ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  aberta:               ["aguardando_aprovacao", "aprovada", "em_andamento", "aguardando_peca", "concluida", "cancelada"],
  aguardando_aprovacao: ["aprovada", "cancelada"],
  aprovada:             ["em_andamento", "aguardando_peca", "concluida", "cancelada", "aguardando_aprovacao"],
  em_andamento:         ["aguardando_peca", "concluida", "cancelada"],
  aguardando_peca:      ["em_andamento", "concluida", "cancelada"],
  concluida:            ["entregue", "em_andamento", "cancelada"],
  entregue:             [],
  cancelada:            [],
}

export function isServiceOrderStatus(value: unknown): value is ServiceOrderStatus {
  return typeof value === "string" && value in SERVICE_ORDER_STATUS_META
}

export function isValidServiceOrderTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): boolean {
  if (from === to) return false
  const allowed = SERVICE_ORDER_ALLOWED_TRANSITIONS[from]
  return Array.isArray(allowed) && allowed.includes(to)
}

export function getServiceOrderNextStatuses(from: ServiceOrderStatus): ServiceOrderStatus[] {
  return SERVICE_ORDER_ALLOWED_TRANSITIONS[from] || []
}

// Política de edição por status: define o que pode ser alterado em cada etapa.
// - aberta / aguardando_aprovacao: tudo editável (incluindo cliente e loja).
// - aprovada: itens (mão de obra e produtos), diagnóstico, especificações,
//   valores/descontos, responsável, previsão, prioridade, status, observações e anexos.
//   (A alteração de itens/diagnóstico/valores retrocede a OS para aguardando_aprovacao).
// - em_andamento / aguardando_peca: idem (sem retroceder status, registrando histórico).
// - concluida / entregue / cancelada: somente leitura (exceto anexos e observações).
export interface ServiceOrderEditPolicy {
  readOnly: boolean
  canEditAll: boolean
  canChangeStatus: boolean
  canEditAssignment: boolean
  canEditItems: boolean
  canEditSpecs: boolean
  canEditNotes: boolean
  canEditDiagnosis: boolean
  canEditFinancial: boolean
  canAttach: boolean
}

export function getServiceOrderEditPolicy(status: ServiceOrderStatus): ServiceOrderEditPolicy {
  switch (status) {
    case "aberta":
    case "aguardando_aprovacao":
      return {
        readOnly: false,
        canEditAll: true,
        canChangeStatus: true,
        canEditAssignment: true,
        canEditItems: true,
        canEditSpecs: true,
        canEditNotes: true,
        canEditDiagnosis: true,
        canEditFinancial: true,
        canAttach: true,
      }
    case "aprovada":
      return {
        readOnly: false,
        canEditAll: false,
        canChangeStatus: true,
        canEditAssignment: true,
        canEditItems: true,
        canEditSpecs: true,
        canEditNotes: true,
        canEditDiagnosis: true,
        canEditFinancial: true,
        canAttach: true,
      }
    case "em_andamento":
    case "aguardando_peca":
      return {
        readOnly: false,
        canEditAll: false,
        canChangeStatus: true,
        canEditAssignment: true,
        canEditItems: true,
        canEditSpecs: true,
        canEditNotes: true,
        canEditDiagnosis: true,
        canEditFinancial: true,
        canAttach: true,
      }
    case "concluida":
    case "entregue":
    case "cancelada":
    default:
      return {
        readOnly: true,
        canEditAll: false,
        canChangeStatus: false,
        canEditAssignment: false,
        canEditItems: false,
        canEditSpecs: false,
        canEditNotes: true,
        canEditDiagnosis: false,
        canEditFinancial: false,
        canAttach: true,
      }
  }
}

// Retrocesso = target aparece antes do status atual na ordem canônica.
export function isServiceOrderBackwardTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): boolean {
  const fromIdx = SERVICE_ORDER_STATUS_ORDER.indexOf(from)
  const toIdx = SERVICE_ORDER_STATUS_ORDER.indexOf(to)
  if (fromIdx === -1 || toIdx === -1) return false
  return toIdx < fromIdx
}
