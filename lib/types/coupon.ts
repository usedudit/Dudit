"use client"

import { formatCurrency, formatDate } from "@/lib/utils"

export type CouponDiscountType = "percentage" | "fixed" | "free_shipping"
export type CouponApplyScope = "all" | "categories" | "products" | "services"
export type CouponCustomerScope = "all" | "specific"

export interface CouponUsageCounter {
  count?: number | null
}

export interface CouponRow {
  id: string
  code: string
  discount_type: CouponDiscountType
  discount_value: number | null
  apply_scope: CouponApplyScope
  allow_combination: boolean | null
  min_cart_value: number | null
  max_discount_value: number | null
  usage_limit: number | null
  usage_per_customer: number | null
  first_purchase_only: boolean | null
  starts_at: string | null
  ends_at: string | null
  is_active: boolean | null
  customer_scope: CouponCustomerScope | null
  is_automatic: boolean | null
  created_at?: string | null
  coupon_usages?: CouponUsageCounter[] | null
}

export type ScopeItem = {
  id: string
  name: string
  category?: string | null
  categoryId?: string | null
  price?: number | null
  sku?: string | null
  image?: string | null
  isActive?: boolean
}

export type ScopeCustomer = {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  avatarUrl?: string | null
  status?: "ativo" | "inativo" | "bloqueado" | null
}

export type ScopeCategory = {
  id: string
  name: string
  isActive: boolean
}

export type CouponFormState = {
  code: string
  discountType: CouponDiscountType
  discountValue: number
  applyScope: CouponApplyScope
  allowCombination: boolean
  minCartValue: number
  maxDiscountEnabled: boolean
  maxDiscountValue: number
  usageLimitEnabled: boolean
  usageLimit: number
  usagePerCustomerEnabled: boolean
  usagePerCustomer: number
  firstPurchaseOnly: boolean
  unlimitedDate: boolean
  startsAt: string
  endsAt: string
  isActive: boolean
  customerScope: CouponCustomerScope
  isAutomatic: boolean
}

export type CouponScopeData = {
  products: ScopeItem[]
  services: ScopeItem[]
  categories: ScopeCategory[]
  customers: ScopeCustomer[]
}

export type CouponRelations = {
  productIds: string[]
  serviceIds: string[]
  categoryIds: string[]
  customerIds: string[]
  products: ScopeItem[]
  services: ScopeItem[]
  categories: ScopeCategory[]
  customers: ScopeCustomer[]
}

export const DEFAULT_COUPON_FORM: CouponFormState = {
  code: "",
  discountType: "percentage",
  discountValue: 0,
  applyScope: "all",
  allowCombination: true,
  minCartValue: 0,
  maxDiscountEnabled: false,
  maxDiscountValue: 0,
  usageLimitEnabled: false,
  usageLimit: 0,
  usagePerCustomerEnabled: false,
  usagePerCustomer: 0,
  firstPurchaseOnly: false,
  unlimitedDate: true,
  startsAt: "",
  endsAt: "",
  isActive: true,
  customerScope: "all",
  isAutomatic: false,
}

export const EMPTY_SCOPE_DATA: CouponScopeData = {
  products: [],
  services: [],
  categories: [],
  customers: [],
}

export const EMPTY_COUPON_RELATIONS: CouponRelations = {
  productIds: [],
  serviceIds: [],
  categoryIds: [],
  customerIds: [],
  products: [],
  services: [],
  categories: [],
  customers: [],
}

export function mapCouponToForm(coupon: CouponRow): CouponFormState {
  return {
    code: coupon.code || "",
    discountType: coupon.discount_type || "percentage",
    discountValue: Number(coupon.discount_value || 0),
    applyScope: coupon.apply_scope || "all",
    allowCombination: Boolean(coupon.allow_combination),
    minCartValue: Number(coupon.min_cart_value || 0),
    maxDiscountEnabled: coupon.max_discount_value !== null,
    maxDiscountValue: Number(coupon.max_discount_value || 0),
    usageLimitEnabled: coupon.usage_limit !== null,
    usageLimit: Number(coupon.usage_limit || 0),
    usagePerCustomerEnabled: coupon.usage_per_customer !== null,
    usagePerCustomer: Number(coupon.usage_per_customer || 0),
    firstPurchaseOnly: Boolean(coupon.first_purchase_only),
    unlimitedDate: !coupon.starts_at && !coupon.ends_at,
    startsAt: toDateTimeInputValue(coupon.starts_at),
    endsAt: toDateTimeInputValue(coupon.ends_at),
    isActive: Boolean(coupon.is_active),
    customerScope: coupon.customer_scope || "all",
    isAutomatic: Boolean(coupon.is_automatic),
  }
}

export function toDateTimeInputValue(value: string | null | undefined) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function getCouponTypeLabel(type: CouponDiscountType) {
  if (type === "percentage") return "Percentual"
  if (type === "fixed") return "Valor fixo"
  return "Frete gratis"
}

export function getCouponValueLabel(coupon: Pick<CouponRow, "discount_type" | "discount_value">) {
  if (coupon.discount_type === "percentage") return `${Number(coupon.discount_value || 0)}%`
  if (coupon.discount_type === "fixed") return formatCurrency(Number(coupon.discount_value || 0))
  return "Frete gratis"
}

export function getCouponStatusLabel(coupon: Pick<CouponRow, "is_active">) {
  return coupon.is_active ? "Ativo" : "Inativo"
}

export function getCouponStatusVariant(coupon: Pick<CouponRow, "is_active">) {
  return coupon.is_active ? "green" : "gray"
}

export function getCouponApplyScopeLabel(scope: CouponApplyScope) {
  if (scope === "categories") return "Categorias especificas"
  if (scope === "products") return "Produtos especificos"
  if (scope === "services") return "Servicos especificos"
  return "Todos os itens"
}

export function getCouponCustomerScopeLabel(scope: CouponCustomerScope | null | undefined) {
  return scope === "specific" ? "Clientes especificos" : "Todos os clientes"
}

export function getCouponUsageCount(coupon: CouponRow) {
  return Number(coupon.coupon_usages?.[0]?.count || 0)
}

export function getCouponUsageSummary(coupon: CouponRow) {
  const used = getCouponUsageCount(coupon)
  if (coupon.usage_limit === null) return `${used} uso(s) • ilimitado`
  return `${used} / ${coupon.usage_limit} uso(s)`
}

export function getCouponValiditySummary(coupon: CouponRow) {
  if (!coupon.starts_at && !coupon.ends_at) return "Sem limite de data"
  const start = coupon.starts_at ? formatDate(coupon.starts_at) : "Sem inicio"
  const end = coupon.ends_at ? formatDate(coupon.ends_at) : "Sem fim"
  return `${start} - ${end}`
}

export function getCouponPrimaryMeta(coupon: CouponRow) {
  return `${getCouponTypeLabel(coupon.discount_type)} • ${getCouponValueLabel(coupon)}`
}
