import React, { useState, useEffect, useCallback } from 'react';
import {
    DefaultModal,
    MoneyInput,
    Badge,
    Button,
} from '@/components/reusable';
import {
    QRCodeIcon,
    CopyIcon,
    CheckCircleIcon,
    TagIcon,
    XIcon,
} from '@/lib/icons';
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from '@/lib/utils';
import { formatPaymentMethodLabel } from '@/lib/utils/payment-method-label';
import { fetchJSONWithCSRF } from '@/lib/utils/fetch-with-csrf';
import { updateOrdersStatusInBatchAction } from '@/app/actions/erp/orders';
import { getPaymentMethodDetailsAction } from '@/app/actions/erp/payment-methods';
import { generateStaticPix } from '@/lib/utils/pix-generator';
import { useStore } from '@/lib/store-context';
// @ts-ignore
import QRCode from "qrcode";
import Portal from '@/components/Portal';

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
    const { selectedStore } = useStore();
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [newReceipts, setNewReceipts] = useState<Record<string, number>>({});

    const [generatingMpPix, setGeneratingMpPix] = useState(false);
    const [mpPixData, setMpPixData] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
    const [mpPaymentId, setMpPaymentId] = useState<string | null>(null);
    const [mpCopied, setMpCopied] = useState(false);

    const [pixKeyCache, setPixKeyCache] = useState<Record<string, { key: string; keyType: string; merchantName: string } | null>>({});
    const [generatingPix, setGeneratingPix] = useState<Record<string, boolean>>({});
    const [pixQrData, setPixQrData] = useState<Record<string, { payload: string; qrDataUrl: string }>>({});
    const [copiedPix, setCopiedPix] = useState<Record<string, boolean>>({});
    const [qrModalMethodKey, setQrModalMethodKey] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setNewReceipts({});
            setMpPixData(null);
            setMpPaymentId(null);
            setMpCopied(false);
            setPixKeyCache({});
            setPixQrData({});
            setGeneratingPix({});
            setCopiedPix({});
        }
    }, [isOpen]);

    if (!order) return null;

    const breakdown = Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0
        ? order.payment_breakdown
        : [{
            method: order.payment_method || "Dinheiro",
            amount: Number(order.total_amount || 0),
            amountReceived: Number(order.paid_amount || order.paidAmount || 0),
            paymentMethodId: order.payment_method_id || null,
            installmentNumber: 1
        }];

    const handleReceiptChange = (methodKey: string, val: number, maxVal: number) => {
        const cleanVal = Math.max(0, Math.min(val, maxVal));
        setNewReceipts(prev => ({
            ...prev,
            [methodKey]: cleanVal
        }));
    };

    const fetchPixKey = useCallback(async (methodKey: string, paymentMethodId: string | null) => {
        if (!paymentMethodId) return null;
        if (pixKeyCache[methodKey] !== undefined) return pixKeyCache[methodKey];

        try {
            const res = await getPaymentMethodDetailsAction(paymentMethodId);
            if (res.success && res.method.pix_key) {
                const data = {
                    key: res.method.pix_key,
                    keyType: res.method.pix_key_type || "email",
                    merchantName: selectedStore?.name || "Loja",
                };
                setPixKeyCache(prev => ({ ...prev, [methodKey]: data }));
                return data;
            }
        } catch (e) {
            console.error("Error fetching PIX key:", e);
        }
        setPixKeyCache(prev => ({ ...prev, [methodKey]: null }));
        return null;
    }, [pixKeyCache, selectedStore]);

    const handleGeneratePix = async (methodKey: string, paymentMethodId: string | null, amount: number) => {
        if (amount <= 0) return;
        setGeneratingPix(prev => ({ ...prev, [methodKey]: true }));

        try {
            const pixInfo = await fetchPixKey(methodKey, paymentMethodId);
            if (!pixInfo) {
                toast({ title: "Erro", description: "Chave PIX não encontrada para este método.", variant: "destructive" });
                return;
            }

            const payload = generateStaticPix(
                pixInfo.key,
                amount,
                pixInfo.merchantName,
                ""
            );

            const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 });

            setPixQrData(prev => ({ ...prev, [methodKey]: { payload, qrDataUrl } }));
            toast({ title: "Pix Gerado", description: "QR Code Pix gerado com sucesso." });
        } catch (err: any) {
            console.error(err);
            toast({ title: "Erro", description: "Falha ao gerar o QR Code Pix.", variant: "destructive" });
        } finally {
            setGeneratingPix(prev => ({ ...prev, [methodKey]: false }));
        }
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

    const handleCopyPix = (code: string, methodKey: string) => {
        navigator.clipboard.writeText(code);
        setCopiedPix(prev => ({ ...prev, [methodKey]: true }));
        setTimeout(() => setCopiedPix(prev => ({ ...prev, [methodKey]: false })), 2000);
        toast({ title: "Copiado", description: "Código Pix copiado com sucesso." });
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
    const displayId = order.order_number || `#${String(order.id || order.originalId || "").substring(0, 8)}`;

    return (
        <>
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
                        <Button onClick={handleSubmit} disabled={loading || syncing} isLoading={loading}>
                            Salvar recebimento
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Left Column: Resumo */}
                    <div className="w-full md:w-[40%] flex flex-col">
                        <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl p-5 flex flex-col gap-4 border border-brand-border dark:border-dark-border h-full">
                            {/* Header: Pedido ID + Status */}
                            <div className="flex items-center justify-between pb-4 border-b border-dashed border-brand-border dark:border-dark-border">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
                                        <TagIcon className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading leading-tight truncate">
                                            {displayId}
                                        </span>
                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">
                                            {order.customer_name || "Consumidor final"}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Resumo dos valores */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">
                                    Resumo Financeiro
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Total</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalOrder)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Recebido</span>
                                        <span className="font-bold text-green-600">{formatCurrency(totalPaid)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">Restante</span>
                                        <span className="font-bold text-amber-600">{formatCurrency(totalRemaining)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Cliente */}
                            <div className="mt-auto pt-4 border-t border-dashed border-brand-border dark:border-dark-border">
                                <span className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase font-bold tracking-wider">Cliente</span>
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                    {order.customer_name || "Consumidor final"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Métodos de pagamento */}
                    <div className="w-full md:w-[60%] flex flex-col gap-4">
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
                            const pixGenerated = !!pixQrData[methodKey];
                            const isGeneratingPix = !!generatingPix[methodKey];
                            const isCopied = !!copiedPix[methodKey];

                            return (
                                <div key={methodKey} className="flex flex-col p-4 border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface">
                                    {/* Header: nome + badge */}
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
                                        <div className="flex items-center gap-3 text-xs font-medium text-brand-inactive-text">
                                            <span>Previsto: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(expected)}</strong></span>
                                            {received > 0 && <span>Recebido: <strong className="text-green-600">{formatCurrency(received)}</strong></span>}
                                        </div>
                                    </div>

                                    {!isQuitado ? (
                                        <div className="space-y-3">
                                            <MoneyInput
                                                label="Registrar recebimento"
                                                value={inputVal}
                                                onChange={(val) => handleReceiptChange(methodKey, val, remaining)}
                                                max={remaining}
                                                disabled={loading || syncing}
                                            />

                                            <div className="flex items-center gap-2">
                                                {remaining > 0 && isManualPix && (
                                                    <>
                                                        {pixGenerated ? (
                                                            <Button
                                                                variant="outline"
                                                                className="flex-1 text-xs h-9"
                                                                onClick={() => setQrModalMethodKey(methodKey)}
                                                            >
                                                                <QRCodeIcon className="w-4 h-4 mr-1.5" />
                                                                Ver QR Code
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="filled"
                                                                className="flex-1 text-xs h-9 bg-teal-600 hover:bg-teal-700 text-white"
                                                                onClick={() => handleGeneratePix(methodKey, entry.paymentMethodId, remaining)}
                                                                isLoading={isGeneratingPix}
                                                                disabled={isGeneratingPix || Number(remaining) <= 0}
                                                            >
                                                                <QRCodeIcon className="w-4 h-4 mr-1.5" />
                                                                Gerar QR Code Pix
                                                            </Button>
                                                        )}
                                                    </>
                                                )}

                                                {remaining > 0 && isMpPix && !mpPixData && (
                                                    <Button
                                                        variant="filled"
                                                        className="flex-1 text-xs h-9 bg-[#00b1ea] hover:bg-[#009ed2] text-white"
                                                        onClick={() => handleGenerateMpPix(remaining)}
                                                        isLoading={generatingMpPix}
                                                        disabled={generatingMpPix}
                                                    >
                                                        <QRCodeIcon className="w-4 h-4 mr-1.5" />
                                                        Gerar QR Code Mercado Pago
                                                    </Button>
                                                )}

                                                {isMpPix && mpPixData && (
                                                    <Button
                                                        variant="outline"
                                                        className="flex-1 text-xs h-9"
                                                        onClick={() => setQrModalMethodKey("mp")}
                                                    >
                                                        <QRCodeIcon className="w-4 h-4 mr-1.5" />
                                                        Ver QR Code MP
                                                    </Button>
                                                )}
                                            </div>
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

            {/* PIX QR Code Modal */}
            <Portal>
                {qrModalMethodKey && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black/60" onClick={() => setQrModalMethodKey(null)} />
                        <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
                            <div className="flex items-center justify-between p-5 pb-2">
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">QR Code Pix</h3>
                                <Button variant="filled" onClick={() => setQrModalMethodKey(null)} className="w-9 h-9 p-0 flex items-center justify-center shrink-0">
                                    <XIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            <div className="p-6 flex flex-col items-center gap-4">
                                {qrModalMethodKey === "mp" && mpPixData ? (
                                    <>
                                        <div className="bg-white p-4 rounded-xl border border-brand-border shadow-sm">
                                            <img src={`data:image/png;base64,${mpPixData.qrCodeBase64}`} alt="QR Code Pix" className="w-48 h-48" />
                                        </div>
                                        <div className="w-full flex gap-2">
                                            <input
                                                type="text" readOnly
                                                value={mpPixData.qrCode}
                                                className="flex-1 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-border/40 text-xs border border-brand-border truncate outline-none"
                                            />
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(mpPixData.qrCode);
                                                    setMpCopied(true);
                                                    setTimeout(() => setMpCopied(false), 2000);
                                                    toast({ title: "Copiado", description: "Código Pix copiado com sucesso." });
                                                }}
                                                className="w-10 h-10 shrink-0"
                                            >
                                                {mpCopied ? <CheckCircleIcon size={16} className="text-green-600" /> : <CopyIcon size={16} />}
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
                                    </>
                                ) : qrModalMethodKey && qrModalMethodKey !== "mp" && pixQrData[qrModalMethodKey] ? (
                                    <>
                                        <div className="bg-white p-4 rounded-xl border border-brand-border shadow-sm">
                                            <img src={pixQrData[qrModalMethodKey].qrDataUrl} alt="QR Code Pix" className="w-48 h-48" />
                                        </div>
                                        <div className="w-full flex gap-2">
                                            <input
                                                type="text" readOnly
                                                value={pixQrData[qrModalMethodKey].payload}
                                                className="flex-1 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-dark-border/40 text-xs border border-brand-border truncate outline-none"
                                            />
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => handleCopyPix(pixQrData[qrModalMethodKey].payload, qrModalMethodKey)}
                                                className="w-10 h-10 shrink-0"
                                            >
                                                {copiedPix[qrModalMethodKey] ? <CheckCircleIcon size={16} className="text-green-600" /> : <CopyIcon size={16} />}
                                            </Button>
                                        </div>
                                        <p className="text-[11px] text-brand-inactive-text text-center">
                                            Use o QR Code acima para pagamento via Pix.
                                        </p>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>
                )}
            </Portal>
        </>
    );
}
