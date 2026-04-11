import React, { useState, useEffect, useRef, useMemo } from 'react';
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
    CancelCircleIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Input, Button, Checkbox } from '@/components/reusable';
import { ReceiptContent, PaymentMethodCard, Numpad, SplitPaymentCard } from './POSComponents';
import { getPaymentMethodsAction } from '@/app/actions/payment-methods';
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';

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

// --- MAIN COMPONENT ---

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
    lockPaymentCompletion = false
}: any) => {
    const { toast } = useToast();
    // Views: methods (main) | money | card | pix | split | split_method_select
    const [view, setView] = useState<string>('methods');
    const [amountPaid, setAmountPaid] = useState<string>('');
    const [installments, setInstallments] = useState<string>('1');
    const [isReceiptOpen, setIsReceiptOpen] = useState(false);

    // Payment Status State
    const [paymentStatus, setPaymentStatus] = useState<'input' | 'processing' | 'success' | 'error'>('input');
    const [saleId, setSaleId] = useState<string>("");
    const [lastPaymentPayload, setLastPaymentPayload] = useState<any | null>(null);
    const [errorMessage, setErrorMessage] = useState("Não conseguimos concluir a venda agora.");

    const inputRef = useRef<HTMLInputElement>(null);

    // Pix Generation State
    const [isPixGenerated, setIsPixGenerated] = useState(false);

    // Toggles
    const [isPendingPayment, setIsPendingPayment] = useState(false);
    const [isPendingDelivery, setIsPendingDelivery] = useState(false);

    // Split Payment Logic - LIMITED TO 2 AS REQUESTED
    const [payments, setPayments] = useState<{ id: number, method: string | null, amount: number }[]>([
        { id: 1, method: null, amount: 0 },
        { id: 2, method: null, amount: 0 }
    ]);
    const [editingPaymentIndex, setEditingPaymentIndex] = useState<number | null>(null);

    const subTotal = cart.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0);
    const total = subTotal + shippingFee + otherCosts - discountAmount;
    const chargeTarget = Math.max(0, Number(amountDue ?? total));
    const itemCount = cart.reduce((acc: number, item: any) => acc + item.quantity, 0);

    // Fetch Partner Payment Methods
    const [availableMethods, setAvailableMethods] = useState<any[]>([]);
    useEffect(() => {
        if (isOpen && partnerId) {
            getPaymentMethodsAction(partnerId).then(res => {
                if (res.methods) setAvailableMethods(res.methods);
            });
        }
    }, [isOpen, partnerId]);

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setView('methods');
            setAmountPaid('');
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
                { id: 1, method: null, amount: 0 },
                { id: 2, method: null, amount: 0 }
            ]);
        }
    }, [isOpen, total]);

    // Auto-fill amount logic
    useEffect(() => {
        if (view === 'money' || view === 'card' || view === 'pix') {
            setIsPixGenerated(false);
            if (editingPaymentIndex !== null) {
                const currentSlot = payments[editingPaymentIndex];
                if (currentSlot.amount > 0) {
                    setAmountPaid(currentSlot.amount.toString());
                } else {
                    const otherPaid = payments.reduce((acc, p, idx) => idx !== editingPaymentIndex ? acc + p.amount : acc, 0);
                    const needed = Math.max(0, chargeTarget - otherPaid);
                    setAmountPaid(needed > 0 ? needed.toFixed(2) : '');
                }
            } else {
                setAmountPaid(chargeTarget.toFixed(2));
            }
            setTimeout(() => {
                if (inputRef.current) inputRef.current.focus();
            }, 100);
        }
    }, [view, editingPaymentIndex, chargeTarget, payments]);

    const handleQuickAdd = (val: number) => {
        setAmountPaid(val.toString());
    }

    const handleManualInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const val = e.target.value;
        if (/^\d*\.?\d{0,2}$/.test(val)) {
            setAmountPaid(val);
        }
    };

    const handleNumpadInput = (key: string) => {
        if (key === '.' && amountPaid.includes('.')) return;
        if (amountPaid === '0' && key !== '.') {
            setAmountPaid(key);
            return;
        }
        setAmountPaid(prev => {
            const newVal = prev + key;
            if (/^\d*\.?\d{0,2}$/.test(newVal)) return newVal;
            return prev;
        });
    };

    const handleNumpadDelete = () => {
        setAmountPaid(prev => prev.slice(0, -1));
    };

    const currentInputVal = parseFloat(amountPaid) || 0;

    const totalPaidCalculated = useMemo(() => {
        if (view === 'split') {
            return payments.reduce((acc, p) => acc + p.amount, 0);
        }
        if (editingPaymentIndex !== null) {
            const otherPaid = payments.reduce((acc, p, idx) => idx !== editingPaymentIndex ? acc + p.amount : acc, 0);
            return otherPaid + currentInputVal;
        }
        return currentInputVal;
    }, [view, payments, editingPaymentIndex, currentInputVal]);

    const diff = totalPaidCalculated - chargeTarget;
    const isUnderpaid = diff < -0.01;
    const isOverpaid = diff > 0.01;
    const changeAmount = isOverpaid ? diff : 0;

    const getTitle = () => {
        switch (view) {
            case 'methods': return 'Método de Pagamento';
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
            if (editingPaymentIndex !== null) {
                setView('split_method_select');
            } else {
                setView('methods');
            }
        } else if (view === 'split_method_select') {
            setView('split');
            setEditingPaymentIndex(null);
        } else if (view === 'split') {
            setView('methods');
        } else {
            setView('methods');
        }
    };

    const handleSplitPaymentUpdate = (newAmount: number, newMethod?: string) => {
        if (editingPaymentIndex !== null) {
            const newPayments = [...payments];
            newPayments[editingPaymentIndex] = {
                ...newPayments[editingPaymentIndex],
                amount: newAmount,
                method: newMethod || newPayments[editingPaymentIndex].method
            };
            setPayments(newPayments);
            setView('split');
            setEditingPaymentIndex(null);
        }
    };

    const handleMethodSelectionInSplit = (methodType: 'Dinheiro' | 'Cartão' | 'Pix') => {
        if (editingPaymentIndex !== null) {
            const newPayments = [...payments];
            newPayments[editingPaymentIndex].method = methodType;
            setPayments(newPayments);
            if (methodType === 'Dinheiro') setView('money');
            else if (methodType === 'Cartão') setView('card');
            else if (methodType === 'Pix') setView('pix');
        }
    };

    const buildConfirmPayload = () => {
        const newPaymentBreakdown = isPendingPayment
            ? []
            : view === 'split'
                ? payments
                    .filter((payment) => payment.method && payment.amount > 0.009)
                    .map((payment) => ({
                        method: normalizePaymentMethodLabel(payment.method),
                        amount: Number(payment.amount || 0),
                    }))
                : [{
                    method: normalizePaymentMethodLabel(view === 'money' ? 'dinheiro' : (view === 'pix' ? 'pix' : 'cartao')),
                    amount: Number(totalPaidCalculated || 0),
                }];

        const mergedPaymentBreakdown = [...(existingPaymentBreakdown || []), ...newPaymentBreakdown]
            .filter((entry: any) => entry?.method && Number(entry?.amount || 0) > 0.009);

        const paymentMethod = isPendingPayment
            ? 'pendente'
            : Array.from(new Set(mergedPaymentBreakdown.map((entry: any) => normalizePaymentMethodLabel(entry.method)))).join(', ');

        return {
            paymentMethod: paymentMethod || 'pendente',
            paymentBreakdown: mergedPaymentBreakdown,
            splitPayments: view === 'split' ? payments : [],
            paymentStatus: isPendingPayment ? 'unpaid' : (isUnderpaid ? 'partially_paid' : 'paid'),
            isPendingDelivery,
            paidAmount: isPendingPayment ? existingPaidAmount : (existingPaidAmount + totalPaidCalculated)
        };
    };

    const handleStartProcessing = async (forcedPayload?: any) => {
        setPaymentStatus('processing');
        const payload = forcedPayload || buildConfirmPayload();
        setLastPaymentPayload(payload);

        try {
            const result = await onConfirm(payload);

            if (result?.success) {
                setSaleId(result.orderNumber || "DDT000000");
                setPaymentStatus('success');
            } else {
                setErrorMessage(result?.error || "Ocorreu um problema ao concluir o pagamento. Você pode tentar novamente.");
                setPaymentStatus('error');
            }
        } catch (error) {
            setErrorMessage("Ocorreu um problema inesperado ao concluir o pagamento. Você pode tentar novamente.");
            setPaymentStatus('error');
        }
    };

    const handleFinishSale = () => {
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

    if (!isOpen) return null;

    const ActionFooter = ({ showConfirm = true, confirmText = "Registrar venda", disabled = false, buttonVariant = 'default', onCustomConfirm }: any) => (
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
                <span className="font-black text-xl text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</span>
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
                    {disabled ? 'Verifique os valores' : confirmText}
                </Button>
            )}
        </div>
    );

    const getIconForMethod = (method: string | null) => {
        if (method === 'Dinheiro') return MoneyIcon;
        if (method === 'Cartão') return CreditCardIcon;
        if (method === 'Pix') return QRCodeIcon;
        return PlusIcon;
    }

    const currentPaymentMethodName = view === 'card' ? 'Cartão' : view === 'pix' ? 'Pix' : view === 'money' ? 'Dinheiro' : 'Pagamento';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

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
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">Venda de Itens</span>
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
                            cart={cart}
                            subTotal={subTotal}
                            shippingFee={shippingFee}
                            otherCosts={otherCosts}
                            discountAmount={discountAmount}
                            total={total}
                            itemCount={itemCount}
                            customerName={customer?.name}
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
                            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading hover:bg-gray-200 transition-colors">
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
                                                        <span className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[150px]">{customer?.name || 'Cliente Balcão'}</span>
                                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">Order ERP / Presencial</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end text-right">
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">{formatDate(new Date())}</span>
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">{formatTime(new Date())}</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <PaymentMethodCard icon={MoneyIcon} label="Dinheiro" onClick={() => setView('money')} />
                                                <PaymentMethodCard icon={QRCodeIcon} label="Pix" onClick={() => setView('pix')} />
                                                <PaymentMethodCard icon={CreditCardIcon} label="Cartão" onClick={() => setView('card')} />
                                                <PaymentMethodCard icon={SplitIcon} label="Dividir" onClick={() => setView('split')} />
                                                <PaymentMethodCard icon={MoreHorizontalIcon} label="Outros" onClick={() => { }} />
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
                                        <motion.div key="money" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="w-full h-full flex flex-col items-center">
                                            <CompactPaymentStatusAlert totalPaid={totalPaidCalculated} totalNeed={chargeTarget} />
                                            <div className="flex justify-center items-baseline gap-1 mb-4 w-full cursor-text" onClick={() => inputRef.current?.focus()}>
                                                <span className="text-5xl md:text-6xl font-bold text-brand-dark dark:text-dark-heading select-none">R$</span>
                                                <input
                                                    ref={inputRef}
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={amountPaid}
                                                    onChange={(e: any) => handleManualInput(e)}
                                                    placeholder="0.00"
                                                    className="text-5xl md:text-6xl font-bold text-brand-dark dark:text-dark-heading bg-transparent outline-none p-0 m-0 placeholder:text-gray-200 dark:placeholder:text-gray-800"
                                                    style={{ width: `${Math.max(1, amountPaid.length || 4)}ch` }}
                                                />
                                            </div>
                                            <div className="flex flex-wrap justify-center gap-3 mb-6 w-full px-2">
                                                {[5, 10, 20, 50, 100].map(amt => (
                                                    <button
                                                        key={amt}
                                                        onClick={() => handleQuickAdd(amt)}
                                                        className="px-5 py-3 bg-gray-100 dark:bg-dark-border/30 rounded-xl text-sm font-bold text-brand-dark dark:text-dark-heading hover:bg-gray-200 dark:hover:bg-dark-border/50 transition-colors border border-transparent hover:border-brand-border flex-grow-0 min-w-[70px] h-auto"
                                                    >
                                                        R$ {amt}
                                                    </button>
                                                ))}
                                            </div>
                                            <Numpad onInput={handleNumpadInput} onDelete={handleNumpadDelete} />
                                        </motion.div>
                                    )}

                                    {view === 'pix' && (
                                        <motion.div key="pix" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-start pt-0 w-full">
                                            <div className="w-full max-w-sm space-y-4">
                                                <CompactPaymentStatusAlert totalPaid={totalPaidCalculated} totalNeed={chargeTarget} />
                                                <Input label="Valor a Receber" name="pixAmount" prefix="R$" value={amountPaid} onChange={handleManualInput} className="font-bold text-lg" />
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
                                        <motion.div key="card" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col items-center justify-start pt-6 w-full max-w-sm mx-auto">
                                            <CompactPaymentStatusAlert totalPaid={totalPaidCalculated} totalNeed={chargeTarget} />
                                            <div className="mb-8 text-center">
                                                <div className="w-24 h-24 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-100 dark:border-green-900/30">
                                                    <CreditCardIcon size={40} className="text-green-600 dark:text-green-400" />
                                                </div>
                                                <div className="text-4xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                                                    {formatCurrency(total)}
                                                </div>
                                                <p className="text-brand-inactive-text">Aguardando leitura do cartão...</p>
                                            </div>
                                            <div className="w-full text-left space-y-4">
                                                <Input label="Valor a Cobrar" name="cardAmount" prefix="R$" value={amountPaid} onChange={(e: any) => handleManualInput(e)} className="font-bold text-lg" />
                                                <Input label="Parcelas" name="installments" type="number" value={installments} onChange={(e: any) => setInstallments(e.target.value)} min="1" className="w-full text-lg font-bold" />
                                            </div>
                                        </motion.div>
                                    )}

                                    {view === 'split' && (
                                        <motion.div key="split" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="flex flex-col w-full h-full">
                                            <div className="flex-1 px-2 py-4">
                                                <CompactPaymentStatusAlert totalPaid={totalPaidCalculated} totalNeed={chargeTarget} />
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {payments.map((p, idx) => (
                                                        <SplitPaymentCard
                                                            key={p.id}
                                                            icon={getIconForMethod(p.method)}
                                                            label={p.method || "Selecionar método"}
                                                            amount={formatCurrency(p.amount)}
                                                            onClick={() => { setEditingPaymentIndex(idx); setView('split_method_select'); }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {view === 'split_method_select' && (
                                        <motion.div key="split_method_select" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="w-full">
                                            <h3 className="text-sm font-bold text-brand-inactive-text mb-4 tracking-wide uppercase">Selecione o método</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <PaymentMethodCard icon={MoneyIcon} label="Dinheiro" onClick={() => handleMethodSelectionInSplit('Dinheiro')} />
                                                <PaymentMethodCard icon={QRCodeIcon} label="Pix" onClick={() => handleMethodSelectionInSplit('Pix')} />
                                                <PaymentMethodCard icon={CreditCardIcon} label="Cartão" onClick={() => handleMethodSelectionInSplit('Cartão')} />
                                                <PaymentMethodCard icon={MoreHorizontalIcon} label="Outros" onClick={() => { }} />
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
                                    {isUnderpaid && (
                                        <div className="mb-6">
                                            <div className="w-full py-3 px-4 rounded-lg flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/20 transition-colors duration-300 border border-yellow-100 dark:border-yellow-900/30">
                                                <div className="w-1 h-4 rounded-full bg-yellow-500"></div>
                                                <span className="font-bold text-sm flex-1 text-yellow-700 dark:text-yellow-400">
                                                    Venda paga parcialmente, restante a pagar: {formatCurrency(Math.abs(diff))}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Stats Row */}
                                    <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 mb-10 mt-4 border-l-4 border-brand-dark dark:border-dark-heading pl-6">
                                        <div>
                                            <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">total da venda</span>
                                            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</div>
                                        </div>
                                        <div>
                                            <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">total recebido</span>
                                            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalPaidCalculated)}</div>
                                        </div>
                                        {changeAmount > 0 && (
                                            <div>
                                                <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">troco</span>
                                                <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(changeAmount)}</div>
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
                                    buttonVariant={isUnderpaid ? "outline" : "filled"}
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
                                    buttonVariant={
                                        editingPaymentIndex !== null
                                            ? "filled"
                                            : (isUnderpaid ? "outline" : "default")
                                    }
                                    onCustomConfirm={editingPaymentIndex !== null ? () => handleSplitPaymentUpdate(parseFloat(amountPaid) || 0) : undefined}
                                />
                            )}

                            {/* 4. Split Method Select Footer */}
                            {view === 'split_method_select' && (
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
                            <Button variant="outline" className="flex-1 h-[52px]" onClick={onClose}>
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
                                        cart={cart}
                                        subTotal={subTotal}
                                        shippingFee={shippingFee}
                                        otherCosts={otherCosts}
                                        discountAmount={discountAmount}
                                        total={total}
                                        itemCount={itemCount}
                                        customerName={customer?.name}
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
