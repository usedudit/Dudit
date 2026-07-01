import React, { useState, useEffect } from 'react';
import {
    DefaultModal,
    MoneyInput,
    Badge,
    Button,
    Spinner,
    InfoCard
} from '@/components/reusable';
import {
    QRCodeIcon,
    CopyIcon,
    CheckCircleIcon,
    MoneyIcon,
    CreditCardIcon,
    TagIcon,
    FileIcon
} from '@/lib/icons';
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from '@/lib/utils';
import { formatPaymentMethodLabel } from '@/lib/utils/payment-method-label';
import { fetchJSONWithCSRF } from '@/lib/utils/fetch-with-csrf';
import { updateOrdersStatusInBatchAction } from '@/app/actions/erp/orders';

interface PaymentStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: any;
    partnerId: string;
    onSuccess?: () => void;
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
    const [newReceipts, setNewReceipts] = useState<Record<string, number>>({});
    
    // Mercado Pago states
    const [generatingMpPix, setGeneratingMpPix] = useState(false);
    const [mpPixData, setMpPixData] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
    const [mpPaymentId, setMpPaymentId] = useState<string | null>(null);
    const [mpCopied, setMpCopied] = useState(false);

    // Manual Pix states
    const [showManualPix, setShowManualPix] = useState(false);
    const [manualCopied, setManualCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setNewReceipts({});
            setMpPixData(null);
            setMpPaymentId(null);
            setMpCopied(false);
            setShowManualPix(false);
            setManualCopied(false);
        }
    }, [isOpen]);

    if (!order) return null;

    const breakdown = Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0
        ? order.payment_breakdown
        : [{
            method: order.payment_method || "Dinheiro",
            amount: Number(order.total_amount || 0),
            amountReceived: Number(order.paid_amount || order.paidAmount || 0),
            paymentMethodId: null,
            installmentNumber: 1
        }];

    const handleReceiptChange = (methodKey: string, val: number, maxVal: number) => {
        const cleanVal = Math.max(0, Math.min(val, maxVal));
        setNewReceipts(prev => ({
            ...prev,
            [methodKey]: cleanVal
        }));
    };

    const handleGenerateMpPix = async (amount: number) => {
        setGeneratingMpPix(true);
        try {
            const res = await fetchJSONWithCSRF<any>("/api/mercadopago/process-erp-payment", {
                method: "POST",
                body: {
                    paymentFormData: { payment_method_id: 'pix' },
                    partnerId,
                    amount,
                    description: `Recebimento Pedido - ${order.customer_name || order.buyer_id || "Cliente"}`
                }
            });

            if (res?.pixData?.qrCode) {
                setMpPixData({
                    qrCode: res.pixData.qrCode,
                    qrCodeBase64: res.pixData.qrCodeBase64
                });
                setMpPaymentId(res.mpPaymentId);
                toast({ title: "Pix Gerado", description: "Código Pix gerado com sucesso via Mercado Pago." });
            } else {
                toast({ title: "Erro", description: res?.error || "Erro ao gerar Pix no Mercado Pago.", variant: "destructive" });
            }
        } catch (err: any) {
            console.error(err);
            toast({ title: "Erro", description: "Falha ao gerar o Pix integrado.", variant: "destructive" });
        } finally {
            setGeneratingMpPix(false);
        }
    };

    const handleSyncMpPayment = async () => {
        if (!mpPaymentId && !order.mp_payment_id) return;
        setSyncing(true);
        try {
            const targetOrderId = order.id || order.originalId;
            // If we generated a new payment in this session, we need to link it first
            if (mpPaymentId) {
                await updateOrdersStatusInBatchAction({
                    orderIds: [targetOrderId],
                    partnerId,
                    actionType: "payment_status",
                    statusValue: order.situation,
                    paidAmount: Number(order.paid_amount || order.paidAmount || 0),
                    mpPaymentId
                });
            }

            const res = await fetch("/api/orders/sync-payment-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: targetOrderId })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.newStatus === "paid" || data.paymentStatus === "approved") {
                    toast({ title: "Pagamento Aprovado", description: "O Pix do Mercado Pago foi identificado com sucesso." });
                    if (onSuccess) onSuccess();
                    onClose();
                } else {
                    toast({ title: "Aguardando", description: "O pagamento Pix ainda consta como pendente no Mercado Pago." });
                }
            } else {
                toast({ title: "Erro ao Sincronizar", description: "Não foi possível verificar o status junto ao Mercado Pago.", variant: "destructive" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Erro", description: "Ocorreu um erro ao sincronizar o pagamento.", variant: "destructive" });
        } finally {
            setSyncing(false);
        }
    };

    const handleCopyPix = (code: string, type: 'mp' | 'manual') => {
        navigator.clipboard.writeText(code);
        if (type === 'mp') {
            setMpCopied(true);
            setTimeout(() => setMpCopied(false), 2000);
        } else {
            setManualCopied(true);
            setTimeout(() => setManualCopied(false), 2000);
        }
        toast({ title: "Copiado", description: "Código Pix gerado copiado com sucesso." });
    };

    const handleSubmit = async () => {
        const targetOrderId = order.id || order.originalId;
        const totalNewReceived = Object.values(newReceipts).reduce((sum, v) => sum + v, 0);

        if (totalNewReceived <= 0.009 && !mpPaymentId) {
            toast({ title: "Aviso", description: "Por favor, insira um valor de recebimento.", variant: "warning" });
            return;
        }

        setLoading(true);
        try {
            const updatedBreakdown = breakdown.map((entry: any, index: number) => {
                const methodKey = `${entry.method}-${index}`;
                const added = newReceipts[methodKey] || 0;
                return {
                    ...entry,
                    amountReceived: Number(entry.amountReceived || 0) + added
                };
            });

            const currentPaid = Number(order.paid_amount || order.paidAmount || 0);
            const nextPaidAmount = currentPaid + totalNewReceived;
            const totalOrder = Number(order.total_amount || 0);

            let nextSituation = "pending";
            if (nextPaidAmount >= totalOrder - 0.005) {
                nextSituation = "paid";
            } else if (nextPaidAmount > 0.005) {
                nextSituation = "partially_paid";
            }

            const res = await updateOrdersStatusInBatchAction({
                orderIds: [targetOrderId],
                partnerId,
                actionType: "payment_status",
                statusValue: nextSituation,
                paidAmount: nextPaidAmount,
                paymentBreakdown: updatedBreakdown,
                mpPaymentId: mpPaymentId || undefined
            });

            if (res.success) {
                toast({ title: "Sucesso", description: "Recebimento registrado com sucesso." });
                if (onSuccess) onSuccess();
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

    const totalOrder = Number(order.total_amount || 0);
    const totalPaid = Number(order.paid_amount || order.paidAmount || 0);
    const totalRemaining = Math.max(0, totalOrder - totalPaid);

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Alterar status de pagamento"
            maxWidth="md"
            footer={
                <div className="flex justify-end gap-3 w-full">
                    <Button variant="outline" onClick={onClose} disabled={loading || syncing}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading || syncing} isLoading={loading}>
                        Salvar recebimento
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-5 p-5">
                <div className="grid grid-cols-2 gap-4">
                    <InfoCard
                        title="Pedido"
                        message={order.order_number || `#${String(order.id || order.originalId).substring(0, 8)}`}
                        color="gray"
                    />
                    <InfoCard
                        title="Cliente"
                        message={order.customer_name || "Consumidor final"}
                        color="gray"
                    />
                </div>

                <div className="border-t border-brand-border dark:border-dark-border my-1" />

                <div className="grid grid-cols-3 gap-2 text-center bg-gray-50 dark:bg-dark-border/20 p-3 rounded-xl">
                    <div>
                        <span className="block text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body uppercase">Total</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalOrder)}</span>
                    </div>
                    <div>
                        <span className="block text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body uppercase">Recebido</span>
                        <span className="text-sm font-bold text-green-600">{formatCurrency(totalPaid)}</span>
                    </div>
                    <div>
                        <span className="block text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body uppercase">Restante</span>
                        <span className="text-sm font-bold text-amber-600">{formatCurrency(totalRemaining)}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <h4 className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                        Métodos de pagamento configurados
                    </h4>

                    {breakdown.map((entry: any, index: number) => {
                        const methodKey = `${entry.method}-${index}`;
                        const expected = Number(entry.amount || 0);
                        const received = Number(entry.amountReceived || 0);
                        const remaining = Math.max(0, expected - received);
                        const isQuitado = remaining <= 0.009;

                        const methodNameFormatted = formatPaymentMethodLabel(entry.method, null);
                        const isMpPix = String(entry.method).toLowerCase().includes("mercado pago") && String(entry.method).toLowerCase().includes("pix");
                        const isManualPix = !isMpPix && String(entry.method).toLowerCase().includes("pix");

                        const inputVal = newReceipts[methodKey] || 0;

                        return (
                            <div key={methodKey} className="flex flex-col p-4 border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface relative">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            {methodNameFormatted}
                                        </span>
                                        {isQuitado ? (
                                            <Badge variant="green">Quitado</Badge>
                                        ) : (
                                            <Badge variant="orange">Pendente</Badge>
                                        )}
                                    </div>
                                    <span className="text-xs font-medium text-brand-inactive-text">
                                        Previsto: {formatCurrency(expected)} | Recebido: {formatCurrency(received)}
                                    </span>
                                </div>

                                {!isQuitado ? (
                                    <div className="space-y-4">
                                        <MoneyInput
                                            label="Registrar recebimento"
                                            value={inputVal}
                                            onChange={(val) => handleReceiptChange(methodKey, val, remaining)}
                                            max={remaining}
                                            disabled={loading || syncing}
                                        />

                                        {isMpPix && (
                                            <div className="pt-2 border-t border-brand-border dark:border-dark-border/50">
                                                {!mpPixData ? (
                                                    <Button
                                                        variant="filled"
                                                        className="w-full text-xs h-9 bg-[#00b1ea] hover:bg-[#009ed2] text-white"
                                                        onClick={() => handleGenerateMpPix(remaining)}
                                                        isLoading={generatingMpPix}
                                                        disabled={generatingMpPix}
                                                    >
                                                        Gerar QR Code Pix MP (Saldo: {formatCurrency(remaining)})
                                                    </Button>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-3 pt-3 bg-gray-50 dark:bg-dark-border/10 p-3 rounded-lg">
                                                        <div className="bg-white p-3 rounded-xl border border-brand-border">
                                                            <img src={`data:image/png;base64,${mpPixData.qrCodeBase64}`} alt="QR Code Pix" className="w-32 h-32 mx-auto" />
                                                        </div>
                                                        <div className="w-full flex gap-2">
                                                            <input
                                                                type="text" readOnly
                                                                value={mpPixData.qrCode}
                                                                className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-dark-border/40 text-xs border border-brand-border truncate outline-none"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                onClick={() => handleCopyPix(mpPixData.qrCode, 'mp')}
                                                            >
                                                                {mpCopied ? <CheckCircleIcon size={14} className="text-green-600" /> : <CopyIcon size={14} />}
                                                            </Button>
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            className="w-full text-xs h-9"
                                                            onClick={handleSyncMpPayment}
                                                            isLoading={syncing}
                                                        >
                                                            Verificar Pagamento no MP
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {isManualPix && (
                                            <div className="pt-2 border-t border-brand-border dark:border-dark-border/50">
                                                {!showManualPix ? (
                                                    <Button
                                                        variant="outline"
                                                        className="w-full text-xs h-9"
                                                        onClick={() => setShowManualPix(true)}
                                                    >
                                                        Ver QR Code Pix Manual
                                                    </Button>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-3 pt-3 bg-gray-50 dark:bg-dark-border/10 p-3 rounded-lg">
                                                        <div className="bg-white p-3 rounded-xl border border-brand-border">
                                                            <QRCodeIcon size={120} className="text-brand-dark" />
                                                        </div>
                                                        <div className="w-full flex gap-2">
                                                            <input
                                                                type="text" readOnly
                                                                value="00020126580014br.gov.bcb.pix0136123e4567..."
                                                                className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-dark-border/40 text-xs border border-brand-border truncate outline-none"
                                                            />
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                onClick={() => handleCopyPix("00020126580014br.gov.bcb.pix0136123e4567...", 'manual')}
                                                            >
                                                                {manualCopied ? <CheckCircleIcon size={14} className="text-green-600" /> : <CopyIcon size={14} />}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="bg-gray-100 dark:bg-dark-border/20 py-2 px-3 rounded-lg text-xs font-semibold text-center text-green-600">
                                        Método quitado - Recebimentos desabilitados
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </DefaultModal>
    );
}
