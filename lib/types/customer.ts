export interface Customer {
  id: string
  partner_id: string
  name: string
  email: string | null
  phone: string | null
  cpf_cnpj: string | null
  created_at: string
  // Outros campos de identificação (cpf, cnpj, nome_fantasia, etc) são tratados dinamicamente no código
  [key: string]: any
}

export interface CustomerInput {
  partner_id: string
  name: string
  email?: string | null
  phone?: string | null
  cpf_cnpj?: string | null
}
