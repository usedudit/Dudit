"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/reusable"
import { Input, Checkbox } from "@/components/reusable"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  installment_fees?: Array<{ installment_number: number; fee_percent: number }>
}

interface PaymentMethodDialogProps {
  open: boolean
  onClose: (shouldReload?: boolean) => void
  partnerId: string
  editingMethod: PaymentMethod | null
  onSuccess?: (newMethod?: any) => void
}

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
          installment_fees: buildInstallments(maxInstallments, full.installment_fees),
        })
      })
      .finally(() => setIsLoadingDetails(false))
  }, [editingMethod, open])

  const isPix = formData.payment_type === "pix"
  const isCreditCard = formData.payment_type === "credit_card"
  const showFeeFields = formData.payment_type === "pix" || formData.payment_type === "debit_card"

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
        installmentFees: isCreditCard && formData.supports_installments ? formData.installment_fees : [],
        pixKeyType: isPix ? formData.pix_key_type : null,
        pixKey: isPix ? formData.pix_key : null,
        usePartnerPixData: isPix ? formData.use_partner_pix_data : false,
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
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingMethod ? "Editar" : "Adicionar"} Método de Pagamento</DialogTitle>
        </DialogHeader>

        {isLoadingDetails ? (
          <div className="text-sm text-muted-foreground py-8">Carregando dados do método...</div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome / Descrição*</Label>
              <Input
                id="name"
                name="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Cartão Visa, PIX, etc"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="payment_type">Tipo de Pagamento*</Label>
              <Select
                value={formData.payment_type}
                onValueChange={(value) => setFormData({ ...formData, payment_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                  <SelectItem value="debit_card">Cartão de Débito</SelectItem>
                  <SelectItem value="other">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isPix && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="pix_key_type">Tipo da chave PIX</Label>
                  <Select
                    value={formData.pix_key_type}
                    onValueChange={(value: any) => setFormData({ ...formData, pix_key_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="random">Chave aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pix_key">Chave PIX</Label>
                  <Input
                    id="pix_key"
                    name="pix_key"
                    value={formData.pix_key}
                    onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                    disabled={formData.use_partner_pix_data}
                    placeholder="Informe a chave PIX"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use_partner_pix_data"
                    checked={formData.use_partner_pix_data}
                    onChange={(checked) => setFormData({ ...formData, use_partner_pix_data: checked as boolean })}
                  />
                  <Label htmlFor="use_partner_pix_data">Usar dados do parceiro automaticamente</Label>
                </div>
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  Atenção! O sistema não valida a chave PIX. Por favor, informe a chave correta.
                </div>
              </>
            )}

            {isCreditCard && (
              <>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="supports_installments"
                    checked={formData.supports_installments}
                    onChange={(checked) => setFormData({ ...formData, supports_installments: checked as boolean })}
                  />
                  <Label htmlFor="supports_installments">Aceita parcelamento</Label>
                </div>
                {formData.supports_installments && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="max_installments">Máximo de parcelas</Label>
                      <Input
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
                    </div>
                    <div className="space-y-2">
                      <Label>Taxa por parcela (%)</Label>
                      <div className="space-y-2">
                        {formData.installment_fees.map((row, index) => (
                          <div key={row.installment_number} className="grid grid-cols-2 gap-2">
                            <Input value={`${row.installment_number}x`} disabled />
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
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
                  </>
                )}
              </>
            )}

            {showFeeFields && (
              <div className="grid gap-2">
                <Label htmlFor="fee_percent">Taxa percentual (%)</Label>
                <Input
                  id="fee_percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.fee_percent}
                  onChange={(e) => setFormData({ ...formData, fee_percent: Number(e.target.value || 0) })}
                />
              </div>
            )}
            {showFeeFields && (
              <div className="grid gap-2">
                <Label htmlFor="fee_fixed">Taxa fixa</Label>
                <Input
                  id="fee_fixed"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.fee_fixed}
                  onChange={(e) => setFormData({ ...formData, fee_fixed: Number(e.target.value || 0) })}
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_active"
                name="is_active"
                checked={formData.is_active}
                onChange={(checked) => setFormData({ ...formData, is_active: checked as boolean })}
              />
              <Label htmlFor="is_active">Método ativo</Label>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Configurações de taxa</h3>
            <div className="grid gap-2">
              <Label htmlFor="fee_bearer">Quem paga a taxa?</Label>
              <Select
                value={formData.fee_bearer}
                onValueChange={(value: "merchant" | "customer") => setFormData({ ...formData, fee_bearer: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merchant">Empresa (absorve)</SelectItem>
                  <SelectItem value="customer">Cliente (acrescenta no valor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="discount_percent">Desconto (%)</Label>
              <Input
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
              <p className="text-xs text-muted-foreground">Desconto automático aplicado ao cliente para este método</p>
            </div>
          </div>

          {error && <p className="text-sm text-brand-red">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onClose()}
              className="flex-1 bg-transparent"
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
      </DialogContent>
    </Dialog>
  )
}
