// Re-export Product type from lib/types for consistency
export type { Product } from "@/lib/types/product"

export interface VariantOption {
  name: string
  value: string
}

export interface FinalVariant {
  name: string
  options: VariantOption[]
  price: number
  stock: number
  sku: string
}

export interface Supplier {
  id: string
  partner_id?: string
  name: string
  email: string | null
  phone: string | null
  address?: string | null
  notes?: string | null
  cpf?: string | null
  cnpj?: string | null
  nomeFantasia?: string | null
  razaoSocial?: string | null
  personType?: string | null
  contribuinte?: string | null
  inscricaoEstadual?: string | null
  ieIsento?: boolean | null
  inscricaoMunicipal?: string | null
  crt?: string | null
  country?: string | null
  zipCode?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  municipioCodigoIbge?: string | null
  createdAt?: string
  updatedAt?: string
}
