import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Button,
    InfoCard,
    IconPlaceholder,
    ListItem,
    Barcode,
    Spinner,
    Input,
    Badge,
} from '@/components/reusable';
import {
    CheckCircleIcon,
    XIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    FileIcon,
    MoneyIcon,
    PrinterIcon,
    CopyIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
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
import { DepositReceiptsSection } from '@/components/erp/payments/shared/DepositReceiptsSection';
import { BalancePaymentCollector } from '@/components/erp/payments/BalancePaymentCollector';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import type { PaymentBreakdownLeg } from '@/components/erp/payments/shared/payment-utils';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import { ReceiptScallopEdge } from '../POSComponents';
import SaleReceiptPrintModal from '@/components/erp/orders/receipt/SaleReceiptPrintModal';

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
    pending: "Sinal pendente",
    partially_paid: "Sinal pago - saldo pendente",
    paid: "Quitado",
    not_required: "Sem sinal",
};

const standardTransition = { type: "spring" as const, stiffness: 380, damping: 30 };

interface PaymentStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: any;
    partnerId: string;
    onSuccess?: () => void;
}

const SuccessActionCard = React.memo(({ icon: Icon, label, onClick }: { icon: any, label: string, onClick?: () => void }) => (
    <div
        className="flex items-center gap-3 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/20 cursor-pointer transition-colors group"
        onClick={onClick}
    >
        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center shrink-0 group-hover:bg-white dark:group-hover:bg-dark-surface">
            <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <div className="flex-1">
            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading block">{label}</span>
        </div>
        <ChevronRightIcon size={16} className="text-brand-inactive-text" />
    </div>
));

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

const TransactionReceiptContent = ({
    cart,
    totalOrder,
    totalPaid,
    totalRemaining,
}: any) => (
    <div className="bg-brand-gray dark:bg-dark-border/50 rounded-t-2xl p-6 pb-12 flex flex-col relative h-full border border-brand-border dark:border-dark-border border-b-0">
        <div className="mb-6 flex justify-between items-center">
            <h3 className="text-md font-bold text-brand-dark dark:text-dark-heading">Detalhes da Transação</h3>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4 space-y-4">
            {cart.map((item: any, idx: number) => (
                <div key={idx} className="flex flex-col w-full">
                    <div className="flex justify-between items-start mb-1 w-full">
                        <span className="font-medium text-brand-dark dark:text-dark-heading text-[14px] leading-snug max-w-[85%]">
                            {item.name}
                        </span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading text-sm whitespace-nowrap ml-2">
                            {item.quantity}x
                        </span>
                    </div>
                    <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                </div>
            ))}
        </div>

        <div className="mt-auto pt-4 border-t border-dashed border-brand-border dark:border-dark-border">
            <div className="space-y-2 mb-6">
                <div className="flex justify-between items-center text-sm">
                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Total</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(totalOrder)}
                    </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Recebido</span>
                    <span className="font-bold text-brand-green">
                        {formatCurrency(totalPaid)}
                    </span>
                </div>
            </div>

            <div className="flex justify-between items-center">
                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">Restante</span>
                <span className="font-black text-2xl text-brand-orange tracking-tight">
                    {formatCurrency(totalRemaining)}
                </span>
            </div>
        </div>

        <ReceiptScallopEdge />
    </div>
);

export default function PaymentStatusModal({
    isOpen,
    onClose,
    order,
    partnerId,
    onSuccess
}: PaymentStatusModalProps) {
    const { toast } = useToast();
    const [isAnimating, setIsAnimating] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState<'input' | 'processing' | 'success' | 'error'>('input');
    const [errorMessage, setErrorMessage] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [pendingLegs, setPendingLegs] = useState<PaymentBreakdownLeg[]>([]);
    const [canSubmitBalance, setCanSubmitBalance] = useState(false);
    const [printOrderId, setPrintOrderId] = useState<string | null>(null);
    const [currentOrder, setCurrentOrder] = useState<any>(order);
    const [collectorHeader, setCollectorHeader] = useState<{
        title: string;
        canGoBack: boolean;
        onGoBack: () => void;
    }>({
        title: 'Receber saldo',
        canGoBack: false,
        onGoBack: () => { },
    });
    const [successSnapshot, setSuccessSnapshot] = useState<{
        displayOrderTotal: number;
        totalPaid: number;
        isUnderpaid: boolean;
        remainingPartial: number;
        paymentBreakdown: any[];
    } | null>(null);
    const [mpLoading, setMpLoading] = useState(false);
    const [mpPaymentData, setMpPaymentData] = useState<{
        pixData?: { qrCode: string; qrCodeBase64: string; ticketUrl?: string } | null;
        boletoData?: { barcode: string; ticketUrl: string } | null;
        paymentMethod?: string;
        paymentStatus?: string;
        chargeAmount?: number;
    } | null>(null);
    const [copiedMp, setCopiedMp] = useState(false);
    const loading = paymentStatus === 'processing';

    useEffect(() => {
        if (isOpen) {
            setCurrentOrder(order);
            setPendingLegs([]);
            setCanSubmitBalance(false);
            setPaymentStatus('input');
            setErrorMessage('');
            setSuccessSnapshot(null);
            setPrintOrderId(null);
            setMpLoading(false);
            setMpPaymentData(null);
            setCopiedMp(false);
            const id = setTimeout(() => setIsAnimating(true), 50);
            return () => clearTimeout(id);
        } else {
            setIsAnimating(false);
        }
    }, [isOpen, order?.id]);

    const handleSafeClose = () => {
        setIsAnimating(false);
        setTimeout(() => {
            onClose();
        }, 200);
    };

    const targetOrder = currentOrder || order;
    const breakdown = targetOrder ? normalizeBreakdown(targetOrder) : [];
    const depositSummary = targetOrder ? getOrderDepositSummary(targetOrder) : null;
    const totalOrder = targetOrder ? getOrderTotalAmount(targetOrder) : 0;
    const totalPaid = targetOrder ? getOrderPaidAmount(targetOrder) : 0;
    const totalRemaining = targetOrder ? getOrderRemainingBalance(targetOrder) : 0;
    const frozen = targetOrder ? isOrderFinanciallyFrozen(targetOrder) : false;

    const isMpOrder = Boolean(
        targetOrder?.payment_provider === "Mercado Pago" ||
        targetOrder?.mp_payment_id ||
        breakdown.some((leg) => {
            const m = String(leg?.method || "").toLowerCase();
            const p = String(leg?.provider || "").toLowerCase();
            return p.includes("mercado pago") || m.includes("mercado pago");
        })
    );

    useEffect(() => {
        if (!isOpen || !targetOrder) return;
        const targetOrderId = targetOrder.id || targetOrder.originalId;
        const fullyPaid = targetOrder.situation === "paid" || totalRemaining <= 0.009;

        if (isMpOrder && !fullyPaid && targetOrderId) {
            setMpLoading(true);
            fetch("/api/orders/retry-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: targetOrderId }),
            })
                .then(async (res) => {
                    if (!res.ok) return null;
                    return res.json();
                })
                .then((data) => {
                    if (data && (data.pixData || data.boletoData)) {
                        setMpPaymentData(data);
                    } else {
                        setMpPaymentData(null);
                    }
                })
                .catch((err) => {
                    console.error("Error fetching MP payment in PaymentStatusModal:", err);
                    setMpPaymentData(null);
                })
                .finally(() => {
                    setMpLoading(false);
                });
        } else {
            setMpPaymentData(null);
        }
    }, [isOpen, targetOrder?.id, targetOrder?.originalId, targetOrder?.situation, totalRemaining, isMpOrder]);

    const displayOrderNumber = useMemo(() => {
        if (!targetOrder) return "";
        return targetOrder.order_number ?? targetOrder.orderNumber ?? targetOrder.number ?? `#${String(targetOrder.id || targetOrder.originalId || "").substring(0, 8)}`;
    }, [targetOrder]);

    const cashEntry = Array.isArray(breakdown)
        ? breakdown.find((entry: any) => {
            const m = String(entry?.method || "").toLowerCase().trim();
            return m === "cash" || m === "dinheiro";
        })
        : null;
    const wantsChange = (cashEntry as any)?.wantsChange ?? String(targetOrder?.payment_method || "").toLowerCase().includes("troco para");
    const payWithAmount = (cashEntry as any)?.payWithAmount ?? (() => {
        const match = String(targetOrder?.payment_method || "").match(/troco para R\$\s*([\d,.]+)/i)
        if (match) {
            const cleanNum = match[1].replace(/\./g, "").replace(',', '.')
            return Number(cleanNum)
        }
        return null;
    })();
    const cashChangeAmount = wantsChange && payWithAmount ? payWithAmount - Number(targetOrder?.total_amount || 0) : 0;

    const lockedMethod = useMemo(() => {
        const paidLeg = breakdown.find((leg) => {
            const m = leg.method;
            if (!m) return false;
            const norm = m.toLowerCase();
            return !norm.includes('não definido') && !norm.includes('metodo nao definido') && !norm.includes('pendente') && !norm.includes('não informado') && !norm.includes('nao informado');
        });
        if (paidLeg?.method) return paidLeg.method;

        const mainMethod = targetOrder?.payment_method;
        if (mainMethod) {
            const norm = mainMethod.toLowerCase();
            if (!norm.includes('não definido') && !norm.includes('metodo nao definido') && !norm.includes('pendente') && !norm.includes('não informado') && !norm.includes('nao informado')) {
                return mainMethod;
            }
        }
        return null;
    }, [targetOrder, breakdown]);

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

    const receiptCart = useMemo(() => {
        const items = targetOrder?.order_items || targetOrder?.items || [];
        return items.map((item: any) => ({
            name: item.products?.name || item.product_name || item.name || "Item",
            quantity: Number(item.quantity || 1),
            unitPrice: Number(item.product_price || item.unit_price || item.unitPrice || 0),
        }));
    }, [targetOrder]);

    const onLegsReady = useCallback((legs: PaymentBreakdownLeg[]) => {
        setPendingLegs(legs);
    }, []);

    if (!targetOrder || !isOpen) return null;

    const handleSyncMpPayment = async () => {
        const targetOrderId = targetOrder.id || targetOrder.originalId;
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
                    handleSafeClose();
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

    const isFullyPaid = targetOrder?.situation === "paid" || totalRemaining <= 0.009;

    const handleSubmit = async () => {
        const targetOrderId = targetOrder.id || targetOrder.originalId;
        if (isFullyPaid) {
            toast({ title: "Aviso", description: "Este pedido já está pago.", variant: "warning" });
            return;
        }
        if (pendingNewAmount <= 0.009) {
            toast({ title: "Aviso", description: "Informe o valor recebido.", variant: "warning" });
            return;
        }

        setPaymentStatus('processing');
        try {
            const updatedBreakdown = breakdown.map((leg) => ({ ...leg }));
            for (const pendingLeg of pendingLegs) {
                let legRemaining = Number(pendingLeg.amountReceived ?? pendingLeg.amount ?? 0);

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

                if (legRemaining > 0.009) {
                    updatedBreakdown.push({
                        ...pendingLeg,
                        amount: legRemaining,
                        effectiveAmount: legRemaining,
                        amountReceived: Number(legRemaining.toFixed(2)),
                        adjustmentType: 'none',
                        adjustmentPercent: 0,
                        adjustmentAmount: 0,
                    } as any);
                }
            }

            const hasRealLeg = updatedBreakdown.some((leg: any) => {
                const norm = String(leg.method || '').toLowerCase();
                return !norm.includes('não definido') && !norm.includes('metodo nao definido') && !norm.includes('pendente');
            });

            const finalBreakdown = hasRealLeg
                ? updatedBreakdown.filter((leg: any) => {
                    const norm = String(leg.method || '').toLowerCase();
                    return !norm.includes('não definido') && !norm.includes('metodo nao definido') && !norm.includes('pendente');
                })
                : updatedBreakdown;

            const isFullPaymentOfBalance = pendingNewAmount >= totalRemaining - 0.005 || pendingNewAmount >= totalOrder - 0.005;
            const nextPaidAmount = isFullPaymentOfBalance ? totalOrder : (totalPaid + pendingNewAmount);
            const nextSituation = resolveSituationFromPaid(nextPaidAmount, totalOrder);

            const res = await updateOrdersStatusInBatchAction({
                orderIds: [targetOrderId],
                partnerId,
                actionType: "payment_status",
                statusValue: nextSituation,
                paidAmount: nextPaidAmount,
                paymentBreakdown: finalBreakdown,
            });

            if (res.success) {
                const updated = {
                    ...targetOrder,
                    order_number: targetOrder.order_number ?? targetOrder.orderNumber ?? targetOrder.number,
                    total_amount: totalOrder,
                    totalAmount: totalOrder,
                    paid_amount: nextPaidAmount,
                    paidAmount: nextPaidAmount,
                    situation: nextSituation,
                    payment_breakdown: finalBreakdown,
                };
                setCurrentOrder(updated);
                setSuccessSnapshot({
                    displayOrderTotal: totalOrder,
                    totalPaid: nextPaidAmount,
                    isUnderpaid: nextSituation !== "paid",
                    remainingPartial: Math.max(0, totalOrder - nextPaidAmount),
                    paymentBreakdown: updatedBreakdown,
                });
                setPaymentStatus('success');
                onSuccess?.();
            } else {
                setErrorMessage(res.error || "Falha ao registrar recebimento.");
                setPaymentStatus('error');
            }
        } catch (err) {
            console.error(err);
            setErrorMessage("Ocorreu um erro ao salvar o pagamento.");
            setPaymentStatus('error');
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div
                className={`fixed inset-0 bg-black/60 transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"}`}
                onClick={handleSafeClose}
            />

            <div
                className={`relative bg-white dark:bg-dark-surface w-full h-full md:h-[85vh] md:max-w-[1100px] md:rounded-3xl flex flex-col md:flex-row overflow-hidden z-10 transition-all duration-200 ease-out ${isAnimating ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
            >
                {/* --- LEFT COLUMN: RECEIPT (Desktop Only) --- */}
                <div className="hidden md:flex w-[40%] bg-white dark:bg-dark-surface p-8 flex-col relative z-20 border-r border-brand-border dark:border-dark-border">
                    <div className="mb-6 h-10 flex items-center">
                        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Resumo</h2>
                    </div>

                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <UserProfileImage
                                fullName={targetOrder.customer_name || 'Consumidor Final'}
                                className="w-12 h-12 text-white font-medium text-lg shrink-0"
                            />
                            <div className="flex flex-col overflow-hidden">
                                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[180px]">{targetOrder.customer_name || 'Consumidor Final'}</span>
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">Venda de Itens</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end text-right justify-center">
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">{formatDate(new Date(targetOrder.created_at || Date.now()))}</span>
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">{formatTime(new Date(targetOrder.created_at || Date.now()))}</span>
                        </div>
                    </div>

                    <div className="relative w-full flex-1 min-h-0 flex flex-col rounded-2xl">
                        <TransactionReceiptContent
                            cart={receiptCart}
                            totalOrder={totalOrder}
                            totalPaid={totalPaid}
                            totalRemaining={totalRemaining}
                            itemCount={receiptCart.length}
                            customerName={targetOrder.customer_name}
                        />
                    </div>
                </div>

                {/* --- RIGHT COLUMN: ACTIONS & COLLECTOR --- */}
                <div className="w-full md:w-[60%] bg-white dark:bg-dark-surface flex flex-col relative h-full">
                    {/* Header */}
                    {paymentStatus === 'input' && (
                        <div className="px-6 py-6 md:px-10 md:pt-10 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3 overflow-hidden">
                                {collectorHeader.canGoBack && (
                                    <button
                                        onClick={collectorHeader.onGoBack}
                                        className="w-10 h-10 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center text-brand-dark dark:text-dark-heading hover:bg-gray-200 dark:hover:bg-dark-border transition-colors shrink-0"
                                    >
                                        <ChevronLeftIcon size={20} />
                                    </button>
                                )}
                                <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {collectorHeader.title}
                                </h2>
                            </div>
                            <button onClick={handleSafeClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading hover:bg-gray-200 transition-colors">
                                <XIcon size={20} />
                            </button>
                        </div>
                    )}

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-32 md:pb-10 relative custom-scrollbar flex flex-col">
                        <AnimatePresence mode="wait">
                            {/* === STATE: INPUT === */}
                            {paymentStatus === 'input' && (
                                <motion.div
                                    key="input-container"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={standardTransition}
                                    className="flex flex-col gap-6"
                                >
                                    <div className="flex flex-col gap-4">
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

                                    {isMpOrder && !isFullyPaid && (
                                        <div className="flex flex-col gap-4">
                                            {/* Header do card MP */}
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-10 h-10 rounded-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                                        <img
                                                            src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                                                            alt="Mercado Pago"
                                                            className="w-5 h-5 object-contain"
                                                        />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5 flex-wrap">
                                                            {mpPaymentData?.boletoData ? "Boleto Mercado Pago" : "Pix Mercado Pago"}
                                                            <Badge variant="orange" className="whitespace-nowrap scale-90">Pendente</Badge>
                                                        </h4>
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                                            {mpPaymentData?.boletoData
                                                                ? "Linha digitável e código de barras para pagamento"
                                                                : "Escaneie o QR Code ou copie a chave Pix"}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    onClick={handleSyncMpPayment}
                                                    disabled={syncing}
                                                    className="h-8"
                                                >
                                                    {syncing ? <Spinner size={12} className="mr-1.5" /> : null}
                                                    Verificar
                                                </Button>
                                            </div>

                                            {/* Loading */}
                                            {mpLoading && !mpPaymentData && (
                                                <div className="flex flex-col items-center justify-center py-6 text-brand-inactive-text">
                                                    <Spinner size={20} className="mb-2 text-brand-primary" />
                                                    <span className="text-xs">Carregando dados da cobrança...</span>
                                                </div>
                                            )}

                                            {/* Conteúdo: PIX */}
                                            {mpPaymentData?.pixData && (
                                                <div className="flex flex-col items-center gap-4">
                                                    {mpPaymentData.pixData.qrCodeBase64 && (
                                                        <div className="w-48 h-48 p-2 bg-white flex items-center justify-center">
                                                            <img
                                                                src={`data:image/png;base64,${mpPaymentData.pixData.qrCodeBase64}`}
                                                                alt="PIX QR Code"
                                                                className="w-full h-full object-contain"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="text-center">
                                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Valor do Pix</span>
                                                        <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(mpPaymentData.chargeAmount || totalRemaining)}
                                                        </span>
                                                    </div>
                                                    {mpPaymentData.pixData.qrCode && (
                                                        <div className="w-full max-w-md flex gap-2">
                                                            <Input
                                                                variant="full-rounded"
                                                                readOnly
                                                                value={mpPaymentData.pixData.qrCode}
                                                                className="flex-1 h-10 truncate"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    if (mpPaymentData?.pixData?.qrCode) {
                                                                        navigator.clipboard.writeText(mpPaymentData.pixData.qrCode);
                                                                        setCopiedMp(true);
                                                                        toast({ title: "Copiado!", description: "Código Pix copiado para a área de transferência." });
                                                                        setTimeout(() => setCopiedMp(false), 2000);
                                                                    }
                                                                }}
                                                                className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                                                title="Copiar chave Pix"
                                                            >
                                                                {copiedMp ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Conteúdo: BOLETO */}
                                            {mpPaymentData?.boletoData && (
                                                <div className="flex flex-col items-center gap-4">
                                                    {mpPaymentData.boletoData.barcode && (
                                                        <div className="w-full max-w-md overflow-hidden bg-white flex justify-center">
                                                            <Barcode
                                                                value={mpPaymentData.boletoData.barcode}
                                                                format="CODE128"
                                                                width={1.5}
                                                                height={50}
                                                                displayValue={false}
                                                                margin={5}
                                                                className="w-full max-w-sm"
                                                            />
                                                        </div>
                                                    )}
                                                    <div className="text-center">
                                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Valor do Boleto</span>
                                                        <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(mpPaymentData.chargeAmount || totalRemaining)}
                                                        </span>
                                                    </div>
                                                    {mpPaymentData.boletoData.barcode && (
                                                        <div className="w-full max-w-md flex gap-2">
                                                            <Input
                                                                variant="full-rounded"
                                                                readOnly
                                                                value={mpPaymentData.boletoData.barcode}
                                                                className="flex-1 h-10 truncate"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    if (mpPaymentData?.boletoData?.barcode) {
                                                                        navigator.clipboard.writeText(mpPaymentData.boletoData.barcode);
                                                                        setCopiedMp(true);
                                                                        toast({ title: "Copiado!", description: "Código de barras do boleto copiado." });
                                                                        setTimeout(() => setCopiedMp(false), 2000);
                                                                    }
                                                                }}
                                                                className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                                                title="Copiar linha digitável"
                                                            >
                                                                {copiedMp ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                                            </Button>
                                                            {mpPaymentData.boletoData.ticketUrl && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => window.open(mpPaymentData!.boletoData!.ticketUrl, "_blank")}
                                                                    className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                                                    title="Abrir / Imprimir Boleto"
                                                                >
                                                                    <PrinterIcon size={16} />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <DepositReceiptsSection
                                        legs={breakdown}
                                        onSyncMp={targetOrder.mp_payment_id || targetOrder.payment_provider === "Mercado Pago" ? handleSyncMpPayment : undefined}
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
                                            onHeaderStateChange={setCollectorHeader}
                                        />
                                    ) : isFullyPaid ? (
                                        <div className="my-auto py-10">
                                            <IconPlaceholder
                                                icon={CheckCircleIcon}
                                                title="Pedido já está pago"
                                                subtitle="Não há saldo restante para receber."
                                                containerSize="w-14 h-14"
                                                iconSize="w-7 h-7"
                                                titleClass="text-brand-dark dark:text-dark-heading text-lg font-bold"
                                                subtitleClass="text-brand-inactive-text dark:text-dark-body text-sm"
                                            />
                                        </div>
                                    ) : null}
                                </motion.div>
                            )}

                            {/* === STATE: PROCESSING === */}
                            {paymentStatus === 'processing' && (
                                <motion.div
                                    key="processing"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={standardTransition}
                                    className="w-full h-full flex flex-col items-center justify-center p-8 text-center my-auto"
                                >
                                    <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-brand-green to-[#10b981] flex items-center justify-center mb-6 relative">
                                        <div className="absolute inset-0 rounded-full bg-white opacity-20 animate-ping"></div>
                                        <MoneyIcon size={56} className="text-white" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Processando recebimento...</h2>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-sm">Por favor, aguarde enquanto registramos o pagamento.</p>
                                </motion.div>
                            )}

                            {/* === STATE: ERROR === */}
                            {paymentStatus === 'error' && (
                                <motion.div
                                    key="error"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={standardTransition}
                                    className="w-full h-full flex flex-col items-center justify-center p-8 text-center my-auto"
                                >
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                                        imageAlt="Não foi possível registrar o recebimento"
                                        title="Não foi possível concluir"
                                        subtitle={errorMessage}
                                    />
                                </motion.div>
                            )}

                            {/* === STATE: SUCCESS === */}
                            {paymentStatus === 'success' && (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={standardTransition}
                                    className="w-full h-full flex flex-col p-6 md:p-10 overflow-y-auto custom-scrollbar my-auto justify-center"
                                >
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 shrink-0">
                                            <CheckCircleIcon size={32} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                Venda nº {displayOrderNumber}
                                            </h2>
                                            <p className="text-brand-inactive-text dark:text-dark-body font-medium text-md">Recebimento concluído com sucesso</p>
                                        </div>
                                    </div>

                                    {successSnapshot?.isUnderpaid && (
                                        <div className="mb-6">
                                            <div className="w-full py-3 px-4 rounded-lg flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/30">
                                                <div className="w-1.5 h-4 rounded-full bg-yellow-500"></div>
                                                <span className="font-bold text-sm flex-1 text-yellow-700 dark:text-yellow-400">
                                                    Recebido parcialmente, restante a pagar: {formatCurrency(successSnapshot.remainingPartial)}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 mb-10 mt-4 border-l-4 border-brand-dark dark:border-dark-heading pl-6">
                                        <div>
                                            <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">Total da venda</span>
                                            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(successSnapshot?.displayOrderTotal || totalOrder)}</div>
                                        </div>
                                        <div>
                                            <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">Total recebido</span>
                                            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(successSnapshot?.totalPaid || totalPaid)}</div>
                                        </div>
                                    </div>

                                    {successSnapshot?.paymentBreakdown && successSnapshot.paymentBreakdown.length > 1 && (
                                        <div className="mb-6 border-t border-brand-border dark:border-dark-border pt-4">
                                            <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-3">Formas de pagamento</span>
                                            <div className="space-y-2">
                                                {successSnapshot.paymentBreakdown.map((entry: any, i: number) => (
                                                    <div key={i} className="flex justify-between items-center py-1">
                                                        <span className="text-sm text-brand-dark dark:text-dark-heading">{entry.method}</span>
                                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(entry.amount)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-4 mb-8">
                                        <ListItem
                                            icon={FileIcon}
                                            title="Imprimir recibo"
                                            description="Gerar e imprimir recibo da venda"
                                            className="px-4 py-3 gap-4"
                                            onClick={() => setPrintOrderId(targetOrder.id || targetOrder.originalId)}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Bottom Action Bar */}
                    {paymentStatus === 'input' && !isFullyPaid && totalRemaining > 0.009 && (
                        <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30 flex gap-3">
                            <Button variant="outline" className="flex-1 h-[52px]" onClick={handleSafeClose} disabled={loading || syncing}>
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1 h-[52px]"
                                onClick={handleSubmit}
                                disabled={loading || syncing || !canSubmitBalance}
                                isLoading={loading}
                            >
                                Salvar recebimento
                            </Button>
                        </div>
                    )}

                    {paymentStatus === 'success' && (
                        <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30 flex">
                            <Button
                                className="flex-1 h-[52px]"
                                onClick={handleSafeClose}
                            >
                                Finalizar
                            </Button>
                        </div>
                    )}

                    {paymentStatus === 'error' && (
                        <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30 flex gap-3">
                            <Button variant="outline" className="flex-1 h-[52px]" onClick={handleSafeClose}>
                                Cancelar
                            </Button>
                            <Button
                                className="flex-1 h-[52px]"
                                onClick={handleSubmit}
                            >
                                Tentar novamente
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {printOrderId && (
                <SaleReceiptPrintModal
                    isOpen={!!printOrderId}
                    onClose={() => setPrintOrderId(null)}
                    orderId={printOrderId}
                />
            )}
        </div>
    );
}
