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
  order_number: string
  customer_id: string | null
  customer_snapshot: any
  status: ServiceOrderStatus
  title: string
  description: string | null
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
  title: string
  description?: string
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
