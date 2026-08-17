export type DeliveryDriverAvailability = "available" | "occupied" | "offline"
export type DeliveryDriverVehicle = "moto" | "carro"
export type DeliveryAssignmentStatus =
  | "assigned"
  | "accepted"
  | "picked_up"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "cancelled"

export type DeliveryBucket = "all" | "pending" | "in_progress" | "completed"

export interface DeliveryAssignmentDTO {
  assignment_id: string
  order_id: string
  partner_id: string
  status: DeliveryAssignmentStatus
  assigned_at: string
  completed_at: string | null
  delivery_fee: number
  failure_reason: string | null
  order_number: string | null
  partner_name: string
  customer_name: string
  customer_phone: string | null
  delivery_address: string | null
  total_amount: number
  payment_method: string | null
  payment_status: string | null
  notes: string | null
  items: Array<{ name: string | null; quantity: number | null }>
}

export interface DeliveryAssignmentDetail extends DeliveryAssignmentDTO {
  accepted_at: string | null
  picked_up_at: string | null
  out_for_delivery_at: string | null
  failed_at: string | null
  payment_confirmed_at: string | null
}
