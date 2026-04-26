import React, { useState, useEffect, useMemo } from 'react';
import {
    XIcon,
    ChevronLeftIcon,
    CreditCardIcon,
    MoneyIcon,
    QRCodeIcon,
    CopyIcon,
    ColumnsIcon as SplitIcon,
    ChevronUpIcon,
    MoreHorizontalIcon,
    ClockIcon,
    TruckIcon,
    ChevronDownIcon,
    PlusIcon,
    PrinterIcon,
    FileIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    CancelCircleIcon,
    InfoIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Input, Button, Checkbox, MoneyInput, Badge, Tooltip } from '@/components/reusable';
import { ReceiptContent, PaymentMethodCard, SplitPaymentCard, Numpad } from './POSComponents';
import { calculatePaymentMethodAmountsAction, getPaymentMethodsAction, previewSplitPaymentBreakdownAction } from '@/app/actions/erp/payment-methods';
import { useToast } from "@/components/ui/use-toast";
import { cn, formatCurrency, formatDate, formatNumber, formatTime } from '@/lib/utils';

const PAYMENT_METHODS_VERSION_PREFIX = "payment-methods-version:";
const PAYMENT_METHODS_UPDATED_EVENT = "payment-methods-updated";

const paymentMethodsCache = new Map<string, {
    methods: PartnerPaymentMethod[];
    signature: string;
}>();

const buildMethodsSignature = (methods: PartnerPaymentMethod[]) =>
    JSON.stringify(
        (methods || []).map((method: any) => ({
            id: method.id,
            name: method.name,
            type: method.type,
            is_active: method.is_active,
            updated_at: method.updated_at || null,
        }))
    );

const normalizePaymentMethodLabel = (value?: string | null) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized === 'dinheiro') return 'Dinheiro';
    if (normalized === 'pix') return 'Pix';
    if (normalized === 'cartao' || normalized === 'cartão') return 'Cartão';
    if (normalized === 'pendente') return 'Pendente';
    return String(value || '').trim();
};

// --- HELPER COMPONENTS ---

const CompactPaymentStatusAlert = ({ totalPaid, totalNeed }: { totalPaid: number, totalNeed: number }) => {
    const diff = totalPaid - totalNeed;
    const absDiff = Math.abs(diff);

    let bgClass = "bg-gray-100 dark:bg-dark-border/20";
    let textClass = "text-gray-600 dark:text-dark-body";
    let message = "";
    let barClass = "bg-gray-400";

    if (diff < -0.01) {
        bgClass = "bg-red-50 dark:bg-red-900/20";
        textClass = "text-red-600 dark:text-red-400";
        message = `Falta Pagar: ${formatCurrency(absDiff)}`;
        barClass = "bg-red-500";
    } else if (diff > 0.01) {
        bgClass = "bg-green-50 dark:bg-green-900/20";
        textClass = "text-green-700 dark:text-green-400";
        message = `Troco: ${formatCurrency(absDiff)}`;
        barClass = "bg-green-500";
    } else {
        bgClass = "bg-green-100 dark:bg-green-900/30";
        textClass = "text-green-800 dark:text-green-300";
        message = "Valor total atingido!";
        barClass = "bg-green-600";
    }

    return (
        <div className={`w-full py-3 px-4 mb-4 rounded-lg flex items-center gap-3 transition-colors duration-300 ${bgClass}`}>
            <div className={`w-1 h-4 rounded-full ${barClass}`}></div>
            <span className={`font-bold text-sm flex-1 ${textClass}`}>
                {message}
            </span>
        </div>
    );
};

// Success Action Card
const SuccessActionCard = ({ icon: Icon, label, onClick }: { icon: any, label: string, onClick?: () => void }) => (
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
);

function PaymentPricingDetailBadge({ calculation, baseAllocated }: { calculation: any; baseAllocated: number }) {
    if (!calculation?.success) return null;
    const base = Math.max(0, Number(baseAllocated || 0));
    const disc = Number(calculation.paymentMethodDiscountAmount || 0);
    const juros = Number(calculation.interestAmount || 0);
    const taxa = Number(calculation.feeAmount || 0);
    const final = Number(calculation.finalAmount || 0);
    return (
        <div className="relative group/payinfo inline-flex shrink-0">
            <Badge variant="gray" icon={<InfoIcon className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />} className="cursor-help" />
            <div className="pointer-events-none absolute bottom-full right-0 z-[120] mb-2 hidden min-w-[240px] max-w-[min(100vw,280px)] rounded-xl border border-brand-border bg-white p-3 text-left text-xs shadow-xl group-hover/payinfo:block dark:border-dark-border dark:bg-dark-surface">
                <div className="mb-2 font-bold text-brand-dark dark:text-dark-heading">Detalhes do meio de pagamento</div>
                <div className="space-y-1.5 text-brand-dark dark:text-dark-heading">
                    <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Subtotal</span><span className="font-semibold">{formatCurrency(base)}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Desc. meio pagamento</span><span className="font-semibold">− {formatCurrency(disc)}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Juros</span><span className="font-semibold">+ {formatCurrency(juros)}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Taxa</span><span className="font-semibold">{formatCurrency(taxa)}</span></div>
                    <div className="mt-2 flex justify-between gap-3 border-t border-brand-border pt-2 font-bold dark:border-dark-border"><span>Total a cobrar</span><span>{formatCurrency(final)}</span></div>
                </div>
            </div>
        </div>
    );
}

function PaymentPricingTooltipBadge({ calculation, baseAllocated }: { calculation: any; baseAllocated: number }) {
    if (!calculation?.success) return null;
    const base = Math.max(0, Number(baseAllocated || 0));
    const disc = Number(calculation.paymentMethodDiscountAmount || 0);
    const juros = Number(calculation.interestAmount || 0);
    const taxa = Number(calculation.feeAmount || 0);
    const final = Number(calculation.finalAmount || 0);

    const rows = [
        { label: 'Subtotal', value: formatCurrency(base) },
        disc > 0 ? { label: 'Desconto', value: `- ${formatCurrency(disc)}` } : null,
        juros > 0 ? { label: 'Juros', value: `+ ${formatCurrency(juros)}` } : null,
        taxa > 0 ? { label: 'Taxa', value: `+ ${formatCurrency(taxa)}` } : null,
        { label: 'Total a cobrar', value: formatCurrency(final), isTotal: true },
    ].filter(Boolean) as Array<{ label: string; value: string; isTotal?: boolean }>;

    return (
        <Tooltip
            text={(
                <div className="min-w-[240px] text-left">
                    <div className="mb-2 font-bold">Detalhes do meio de pagamento</div>
                    <div className="space-y-1.5">
                        {rows.map((row) => (
                            <div
                                key={`${row.label}-${row.value}`}
                                className={cn(
                                    "flex justify-between gap-3",
                                    row.isTotal && "mt-2 border-t border-white/20 pt-2 font-bold dark:border-black/10",
                                )}
                            >
                                <span className={cn(!row.isTotal && "text-white/70 dark:text-black/60")}>{row.label}</span>
                                <span className="font-semibold">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        >
            <span className="inline-flex shrink-0">
                <Badge variant="gray" icon={<InfoIcon className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />} className="cursor-help" />
            </span>
        </Tooltip>
    );
}

function PaymentAmountLabel({
    label,
    calculation,
    baseAllocated,
}: {
    label: string;
    calculation: any;
    baseAllocated: number;
}) {
    return (
        <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{label}</span>
            {calculation?.success && baseAllocated > 0.009 ? (
                <PaymentPricingTooltipBadge calculation={calculation} baseAllocated={baseAllocated} />
            ) : null}
        </div>
    );
}

// --- MAIN COMPONENT ---

type PartnerPaymentMethod = {
    id: string;
    name: string;
    type: string;
    is_active?: boolean;
    fee_percent?: number | null;
    fee_fixed?: number | null;
    fee_bearer?: "merchant" | "customer";
    discount_percent?: number | null;
    max_installments?: number | null;
};

const normalizeMethodType = (value?: string | null) => {
    const raw = String(value || "").toLowerCase().trim();
    if (raw === "cash" || raw === "dinheiro") return "cash";
    if (raw === "pix") return "pix";
    if (["credit_card", "debit_card", "card", "cartao", "cartão", "credito", "debito"].includes(raw)) return "card";
    return "other";
};

/** Props alinhadas entre PDV (`POSPage`) e venda manual (`CreateOrder`) — manter os mesmos significados. */
export type PaymentModalProps = {
    isOpen: boolean
    onClose: () => void
    cart: any[]
    customer?: any
    onConfirm: (payload: any) => Promise<any>
    partnerId: string
    shippingFee?: number
    otherCosts?: number
    /** Soma dos descontos do pedido na tela de origem (em venda manual: desconto manual + cupom). */
    discountAmount?: number
    amountDue?: number
    existingPaidAmount?: number
    existingPaymentBreakdown?: any[]
    lockPaymentCompletion?: boolean
    /** Texto abaixo do nome do cliente (desktop e mobile). */
    headerSubtitle?: string
}

/** Mesmo texto em PDV e venda manual — importe nos pais para garantir paridade. */
export const PAYMENT_MODAL_HEADER_SUBTITLE = "Venda de Itens"

const PaymentModal = ({
    isOpen,
    onClose,
    cart,
    customer,
    onConfirm,
    partnerId,
    shippingFee = 0,
    otherCosts = 0,
    discountAmount = 0,
    amountDue,
    existingPaidAmount = 0,
    existingPaymentBreakdown = [],
    lockPaymentCompletion = false,
    headerSubtitle = PAYMENT_MODAL_HEADER_SUBTITLE,
}: PaymentModalProps) => {
    const { toast } = useToast();
    // Views: methods (main) | method_type_select | money | card | pix | split | split_method_select
    const [view, setView] = useState<string>('methods');
    /** Valor base alocado ao pedido neste meio (antes de desconto/juros/taxa do método); servidor recalcula o líquido a cobrar. */
    const [paymentBaseAmount, setPaymentBaseAmount] = useState<number>(0);
    const [installments, setInstallments] = useState<string>('1');
    const [isReceiptOpen, setIsReceiptOpen] = useState(false);

    // Payment Status State
    const [paymentStatus, setPaymentStatus] = useState<'input' | 'processing' | 'success' | 'error'>('input');
    const [saleId, setSaleId] = useState<string>("");
    const [lastPaymentPayload, setLastPaymentPayload] = useState<any | null>(null);
    const [errorMessage, setErrorMessage] = useState("Não conseguimos concluir a venda agora.");

    // Pix Generation State
    const [isPixGenerated, setIsPixGenerated] = useState(false);

    // Toggles
    const [isPendingPayment, setIsPendingPayment] = useState(false);
    const [isPendingDelivery, setIsPendingDelivery] = useState(false);
    const [cashCalculatorInput, setCashCalculatorInput] = useState("");

    // Split: user-defined base amount per method (not weights / percentages)
    const [payments, setPayments] = useState<{
        id: number
        method: string | null
        paymentMethodId: string | null
        amount: number
        installmentNumber: number
    }[]>([
        { id: 1, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 },
        { id: 2, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 }
    ]);
    const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
    const [selectedMethodType, setSelectedMethodType] = useState<string | null>(null);
    const [editingPaymentIndex, setEditingPaymentIndex] = useState<number | null>(null);
    const [paymentCalculation, setPaymentCalculation] = useState<any | null>(null);
    const [isPaymentCalculationLoading, setIsPaymentCalculationLoading] = useState(false);
    const [isSplitPreviewLoading, setIsSplitPreviewLoading] = useState(false);
    const [splitPreview, setSplitPreview] = useState<
        { success: true; finalTotal: number; rows: any[] } | { success: false; error: string } | null
    >(null);

    /** Valores e itens congelados no momento de confirmar o pagamento (o PDV pode limpar o carrinho antes do estado de sucesso). */
    const [successSnapshot, setSuccessSnapshot] = useState<{
        subTotal: number
        itemCount: number
        shippingFee: number
        otherCosts: number
        discountAmount: number
        total: number
        displayOrderTotal: number
        totalPaid: number
        change: number
        isUnderpaid: boolean
        remainingPartial: number
        paymentMethodDiscountAmount: number
        interestAmount: number
        feeAmount: number
        receiptCart: any[]
    } | null>(null)

    const subTotal = cart.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0);
    const total = subTotal + shippingFee + otherCosts - discountAmount;
    const chargeTarget = Math.max(0, Number(amountDue ?? total));
    const itemCount = cart.reduce((acc: number, item: any) => acc + item.quantity, 0);
    const resetSelectedMethodPricing = (options?: { clearType?: boolean; resetInstallments?: boolean }) => {
        setSelectedMethodId(null);
        setPaymentCalculation(null);
        setIsPaymentCalculationLoading(false);
        setIsPixGenerated(false);
        if (options?.clearType) {
            setSelectedMethodType(null);
        }
        if (options?.resetInstallments !== false) {
            setInstallments('1');
        }
    };

    const formatCalculatorAmount = (value: number) => `R$ ${formatNumber(Math.max(0, Number(value || 0)))}`;
    const parseCalculatorInput = (value: string) => {
        const normalized = String(value || '').trim();
        if (!normalized) return 0;
        if (normalized.includes('.')) {
            const parsed = Number(normalized);
            return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
        }
        const digits = normalized.replace(/\D/g, '');
        return digits ? Number(digits) / 100 : 0;
    };

    // Fetch Partner Payment Methods
    const [availableMethods, setAvailableMethods] = useState<PartnerPaymentMethod[]>([]);
    const activeMethods = useMemo(
        () => (availableMethods || []).filter((method) => method?.is_active !== false),
        [availableMethods],
    );

    useEffect(() => {
        if (!isOpen || !partnerId) return;

        const cacheKey = String(partnerId);
        const versionKey = `${PAYMENT_METHODS_VERSION_PREFIX}${cacheKey}`;
        const cached = paymentMethodsCache.get(cacheKey);
        if (cached?.methods?.length) {
            setAvailableMethods(cached.methods);
        }

        const storedVersion = typeof window !== "undefined" ? window.localStorage.getItem(versionKey) : null;
        const hasVersionChange = Boolean(storedVersion && storedVersion !== cached?.signature);

        if (cached && !hasVersionChange) return;

        getPaymentMethodsAction(partnerId).then(res => {
            if (!res.methods) return;
            const methods = res.methods as PartnerPaymentMethod[];
            setAvailableMethods(methods);
            const signature = buildMethodsSignature(methods);
            paymentMethodsCache.set(cacheKey, { methods, signature });
            if (typeof window !== "undefined") {
                window.localStorage.setItem(versionKey, signature);
            }
        });
    }, [isOpen, partnerId]);

    useEffect(() => {
        if (!partnerId || typeof window === "undefined") return;
        const cacheKey = String(partnerId);
        const versionKey = `${PAYMENT_METHODS_VERSION_PREFIX}${cacheKey}`;

        const refreshOnChange = () => {
            const expectedSignature = window.localStorage.getItem(versionKey);
            const cached = paymentMethodsCache.get(cacheKey);
            if (!expectedSignature || cached?.signature === expectedSignature) return;

            getPaymentMethodsAction(partnerId).then((res) => {
                if (!res.methods) return;
                const methods = res.methods as PartnerPaymentMethod[];
                setAvailableMethods(methods);
                const signature = buildMethodsSignature(methods);
                paymentMethodsCache.set(cacheKey, { methods, signature });
                window.localStorage.setItem(versionKey, signature);
            });
        };

        window.addEventListener(PAYMENT_METHODS_UPDATED_EVENT, refreshOnChange);
        return () => window.removeEventListener(PAYMENT_METHODS_UPDATED_EVENT, refreshOnChange);
    }, [partnerId]);

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setView('methods');
            setPaymentBaseAmount(0);
            setInstallments('1');
            setIsReceiptOpen(false);
            setIsPendingPayment(false);
            setIsPendingDelivery(false);
            setEditingPaymentIndex(null);
            setIsPixGenerated(false);
            setPaymentStatus('input');
            setLastPaymentPayload(null);
            setErrorMessage("Não conseguimos concluir a venda agora.");

            setPayments([
                { id: 1, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 },
                { id: 2, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 }
            ]);
            setSelectedMethodId(null);
            setSelectedMethodType(null);
            setPaymentCalculation(null);
            setIsPaymentCalculationLoading(false);
            setSplitPreview(null);
            setSuccessSnapshot(null);
        }
        // Não depender de `total`: se o pai zerar o carrinho (ex.: PDV) o total cai e apagava a tela de sucesso.
    }, [isOpen]);

    const activeSplitLegs = useMemo(
        () => payments.filter((p) => p.method && p.amount > 0.009),
        [payments],
    );

    /** Base sobre a qual incidem taxas/desconto do método (troco em dinheiro não aumenta o pedido). */
    const basisForMethodCalc = useMemo(() => {
        const raw = Math.max(0, Number(paymentBaseAmount || 0));
        if (view === 'split' || editingPaymentIndex !== null) return raw;
        if (view === 'card' || view === 'pix') return Math.max(0, Number(chargeTarget || 0));
        return Math.min(raw, Math.max(0, Number(chargeTarget || 0)));
    }, [view, editingPaymentIndex, paymentBaseAmount, chargeTarget]);

    useEffect(() => {
        let active = true;
        if (view !== 'split' || !partnerId) {
            if (view !== 'split') setSplitPreview(null);
            setIsSplitPreviewLoading(false);
            return;
        }
        if (activeSplitLegs.length === 0) {
            setSplitPreview(null);
            setIsSplitPreviewLoading(false);
            return;
        }
        const t = setTimeout(() => {
            setIsSplitPreviewLoading(true);
            previewSplitPaymentBreakdownAction({
                partnerId: String(partnerId),
                baseTotal: Math.max(0, Number(chargeTarget || 0)),
                legs: activeSplitLegs.map((p) => ({
                    method: p.method || '—',
                    baseAmount: p.amount,
                    paymentMethodId: p.paymentMethodId,
                    installmentNumber: Math.max(1, p.installmentNumber || 1),
                })),
            }).then((res) => {
                if (!active) return;
                if (res && 'success' in res && res.success) {
                    setSplitPreview({
                        success: true,
                        finalTotal: res.finalTotal,
                        rows: res.rows || [],
                    });
                } else if (res && 'success' in res && !res.success) {
                    setSplitPreview({ success: false, error: String((res as { error?: string }).error || 'Não foi possível calcular.') });
                } else {
                    setSplitPreview(null);
                }
                setIsSplitPreviewLoading(false);
            });
        }, 200);
        return () => {
            active = false;
            clearTimeout(t);
        };
    }, [view, partnerId, chargeTarget, activeSplitLegs, payments]);

    // Auto-fill amount logic
    useEffect(() => {
        if (view === 'money' || view === 'card' || view === 'pix') {
            setIsPixGenerated(false);
            if (editingPaymentIndex !== null) {
                const currentSlot = payments[editingPaymentIndex];
                if (Number(currentSlot.installmentNumber) > 1) {
                    setInstallments(String(currentSlot.installmentNumber));
                }
                if (currentSlot.amount > 0) {
                    setPaymentBaseAmount(Number(currentSlot.amount));
                } else {
                    const otherPaid = payments.reduce((acc, p, idx) => idx !== editingPaymentIndex ? acc + p.amount : acc, 0);
                    const needed = Math.max(0, chargeTarget - otherPaid);
                    setPaymentBaseAmount(needed > 0 ? needed : 0);
                }
            } else {
                setPaymentBaseAmount(Math.max(0, chargeTarget));
            }
        }
    }, [view, editingPaymentIndex, chargeTarget, payments]);

    useEffect(() => {
        if (view !== 'money') return;
        const nextAmount = Math.max(0, Number(paymentBaseAmount || 0));
        const nextInput = nextAmount > 0 ? String(Math.round(nextAmount * 100)) : "";
        setCashCalculatorInput((current) => current === nextInput ? current : nextInput);
    }, [view, paymentBaseAmount]);

    useEffect(() => {
        let active = true;
        if (!selectedMethodId) {
            setPaymentCalculation(null);
            setIsPaymentCalculationLoading(false);
            return;
        }
        const currentViewIsCardLike = view === "card" || view === "pix" || view === "money";
        if (!currentViewIsCardLike) {
            setPaymentCalculation(null);
            setIsPaymentCalculationLoading(false);
            return;
        }
        const installmentNumber = Math.max(1, Number(installments || 1));
        const base = basisForMethodCalc;
        setIsPaymentCalculationLoading(true);
        calculatePaymentMethodAmountsAction({
            originalAmount: base,
            paymentMethodId: selectedMethodId,
            installmentNumber,
        }).then((res: any) => {
            if (!active) return;
            if (res?.success) {
                setPaymentCalculation(res);
            } else {
                setPaymentCalculation(null);
            }
            setIsPaymentCalculationLoading(false);
        });
        return () => {
            active = false;
        };
    }, [selectedMethodId, installments, chargeTarget, view, basisForMethodCalc]);

    useEffect(() => {
        if (editingPaymentIndex !== null) return;
        if ((view !== 'card' && view !== 'pix') || !paymentCalculation?.success) return;
        const nextAmount = Number(paymentCalculation.finalAmount || chargeTarget || 0);
        setPaymentBaseAmount((current) => (Math.abs(Number(current || 0) - nextAmount) < 0.01 ? current : nextAmount));
    }, [view, editingPaymentIndex, paymentCalculation, chargeTarget]);

    const handleQuickDenomination = (val: number) => {
        setCashCalculatorInput(val > 0 ? String(Math.round(val * 100)) : "");
        setPaymentBaseAmount(val);
    };

    const handleCashNumpadInput = (key: string) => {
        const nextRaw = key === '.'
            ? (cashCalculatorInput.includes('.') ? cashCalculatorInput : `${cashCalculatorInput || '0'}.`)
            : `${cashCalculatorInput}${key}`;
        setCashCalculatorInput(nextRaw);
        setPaymentBaseAmount(parseCalculatorInput(nextRaw));
    };

    const handleCashNumpadDelete = () => {
        const nextRaw = cashCalculatorInput.slice(0, -1);
        setCashCalculatorInput(nextRaw);
        setPaymentBaseAmount(parseCalculatorInput(nextRaw));
    };

    const splitBaseSum = useMemo(
        () => payments.reduce((acc, p) => acc + (p.method && p.amount > 0.009 ? p.amount : 0), 0),
        [payments],
    );

    const legFinalCharged =
        paymentCalculation?.success && basisForMethodCalc > 0.009
            ? Number(paymentCalculation.finalAmount || 0)
            : null;

    const allocationTotal = useMemo(() => {
        if (view === 'split') return splitBaseSum;
        if (editingPaymentIndex !== null) {
            const other = payments.reduce((acc, p, idx) => (idx !== editingPaymentIndex ? acc + p.amount : acc), 0);
            return other + paymentBaseAmount;
        }
        return paymentBaseAmount;
    }, [view, splitBaseSum, editingPaymentIndex, payments, paymentBaseAmount]);

    const finalDueForLeg = legFinalCharged != null && Number.isFinite(legFinalCharged) ? legFinalCharged : chargeTarget;

    const { compactAlertPaid, compactAlertNeed } = useMemo(() => {
        if (view === 'split') {
            return { compactAlertPaid: splitBaseSum, compactAlertNeed: chargeTarget };
        }
        if (editingPaymentIndex !== null) {
            return { compactAlertPaid: allocationTotal, compactAlertNeed: chargeTarget };
        }
        if (view === 'money') {
            if (allocationTotal + 0.01 >= chargeTarget) {
                return { compactAlertPaid: paymentBaseAmount, compactAlertNeed: finalDueForLeg };
            }
            return { compactAlertPaid: allocationTotal, compactAlertNeed: chargeTarget };
        }
        if (legFinalCharged != null) {
            return { compactAlertPaid: legFinalCharged, compactAlertNeed: legFinalCharged };
        }
        return { compactAlertPaid: allocationTotal, compactAlertNeed: chargeTarget };
    }, [view, splitBaseSum, chargeTarget, editingPaymentIndex, allocationTotal, paymentBaseAmount, finalDueForLeg, legFinalCharged]);

    const isAllocationUnderpaid =
        (view === 'card' || view === 'pix') && editingPaymentIndex === null && legFinalCharged != null
            ? legFinalCharged < finalDueForLeg - 0.01
            : allocationTotal < chargeTarget - 0.01;
    const isUnderpaid = isAllocationUnderpaid;
    const isOverpaid = view === 'money' && !isAllocationUnderpaid && paymentBaseAmount > finalDueForLeg + 0.01;
    const changeAmount = isOverpaid ? paymentBaseAmount - finalDueForLeg : 0;

    /** Valor efetivo pago / a registrar (líquido do método quando houver cálculo). */
    const totalPaidCalculated = useMemo(() => {
        if (view === 'split' && splitPreview && 'success' in splitPreview && splitPreview.success) {
            return splitPreview.finalTotal;
        }
        if (view === 'split') {
            return splitBaseSum;
        }
        if (editingPaymentIndex !== null) {
            const other = payments.reduce((acc, p, idx) => (idx !== editingPaymentIndex ? acc + p.amount : acc), 0);
            return other + paymentBaseAmount;
        }
        if (view === 'money') return paymentBaseAmount;
        if (legFinalCharged != null) return legFinalCharged;
        return paymentBaseAmount;
    }, [view, splitPreview, splitBaseSum, editingPaymentIndex, payments, paymentBaseAmount, legFinalCharged]);

    const currentPricingTotals = useMemo(() => {
        if (view === 'split' && splitPreview && 'success' in splitPreview && splitPreview.success) {
            const rows = splitPreview.rows || [];
            return {
                paymentMethodDiscountAmount: rows.reduce((acc: number, row: any) => acc + Number(row?.paymentMethodDiscountAmount || 0), 0),
                interestAmount: rows.reduce((acc: number, row: any) => acc + Number(row?.interestAmount || 0), 0),
                feeAmount: rows.reduce((acc: number, row: any) => acc + Number(row?.feeAmount || 0), 0),
            };
        }
        if (paymentCalculation?.success) {
            return {
                paymentMethodDiscountAmount: Number(paymentCalculation.paymentMethodDiscountAmount || 0),
                interestAmount: Number(paymentCalculation.interestAmount || 0),
                feeAmount: Number(paymentCalculation.feeAmount || 0),
            };
        }
        return {
            paymentMethodDiscountAmount: 0,
            interestAmount: 0,
            feeAmount: 0,
        };
    }, [view, splitPreview, paymentCalculation]);

    const displayTransactionTotal = paymentStatus === "success" && successSnapshot
        ? successSnapshot.displayOrderTotal
        : view === 'split' && splitPreview && 'success' in splitPreview && splitPreview.success
            ? splitPreview.finalTotal
            : (view === 'money' || view === 'card' || view === 'pix') && legFinalCharged != null
                ? legFinalCharged
                : total;

    const receiptPricingDetails = useMemo(() => {
        const source = paymentStatus === "success" && successSnapshot
            ? {
                paymentMethodDiscountAmount: successSnapshot.paymentMethodDiscountAmount,
                interestAmount: successSnapshot.interestAmount,
                feeAmount: successSnapshot.feeAmount,
            }
            : currentPricingTotals;

        return [
            source.paymentMethodDiscountAmount > 0 ? { label: 'Desc. meio pagamento', amount: source.paymentMethodDiscountAmount, prefix: '-', tone: 'positive' } : null,
            source.interestAmount > 0 ? { label: 'Juros', amount: source.interestAmount, prefix: '+', tone: 'neutral' } : null,
            source.feeAmount > 0 ? { label: 'Taxas', amount: source.feeAmount, tone: 'neutral' } : null,
        ].filter(Boolean);
    }, [paymentStatus, successSnapshot, currentPricingTotals]);

    const receiptView = successSnapshot
        ? {
            cart: successSnapshot.receiptCart,
            subTotal: successSnapshot.subTotal,
            itemCount: successSnapshot.itemCount,
            shippingFee: successSnapshot.shippingFee,
            otherCosts: successSnapshot.otherCosts,
            discountAmount: successSnapshot.discountAmount,
            total: successSnapshot.displayOrderTotal,
        }
        : { cart, subTotal, itemCount, shippingFee, otherCosts, discountAmount, total: displayTransactionTotal };

    const getTitle = () => {
        const selectedTypeLabel =
            selectedMethodType === "pix" ? "Pix" :
                selectedMethodType === "cash" ? "Dinheiro" :
                    selectedMethodType === "card" ? "Cartão" : "Método";
        switch (view) {
            case 'methods': return 'Método de Pagamento';
            case 'method_type_select': return `Selecionar ${selectedTypeLabel}`;
            case 'money': return 'Dinheiro';
            case 'card': return 'Cartão';
            case 'pix': return 'Pix';
            case 'split': return 'Dividir Pagamento';
            case 'split_method_select': return 'Selecionar Método';
            default: return 'Pagamento';
        }
    };

    const handleGoBack = () => {
        if (view === 'money' || view === 'card' || view === 'pix') {
            resetSelectedMethodPricing();
            if (editingPaymentIndex !== null) {
                setView('split_method_select');
            } else {
                setView('methods');
            }
        } else if (view === 'split_method_select') {
            resetSelectedMethodPricing({ resetInstallments: false });
            setView('split');
            setEditingPaymentIndex(null);
        } else if (view === 'method_type_select') {
            resetSelectedMethodPricing({ clearType: true });
            setView('methods');
        } else if (view === 'split') {
            resetSelectedMethodPricing({ clearType: true });
            setView('methods');
        } else {
            resetSelectedMethodPricing({ clearType: true });
            setView('methods');
        }
    };

    const handleSplitPaymentUpdate = (newAmount: number) => {
        if (editingPaymentIndex !== null) {
            const inst = view === 'card' ? Math.max(1, parseInt(String(installments), 10) || 1) : 1;
            const newPayments = [...payments];
            newPayments[editingPaymentIndex] = {
                ...newPayments[editingPaymentIndex],
                amount: newAmount,
                installmentNumber: inst,
            };
            setPayments(newPayments);
            setView('split');
            setEditingPaymentIndex(null);
        }
    };

    const handleMethodSelectionInSplit = (method: PartnerPaymentMethod) => {
        if (editingPaymentIndex !== null) {
            const newPayments = [...payments];
            newPayments[editingPaymentIndex] = {
                ...newPayments[editingPaymentIndex],
                method: method.name,
                paymentMethodId: method.id,
            };
            setPayments(newPayments);
            setPaymentCalculation(null);
            setSelectedMethodId(method.id);
            setInstallments(String(newPayments[editingPaymentIndex]?.installmentNumber || 1));
            const normalizedType = normalizeMethodType(method.type);
            if (normalizedType === 'cash') setView('money');
            else if (normalizedType === 'pix') setView('pix');
            else setView('card');
        }
    };

    const openMethodTypeSelection = (methodType: "cash" | "pix" | "card") => {
        resetSelectedMethodPricing({ clearType: false });
        const methodsOfType = activeMethods.filter((method) => normalizeMethodType(method.type) === methodType);
        if (methodsOfType.length === 0) {
            toast({
                title: "Sem métodos ativos",
                description: `Nenhum método ${methodType === "cash" ? "de dinheiro" : methodType === "pix" ? "de PIX" : "de cartão"} ativo encontrado.`,
                variant: "destructive",
            });
            return;
        }
        if (methodsOfType.length === 1) {
            const only = methodsOfType[0];
            setSelectedMethodId(only.id);
            setPaymentCalculation(null);
            setView(methodType === "cash" ? "money" : methodType === "pix" ? "pix" : "card");
            return;
        }
        setSelectedMethodType(methodType);
        setView("method_type_select");
    };

    const buildConfirmPayload = () => {
        const splitFinalCharged =
            view === 'split' && splitPreview && 'success' in splitPreview && splitPreview.success
                ? splitPreview.finalTotal
                : null;

        const newPaymentBreakdown = isPendingPayment
            ? []
            : view === 'split'
                ? payments
                    .filter((payment) => payment.method && payment.amount > 0.009)
                    .map((payment) => ({
                        method: normalizePaymentMethodLabel(payment.method),
                        amount: Number(payment.amount || 0),
                        paymentMethodId: payment.paymentMethodId || null,
                        installmentNumber: Math.max(1, Number(payment.installmentNumber || 1)),
                    }))
                : [{
                    method: normalizePaymentMethodLabel(activeMethods.find((method) => method.id === selectedMethodId)?.name || (view === 'money' ? 'dinheiro' : (view === 'pix' ? 'pix' : 'cartao'))),
                    amount: Number(paymentBaseAmount || 0),
                    paymentMethodId: selectedMethodId || null,
                    installmentNumber: Math.max(1, Number(installments || 1)),
                }];

        const mergedPaymentBreakdown = [...(existingPaymentBreakdown || []), ...newPaymentBreakdown]
            .filter((entry: any) => entry?.method && Number(entry?.amount || 0) > 0.009);

        const paymentMethod = isPendingPayment
            ? 'pendente'
            : Array.from(new Set(mergedPaymentBreakdown.map((entry: any) => normalizePaymentMethodLabel(entry.method)))).join(', ');

        const singleRegisterAmount =
            view !== 'split' && paymentCalculation?.success && legFinalCharged != null && Number.isFinite(legFinalCharged)
                ? legFinalCharged
                : view !== 'split'
                    ? Number(paymentBaseAmount || 0)
                    : 0;

        const paidToRegister =
            isPendingPayment
                ? existingPaidAmount
                : (existingPaidAmount + (splitFinalCharged != null ? splitFinalCharged : singleRegisterAmount));

        return {
            paymentMethod: paymentMethod || 'pendente',
            paymentBreakdown: mergedPaymentBreakdown,
            splitPayments: view === 'split' ? payments : [],
            paymentStatus: isPendingPayment ? 'unpaid' : (isUnderpaid ? 'partially_paid' : 'paid'),
            isPendingDelivery,
            paidAmount: paidToRegister
        };
    };

    const handleStartProcessing = async (forcedPayload?: any) => {
        const remainingPartial = Math.max(0, displayTransactionTotal - totalPaidCalculated)
        setSuccessSnapshot({
            subTotal,
            itemCount,
            shippingFee: Number(shippingFee || 0),
            otherCosts: Number(otherCosts || 0),
            discountAmount: Number(discountAmount || 0),
            total,
            displayOrderTotal: !isUnderpaid ? totalPaidCalculated : chargeTarget,
            totalPaid: totalPaidCalculated,
            change: changeAmount,
            isUnderpaid,
            remainingPartial,
            paymentMethodDiscountAmount: Number(currentPricingTotals.paymentMethodDiscountAmount || 0),
            interestAmount: Number(currentPricingTotals.interestAmount || 0),
            feeAmount: Number(currentPricingTotals.feeAmount || 0),
            receiptCart: Array.isArray(cart) ? cart.map((row: any) => ({ ...row })) : [],
        })
        setPaymentStatus('processing');
        const payload = forcedPayload || buildConfirmPayload();
        setLastPaymentPayload(payload);

        try {
            const result = await onConfirm(payload);

            if (result?.success) {
                setSaleId(result.orderNumber || "DDT000000");
                setPaymentStatus('success');
            } else {
                setSuccessSnapshot(null);
                setErrorMessage(result?.error || "Ocorreu um problema ao concluir o pagamento. Você pode tentar novamente.");
                setPaymentStatus('error');
            }
        } catch (error) {
            setSuccessSnapshot(null);
            setErrorMessage("Ocorreu um problema inesperado ao concluir o pagamento. Você pode tentar novamente.");
            setPaymentStatus('error');
        }
    };

    const handleFinishSale = () => {
        setSuccessSnapshot(null);
        onClose();
    };

    // --- STANDARD ANIMATION CONFIGURATION ---
    const standardTransition = { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const };

    const contentVariants = {
        initial: { opacity: 0, x: 20 },
        animate: { opacity: 1, x: 0, transition: standardTransition },
        exit: { opacity: 0, x: -20, transition: standardTransition }
    };

    const stateVariants = {
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1, transition: standardTransition },
        exit: { opacity: 0, scale: 0.95, transition: standardTransition }
    };

    const footerMobileTotal = displayTransactionTotal;

    if (!isOpen) return null;
    const isCloseLocked = paymentStatus === 'processing';
    const handleSafeClose = () => {
        if (isCloseLocked) return;
        onClose();
    };
    const isSinglePricingBusy =
        (view === 'money' || view === 'card' || view === 'pix') &&
        !!selectedMethodId &&
        isPaymentCalculationLoading;
    const isSplitPricingBusy = view === 'split' && activeSplitLegs.length > 0 && isSplitPreviewLoading;

    const ActionFooter = ({ showConfirm = true, confirmText = "Registrar venda", disabled = false, disabledText = "Verifique os valores", buttonVariant = 'default', onCustomConfirm }: any) => (
        <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30">
            <div
                className="md:hidden flex items-center justify-between mb-4 cursor-pointer active:opacity-70 transition-opacity"
                onClick={() => setIsReceiptOpen(true)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                        <ChevronUpIcon size={18} />
                    </div>
                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Ver Detalhes do Pedido</span>
                </div>
                <span className="font-black text-xl text-brand-dark dark:text-dark-heading">{formatCurrency(footerMobileTotal)}</span>
            </div>

            {showConfirm && (
                <Button
                    variant={buttonVariant}
                    disabled={disabled}
                    onClick={() => {
                        if (onCustomConfirm) onCustomConfirm();
                        else {
                            handleStartProcessing();
                        }
                    }}
                    className="w-full h-[52px]"
                >
                    {disabled ? disabledText : confirmText}
                </Button>
            )}
        </div>
    );

    const getIconForMethod = (method: string | null, paymentMethodId?: string | null) => {
        const resolvedType = normalizeMethodType(activeMethods.find((m) => m.id === paymentMethodId)?.type || method);
        if (resolvedType === 'cash') return MoneyIcon;
        if (resolvedType === 'pix') return QRCodeIcon;
        if (resolvedType === 'card') return CreditCardIcon;
        return PlusIcon;
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleSafeClose} />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={standardTransition}
                className="relative bg-white dark:bg-dark-surface w-full h-full md:h-[85vh] md:max-w-[1100px] md:rounded-3xl flex flex-col md:flex-row overflow-hidden z-10"
            >
                {/* --- LEFT COLUMN: RECEIPT (Desktop Only) --- */}
                <div className="hidden md:flex w-[40%] bg-white dark:bg-dark-surface p-8 flex-col relative z-20 border-r border-brand-border dark:border-dark-border">
                    <div className="mb-6 h-10 flex items-center">
                        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Resumo</h2>
                    </div>

                    {/* Customer Info Section */}
                    <div className="flex items-start justify-between mb-8">
                        <div className="flex gap-4">
                            <div className="w-12 h-12 bg-brand-dark rounded-full flex items-center justify-center text-white font-medium text-lg shrink-0">
                                {customer?.name?.substring(0, 2).toUpperCase() || 'CF'}
                            </div>
                            <div className="flex flex-col overflow-hidden">
                                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[180px]">{customer?.name || 'Consumidor Final'}</span>
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">{headerSubtitle}</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end text-right">
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">{formatDate(new Date())}</span>
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">{formatTime(new Date())}</span>
                        </div>
                    </div>

                    {/* Receipt Card */}
                    <div className="relative w-full flex-1 min-h-0 flex flex-col rounded-2xl">
                        <ReceiptContent
                            cart={receiptView.cart}
                            subTotal={receiptView.subTotal}
                            shippingFee={receiptView.shippingFee}
                            otherCosts={receiptView.otherCosts}
                            discountAmount={receiptView.discountAmount}
                            total={receiptView.total}
                            itemCount={receiptView.itemCount}
                            customerName={customer?.name}
                            pricingDetails={receiptPricingDetails}
                        />
                    </div>
                </div>

                {/* --- RIGHT COLUMN: PAYMENT INPUTS --- */}
                <div className="w-full md:w-[60%] bg-white dark:bg-dark-surface flex flex-col relative h-full">

                    {/* Header */}
                    {paymentStatus === 'input' && (
                        <div className="px-6 py-6 md:px-10 md:pt-10 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3 overflow-hidden">
                                {view !== 'methods' && (
                                    <motion.button
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={standardTransition}
                                        onClick={handleGoBack}
                                        className="w-10 h-10 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center text-brand-dark dark:text-dark-heading hover:bg-gray-200 dark:hover:bg-dark-border transition-colors shrink-0"
                                    >
                                        <ChevronLeftIcon size={20} />
                                    </motion.button>
                                )}
                                <motion.h2
                                    key={getTitle()}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={standardTransition}
                                    className="text-2xl font-bold text-brand-dark dark:text-dark-heading truncate"
                                >
                                    {getTitle()}
                                </motion.h2>
                            </div>
                            <button onClick={handleSafeClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading hover:bg-gray-200 transition-colors">
                                <XIcon size={20} />
                            </button>
                        </div>
                    )}

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-32 md:pb-10 relative custom-scrollbar">
                        <AnimatePresence mode="wait">

                            {/* === STATE: INPUT (Normal Payment Flow) === */}
                            {paymentStatus === 'input' && (
                                <motion.div
                                    key="input-container"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={standardTransition}
                                    className="h-full"
                                >
                                    {view === 'methods' && (
                                        <motion.div key="methods" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="w-full h-full flex flex-col">
                                            {/* Mobile Customer Info */}
                                            <div className="md:hidden flex items-start justify-between mb-6 px-1">
                                                <div className="flex gap-4">
                                                    <div className="w-12 h-12 bg-brand-dark rounded-full flex items-center justify-center text-white font-medium text-lg shrink-0">
                                                        {customer?.name?.substring(0, 2).toUpperCase() || 'CB'}
                                                    </div>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[150px]">{customer?.name || 'Consumidor Final'}</span>
                                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">{headerSubtitle}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end text-right">
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">{formatDate(new Date())}</span>
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">{formatTime(new Date())}</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <PaymentMethodCard icon={MoneyIcon} label="Dinheiro" onClick={() => openMethodTypeSelection("cash")} />
                                                <PaymentMethodCard icon={QRCodeIcon} label="Pix" onClick={() => openMethodTypeSelection("pix")} />
                                                <PaymentMethodCard icon={CreditCardIcon} label="Cartão" onClick={() => openMethodTypeSelection("card")} />
                                                <PaymentMethodCard icon={SplitIcon} label="Dividir" onClick={() => { resetSelectedMethodPricing({ clearType: true }); setView('split'); }} />
                                            </div>

                                            <div className="border-t border-brand-border dark:border-dark-border my-6"></div>

                                            {!lockPaymentCompletion && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                                    <div
                                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${isPendingPayment ? 'border-brand-green bg-green-50/20 dark:bg-green-900/10' : 'border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/20'}`}
                                                        onClick={() => setIsPendingPayment(!isPendingPayment)}
                                                    >
                                                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                                                            <ClockIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                        </div>
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">Pendente de pagamento</span>
                                                        <div className="ml-auto pointer-events-none">
                                                            <Checkbox checked={isPendingPayment} onChange={() => { }} name="pendingPay" />
                                                        </div>
                                                    </div>

                                                    <div
                                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${isPendingDelivery ? 'border-brand-green bg-green-50/20 dark:bg-green-900/10' : 'border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/20'}`}
                                                        onClick={() => setIsPendingDelivery(!isPendingDelivery)}
                                                    >
                                                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                                                            <TruckIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                        </div>
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">Pendente de entrega</span>
                                                        <div className="ml-auto pointer-events-none">
                                                            <Checkbox checked={isPendingDelivery} onChange={() => { }} name="pendingDel" />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}

                                    {view === 'money' && (
                                        <motion.div key="money" variants={contentVariants} initial="initial" animate="animate" exit="exit" className={cn("w-full h-full flex flex-col items-center px-2", isSinglePricingBusy && "pointer-events-none opacity-60")}>
                                            <CompactPaymentStatusAlert totalPaid={compactAlertPaid} totalNeed={compactAlertNeed} />
                                            <div className="w-full max-w-sm space-y-3">
                                                <div className="rounded-[28px] bg-white px-4 pt-2 pb-4 dark:bg-dark-surface">
                                                    <PaymentAmountLabel
                                                        label="Valor recebido (dinheiro)"
                                                        calculation={paymentCalculation}
                                                        baseAllocated={basisForMethodCalc}
                                                    />
                                                    <div className="text-center text-[42px] font-black tracking-tight text-brand-dark dark:text-dark-heading">
                                                        {formatCalculatorAmount(paymentBaseAmount)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap justify-center gap-3 mb-6 mt-4 w-full px-2">
                                                {[5, 10, 20, 50, 100].map((amt) => (
                                                    <button
                                                        key={amt}
                                                        type="button"
                                                        onClick={() => handleQuickDenomination(amt)}
                                                        className="px-5 py-3 bg-gray-100 dark:bg-dark-border/30 rounded-xl text-sm font-bold text-brand-dark dark:text-dark-heading hover:bg-gray-200 dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border flex-grow-0 min-w-[70px] h-auto"
                                                    >
                                                        R$ {amt}
                                                    </button>
                                                ))}
                                            </div>
                                            {isSinglePricingBusy && (
                                                <div className="mb-4 flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
                                                    Calculando valor a cobrar...
                                                </div>
                                            )}
                                            <Numpad onInput={handleCashNumpadInput} onDelete={handleCashNumpadDelete} />
                                        </motion.div>
                                    )}

                                    {view === 'pix' && (
                                        <motion.div key="pix" variants={contentVariants} initial="initial" animate="animate" exit="exit" className={cn("flex flex-col items-center justify-start pt-0 w-full", isSinglePricingBusy && "pointer-events-none opacity-60")}>
                                            <div className="w-full max-w-sm space-y-4">
                                                <CompactPaymentStatusAlert totalPaid={compactAlertPaid} totalNeed={compactAlertNeed} />
                                                <div className="min-w-0 flex-1">
                                                    <PaymentAmountLabel
                                                        label="Valor a receber"
                                                        calculation={paymentCalculation}
                                                        baseAllocated={basisForMethodCalc}
                                                    />
                                                    <MoneyInput
                                                        value={paymentBaseAmount}
                                                        onChange={setPaymentBaseAmount}
                                                        className="font-bold text-lg"
                                                    />
                                                </div>
                                                {isSinglePricingBusy && (
                                                    <div className="flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
                                                        Calculando valor a cobrar...
                                                    </div>
                                                )}
                                                {!isPixGenerated ? (
                                                    <Button variant="filled" className="w-full h-12" onClick={() => setIsPixGenerated(true)}>Gerar QR Code</Button>
                                                ) : (
                                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={standardTransition} className="flex flex-col items-center">
                                                        <div className="bg-white p-6 rounded-3xl border border-brand-border mb-8 shadow-sm">
                                                            <QRCodeIcon size={180} className="text-brand-dark" />
                                                        </div>
                                                        <div className="w-full relative">
                                                            <input type="text" readOnly value="00020126580014br.gov.bcb.pix0136123e4567..." className="w-full pl-4 pr-12 py-4 rounded-xl bg-gray-100 dark:bg-dark-border/30 text-sm text-brand-inactive-text border border-transparent focus:border-brand-green outline-none font-medium" />
                                                            <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-200 dark:hover:bg-dark-border/50 rounded-lg transition-colors text-brand-dark dark:text-dark-heading">
                                                                <CopyIcon size={18} />
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}

                                    {view === 'card' && (
                                        <motion.div key="card" variants={contentVariants} initial="initial" animate="animate" exit="exit" className={cn("flex flex-col items-center justify-start pt-6 w-full max-w-sm mx-auto", isSinglePricingBusy && "pointer-events-none opacity-60")}>
                                            <CompactPaymentStatusAlert totalPaid={compactAlertPaid} totalNeed={compactAlertNeed} />
                                            <div className="mb-8 text-center">
                                                <div className="w-24 h-24 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-100 dark:border-green-900/30">
                                                    <CreditCardIcon size={40} className="text-green-600 dark:text-green-400" />
                                                </div>
                                                <div className="text-4xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                                                    {formatCurrency(legFinalCharged != null ? legFinalCharged : chargeTarget)}
                                                </div>
                                                <p className="text-brand-inactive-text">Aguardando leitura do cartão...</p>
                                            </div>
                                            <div className="w-full text-left space-y-4">
                                                <div className="min-w-0 flex-1">
                                                    <PaymentAmountLabel
                                                        label="Valor a receber"
                                                        calculation={paymentCalculation}
                                                        baseAllocated={basisForMethodCalc}
                                                    />
                                                    <MoneyInput
                                                        value={paymentBaseAmount}
                                                        onChange={setPaymentBaseAmount}
                                                        className="font-bold text-lg"
                                                    />
                                                </div>
                                                <Input label="Parcelas" name="installments" type="number" value={installments} onChange={(e: any) => setInstallments(e.target.value)} min="1" className="w-full text-lg font-bold" />
                                                {isSinglePricingBusy && (
                                                    <div className="flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
                                                        Calculando valor a cobrar...
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}

                                    {view === 'split' && (
                                        <motion.div key="split" variants={contentVariants} initial="initial" animate="animate" exit="exit" className={cn("flex flex-col w-full h-full", isSplitPricingBusy && "pointer-events-none opacity-60")}>
                                            <div className="flex-1 px-2 py-4">
                                                <CompactPaymentStatusAlert totalPaid={compactAlertPaid} totalNeed={compactAlertNeed} />
                                                {isSplitPricingBusy && (
                                                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
                                                        Calculando valores por meio de pagamento...
                                                    </div>
                                                )}
                                                {splitPreview && !splitPreview.success && (
                                                    <p className="text-sm text-red-600 dark:text-red-400 mb-3" role="alert">
                                                        {splitPreview.error}
                                                    </p>
                                                )}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {payments.map((p, idx) => {
                                                        const li = activeSplitLegs.findIndex((l) => l.id === p.id);
                                                        const pr = splitPreview && 'success' in splitPreview && splitPreview.success && li >= 0
                                                            ? (splitPreview.rows[li] as { finalAmount: number; paymentMethodDiscountAmount?: number; interestAmount?: number; feeAmount?: number })
                                                            : null;
                                                        const sub: string[] = [];
                                                        if (pr) {
                                                            if (Number(pr.paymentMethodDiscountAmount || 0) > 0) sub.push(`Desc. meio −${formatCurrency(pr.paymentMethodDiscountAmount || 0)}`);
                                                            if (Number(pr.interestAmount || 0) > 0) sub.push(`+ juros ${formatCurrency(pr.interestAmount || 0)}`);
                                                            if (Number(pr.feeAmount || 0) > 0) sub.push(`taxa (estim.) ${formatCurrency(pr.feeAmount || 0)}`);
                                                        }
                                                        const showFinal = pr != null && Math.abs(pr.finalAmount - p.amount) > 0.005;
                                                        return (
                                                            <SplitPaymentCard
                                                                key={p.id}
                                                                icon={getIconForMethod(p.method, p.paymentMethodId)}
                                                                label={p.method || "Selecionar método"}
                                                                amount={formatCurrency(p.amount)}
                                                                recalculatedAmount={showFinal ? formatCurrency(pr!.finalAmount) : undefined}
                                                                subLabel={sub.length ? sub.join(" · ") : undefined}
                                                                onClick={() => { setEditingPaymentIndex(idx); setView('split_method_select'); }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                                {splitPreview && 'success' in splitPreview && splitPreview.success && (
                                                    <div className="mt-4 flex flex-col sm:flex-row sm:items-baseline sm:justify-end gap-1 sm:gap-2 border-t border-brand-border dark:border-dark-border pt-4 text-right">
                                                        <span className="text-sm text-brand-inactive-text">Total base (pedido):</span>
                                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(chargeTarget)}</span>
                                                        <span className="text-sm text-brand-inactive-text sm:ml-2">Total a cobrar:</span>
                                                        <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(splitPreview.finalTotal)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}

                                    {view === 'split_method_select' && (
                                        <motion.div key="split_method_select" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="w-full">
                                            <h3 className="text-sm font-bold text-brand-inactive-text mb-4 tracking-wide uppercase">Selecione o método</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                {activeMethods.map((method) => {
                                                    const normalizedType = normalizeMethodType(method.type);
                                                    const MethodIcon = normalizedType === "cash"
                                                        ? MoneyIcon
                                                        : normalizedType === "pix"
                                                            ? QRCodeIcon
                                                            : normalizedType === "card"
                                                                ? CreditCardIcon
                                                                : MoreHorizontalIcon;
                                                    return (
                                                        <PaymentMethodCard
                                                            key={`split-${method.id}`}
                                                            icon={MethodIcon}
                                                            label={method.name}
                                                            onClick={() => handleMethodSelectionInSplit(method)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}

                                    {view === 'method_type_select' && (
                                        <motion.div key="method_type_select" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="w-full">
                                            <h3 className="text-sm font-bold text-brand-inactive-text mb-4 tracking-wide uppercase">Selecione um método</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                {activeMethods
                                                    .filter((method) => normalizeMethodType(method.type) === selectedMethodType)
                                                    .map((method) => {
                                                        const normalizedType = normalizeMethodType(method.type);
                                                        const MethodIcon = normalizedType === "cash"
                                                            ? MoneyIcon
                                                            : normalizedType === "pix"
                                                                ? QRCodeIcon
                                                                : CreditCardIcon;
                                                        const targetView = normalizedType === "cash" ? "money" : normalizedType === "pix" ? "pix" : "card";
                                                        return (
                                                            <PaymentMethodCard
                                                                key={`single-${method.id}`}
                                                                icon={MethodIcon}
                                                                label={method.name}
                                                                onClick={() => {
                                                                    setPaymentCalculation(null);
                                                                    setSelectedMethodId(method.id);
                                                                    setView(targetView);
                                                                }}
                                                            />
                                                        );
                                                    })}
                                            </div>
                                        </motion.div>
                                    )}
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
                                    className="w-full h-full flex flex-col items-center justify-center p-8 text-center"
                                >
                                    <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-brand-green to-[#10b981] flex items-center justify-center mb-6 relative">
                                        <div className="absolute inset-0 rounded-full bg-white opacity-20 animate-ping"></div>
                                        <MoneyIcon size={56} className="text-white" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Processando venda...</h2>
                                    <p className="text-brand-inactive-text dark:text-dark-body">Por favor, aguarde enquanto finalizamos o pedido no sistema.</p>
                                </motion.div>
                            )}

                            {paymentStatus === 'error' && (
                                <motion.div
                                    key="error"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={standardTransition}
                                    className="w-full h-full flex flex-col items-center justify-center p-8 text-center"
                                >
                                    <div className="w-32 h-32 rounded-full bg-brand-red flex items-center justify-center mb-6 relative">
                                        <div className="absolute inset-0 rounded-full bg-brand-red"></div>
                                        <CancelCircleIcon size={56} className="text-white" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Não foi possível concluir a venda</h2>
                                    <p className="text-brand-inactive-text dark:text-dark-body max-w-md">{errorMessage}</p>
                                </motion.div>
                            )}

                            {/* === STATE: SUCCESS === */}
                            {paymentStatus === 'success' && (
                                <motion.div
                                    key="success"
                                    variants={stateVariants}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className="w-full h-full flex flex-col p-6 md:p-10 overflow-y-auto custom-scrollbar"
                                >
                                    {/* Success Header */}
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 shrink-0">
                                            <CheckCircleIcon size={32} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                                Venda nº {saleId}
                                            </h2>
                                            <p className="text-brand-inactive-text dark:text-dark-body font-medium text-md">Finalizada com sucesso</p>
                                        </div>
                                    </div>

                                    {/* Warning for Partial */}
                                    {successSnapshot?.isUnderpaid && (
                                        <div className="mb-6">
                                            <div className="w-full py-3 px-4 rounded-lg flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/20 transition-colors duration-300 border border-yellow-100 dark:border-yellow-900/30">
                                                <div className="w-1 h-4 rounded-full bg-yellow-500"></div>
                                                <span className="font-bold text-sm flex-1 text-yellow-700 dark:text-yellow-400">
                                                    Venda paga parcialmente, restante a pagar: {formatCurrency(successSnapshot.remainingPartial)}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Stats Row */}
                                    <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 mb-10 mt-4 border-l-4 border-brand-dark dark:border-dark-heading pl-6">
                                        <div>
                                            <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">Total da venda</span>
                                            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(successSnapshot ? successSnapshot.displayOrderTotal : !isUnderpaid ? totalPaidCalculated : chargeTarget)}</div>
                                        </div>
                                        <div>
                                            <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">Total recebido</span>
                                            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(successSnapshot ? successSnapshot.totalPaid : totalPaidCalculated)}</div>
                                        </div>
                                        {(successSnapshot ? successSnapshot.change : changeAmount) > 0 && (
                                            <div>
                                                <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">Troco</span>
                                                <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(successSnapshot ? successSnapshot.change : changeAmount)}</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Cards Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                                        <SuccessActionCard
                                            icon={FileIcon}
                                            label="Imprimir recibo"
                                            onClick={() => { }}
                                        />
                                        <SuccessActionCard
                                            icon={PrinterIcon}
                                            label="Imprimir NFC-e"
                                            onClick={() => { }}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Fixed Bottom Bar: Confirm & Footer */}
                    {paymentStatus === 'input' && (
                        <div className="relative">
                            {/* 1. Main View (Methods) Footer Logic */}
                            {view === 'methods' && (
                                isPendingPayment ? (
                                    <ActionFooter showConfirm={true} />
                                ) : (
                                    <ActionFooter showConfirm={false} />
                                )
                            )}

                            {/* 2. Split View Footer Logic */}
                            {view === 'split' && (
                                <ActionFooter
                                    showConfirm={true}
                                    confirmText={isUnderpaid ? "Registrar venda parcialmente" : "Registrar venda"}
                                    disabledText={isSplitPricingBusy ? "Calculando valores..." : "Verifique os valores"}
                                    buttonVariant={isUnderpaid ? "outline" : "filled"}
                                    disabled={
                                        isSplitPricingBusy || (
                                            activeSplitLegs.length > 0 &&
                                            splitPreview != null &&
                                            'success' in splitPreview &&
                                            !splitPreview.success
                                        )
                                    }
                                />
                            )}

                            {/* 3. Input Views (Money, Card, Pix) Footer Logic */}
                            {(view === 'money' || view === 'card' || view === 'pix') && (
                                <ActionFooter
                                    showConfirm={true}
                                    confirmText={
                                        editingPaymentIndex !== null
                                            ? "Salvar"
                                            : (isUnderpaid ? "Salvar Parcialmente" : "Registrar Venda")
                                    }
                                    disabledText={isSinglePricingBusy ? "Calculando valores..." : "Verifique os valores"}
                                    buttonVariant={
                                        editingPaymentIndex !== null
                                            ? "filled"
                                            : (isUnderpaid ? "outline" : "default")
                                    }
                                    disabled={isSinglePricingBusy}
                                    onCustomConfirm={editingPaymentIndex !== null ? () => handleSplitPaymentUpdate(Number(paymentBaseAmount || 0)) : undefined}
                                />
                            )}

                            {/* 4. Split Method Select Footer */}
                            {(view === 'split_method_select' || view === 'method_type_select') && (
                                <ActionFooter showConfirm={false} />
                            )}
                        </div>
                    )}

                    {/* Fixed Bottom Bar: Success View */}
                    {paymentStatus === 'success' && (
                        <ActionFooter
                            showConfirm={true}
                            confirmText="Finalizar"
                            buttonVariant="default"
                            onCustomConfirm={handleFinishSale}
                        />
                    )}
                    {paymentStatus === 'error' && (
                        <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30 flex gap-3">
                            <Button variant="outline" className="flex-1 h-[52px]" onClick={handleSafeClose}>
                                Cancelar
                            </Button>
                            <Button className="flex-1 h-[52px]" onClick={() => handleStartProcessing(lastPaymentPayload)}>
                                Tentar novamente
                            </Button>
                        </div>
                    )}
                </div>

                {/* --- MOBILE BOTTOM SHEET RECEIPT --- */}
                <AnimatePresence>
                    {isReceiptOpen && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 bg-black/60 z-[70] md:hidden"
                                onClick={() => setIsReceiptOpen(false)}
                            />
                            <motion.div
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                className="fixed bottom-0 left-0 right-0 h-[85vh] bg-white dark:bg-dark-surface z-[80] rounded-t-3xl flex flex-col overflow-hidden md:hidden shadow-2xl"
                            >
                                <div className="flex justify-between items-center p-6 border-b border-brand-border dark:border-dark-border">
                                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Resumo do Pedido</h3>
                                    <button onClick={() => setIsReceiptOpen(false)} className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-dark-border/50 rounded-full">
                                        <ChevronDownIcon size={20} />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                                    <ReceiptContent
                                        cart={receiptView.cart}
                                        subTotal={receiptView.subTotal}
                                        shippingFee={receiptView.shippingFee}
                                        otherCosts={receiptView.otherCosts}
                                        discountAmount={receiptView.discountAmount}
                                        total={receiptView.total}
                                        itemCount={receiptView.itemCount}
                                        customerName={customer?.name}
                                        pricingDetails={receiptPricingDetails}
                                    />
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

            </motion.div>
        </div>
    );
};

export default PaymentModal;
