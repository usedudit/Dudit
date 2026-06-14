export interface Customer {
  id: string
  partner_id: string
  name: string
  email: string | null
  phone: string | null
  cpf_cnpj: string | null
  marketplace_user_id: string | null
  created_at: string
  [key: string]: any
}

export interface CustomerInput {
  partner_id: string
  name: string
  email?: string | null
  phone?: string | null
  cpf_cnpj?: string | null
}
