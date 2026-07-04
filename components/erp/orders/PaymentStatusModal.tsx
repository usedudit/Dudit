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

    const lockedMethod = useMemo(() => {
        if (order?.situation !== "partially_paid") return null;
        const paidLeg = breakdown.find((leg) => Number(leg.amountReceived ?? 0) > 0.009);
        return paidLeg?.method || order?.payment_method || null;
    }, [order, breakdown]);

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
            const updatedBreakdown = [...breakdown, ...pendingLegs.map((leg) => ({
                ...leg,
                amountReceived: Number(leg.amountReceived ?? leg.amount ?? 0),
                effectiveAmount: Number(leg.effectiveAmount ?? leg.amount ?? 0),
                adjustmentType: 'none',
                adjustmentPercent: 0,
                adjustmentAmount: 0,
            }))];

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
