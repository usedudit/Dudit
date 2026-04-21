"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  Badge,
  Button,
  Checkbox,
  Input,
  MoneyInput,
  Pagination,
  ThreeDotsLoader,
} from "@/components/reusable"
import {
  createCouponAction,
  deleteCouponAction,
  listCouponsAction,
  toggleCouponStatusAction,
  updateCouponAction,
} from "@/app/actions/erp/coupons"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useMediaQuery } from "../hooks"

type CouponRow = any

const ITEMS_PER_PAGE = 8

const DEFAULT_FORM = {
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
}

export default function CouponsPage({
  partnerId,
  initialCoupons,
  initialTotal,
}: {
  partnerId: string
  initialCoupons: CouponRow[]
  initialTotal: number
}) {
  const { toast } = useToast()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [coupons, setCoupons] = useState<CouponRow[]>(initialCoupons || [])
  const [total] = useState(initialTotal || 0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [activeFilter, setActiveFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [openForm, setOpenForm] = useState(false)
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(DEFAULT_FORM)

  const filtered = useMemo(() => {
    return coupons.filter((coupon) => {
      const term = search.trim().toLowerCase()
      const searchOk = !term || String(coupon.code || "").toLowerCase().includes(term)
      const typeOk = typeFilter === "all" || coupon.discount_type === typeFilter
      const activeOk = activeFilter === "all" || (activeFilter === "active" ? coupon.is_active : !coupon.is_active)
      return searchOk && typeOk && activeOk
    })
  }, [coupons, search, typeFilter, activeFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const refresh = async () => {
    setLoading(true)
    const res = await listCouponsAction(partnerId, { page: 1, limit: 100 })
    if (res.success) setCoupons(res.data)
    setLoading(false)
  }

  const openCreate = () => {
    setEditingCouponId(null)
    setForm(DEFAULT_FORM)
    setOpenForm(true)
  }

  const openEdit = (coupon: any) => {
    setEditingCouponId(coupon.id)
    setForm({
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
      startsAt: coupon.starts_at ? String(coupon.starts_at).slice(0, 16) : "",
      endsAt: coupon.ends_at ? String(coupon.ends_at).slice(0, 16) : "",
      isActive: Boolean(coupon.is_active),
    })
    setOpenForm(true)
  }

  const saveCoupon = async () => {
    const payload = {
      partnerId,
      code: form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue: form.discountType === "free_shipping" ? null : Number(form.discountValue || 0),
      applyScope: form.applyScope,
      allowCombination: !!form.allowCombination,
      minCartValue: Number(form.minCartValue || 0),
      maxDiscountValue: form.maxDiscountEnabled ? Number(form.maxDiscountValue || 0) : null,
      usageLimit: form.usageLimitEnabled ? Number(form.usageLimit || 0) : null,
      usagePerCustomer: form.usagePerCustomerEnabled ? Number(form.usagePerCustomer || 0) : null,
      firstPurchaseOnly: !!form.firstPurchaseOnly,
      startsAt: form.unlimitedDate || !form.startsAt ? null : new Date(form.startsAt).toISOString(),
      endsAt: form.unlimitedDate || !form.endsAt ? null : new Date(form.endsAt).toISOString(),
      isActive: !!form.isActive,
      productIds: [],
      categoryIds: [],
      serviceIds: [],
    }

    if (!payload.code) {
      toast({ title: "Validação", description: "Informe o código do cupom.", variant: "destructive" })
      return
    }
    if (payload.discountType === "percentage" && Number(payload.discountValue || 0) > 100) {
      toast({ title: "Validação", description: "Percentual máximo é 100%.", variant: "destructive" })
      return
    }
    if (payload.discountType === "fixed" && Number(payload.discountValue || 0) <= 0) {
      toast({ title: "Validação", description: "Desconto fixo deve ser maior que zero.", variant: "destructive" })
      return
    }

    const res = editingCouponId
      ? await updateCouponAction(editingCouponId, payload)
      : await createCouponAction(payload)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }

    toast({ title: "Sucesso", description: editingCouponId ? "Cupom atualizado." : "Cupom criado." })
    setOpenForm(false)
    setEditingCouponId(null)
    await refresh()
  }

  return (
    <motion.div className="flex flex-col h-full bg-white dark:bg-dark-background p-4 md:p-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading leading-none">Cupons</h1>
          <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium mt-2">Gerencie descontos e promoções</p>
        </div>
        <Button onClick={openCreate}>Novo cupom</Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <Input label="" placeholder="Buscar por código" value={search} onChange={(e: any) => setSearch(e.target.value)} />
        <select className="h-11 rounded-xl border border-brand-border px-3" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
        <select className="h-11 rounded-xl border border-brand-border px-3" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Todos os tipos</option>
          <option value="percentage">Percentual</option>
          <option value="fixed">Fixo</option>
          <option value="free_shipping">Frete grátis</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-40 flex items-center justify-center"><ThreeDotsLoader /></div>
        ) : (
          <div className={isMobile ? "flex flex-col gap-3" : "grid grid-cols-2 xl:grid-cols-3 gap-4"}>
            {paginated.map((coupon) => {
              const usageLimit = coupon.usage_limit === null ? "Ilimitado" : `${Number(coupon.coupon_usages?.[0]?.count || 0)} / ${coupon.usage_limit}`
              const typeLabel = coupon.discount_type === "percentage" ? "Percentual" : coupon.discount_type === "fixed" ? "Fixo" : "Frete grátis"
              const valueLabel = coupon.discount_type === "percentage"
                ? `${Number(coupon.discount_value || 0)}%`
                : coupon.discount_type === "fixed"
                  ? formatCurrency(Number(coupon.discount_value || 0))
                  : "R$ 0,00 frete"

              return (
                <div key={coupon.id} className="rounded-2xl border border-brand-border p-4 bg-white dark:bg-dark-surface">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-brand-dark dark:text-dark-heading">{coupon.code}</div>
                      <div className="text-sm text-brand-inactive-text">{typeLabel} - {valueLabel}</div>
                    </div>
                    <Badge variant={coupon.is_active ? "green" : "gray"}>{coupon.is_active ? "Ativo" : "Inativo"}</Badge>
                  </div>
                  <div className="text-sm mt-3 text-brand-inactive-text">
                    Uso: {usageLimit}
                  </div>
                  <div className="text-sm text-brand-inactive-text">
                    Validade: {coupon.starts_at ? formatDate(coupon.starts_at) : "Sem início"} - {coupon.ends_at ? formatDate(coupon.ends_at) : "Sem fim"}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" className="h-9" onClick={() => openEdit(coupon)}>Editar</Button>
                    <Button variant="outline" className="h-9" onClick={async () => { await toggleCouponStatusAction(partnerId, coupon.id, !coupon.is_active); await refresh() }}>
                      {coupon.is_active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button variant="outline" className="h-9" onClick={async () => { await deleteCouponAction(partnerId, coupon.id); await refresh() }}>Excluir</Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      {openForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="w-full md:max-w-3xl max-h-[95vh] overflow-y-auto bg-white dark:bg-dark-surface rounded-t-2xl md:rounded-2xl p-4 md:p-6">
            <h2 className="font-bold text-xl mb-4">{editingCouponId ? "Editar cupom" : "Novo cupom"}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Código do cupom" value={form.code} onChange={(e: any) => setForm((p: any) => ({ ...p, code: e.target.value }))} />
              <div>
                <label className="text-sm font-medium">Tipo de desconto</label>
                <select className="h-11 mt-1 w-full rounded-xl border border-brand-border px-3" value={form.discountType} onChange={(e) => setForm((p: any) => ({ ...p, discountType: e.target.value }))}>
                  <option value="percentage">percentage</option>
                  <option value="fixed">fixed</option>
                  <option value="free_shipping">free_shipping</option>
                </select>
              </div>
              {form.discountType !== "free_shipping" && (
                <MoneyInput label="Valor do desconto" value={Number(form.discountValue || 0)} onChange={(v: number) => setForm((p: any) => ({ ...p, discountValue: v }))} />
              )}
              <div>
                <label className="text-sm font-medium">Aplicar a</label>
                <select className="h-11 mt-1 w-full rounded-xl border border-brand-border px-3" value={form.applyScope} onChange={(e) => setForm((p: any) => ({ ...p, applyScope: e.target.value }))}>
                  <option value="all">all</option>
                  <option value="categories">categories</option>
                  <option value="products">products</option>
                  <option value="services">services</option>
                </select>
              </div>
              <MoneyInput label="Valor mínimo do carrinho" value={Number(form.minCartValue || 0)} onChange={(v: number) => setForm((p: any) => ({ ...p, minCartValue: v }))} />
              <div className="flex items-center gap-3 mt-7">
                <Checkbox checked={form.allowCombination} onChange={(val) => setForm((p: any) => ({ ...p, allowCombination: Boolean(val) }))} />
                <span className="text-sm">Permitir combinação</span>
              </div>
              <div className="flex items-center gap-3 mt-7">
                <Checkbox checked={form.firstPurchaseOnly} onChange={(val) => setForm((p: any) => ({ ...p, firstPurchaseOnly: Boolean(val) }))} />
                <span className="text-sm">Primeira compra apenas</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
              <Button onClick={saveCoupon}>Salvar</Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
