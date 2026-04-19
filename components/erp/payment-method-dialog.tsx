"use client"

import type React from "react"
import { useState, useEffect } from "react"
import {
  DefaultModal,
  Button,
  Input,
  Checkbox,
  FormDropdown,
} from "@/components/reusable"
import {
  createPaymentMethodAction,
  getPaymentMethodDetailsAction,
  updatePaymentMethodAction,
} from "@/app/actions/payment-methods"

interface PaymentMethod {
  id: string
  name: string
  type?: string
  payment_type?: string
  is_active: boolean
  fee_percent?: number | null
  fee_fixed?: number | null
  fee_bearer?: "merchant" | "customer"
  supports_installments?: boolean
  max_installments?: number
  receiving_days?: number
  discount_percent?: number | null
  pix_key_type?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
  pix_key?: string | null
  use_partner_pix_data?: boolean
  card_brand?: string | null
  installment_fees?: Array<{ installment_number: number; fee_percent: number }>
}

interface PaymentMethodDialogProps {
  open: boolean
  onClose: (shouldReload?: boolean) => void
  partnerId: string
  editingMethod: PaymentMethod | null
  onSuccess?: (newMethod?: any) => void
}

const AVAILABLE_BRANDS = [
  { id: "visa", label: "Visa" },
  { id: "mastercard", label: "Mastercard" },
  { id: "elo", label: "Elo" },
  { id: "american_express", label: "American Express" },
  { id: "diners", label: "Diners Club" },
  { id: "hipercard", label: "Hipercard" },
  { id: "aura", label: "Aura" },
  { id: "cabal", label: "Cabal" },
  { id: "sorocred", label: "Sorocred" },
  { id: "outros", label: "Outros" },
]

export function PaymentMethodDialog({ open, onClose, partnerId, editingMethod }: PaymentMethodDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    payment_type: "cash",
    is_active: true,
    max_installments: 1,
    supports_installments: false,
    fee_percent: 0,
    fee_fixed: 0,
    fee_bearer: "merchant" as "merchant" | "customer",
    receiving_days: 0,
    discount_percent: 0,
    pix_key_type: "email" as "cpf" | "cnpj" | "email" | "phone" | "random",
    pix_key: "",
    use_partner_pix_data: false,
    card_brand: "" as string,
    installment_fees: [{ installment_number: 1, fee_percent: 0 }] as Array<{ installment_number: number; fee_percent: number }>,
  })

  const buildInstallments = (maxInstallments: number, existing?: Array<{ installment_number: number; fee_percent: number }>) => {
    const map = new Map<number, number>((existing || []).map((row) => [row.installment_number, row.fee_percent]))
    return Array.from({ length: maxInstallments }).map((_, idx) => ({
      installment_number: idx + 1,
      fee_percent: map.get(idx + 1) ?? 0,
    }))
  }

  useEffect(() => {
    if (!open) return
    if (!editingMethod) {
      setFormData({
        name: "",
        payment_type: "cash",
        is_active: true,
        max_installments: 1,
        supports_installments: false,
        fee_percent: 0,
        fee_fixed: 0,
        fee_bearer: "merchant",
        receiving_days: 0,
        discount_percent: 0,
        pix_key_type: "email",
        pix_key: "",
        use_partner_pix_data: false,
        card_brand: "",
        installment_fees: [{ installment_number: 1, fee_percent: 0 }],
      })
      setError(null)
      return
    }

    setIsLoadingDetails(true)
    getPaymentMethodDetailsAction(editingMethod.id)
      .then((res: any) => {
        const full = res?.method || editingMethod
        const resolvedType = full.type || full.payment_type || "cash"
        const maxInstallments = Number(full.max_installments || 1)
        setFormData({
          name: full.name || "",
          payment_type: resolvedType,
          is_active: full.is_active ?? true,
          max_installments: maxInstallments,
          supports_installments: Boolean(full.supports_installments || maxInstallments > 1),
          fee_percent: Number(full.fee_percent || 0),
          fee_fixed: Number(full.fee_fixed || 0),
          fee_bearer: full.fee_bearer || "merchant",
          receiving_days: Number(full.receiving_days || 0),
          discount_percent: Number(full.discount_percent || 0),
          pix_key_type: full.pix_key_type || "email",
          pix_key: full.pix_key || "",
          use_partner_pix_data: Boolean(full.use_partner_pix_data),
          card_brand: full.card_brand || "",
          installment_fees: buildInstallments(maxInstallments, full.installment_fees),
        })
      })
      .finally(() => setIsLoadingDetails(false))
  }, [editingMethod, open])

  const isPix = formData.payment_type === "pix"
  const isCreditCard = formData.payment_type === "credit_card"
  const isDebitCard = formData.payment_type === "debit_card"
  const isCard = isCreditCard || isDebitCard
  const showFeeFields = isPix || isDebitCard

  useEffect(() => {
    if (!isCreditCard) {
      setFormData((prev) => ({
        ...prev,
        supports_installments: false,
        max_installments: 1,
        installment_fees: [{ installment_number: 1, fee_percent: 0 }],
      }))
      return
    }
    setFormData((prev) => ({
      ...prev,
      installment_fees: buildInstallments(prev.max_installments || 1, prev.installment_fees),
    }))
  }, [isCreditCard, formData.max_installments])

  const handleBrandToggle = (brandId: string) => {
    const brands = formData.card_brand ? formData.card_brand.split(";").map(b => b.trim()).filter(Boolean) : []
    const index = brands.indexOf(brandId)
    if (index > -1) {
      brands.splice(index, 1)
    } else {
      brands.push(brandId)
    }
    setFormData({ ...formData, card_brand: brands.join("; ") })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!formData.name.trim()) {
      setError("Nome é obrigatório")
      setIsLoading(false)
      return
    }

    if (formData.max_installments > 24) {
      setError("O máximo de parcelas permitido é 24")
      setIsLoading(false)
      return
    }

    try {
      const payload = {
        name: formData.name,
        isActive: formData.is_active,
        paymentType: formData.payment_type,
        feePercent: showFeeFields || isCreditCard ? formData.fee_percent : 0,
        feeFixed: showFeeFields || isCreditCard ? formData.fee_fixed : 0,
        receivingDays: formData.receiving_days,
        discountPercent: formData.discount_percent,
        feeBearer: formData.fee_bearer,
        supportsInstallments: isCreditCard ? formData.supports_installments : false,
        maxInstallments: isCreditCard && formData.supports_installments ? formData.max_installments : 1,
        installmentFees: isCreditCard && formData.supports_installments
          ? formData.installment_fees.map((row) => ({ installmentNumber: row.installment_number, feePercent: row.fee_percent }))
          : [],
        pixKeyType: isPix ? formData.pix_key_type : null,
        pixKey: isPix ? formData.pix_key : null,
        usePartnerPixData: isPix ? formData.use_partner_pix_data : false,
        cardBrand: isCard ? formData.card_brand : null,
      }

      if (editingMethod) {
        const result = await updatePaymentMethodAction(editingMethod.id, payload)

        if (result.error) {
          setError(result.error)
        } else {
          onClose(true)
        }
      } else {
        const result = await createPaymentMethodAction({
          partnerId,
          ...payload,
        })

        if (result.error) {
          setError(result.error)
        } else {
          onClose(true)
        }
      }
    } catch (err) {
      setError("Erro ao salvar método de pagamento")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <DefaultModal
      isOpen={open}
      onClose={() => onClose(false)}
      title={`${editingMethod ? "Editar" : "Adicionar"} Método de Pagamento`}
      maxWidth="2xl"
    >
      {isLoadingDetails ? (
        <div className="text-sm text-brand-inactive-text py-8 text-center">Carregando dados do método...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <Input
              label="Nome / Descrição*"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Cartão Visa, PIX, etc"
            />

            <FormDropdown
              label="Tipo de Pagamento*"
              value={formData.payment_type}
              setValue={(value) => setFormData({ ...formData, payment_type: value })}
              options={[
                { value: "cash", label: "Dinheiro" },
                { value: "pix", label: "PIX" },
                { value: "credit_card", label: "Cartão de Crédito" },
                { value: "debit_card", label: "Cartão de Débito" },
                { value: "other", label: "Outros" },
              ]}
            />

            {isPix && (
              <div className="space-y-4 bg-brand-gray/30 dark:bg-dark-border/10 p-4 rounded-xl">
                <FormDropdown
                  label="Tipo da chave PIX"
                  value={formData.pix_key_type}
                  setValue={(value: any) => setFormData({ ...formData, pix_key_type: value })}
                  options={[
                    { value: "cpf", label: "CPF" },
                    { value: "cnpj", label: "CNPJ" },
                    { value: "email", label: "Email" },
                    { value: "phone", label: "Telefone" },
                    { value: "random", label: "Chave aleatória" },
                  ]}
                />
                <Input
                  label="Chave PIX"
                  id="pix_key"
                  name="pix_key"
                  value={formData.pix_key}
                  onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                  disabled={formData.use_partner_pix_data}
                  placeholder="Informe a chave PIX"
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="use_partner_pix_data"
                    checked={formData.use_partner_pix_data}
                    onChange={(checked) => setFormData({ ...formData, use_partner_pix_data: checked as boolean })}
                  />
                  <label htmlFor="use_partner_pix_data" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer">
                    Usar dados do parceiro automaticamente
                  </label>
                </div>
                <div className="rounded-lg border border-brand-red/30 bg-brand-red/5 p-3 text-xs text-brand-red">
                  Atenção! O sistema não valida a chave PIX. Por favor, informe a chave correta.
                </div>
              </div>
            )}

            {isCard && (
              <div className="space-y-4 bg-brand-gray/30 dark:bg-dark-border/10 p-4 rounded-xl">
                <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading">Bandeiras Aceitas</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {AVAILABLE_BRANDS.map((brand) => {
                    const isChecked = formData.card_brand.split(";").map(b => b.trim()).includes(brand.id)
                    return (
                      <div key={brand.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`brand-${brand.id}`}
                          checked={isChecked}
                          onChange={() => handleBrandToggle(brand.id)}
                        />
                        <label htmlFor={`brand-${brand.id}`} className="text-sm text-brand-dark dark:text-dark-heading cursor-pointer">
                          {brand.label}
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {isCreditCard && (
              <div className="space-y-4 bg-brand-gray/30 dark:bg-dark-border/10 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="supports_installments"
                    checked={formData.supports_installments}
                    onChange={(checked) => setFormData({ ...formData, supports_installments: checked as boolean })}
                  />
                  <label htmlFor="supports_installments" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer">
                    Aceita parcelamento
                  </label>
                </div>
                {formData.supports_installments && (
                  <div className="space-y-4 pt-2">
                    <Input
                      label="Máximo de parcelas"
                      id="max_installments"
                      type="number"
                      min="1"
                      max="24"
                      value={formData.max_installments}
                      onChange={(e) => {
                        const nextMax = Math.max(1, Math.min(24, Number(e.target.value || 1)))
                        setFormData((prev) => ({
                          ...prev,
                          max_installments: nextMax,
                          installment_fees: buildInstallments(nextMax, prev.installment_fees),
                        }))
                      }}
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">Taxa por parcela (%)</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-2 no-scrollbar">
                        {formData.installment_fees.map((row, index) => (
                          <div key={row.installment_number} className="flex items-center gap-2">
                            <span className="text-xs font-bold w-8">{row.installment_number}x</span>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              className="h-9"
                              value={row.fee_percent}
                              onChange={(e) => {
                                const next = [...formData.installment_fees]
                                next[index] = { ...row, fee_percent: Number(e.target.value || 0) }
                                setFormData({ ...formData, installment_fees: next })
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(showFeeFields || isCreditCard) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Taxa percentual (%)"
                  id="fee_percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.fee_percent}
                  onChange={(e) => setFormData({ ...formData, fee_percent: Number(e.target.value || 0) })}
                />
                <Input
                  label="Taxa fixa (R$)"
                  id="fee_fixed"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.fee_fixed}
                  onChange={(e) => setFormData({ ...formData, fee_fixed: Number(e.target.value || 0) })}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="is_active"
                name="is_active"
                checked={formData.is_active}
                onChange={(checked) => setFormData({ ...formData, is_active: checked as boolean })}
              />
              <label htmlFor="is_active" className="text-sm font-medium text-brand-dark dark:text-dark-heading cursor-pointer">
                Método ativo
              </label>
            </div>
          </div>

          <div className="space-y-4 border-t border-brand-border dark:border-dark-border pt-4">
            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">Configurações de taxa</h3>
            <FormDropdown
              label="Quem paga a taxa?"
              value={formData.fee_bearer}
              setValue={(value: any) => setFormData({ ...formData, fee_bearer: value })}
              options={[
                { value: "merchant", label: "Empresa (absorve)" },
                { value: "customer", label: "Cliente (acrescenta no valor)" },
              ]}
            />
            <Input
              label="Desconto (%)"
              id="discount_percent"
              name="discount_percent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formData.discount_percent}
              onChange={(e) => setFormData({ ...formData, discount_percent: Number.parseFloat(e.target.value) || 0 })}
              placeholder="0,00"
            />
            <p className="text-[10px] text-brand-inactive-text dark:text-dark-body -mt-3">Desconto automático aplicado ao cliente para este método</p>
          </div>

          {error && <p className="text-sm text-brand-red font-bold">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onClose()}
              className="flex-1"
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? "Salvando..." : editingMethod ? "Atualizar" : "Adicionar"}
            </Button>
          </div>
        </form>
      )}
    </DefaultModal>
  )
}
