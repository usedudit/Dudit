export interface Customer {
  id: string
  partner_id: string
  name: string
  email: string | null
  phone: string | null
  cpf_cnpj: string | null
  marketplace_user_id: string | null
  razao_social: string | null
  crt: string | null
  is_active?: boolean
  status?: "ativo" | "inativo" | "arquivado" | "excluido" | "active" | "inactive" | "archived" | "deleted"
  deleted_at?: string | null
  deleted_by?: string | null
  deleted_reason?: string | null
  created_at: string
  [key: string]: any
}

export interface CustomerInput {
  partner_id: string
  name: string
  email?: string | null
  phone?: string | null
  cpf_cnpj?: string | null
  razao_social?: string | null
  crt?: string | null
  is_active?: boolean
  status?: string
}
