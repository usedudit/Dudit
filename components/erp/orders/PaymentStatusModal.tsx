import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    DefaultModal,
    Button,
    InfoCard,
} from '@/components/reusable';
import { useToast } from "@/components/ui/use-toast";
import { updateOrdersStatusInBatchAction } from '@/app/actions/erp/orders';
import {
    FINANCIAL_FREEZE_INFO_MESSAGE,
    getOrderPaidAmount,
    getOrderRemainingBalance,
    getOrderTotalAmount,
    isOrderFinanciallyFrozen,
    resolveSituationFromPaid,
} from '@/lib/payments/order-financial-state';
import { PaymentSummary } from '@/components/erp/payments/shared/PaymentSummary';
import { DepositReceiptsSection } from '@/components/erp/payments/shared/DepositReceiptsSection';
import { BalancePaymentCollector } from '@/components/erp/payments/BalancePaymentCollector';
import type { PaymentBreakdownLeg } from '@/components/erp/payments/shared/payment-utils';

interface PaymentStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: any;
    partnerId: string;
    onSuccess?: () => void;
}

function normalizeBreakdown(order: any): PaymentBreakdownLeg[] {
    if (Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0) {
        return order.payment_breakdown;
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
    const totalOrder = order ? getOrderTotalAmount(order) : 0;
    const totalPaid = order ? getOrderPaidAmount(order) : 0;
    const totalRemaining = order ? getOrderRemainingBalance(order) : 0;
    const frozen = order ? isOrderFinanciallyFrozen(order) : false;
    const displayId = order
        ? order.order_number || `#${String(order.id || order.originalId || "").substring(0, 8)}`
        : "";

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

    const handleSubmit = async () => {
        const targetOrderId = order.id || order.originalId;
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
                    <Button variant="outline" onClick={onClose} disabled={loading || syncing}>
                        Cancelar
                    </Button>
                    {totalRemaining > 0.009 && (
                        <Button
                            onClick={handleSubmit}
                            disabled={loading || syncing || !canSubmitBalance}
                            isLoading={loading}
                        >
                            Salvar recebimento
                        </Button>
                    )}
                </div>
            }
        >
            <div className="flex flex-col gap-4 mb-4">
                {frozen && (
                    <InfoCard color="orange" message={FINANCIAL_FREEZE_INFO_MESSAGE} />
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

                    {totalRemaining > 0.009 && (
                        <BalancePaymentCollector
                            partnerId={partnerId}
                            remainingBalance={totalRemaining}
                            disabled={loading || syncing}
                            onLegsReady={onLegsReady}
                            onValidityChange={setCanSubmitBalance}
                        />
                    )}
                </div>
            </div>
        </DefaultModal>
    );
}
