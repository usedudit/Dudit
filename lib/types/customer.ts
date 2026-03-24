export interface Customer {
  id: string
  partner_id: string
  name: string
  email: string | null
  phone: string | null
  cpf_cnpj: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  created_at: string
}

export interface CustomerInput {
  partner_id: string
  name: string
  email?: string | null
  phone?: string | null
  cpf_cnpj?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
}
