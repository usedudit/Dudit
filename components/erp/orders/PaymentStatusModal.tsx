import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    DefaultModal,
    Button,
    InfoCard,
    IconPlaceholder,
} from '@/components/reusable';
import { CheckCircleIcon } from '@/lib/icons';
import { useToast } from "@/components/ui/use-toast";
import { updateOrdersStatusInBatchAction } from '@/app/actions/erp/orders';
import {
    FINANCIAL_FREEZE_INFO_MESSAGE,
    getOrderDepositSummary,
    getOrderPaidAmount,
    getOrderRemainingBalance,
    getOrderTotalAmount,
    isOrderFinanciallyFrozen,
    resolveSituationFromPaid,
} from '@/lib/payments/order-financial-state';
import { PaymentSummary } from '@/components/erp/payments/shared/PaymentSummary';
import { DepositReceiptsSection } from '@/components/erp/payments/shared/DepositReceiptsSection';
import { BalancePaymentCollector } from '@/components/erp/payments/BalancePaymentCollector';
import { formatCurrency } from '@/lib/utils';
import type { PaymentBreakdownLeg } from '@/components/erp/payments/shared/payment-utils';

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
    pending: "Sinal pendente",
    partially_paid: "Sinal pago — saldo pendente",
    paid: "Quitado",
    not_required: "Sem sinal",
};

interface PaymentStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: any;
    partnerId: string;
    onSuccess?: () => void;
}

function normalizeBreakdown(order: any): PaymentBreakdownLeg[] {
    if (Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0) {
        const paidAmount = Number(order.paid_amount ?? 0);
        return order.payment_breakdown.map((leg: any) => {
            const legReceived = Number(leg.amountReceived ?? 0);
            if (legReceived > paidAmount + 0.01) {
                return { ...leg, amountReceived: 0 };
            }
            return leg;
        });
    }
    return [{
        method: order.payment_method || "Dinheiro",
        amount: Number(order.total_amount || 0),
        effectiveAmount: Number(order.total_amount || 0),
        amountReceived: Number(order.paid_amount || order.paidAmount || 0),
        paymentMethodId: order.payment_method_id || null,
        installmentNumber: 1,
    }];
}

export default function PaymentStatusModal({
    isOpen,
    onClose,
    order,
    partnerId,
    onSuccess
}: PaymentStatusModalProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [pendingLegs, setPendingLegs] = useState<PaymentBreakdownLeg[]>([]);
    const [canSubmitBalance, setCanSubmitBalance] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setPendingLegs([]);
            setCanSubmitBalance(false);
        }
    }, [isOpen, order?.id]);

    const breakdown = order ? normalizeBreakdown(order) : [];
    const depositSummary = order ? getOrderDepositSummary(order) : null;
    const totalOrder = order ? getOrderTotalAmount(order) : 0;
    const totalPaid = order ? getOrderPaidAmount(order) : 0;
    const totalRemaining = order ? getOrderRemainingBalance(order) : 0;
    const frozen = order ? isOrderFinanciallyFrozen(order) : false;
    const displayId = order
        ? order.order_number || `#${String(order.id || order.originalId || "").substring(0, 8)}`
        : "";

    const cashEntry = Array.isArray(breakdown)
        ? breakdown.find((entry: any) => {
            const m = String(entry?.method || "").toLowerCase().trim();
            return m === "cash" || m === "dinheiro";
        })
        : null;
    const wantsChange = (cashEntry as any)?.wantsChange ?? String(order?.payment_method || "").toLowerCase().includes("troco para");
    const payWithAmount = (cashEntry as any)?.payWithAmount ?? (() => {
        const match = String(order?.payment_method || "").match(/troco para R\$\s*([\d,.]+)/i)
        if (match) {
            const cleanNum = match[1].replace(/\./g, "").replace(',', '.')
            return Number(cleanNum)
        }
        return null
    })();
    const cashChangeAmount = wantsChange && payWithAmount ? payWithAmount - Number(order?.total_amount || 0) : 0;

    const lockedMethod = useMemo(() => {
        const paidLeg = breakdown.find((leg) => {
            const m = leg.method;
            if (!m) return false;
            const norm = m.toLowerCase();
            return !norm.includes('não definido') && !norm.includes('metodo nao definido') && !norm.includes('pendente') && !norm.includes('não informado') && !norm.includes('nao informado');
        });
        if (paidLeg?.method) return paidLeg.method;

        const mainMethod = order?.payment_method;
        if (mainMethod) {
            const norm = mainMethod.toLowerCase();
            if (!norm.includes('não definido') && !norm.includes('metodo nao definido') && !norm.includes('pendente') && !norm.includes('não informado') && !norm.includes('nao informado')) {
                return mainMethod;
            }
        }
        return null;
    }, [order, breakdown]);

    const lockedInstallments = useMemo(() => {
        const matchingLeg = breakdown.find((leg) => {
            const legMethod = leg.method;
            if (!legMethod) return false;
            const norm = legMethod.toLowerCase();
            return !norm.includes('não definido') && !norm.includes('metodo nao definido') && !norm.includes('pendente') && !norm.includes('não informado') && !norm.includes('nao informado');
        });
        return matchingLeg?.installmentNumber || 1;
    }, [breakdown]);

    const pendingNewAmount = useMemo(
        () => pendingLegs.reduce((sum, leg) => sum + Number(leg.amountReceived ?? leg.amount ?? 0), 0),
        [pendingLegs],
    );

    const onLegsReady = useCallback((legs: PaymentBreakdownLeg[]) => {
        setPendingLegs(legs);
    }, []);

    if (!order) return null;

    const handleSyncMpPayment = async () => {
        const targetOrderId = order.id || order.originalId;
        if (!targetOrderId) return;
        setSyncing(true);
        try {
            const res = await fetch("/api/orders/sync-payment-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: targetOrderId })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.newStatus === "paid" || data.newStatus === "partially_paid" || data.paymentStatus === "approved") {
                    toast({ title: "Pagamento confirmado", description: "Status atualizado com sucesso." });
                    onSuccess?.();
                    onClose();
                } else {
                    toast({ title: "Aguardando", description: "O pagamento ainda consta como pendente." });
                }
            } else {
                toast({ title: "Erro ao sincronizar", description: "Não foi possível verificar o pagamento.", variant: "destructive" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Erro", description: "Ocorreu um erro ao sincronizar.", variant: "destructive" });
        } finally {
            setSyncing(false);
        }
    };

    const isFullyPaid = order?.situation === "paid" || totalRemaining <= 0.009;

    const handleSubmit = async () => {
        const targetOrderId = order.id || order.originalId;
        if (isFullyPaid) {
            toast({ title: "Aviso", description: "Este pedido já está pago.", variant: "warning" });
            return;
        }
        if (pendingNewAmount <= 0.009) {
            toast({ title: "Aviso", description: "Informe o valor recebido.", variant: "warning" });
            return;
        }

        if (pendingNewAmount > totalRemaining + 0.01) {
            toast({ title: "Aviso", description: "Valor informado excede o saldo restante.", variant: "warning" });
            return;
        }

        setLoading(true);
        try {
            const updatedBreakdown = breakdown.map((leg) => ({ ...leg }));
            for (const pendingLeg of pendingLegs) {
                let legRemaining = Number(pendingLeg.amountReceived ?? pendingLeg.amount ?? 0);
                
                // 1. Try to distribute to matching methods
                for (const leg of updatedBreakdown) {
                    if (leg.method === pendingLeg.method || (leg.paymentMethodId && leg.paymentMethodId === pendingLeg.paymentMethodId)) {
                        const legCapacity = Math.max(0, Number(leg.amount || 0) - Number(leg.amountReceived || 0));
                        if (legCapacity > 0.009 && legRemaining > 0.009) {
                            const toAdd = Math.min(legCapacity, legRemaining);
                            leg.amountReceived = Number((Number(leg.amountReceived || 0) + toAdd).toFixed(2));
                            legRemaining -= toAdd;
                        }
                    }
                }
                
                // 2. Try to distribute to undefined method legs
                if (legRemaining > 0.009) {
                    for (const leg of updatedBreakdown) {
                        const normalizedMethod = String(leg.method || "").toLowerCase();
                        if (normalizedMethod === 'método não definido' || normalizedMethod === 'metodo nao definido' || !leg.method) {
                            leg.method = pendingLeg.method;
                            leg.paymentMethodId = pendingLeg.paymentMethodId;
                            leg.installmentNumber = pendingLeg.installmentNumber;
                            const legCapacity = Math.max(0, Number(leg.amount || 0) - Number(leg.amountReceived || 0));
                            const toAdd = Math.min(legCapacity, legRemaining);
                            leg.amountReceived = Number((Number(leg.amountReceived || 0) + toAdd).toFixed(2));
                            legRemaining -= toAdd;
                        }
                    }
                }
                
                // 3. Fallback: append as a new leg
                if (legRemaining > 0.009) {
                    updatedBreakdown.push({
                        ...pendingLeg,
                        amount: legRemaining,
                        effectiveAmount: legRemaining,
                        amountReceived: Number(legRemaining.toFixed(2)),
                        adjustmentType: 'none',
                        adjustmentPercent: 0,
                        adjustmentAmount: 0,
                    });
                }
            }

            const nextPaidAmount = totalPaid + pendingNewAmount;
            const nextSituation = resolveSituationFromPaid(nextPaidAmount, totalOrder);

            const res = await updateOrdersStatusInBatchAction({
                orderIds: [targetOrderId],
                partnerId,
                actionType: "payment_status",
                statusValue: nextSituation,
                paidAmount: nextPaidAmount,
                paymentBreakdown: updatedBreakdown,
            });

            if (res.success) {
                toast({ title: "Sucesso", description: "Recebimento registrado com sucesso." });
                onSuccess?.();
                onClose();
            } else {
                toast({ title: "Erro", description: res.error || "Falha ao registrar recebimento.", variant: "destructive" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Erro", description: "Ocorreu um erro ao salvar o pagamento.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Alterar status de pagamento"
            maxWidth="4xl"
            footer={
                <div className="flex justify-end gap-3 w-full">
                    {!isFullyPaid && totalRemaining > 0.009 && (
                        <>
                            <Button variant="outline" onClick={onClose} disabled={loading || syncing}>
                                Cancelar
                            </Button><Button
                                onClick={handleSubmit}
                                disabled={loading || syncing || !canSubmitBalance}
                                isLoading={loading}
                            >
                                Salvar recebimento
                            </Button></>
                    )}
                </div>
            }
        >
            <div className="flex flex-col gap-4 mb-4">
                {frozen && (
                    <InfoCard color="orange" message={FINANCIAL_FREEZE_INFO_MESSAGE} />
                )}
                {depositSummary?.usesDeposit && (
                    <InfoCard
                        color="blue"
                        message={`Sinal (${depositSummary.depositPercent}%): ${formatCurrency(depositSummary.depositAmount)} · Cobrança inicial: ${formatCurrency(depositSummary.initialChargeAmount)} · ${DEPOSIT_STATUS_LABELS[depositSummary.depositStatus] || depositSummary.depositStatus} · Restante: ${formatCurrency(depositSummary.remainingBalance)}${depositSummary.paymentProvider ? ` · via ${depositSummary.paymentProvider}` : ""}`}
                    />
                )}
                {wantsChange && payWithAmount !== null && (
                    <InfoCard
                        color="blue"
                        message={`O cliente pagará em dinheiro e precisa de troco para ${formatCurrency(payWithAmount)}. Levar ${formatCurrency(cashChangeAmount)} de troco.`}
                    />
                )}
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-[40%] flex flex-col">
                    <PaymentSummary
                        orderLabel={displayId}
                        customerName={order.customer_name}
                        totalAmount={totalOrder}
                        paidAmount={totalPaid}
                        remainingAmount={totalRemaining}
                    />
                </div>

                <div className="w-full md:w-[60%] flex flex-col gap-6">
                    <DepositReceiptsSection
                        legs={breakdown}
                        onSyncMp={order.mp_payment_id || order.payment_provider === "Mercado Pago" ? handleSyncMpPayment : undefined}
                        syncing={syncing}
                    />

                    {!isFullyPaid && totalRemaining > 0.009 ? (
                        <BalancePaymentCollector
                            partnerId={partnerId}
                            remainingBalance={totalRemaining}
                            disabled={loading || syncing}
                            onLegsReady={onLegsReady}
                            onValidityChange={setCanSubmitBalance}
                            lockedMethodLabel={lockedMethod}
                            lockedInstallments={lockedInstallments}
                            onConfirmPayment={handleSubmit}
                        />
                    ) : isFullyPaid ? (
                        <div className="my-auto">
                            <IconPlaceholder
                                icon={CheckCircleIcon}
                                title="Pedido já está pago"
                                subtitle="Não há saldo restante para receber."
                                containerSize="w-14 h-14"
                                iconSize="w-7 h-7"
                                titleClass="text-base font-bold"
                                subtitleClass="text-sm"
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </DefaultModal>
    );
}
