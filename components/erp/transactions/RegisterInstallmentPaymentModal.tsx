"use client"

import React, { useState, useEffect, useMemo } from "react"
import { DefaultModal, Button, Badge, FormDropdown, MoneyInput } from "@/components/reusable"
import { InstallmentIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { formatBrazilDateFromDbInput } from "@/lib/utils/formatters"
import { getFinanceAccountsAction } from "@/app/actions/erp/finance-accounts"
import { recordInstallmentPaymentAction } from "@/app/actions/erp/transactions"
import { useToast } from "@/components/ui/use-toast"
import { sanitizeUUID } from "@/lib/security/input-sanitizer"

export type RegisterInstallmentPaymentModalProps = {
    isOpen: boolean
    onClose: () => void
    partnerId: string
    installment: {
        id: string
        installmentGroupId?: string | null
        installmentNumber?: number
        totalInstallments?: number
        originalAmount?: number
        amount?: number
        remainingAmount?: number
        description?: string | null
        dueDate?: string | null
        paymentDate?: string | null
        paymentMethodId?: string | null
        paymentType?: string | null
        accountId?: string | null
        storeId?: string | null
        ledgerDirection?: "in" | "out"
    } | null
    financeAccounts?: any[]
    onSuccess?: () => void
}

export function RegisterInstallmentPaymentModal({
    isOpen,
    onClose,
    partnerId,
    installment,
    financeAccounts: externalFinanceAccounts,
    onSuccess,
}: RegisterInstallmentPaymentModalProps) {
    const { toast } = useToast()
    const [financeAccounts, setFinanceAccounts] = useState<any[]>([])
    const [loadingAccounts, setLoadingAccounts] = useState(false)

    const [paymentAmount, setPaymentAmount] = useState<string>("")
    const [interestAmount, setInterestAmount] = useState<string>("0")
    const [discountAmount, setDiscountAmount] = useState<string>("0")
    const [financeAccountId, setFinanceAccountId] = useState<string>("")
    const [paymentMethodName, setPaymentMethodName] = useState<string>("Cartão de Crédito")
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Carregar contas financeiras se não passadas por prop
    useEffect(() => {
        if (!isOpen || !partnerId) return
        if (externalFinanceAccounts && externalFinanceAccounts.length > 0) {
            setFinanceAccounts(externalFinanceAccounts)
            return
        }
        let cancelled = false
        setLoadingAccounts(true)
        getFinanceAccountsAction(partnerId, installment?.storeId)
            .then((res: any) => {
                if (cancelled) return
                const accounts = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : []
                setFinanceAccounts(accounts)
            })
            .catch((err) => {
                console.error("Erro ao carregar contas bancárias:", err)
            })
            .finally(() => {
                if (!cancelled) setLoadingAccounts(false)
            })
        return () => {
            cancelled = true
        }
    }, [isOpen, partnerId, installment?.storeId, externalFinanceAccounts])

    // Inicializar estado dos inputs ao abrir com uma parcela
    useEffect(() => {
        if (!isOpen || !installment) {
            setPaymentAmount("")
            setInterestAmount("0")
            setDiscountAmount("0")
            setFinanceAccountId("")
            return
        }

        const remaining = Number(installment.remainingAmount ?? installment.originalAmount ?? installment.amount ?? 0)
        setPaymentAmount(String(remaining > 0 ? remaining.toFixed(2) : "0"))
        setInterestAmount("0")
        setDiscountAmount("0")
        setPaymentMethodName(installment.paymentType || "Cartão de Crédito")

        // Pré-selecionar conta financeira
        if (installment.accountId) {
            setFinanceAccountId(installment.accountId)
        } else if (financeAccounts.length > 0) {
            const defaultAcc = financeAccounts.find((a: any) => a.is_default) || financeAccounts[0]
            if (defaultAcc) setFinanceAccountId(defaultAcc.id)
        }
    }, [isOpen, installment, financeAccounts])

    const currentRemaining = Number(installment?.remainingAmount ?? installment?.originalAmount ?? installment?.amount ?? 0)
    const paidNumber = Number(paymentAmount || 0)
    const interestNumber = Number(interestAmount || 0)
    const discountNumber = Number(discountAmount || 0)
    const nextRemaining = Math.max(0, currentRemaining - paidNumber)
    const totalLiquidFlow = Math.max(0, paidNumber + interestNumber - discountNumber)

    const handleSubmit = async () => {
        if (!installment || !partnerId) return
        if (paidNumber <= 0) {
            toast({
                title: "Valor inválido",
                description: "Informe um valor de pagamento maior que zero.",
                variant: "destructive",
            })
            return
        }
        if (!financeAccountId) {
            toast({
                title: "Conta bancária obrigatória",
                description: "Selecione uma conta bancária para registrar o recebimento.",
                variant: "destructive",
            })
            return
        }

        setIsSubmitting(true)
        try {
            const res = await recordInstallmentPaymentAction({
                partnerId,
                transactionId: installment.id,
                paymentAmount: paidNumber,
                interestAmount: interestNumber,
                discountAmount: discountNumber,
                paymentMethodId: installment.paymentMethodId || null,
                accountId: financeAccountId,
            })

            if (!res.success) {
                toast({
                    title: "Não foi possível concluir",
                    description: res.error || "Ocorreu um erro ao registrar a baixa da parcela.",
                    variant: "destructive",
                })
                return
            }

            toast({
                title: "Recebimento registrado",
                description: res.data.fullyPaid
                    ? `Parcela ${installment.installmentNumber || 1} quitada com sucesso.`
                    : "Recebimento parcial registrado com sucesso.",
            })

            onSuccess?.()
            onClose()
        } catch (err: any) {
            toast({
                title: "Erro inesperado",
                description: err.message || "Falha ao registrar o recebimento da parcela.",
                variant: "destructive",
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen || !installment) return null

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={() => {
                if (isSubmitting) return
                onClose()
            }}
            title="Registrar pagamento da parcela"
            maxWidth="3xl"
        >
            <div className="flex flex-col md:flex-row gap-6">
                {/* Coluna Esquerda: Resumo do Lançamento */}
                <div className="w-full md:w-[45%] flex flex-col justify-between">
                    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl p-5 flex flex-col relative h-full border border-brand-border dark:border-dark-border">
                        {/* Header da parcela */}
                        <div className="flex items-center justify-between pb-4 border-b border-dashed border-brand-border dark:border-dark-border mb-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                                    <InstallmentIcon className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[140px]" title={installment.description || "Parcela"}>
                                            {installment.description || "Parcela de Venda"}
                                        </span>
                                        <Badge variant="gray" icon={null}>
                                            Parcela {installment.installmentNumber || 1}
                                            {installment.totalInstallments ? ` de ${installment.totalInstallments}` : ""}
                                        </Badge>
                                    </div>
                                    {installment.dueDate && (
                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">
                                            Vence em {formatBrazilDateFromDbInput(String(installment.dueDate).slice(0, 10), "dayMonthYear")}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col items-end text-right justify-center shrink-0">
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Restante</span>
                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(currentRemaining)}
                                </span>
                            </div>
                        </div>

                        {/* Detalhes do resumo */}
                        <div className="space-y-4 flex-1">
                            <h4 className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Resumo do Lançamento</h4>

                            <div className="space-y-2.5 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Saldo Devedor Atual</span>
                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(currentRemaining)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">(-) Valor Abatido (Principal)</span>
                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                        - {formatCurrency(paidNumber)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-[11px] pl-2 border-l border-brand-border dark:border-dark-border">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Novo Saldo Restante</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(nextRemaining)}
                                    </span>
                                </div>

                                <div className="border-t border-dashed border-brand-border dark:border-dark-border my-2" />

                                <div className="flex justify-between items-center">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">(+) Juros Adicionais</span>
                                    <span className={interestNumber > 0 ? "font-semibold text-brand-red" : "font-medium text-brand-inactive-text dark:text-dark-body"}>
                                        + {formatCurrency(interestNumber)}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">(-) Desconto Aplicado</span>
                                    <span className={discountNumber > 0 ? "font-semibold text-brand-green" : "font-medium text-brand-inactive-text dark:text-dark-body"}>
                                        - {formatCurrency(discountNumber)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Total Líquido */}
                        <div className="mt-6 pt-4 border-t border-dashed border-brand-border dark:border-dark-border">
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="font-bold text-xs text-brand-dark dark:text-dark-heading block">
                                        Total a Receber
                                    </span>
                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        Fluxo de caixa líquido
                                    </span>
                                </div>
                                <span className="font-black text-lg text-brand-dark dark:text-dark-heading tracking-tight">
                                    {formatCurrency(totalLiquidFlow)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Coluna Direita: Formulário de Baixa */}
                <div className="w-full md:w-[55%] flex flex-col justify-between space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <MoneyInput
                                label="Valor do pagamento"
                                value={paidNumber}
                                onChange={(value) => setPaymentAmount(String(value))}
                                min={0}
                            />
                        </div>
                        <div>
                            <FormDropdown
                                label="Meio de pagamento"
                                value={paymentMethodName}
                                setValue={setPaymentMethodName}
                                options={[{ value: paymentMethodName, label: paymentMethodName }]}
                                placeholder="Meio de pagamento"
                                disabled={true}
                            />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <FormDropdown
                                label="Conta bancária *"
                                value={financeAccountId}
                                setValue={setFinanceAccountId}
                                options={financeAccounts.map((a: any) => ({ value: a.id, label: a.name }))}
                                placeholder={loadingAccounts ? "Carregando contas..." : "Selecione a conta bancária"}
                                disabled={loadingAccounts || financeAccounts.length === 0}
                                error={!financeAccountId}
                            />
                            <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                Selecione a conta bancária onde o dinheiro da parcela foi creditado.
                            </p>
                        </div>
                        <div>
                            <MoneyInput
                                label="Juros"
                                value={interestNumber}
                                onChange={(value) => setInterestAmount(String(value))}
                                min={0}
                            />
                        </div>
                        <div>
                            <MoneyInput
                                label="Desconto"
                                value={discountNumber}
                                onChange={(value) => setDiscountAmount(String(value))}
                                min={0}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-brand-border dark:border-dark-border">
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (isSubmitting) return
                                onClose()
                            }}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => void handleSubmit()}
                            disabled={isSubmitting || !financeAccountId || paidNumber <= 0}
                            isLoading={isSubmitting}
                        >
                            Confirmar recebimento
                        </Button>
                    </div>
                </div>
            </div>
        </DefaultModal>
    )
}
