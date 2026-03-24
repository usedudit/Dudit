export interface Order {
  id: string
  partner_id: string
  customer_id: string | null
  order_number: string
  status: string
  total_amount: number
  created_at: string
  updated_at: string
}

export interface OrderInput {
  partner_id: string
  customer_id?: string | null
  order_number: string
  status: string
  total_amount: number
  items: OrderItemInput[]
}

export interface OrderWithDetails extends Order {
  items?: OrderItem[]
  customer?: Customer | null
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  price: number
  total: number
}

export interface OrderItemInput {
  product_id: string
  quantity: number
  price: number
}

interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
}
