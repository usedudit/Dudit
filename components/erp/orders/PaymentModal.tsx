import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    XIcon,
    ChevronLeftIcon,
    CreditCardIcon,
    MoneyIcon,
    QRCodeIcon,
    CopyIcon,
    ColumnsIcon as SplitIcon,
    ChevronUpIcon,
    ClockIcon,
    TruckIcon,
    ChevronDownIcon,
    PrinterIcon,
    FileIcon,
    TagIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    CancelCircleIcon,
    InfoIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Checkbox, MoneyInput, Badge, Tooltip, Spinner, FormDropdown, InfoCard, DefaultModal, ListItem, IconPlaceholder } from '@/components/reusable';
import { ReceiptContent, PaymentMethodCard, SplitPaymentCard, Numpad } from '../POSComponents';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import { calculatePaymentMethodAmountsAction, previewSplitPaymentBreakdownAction } from '@/app/actions/erp/payment-methods';
import { useToast } from "@/components/ui/use-toast";
import { cn, formatCurrency, formatDate, formatNumber, formatTime } from '@/lib/utils';
import SaleReceiptPrintModal from '@/components/erp/orders/receipt/SaleReceiptPrintModal';
import { getMercadoPagoStatusAction, checkMercadoPagoPaymentStatusAction, type MpAcceptedPaymentMethods } from '@/app/actions/mercadopago';
import { getServiceCheckoutSettingsAction } from '@/app/actions/marketplace/service-checkout-settings';
import { fetchJSONWithCSRF } from '@/lib/utils/fetch-with-csrf';
import { formatPaymentMethodLabel } from '@/lib/utils/payment-method-label';
import { usePaymentMethods } from '@/hooks/use-payment-methods';
import { useStore } from '@/lib/store-context';
import { getPOSCustomerDetailsAction } from '@/app/actions/erp/pdv';


const PAYMENT_METHODS_UPDATED_EVENT = "payment-methods-updated";

const normalizePaymentMethodLabel = (value?: string | null) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized.includes('dinheiro') || normalized.includes('cash') || normalized.includes('money')) return 'Dinheiro';
    if (normalized.includes('pix')) return 'Pix';
    if (normalized.includes('cartão de crédito') || normalized.includes('cartao de credito') || normalized.includes('credito') || normalized.includes('crédito') || normalized.includes('credit')) return 'Cartão de Crédito';
    if (normalized.includes('cartão de débito') || normalized.includes('cartao de debito') || normalized.includes('debito') || normalized.includes('débito') || normalized.includes('debit')) return 'Cartão de Débito';
    if (normalized.includes('transferência') || normalized.includes('transferencia') || normalized.includes('ted') || normalized.includes('doc')) return 'Transferência';
    if (normalized.includes('cartao') || normalized.includes('cartão') || normalized.includes('card')) return 'Cartão';
    if (normalized.includes('pendente') || normalized.includes('método não definido')) return 'Método não definido';
    return String(value || '').trim();
};

const formatPaymentMethodToFullLabel = (value?: string | null) => {
    if (!value) return "";
    return formatPaymentMethodLabel(value, null);
};

const getFormattedMethodLabel = (name: string, type?: string | null) => {
    return formatPaymentMethodLabel(name, type);
};

const getCustomerCredit = (cust: any, fetchedCredit?: number | null) => {
    if (typeof fetchedCredit === "number" && !isNaN(fetchedCredit)) {
        return Math.max(0, fetchedCredit);
    }
    if (!cust) return 0;
    return Math.max(0, Number(cust.store_credit ?? cust.storeCredit ?? cust.credit ?? cust.customer_credit ?? cust.store_credit_amount ?? cust.balance ?? 0));
};



import { CompactPaymentStatusAlert } from '@/components/erp/payments/shared/CompactPaymentStatusAlert';
import { PaymentAmountLabel } from '@/components/erp/payments/shared/PaymentAmountLabel';
import { generateStaticPix } from '@/lib/utils/pix-generator';
import { PixQrDisplayModal } from '@/components/erp/payments/shared/PixQrDisplayModal';
import { getPaymentMethodDetailsAction, updatePaymentMethodAction } from '@/app/actions/erp/payment-methods';
import { AlertModal, Input, CpfCnpjInput, EmailInput, PhoneInput } from '@/components/reusable';
import QRCode from 'qrcode';
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

const PaymentPricingDetailBadge = React.memo(({ calculation, baseAllocated }: { calculation: any; baseAllocated: number }) => {
    if (!calculation?.success) return null;
    const base = Math.max(0, Number(baseAllocated || 0));
    const disc = Number(calculation.paymentMethodDiscountAmount || 0);
    const juros = Number(calculation.interestAmount || 0);
    const taxa = Number(calculation.feeAmount || 0);
    const custoMetodo = Number(calculation.fixedFeeAmount || 0);
    const final = Number(calculation.finalAmount || 0);
    const isMerchant = calculation.feeBearer === "merchant";
    const totalAbsorbed = juros + taxa + custoMetodo;
    return (
        <div className="relative group/payinfo inline-flex shrink-0">
            <Badge variant="gray" icon={<InfoIcon className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />} className="cursor-help" />
            <div className="pointer-events-none absolute bottom-full right-0 z-[120] mb-2 hidden min-w-[240px] max-w-[min(100vw,280px)] rounded-xl border border-brand-border bg-white p-3 text-left text-xs shadow-xl group-hover/payinfo:block dark:border-dark-border dark:bg-dark-surface">
                <div className="mb-2 font-bold text-brand-dark dark:text-dark-heading">Detalhes do meio de pagamento</div>
                <div className="space-y-1.5 text-brand-dark dark:text-dark-heading">
                    <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Subtotal</span><span className="font-semibold">{formatCurrency(base)}</span></div>
                    {disc > 0 && <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Desc. meio pagamento</span><span className="font-semibold">− {formatCurrency(disc)}</span></div>}
                    {!isMerchant && juros > 0 && <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Juros</span><span className="font-semibold">+ {formatCurrency(juros)}</span></div>}
                    {!isMerchant && taxa > 0 && <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Taxa</span><span className="font-semibold">+ {formatCurrency(taxa)}</span></div>}
                    {!isMerchant && custoMetodo > 0 && <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Custo do método</span><span className="font-semibold">+ {formatCurrency(custoMetodo)}</span></div>}
                    {isMerchant && totalAbsorbed > 0.009 && (
                        <div className="flex justify-between gap-3"><span className="text-brand-inactive-text/70">Taxas/juros absorvidos</span><span className="font-semibold text-brand-inactive-text/70">{formatCurrency(totalAbsorbed)}</span></div>
                    )}
                    <div className="mt-2 flex justify-between gap-3 border-t border-brand-border pt-2 font-bold dark:border-dark-border"><span>Total a cobrar</span><span>{formatCurrency(final)}</span></div>
                </div>
            </div>
        </div>
    );
});

const PaymentPricingTooltipBadge = React.memo(({ calculation, baseAllocated }: { calculation: any; baseAllocated: number }) => {
    if (!calculation?.success) return null;
    const base = Math.max(0, Number(baseAllocated || 0));
    const disc = Number(calculation.paymentMethodDiscountAmount || 0);
    const juros = Number(calculation.interestAmount || 0);
    const taxa = Number(calculation.feeAmount || 0);
    const custoMetodo = Number(calculation.fixedFeeAmount || 0);
    const final = Number(calculation.finalAmount || 0);

    const rows = [
        { label: 'Subtotal', value: formatCurrency(base) },
        disc > 0 ? { label: 'Desconto', value: `- ${formatCurrency(disc)}` } : null,
        juros > 0 ? { label: 'Juros', value: `+ ${formatCurrency(juros)}` } : null,
        taxa > 0 ? { label: 'Taxa', value: `+ ${formatCurrency(taxa)}` } : null,
        custoMetodo > 0 ? { label: 'Custo do método', value: `+ ${formatCurrency(custoMetodo)}` } : null,
        { label: 'Total a cobrar', value: formatCurrency(final), isTotal: true },
    ].filter(Boolean) as Array<{ label: string; value: string; isTotal?: boolean }>;

    return (
        <Tooltip
            text={(
                <div className="w-[240px] text-left">
                    <div className="mb-2 font-bold">Detalhes do meio de pagamento</div>
                    <div className="space-y-1.5">
                        {rows.map((row) => (
                            <div
                                key={`${row.label}-${row.value}`}
                                className={cn(
                                    "flex justify-between items-center gap-3 min-w-0 w-full",
                                    row.isTotal && "mt-2 border-t border-white/20 pt-2 font-bold dark:border-black/10",
                                )}
                            >
                                <span
                                    className={cn("truncate min-w-0", !row.isTotal && "text-white/70 dark:text-black/60")}
                                    title={row.label}
                                >
                                    {row.label}
                                </span>
                                <span className="font-semibold shrink-0">{row.value}</span>
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
});

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
    if (["credit_card", "credito", "cartao_credito", "cartão de crédito"].includes(raw)) return "credit_card";
    if (["debit_card", "debito", "cartao_debito", "cartão de débito"].includes(raw)) return "debit_card";
    if (["bank_transfer", "transferencia_bancaria", "transferencia", "ted", "doc", "transferência", "transferência bancária"].includes(raw)) return "bank_transfer";
    if (["card", "cartao", "cartão", "credit", "debit"].includes(raw)) return "credit_card";
    return "other";
};

const getTargetViewForMethodType = (type: string) => {
    if (type === "cash") return "money";
    if (type === "pix") return "pix";
    return "card"; // credit_card, debit_card, bank_transfer, other
};

const formatInstallmentOptionLabel = (opt: any) => {
    const installmentsCount = Math.max(1, Number(opt?.installments || 1));
    const installmentValue = Number(opt?.installmentValue || 0);
    const finalAmount = Number(opt?.finalAmount || (installmentValue * installmentsCount));
    const interestAmount = Number(opt?.totalInterest || 0);
    const feeAmount = Number(opt?.totalFee || 0);
    const fixedFeeAmount = Number(opt?.fixedFee || 0);
    const pricingAmount = interestAmount + feeAmount + fixedFeeAmount;
    const passesCostToCustomer = opt?.feeBearer !== "merchant";

    const parts = [];
    if (interestAmount > 0.009) parts.push("juros");
    if (feeAmount > 0.009) parts.push("taxa");
    if (fixedFeeAmount > 0.009) parts.push("custo fixo");

    const pricingName = parts.length > 0 ? parts.join("/") : "taxa";

    const pricingLabel = pricingAmount > 0.009
        ? ` · ${formatCurrency(pricingAmount)} ${passesCostToCustomer ? `de ${pricingName}` : `${pricingName} absorvida`}`
        : "";
    const freeInterestLabel = pricingAmount <= 0.009 ? " sem juros" : "";
    return `${installmentsCount}x de ${formatCurrency(installmentValue)}${freeInterestLabel} (Total: ${formatCurrency(finalAmount)}${pricingLabel})`;
};

/** Props alinhadas entre PDV (`POSPage`) e venda manual (`CreateOrder`) - manter os mesmos significados. */
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
    /** Oculta "Pendente de entrega" e usa layout de coluna única (ex.: checkout de agendamento). */
    hidePendingDelivery?: boolean
    deliveryMethod?: 'delivery' | 'pickup'
    /** Texto abaixo do nome do cliente (desktop e mobile). */
    headerSubtitle?: string
    isMarketplaceOrder?: boolean
    role?: string
    originalPaymentMethod?: string
    /** Quando o pedido tem serviços, permite gerar cobrança de sinal via MP antes do pagamento integral. */
    allowDepositCharge?: boolean
    depositChargeAmount?: number
    depositPercentage?: number
    deliveryBreakdown?: Record<string, unknown> | null
}

/** Mesmo texto em PDV e venda manual - importe nos pais para garantir paridade. */
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
    hidePendingDelivery = false,
    deliveryMethod = 'delivery',
    headerSubtitle = PAYMENT_MODAL_HEADER_SUBTITLE,
    isMarketplaceOrder = false,
    role = 'staff',
    originalPaymentMethod,
    allowDepositCharge = false,
    depositChargeAmount = 0,
    depositPercentage: propsDepositPercentage,
    deliveryBreakdown,
}: PaymentModalProps) => {
    const { toast } = useToast();
    const { selectedStore } = useStore();

    const [effectiveDepositPercent, setEffectiveDepositPercent] = useState<number | undefined>(propsDepositPercentage)
    const [fetchedCustomerCredit, setFetchedCustomerCredit] = useState<number | null>(null);
    const [useStoreCredit, setUseStoreCredit] = useState(false);
    const [storeCreditToUse, setStoreCreditToUse] = useState<number>(0);

    useEffect(() => {
        if (!isOpen || !customer?.id || !partnerId) {
            setFetchedCustomerCredit(null);
            return;
        }
        let active = true;
        getPOSCustomerDetailsAction({ partnerId, customerId: customer.id }).then((res) => {
            if (active && res?.success && res?.data) {
                setFetchedCustomerCredit(Number(res.data.store_credit || 0));
            }
        }).catch(() => {});
        return () => { active = false; };
    }, [isOpen, customer?.id, partnerId]);

    useEffect(() => {
        if (propsDepositPercentage != null) {
            setEffectiveDepositPercent(propsDepositPercentage)
            return
        }
        if (!partnerId) return
        let active = true
        getServiceCheckoutSettingsAction(partnerId).then((res) => {
            if (active && res?.success && res?.settings) {
                setEffectiveDepositPercent(res.settings.depositPercentage)
            }
        })
        return () => { active = false }
    }, [partnerId, propsDepositPercentage])

    // Views: methods (main) | method_type_select | money | card | pix | split | split_method_select
    const [view, setView] = useState<string>('methods');
    /** Valor base alocado ao pedido neste meio (antes de desconto/juros/taxa do método); servidor recalcula o líquido a cobrar. */
    const [paymentBaseAmount, setPaymentBaseAmount] = useState<number>(0);
    const [calcBaseAmount, setCalcBaseAmount] = useState<number>(0);
    const userManuallyChangedRef = useRef(false);
    const [installments, setInstallments] = useState<string>('1');
    const [isReceiptOpen, setIsReceiptOpen] = useState(false);

    // Payment Status State
    const [paymentStatus, setPaymentStatus] = useState<'input' | 'processing' | 'success' | 'error'>('input');
    const [saleId, setSaleId] = useState<string>("");
    const [printOrderId, setPrintOrderId] = useState<string | null>(null);
    const [lastPaymentPayload, setLastPaymentPayload] = useState<any | null>(null);
    const [errorMessage, setErrorMessage] = useState("Não conseguimos concluir a venda agora.");

    // Pix Generation State
    const [isPixGenerated, setIsPixGenerated] = useState(false);
    const [showPixQrModal, setShowPixQrModal] = useState(false);
    const [pixQrData, setPixQrData] = useState<{ payload: string; qrDataUrl: string } | null>(null);
    const [isGeneratingPix, setIsGeneratingPix] = useState(false);
    const [hasPixKey, setHasPixKey] = useState<boolean | null>(null);
    const [tempPixKey, setTempPixKey] = useState("");
    const [tempPixKeyType, setTempPixKeyType] = useState<"cpf" | "cnpj" | "email" | "phone" | "random">("cpf");
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);
    const [showKeyInputs, setShowKeyInputs] = useState(false);
    const [savingPixKey, setSavingPixKey] = useState(false);

    // Toggles
    const paymentPendingType = 'none';
    const setPaymentPendingType = (v: any) => { };
    const isPendingDelivery = false;
    const setIsPendingDelivery = (v: any) => { };
    const showPaymentStatusModal = false;
    const setShowPaymentStatusModal = (v: any) => { };
    const showDeliveryStatusModal = false;
    const setShowDeliveryStatusModal = (v: any) => { };
    const [cashCalculatorInput, setCashCalculatorInput] = useState("");

    // Mercado Pago State
    const [mpConnected, setMpConnected] = useState(false);
    const [mpPublicKey, setMpPublicKey] = useState<string | null>(null);
    const [mpAcceptedPaymentMethods, setMpAcceptedPaymentMethods] = useState<MpAcceptedPaymentMethods | undefined>(undefined);
    const [mpStep, setMpStep] = useState<"brick" | "pix" | "boleto" | "mp_redirect" | "error">("brick");
    const [mpSdkLoaded, setMpSdkLoaded] = useState(false);
    const [mpBrickReady, setMpBrickReady] = useState(false);
    const [mpBrickError, setMpBrickError] = useState<string | null>(null);
    const [mpIsProcessing, setMpIsProcessing] = useState(false);
    const [mpPixData, setMpPixData] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
    const [mpBoletoData, setMpBoletoData] = useState<{ barcode: string; ticketUrl: string } | null>(null);
    const [mpPaymentId, setMpPaymentId] = useState<string | null>(null);
    const [preCreatedOrderId, setPreCreatedOrderId] = useState<string | null>(null);
    const [mpCopied, setMpCopied] = useState(false);
    const [mpIsCheckingStatus, setMpIsCheckingStatus] = useState(false);
    const mpInstanceRef = useRef<any>(null);
    const mpBricksBuilderRef = useRef<any>(null);
    const mpBrickIdRef = useRef<any>(null);
    const mpBrickInitializedRef = useRef(false);


    const [depositMpPixData, setDepositMpPixData] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
    const [depositMpPaymentId, setDepositMpPaymentId] = useState<string | null>(null);
    const [generatingDepositPix, setGeneratingDepositPix] = useState(false);
    const [showDepositPixModal, setShowDepositPixModal] = useState(false);
    const [isCheckingDepositStatus, setIsCheckingDepositStatus] = useState(false);

    const handleVerifyDepositPayment = async () => {
        if (!depositMpPaymentId) return;
        setIsCheckingDepositStatus(true);
        try {
            const res = await checkMercadoPagoPaymentStatusAction(depositMpPaymentId);
            if (res && 'success' in res && res.success) {
                if (res.status === "approved") {
                    toast({ title: "Sinal Pago!", description: "O pagamento do sinal foi confirmado." });
                    setShowDepositPixModal(false);
                    setDepositMpPixData(null);
                    setDepositMpPaymentId(null);
                    invalidate();
                } else {
                    toast({ title: "Aguardando pagamento", description: "O Pix do sinal ainda não consta como pago." });
                }
            } else {
                toast({
                    title: "Erro ao verificar",
                    description: (res && 'error' in res ? res.error : null) || "Não foi possível consultar o status do pagamento.",
                    variant: "destructive"
                });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Erro", description: "Ocorreu um erro ao verificar o pagamento.", variant: "destructive" });
        } finally {
            setIsCheckingDepositStatus(false);
        }
    };

    const handleSendDepositWhatsApp = () => {
        if (!depositMpPixData || !customer?.phone) return;
        const formattedAmount = formatCurrency(depositChargeAmount);
        const customerName = (customer?.name || customer?.full_name || customer?.fullName || customer?.customer_name || "").trim();
        const messageText = `Olá, *${customerName || "Cliente"}*! 🌟\n\n` +
            `Aqui está o código Pix Copia e Cola para o pagamento do sinal do seu pedido no valor de *${formattedAmount}*:\n\n` +
            `\`${depositMpPixData.qrCode}\`\n\n` +
            `Assim que realizar o pagamento, nosso sistema irá confirmar de forma automática! 😉`;
        const encodedMsg = encodeURIComponent(messageText);
        const phone = String(customer.phone).replace(/\D/g, "");
        window.open(`https://wa.me/55${phone}?text=${encodedMsg}`, "_blank");
    };

    const handleGenerateDepositCharge = async () => {
        if (depositMpPixData) {
            setShowDepositPixModal(true);
            return;
        }
        if (depositChargeAmount <= 0.009) {
            toast({ title: "Sinal indisponível", description: "Configure o valor do sinal para este pedido.", variant: "destructive" });
            return;
        }
        setGeneratingDepositPix(true);
        try {
            const customerName = (customer?.name || customer?.full_name || customer?.fullName || customer?.customer_name || "").trim();
            const nameParts = customerName ? customerName.split(/\s+/) : [];
            const firstName = nameParts[0] || undefined;
            const lastName = nameParts.slice(1).join(" ") || undefined;
            const customerEmail = (customer?.email || customer?.customer_email || customer?.user?.email || "").trim();
            const customerCpfCnpj = String(customer?.cpf_cnpj || customer?.cpf || customer?.cnpj || customer?.doc || "").replace(/\D/g, "");

            const res = await fetchJSONWithCSRF<any>("/api/mercadopago/process-erp-payment", {
                method: "POST",
                body: {
                    paymentFormData: {
                        payment_method_id: "pix",
                        payer: {
                            email: customerEmail || undefined,
                            first_name: firstName,
                            last_name: lastName,
                            ...(customerCpfCnpj ? {
                                identification: {
                                    type: customerCpfCnpj.length > 11 ? "CNPJ" : "CPF",
                                    number: customerCpfCnpj,
                                }
                            } : {}),
                        }
                    },
                    partnerId,
                    amount: depositChargeAmount,
                    description: `Sinal - ${customerName || "Cliente"}`,
                },
            });
            if (res?.pixData?.qrCode) {
                setDepositMpPixData({ qrCode: res.pixData.qrCode, qrCodeBase64: res.pixData.qrCodeBase64 });
                setDepositMpPaymentId(res.mpPaymentId);
                setShowDepositPixModal(true);
                toast({ title: "Pix gerado", description: "Cobrança de sinal criada via Mercado Pago." });
            } else {
                toast({ title: "Erro", description: res?.error || "Falha ao gerar Pix.", variant: "destructive" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Erro", description: "Não foi possível gerar a cobrança de sinal.", variant: "destructive" });
        } finally {
            setGeneratingDepositPix(false);
        }
    };

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
    const [splitSelectedType, setSplitSelectedType] = useState<string | null>(null);
    const [paymentCalculation, setPaymentCalculation] = useState<any | null>(null);
    const [installmentOptions, setInstallmentOptions] = useState<any[]>([]);
    const [isPaymentCalculationLoading, setIsPaymentCalculationLoading] = useState(false);
    const [isSplitPreviewLoading, setIsSplitPreviewLoading] = useState(false);
    const lastOptionsConfigRef = useRef<{ methodId: string | null; feeBearer: string | null; amount: number | null }>({ methodId: null, feeBearer: null, amount: null });
    const [wantsChange, setWantsChange] = useState(false);
    const [payWithAmount, setPayWithAmount] = useState<number>(0);
    // CSS animation state matching DefaultModal/AlertModal
    const [isAnimating, setIsAnimating] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
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
        fixedFeeAmount: number
        feeBearer: "merchant" | "customer" | null
        appliedDiscountPercent?: number
        appliedFeePercent?: number
        appliedInterestPercent?: number
        receiptCart: any[]
        paymentBreakdown?: Array<{ method: string; amount: number }>
    } | null>(null)

    const subTotal = cart.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0);
    const total = subTotal + shippingFee + otherCosts - discountAmount;
    const chargeTarget = Math.max(0, Number(amountDue ?? total));

    const customerCredit = getCustomerCredit(customer, fetchedCustomerCredit);
    const effectiveCreditApplied = useStoreCredit
        ? Math.min(customerCredit, Math.min(chargeTarget, Math.max(0, Number(storeCreditToUse || 0))))
        : 0;
    const netChargeTarget = Math.max(0, chargeTarget - effectiveCreditApplied);

    useEffect(() => {
        if (isOpen && useStoreCredit && customerCredit > 0) {
            const maxApplicable = Math.min(customerCredit, chargeTarget);
            setStoreCreditToUse((prev) => (prev <= 0 || prev > maxApplicable ? maxApplicable : prev));
        } else if (!isOpen || !useStoreCredit) {
            setStoreCreditToUse(0);
        }
    }, [isOpen, useStoreCredit, customerCredit, chargeTarget]);

    useEffect(() => {
        if (!isOpen) {
            setUseStoreCredit(false);
            setStoreCreditToUse(0);
        }
    }, [isOpen]);
    const itemCount = cart.reduce((acc: number, item: any) => acc + item.quantity, 0);
    const resetSelectedMethodPricing = (options?: { clearType?: boolean; resetInstallments?: boolean }) => {
        setSelectedMethodId(null);
        setPaymentCalculation(null);
        setInstallmentOptions([]);
        setIsPaymentCalculationLoading(false);
        setIsPixGenerated(false);
        setWantsChange(false);
        setPayWithAmount(0);
        setSplitSelectedType(null);
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

    // Fetch Partner Payment Methods via React Query (shared cache, deduplicated)
    const { methods: availableMethods, isLoading: isLoadingMethods, invalidate } = usePaymentMethods(isOpen ? partnerId : '');

    const activeMethods = useMemo(
        () => (availableMethods || []).filter((method: PartnerPaymentMethod) => method?.is_active !== false),
        [availableMethods],
    );

    const availableMethodTypes = useMemo(() => {
        const types = new Set(activeMethods.map((m: PartnerPaymentMethod) => normalizeMethodType(m.type)));
        types.add("cash"); // Always allow cash
        return types;
    }, [activeMethods]);

    // Listen for payment methods updates from settings page (create/update/delete)
    useEffect(() => {
        if (!partnerId || typeof window === "undefined") return;

        const refreshOnChange = () => { invalidate(); };

        window.addEventListener(PAYMENT_METHODS_UPDATED_EVENT, refreshOnChange);
        return () => window.removeEventListener(PAYMENT_METHODS_UPDATED_EVENT, refreshOnChange);
    }, [partnerId, invalidate]);

    // CSS animation two-phase mount/unmount (matching DefaultModal/AlertModal)
    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            const id = setTimeout(() => setIsAnimating(true), 50);
            return () => clearTimeout(id);
        } else {
            setIsAnimating(false);
            const id = setTimeout(() => setIsVisible(false), 200);
            return () => clearTimeout(id);
        }
    }, [isOpen]);

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setView('methods');
            setPaymentBaseAmount(0);
            setInstallments('1');
            setIsReceiptOpen(false);
            setPaymentPendingType('none');
            setIsPendingDelivery(false);
            setEditingPaymentIndex(null);
            setIsPixGenerated(false);
            setPaymentStatus('input');
            setLastPaymentPayload(null);
            setErrorMessage("Não conseguimos concluir a venda agora.");
            setShowPixQrModal(false);
            setPixQrData(null);
            setIsGeneratingPix(false);
            setHasPixKey(null);
            setTempPixKey("");
            setTempPixKeyType("cpf");
            setShowWarningModal(false);
            setShowConfirmSaveModal(false);
            setShowKeyInputs(false);
            setSavingPixKey(false);

            setPayments([
                { id: 1, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 },
                { id: 2, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 }
            ]);
            setSelectedMethodId(null);
            setWantsChange(false);
            setPayWithAmount(0);
            setSelectedMethodType(null);
            setPaymentCalculation(null);
            setInstallmentOptions([]);
            setIsPaymentCalculationLoading(false);
            setSplitPreview(null);
            setSuccessSnapshot(null);

            // Reset MP state
            setMpStep("brick");
            setMpBrickReady(false);
            setMpBrickError(null);
            setMpIsProcessing(false);
            setMpPixData(null);
            setMpBoletoData(null);
            setMpPaymentId(null);
            setPreCreatedOrderId(null);
            setMpCopied(false);
            setMpIsCheckingStatus(false);
            mpBrickInitializedRef.current = false;
            if (mpBrickIdRef.current) {
                try { mpBrickIdRef.current.unmount(); } catch { }
                mpBrickIdRef.current = null;
            }
        }
        // Não depender de `total`: se o pai zerar o carrinho (ex.: PDV) o total cai e apagava a tela de sucesso.
    }, [isOpen]);

    // Marketplace orders or orders with existing payments: auto-navigate directly to the original/existing method view (skip method selection)
    useEffect(() => {
        if (!isOpen || isLoadingMethods) return;
        // Only auto-navigate if we're on the initial methods screen
        if (view !== 'methods') return;

        const hasExistingPaid = existingPaidAmount > 0.009;
        const isMarketplace = isMarketplaceOrder && !!originalPaymentMethod;

        if (!isMarketplace && !hasExistingPaid) return;

        if (hasExistingPaid && existingPaymentBreakdown && existingPaymentBreakdown.length > 1) {
            // Split payment restore
            const initialSplitLegs = existingPaymentBreakdown.map((entry: any, index: number) => ({
                id: index + 1,
                method: entry.method,
                paymentMethodId: entry.paymentMethodId || null,
                amount: entry.amount,
                installmentNumber: entry.installmentNumber || 1,
            }));
            setPayments(initialSplitLegs);
            setView('split');
            return;
        }

        // Single method restore/lock
        const targetMethodLabel = hasExistingPaid
            ? (existingPaymentBreakdown?.[0]?.method || originalPaymentMethod || 'Dinheiro')
            : (originalPaymentMethod || 'Dinheiro');

        const normalizedOriginal = normalizePaymentMethodLabel(targetMethodLabel);
        const methodType = (() => {
            if (normalizedOriginal === 'Dinheiro') return 'cash';
            if (normalizedOriginal === 'Pix') return 'pix';
            if (normalizedOriginal === 'Cartão de Crédito') return 'credit_card';
            if (normalizedOriginal === 'Cartão de Débito') return 'debit_card';
            if (normalizedOriginal === 'Transferência') return 'bank_transfer';
            return 'other';
        })();

        const matchingMethods = activeMethods.filter((m: PartnerPaymentMethod) => normalizeMethodType(m.type) === methodType);
        const restoredMethodId = hasExistingPaid ? (existingPaymentBreakdown?.[0]?.paymentMethodId || null) : null;

        if (restoredMethodId) {
            setSelectedMethodId(restoredMethodId);
        } else if (matchingMethods.length === 1) {
            setSelectedMethodId(matchingMethods[0].id);
        } else if (matchingMethods.length > 1) {
            const exactMatch = matchingMethods.find((m: PartnerPaymentMethod) =>
                normalizePaymentMethodLabel(m.name) === normalizedOriginal
            );
            if (exactMatch) {
                setSelectedMethodId(exactMatch.id);
            } else {
                setSelectedMethodId(matchingMethods[0].id);
            }
        }

        setSelectedMethodType(methodType);
        setView(getTargetViewForMethodType(methodType));
    }, [isOpen, isMarketplaceOrder, originalPaymentMethod, existingPaidAmount, existingPaymentBreakdown, isLoadingMethods, activeMethods, view]);

    // Fetch MP connection status
    useEffect(() => {
        if (!isOpen) return;
        getMercadoPagoStatusAction().then((res) => {
            if ('connected' in res && res.connected) {
                setMpConnected(true);
                setMpPublicKey(res.publicKey || null);
                if ('acceptedPaymentMethods' in res) {
                    setMpAcceptedPaymentMethods(res.acceptedPaymentMethods);
                }
            } else {
                setMpConnected(false);
                setMpPublicKey(null);
                setMpAcceptedPaymentMethods(undefined);
            }
        }).catch(() => {
            setMpConnected(false);
            setMpAcceptedPaymentMethods(undefined);
        });
    }, [isOpen]);

    // Load MP SDK when entering mercadopago view
    useEffect(() => {
        if (view !== 'mercadopago' || !isOpen || mpSdkLoaded) return;
        if ((window as any).MercadoPago) {
            setMpSdkLoaded(true);
            return;
        }
        const script = document.createElement("script");
        script.src = "https://sdk.mercadopago.com/js/v2";
        script.async = true;
        script.onload = () => setMpSdkLoaded(true);
        document.body.appendChild(script);
    }, [view, isOpen, mpSdkLoaded]);

    // Initialize MP Payment Brick
    useEffect(() => {
        if (mpBrickInitializedRef.current) return;
        if (!isOpen || !mpSdkLoaded || view !== 'mercadopago' || mpStep !== 'brick') return;
        mpBrickInitializedRef.current = true;
        initializeMpBrick();

        return () => {
            if (mpBrickIdRef.current) {
                try { mpBrickIdRef.current.unmount(); } catch { }
                mpBrickIdRef.current = null;
                setMpBrickReady(false);
                mpBrickInitializedRef.current = false;
            }
        };
    }, [isOpen, mpSdkLoaded, view, mpStep]);

    const initializeMpBrick = async () => {
        if (typeof window === "undefined" || !(window as any).MercadoPago) {
            setMpBrickError("Erro ao carregar Mercado Pago.");
            return;
        }
        try {
            if (!mpPublicKey) {
                setMpBrickError("Chave pública do Mercado Pago não configurada.");
                return;
            }
            const mp = new (window as any).MercadoPago(mpPublicKey);
            const bricksBuilder = mp.bricks();
            mpInstanceRef.current = mp;
            mpBricksBuilderRef.current = bricksBuilder;

            const container = document.getElementById("erpPaymentBrick_container");
            if (!container) return;

            let preferenceData: any;
            try {
                preferenceData = await fetchJSONWithCSRF<any>("/api/mercadopago/create-preference", {
                    method: "POST",
                    body: {
                        products: cart.map((item: any) => ({
                            id: item.productId,
                            variant_id: item.variantId || undefined,
                            name: item.name,
                            price: item.unitPrice,
                            quantity: item.quantity,
                        })),
                        partnerId,
                    },
                });
            } catch (err: any) {
                setMpBrickError(err?.message || "Erro ao preparar pagamento");
                return;
            }

            const customerName = (customer?.name || customer?.full_name || customer?.fullName || customer?.customer_name || "").trim();
            const nameParts = customerName ? customerName.split(/\s+/) : [];
            const firstName = nameParts[0] || "Cliente";
            const lastName = nameParts.slice(1).join(" ") || "";
            const email = customer?.email || customer?.customer_email || customer?.user?.email || "";

            const rawAddress = customer?.address || customer?.addresses?.[0] || null;
            const address = rawAddress ? {
                zipCode: rawAddress.zipCode || rawAddress.zip_code || "",
                streetName: rawAddress.street || rawAddress.street_name || "",
                streetNumber: rawAddress.number || rawAddress.street_number || "",
                neighborhood: rawAddress.neighborhood || "",
                city: rawAddress.city || "",
                federalUnit: rawAddress.state || rawAddress.federal_unit || "",
            } : undefined;

            const brickController = await bricksBuilder.create("payment", "erpPaymentBrick_container", {
                initialization: {
                    amount: chargeTarget,
                    preferenceId: preferenceData.preference_id,
                    payer: {
                        firstName,
                        lastName,
                        email,
                        ...(address ? { address } : {}),
                    },
                },
                customization: {
                    visual: {
                        style: {
                            theme: "flat",
                            customVariables: {
                                textPrimaryColor: "#003229", textSecondaryColor: "#6b7280",
                                inputBackgroundColor: "#FFFFFF", formBackgroundColor: "#FFFFFF",
                                baseColor: "#059669", baseColorFirstVariant: "#059669E6", baseColorSecondVariant: "#059669E6",
                                errorColor: "#f04438", successColor: "#059669",
                                outlinePrimaryColor: "#ebebeb", outlineSecondaryColor: "#ebebeb",
                                buttonTextColor: "#FFFFFF",
                                fontSizeExtraSmall: "12px", fontSizeSmall: "14px", fontSizeMedium: "15px",
                                fontSizeLarge: "17px", fontSizeExtraLarge: "20px",
                                fontWeightNormal: "400", fontWeightSemiBold: "600",
                                formInputsTextTransform: "none",
                                inputVerticalPadding: "12px", inputHorizontalPadding: "16px",
                                inputBorderWidth: "1px", inputFocusedBorderWidth: "1px",
                                inputFocusedBoxShadow: "0 0 0 3px rgba(5,150,105,0.15)",
                                inputErrorFocusedBoxShadow: "0 0 0 3px rgba(239,68,68,0.15)",
                                borderRadiusSmall: "6px", borderRadiusMedium: "8px", borderRadiusLarge: "12px",
                                formPadding: "16px",
                            },
                        },
                        texts: { formTitle: "", formSubmit: "Pagar" },
                        hidePaymentButton: false,
                        hideFormTitle: false,
                    },
                    paymentMethods: {
                        ticket: mpAcceptedPaymentMethods?.boleto === false ? [] : "all",
                        bankTransfer: mpAcceptedPaymentMethods?.pix === false ? [] : "all",
                        creditCard: mpAcceptedPaymentMethods?.credit_card === false ? [] : "all",
                        debitCard: mpAcceptedPaymentMethods?.debit_card === false ? [] : "all",
                        mercadoPago: mpAcceptedPaymentMethods?.mercado_pago_wallet === false ? [] : "all",
                        atm: mpAcceptedPaymentMethods?.boleto === false ? [] : "all",
                    },
                },
                callbacks: {
                    onReady: () => setMpBrickReady(true),
                    onSubmit: async (formData: any) => await handleMpBrickSubmit(formData),
                    onError: (error: any) => setMpBrickError(error.message || "Erro ao processar pagamento"),
                },
            });
            mpBrickIdRef.current = brickController;
        } catch (err: any) {
            setMpBrickError(err.message || "Erro ao inicializar Payment Brick");
        }
    };

    const handleMpBrickSubmit = async (formData: any) => {
        setMpIsProcessing(true);
        setMpBrickError(null);
        try {
            const resolvedFormData = formData.formData || formData;
            const paymentMethodId = resolvedFormData?.payment_method_id;
            const isRedirectMethod = !paymentMethodId || ["account_money", "consumer_credits", "mercadopago"].includes(paymentMethodId);

            if (isRedirectMethod) {
                setMpStep("mp_redirect");
                setMpIsProcessing(false);
                return;
            }

            const responseData = await fetchJSONWithCSRF<any>("/api/mercadopago/process-erp-payment", {
                method: "POST",
                body: {
                    paymentFormData: resolvedFormData,
                    partnerId,
                    amount: chargeTarget,
                    description: `Venda ERP - ${customer?.name || "Cliente"}`,
                },
            });

            if (responseData.mpPaymentId) setMpPaymentId(responseData.mpPaymentId);

            const status = responseData.paymentStatus;
            const paymentMethod = responseData.paymentMethod;

            if (status === "approved") {
                // Payment approved - register the sale via onConfirm
                handleStartProcessing({
                    paymentMethod: responseData.paymentMethodDisplayName || "Mercado Pago",
                    paymentProvider: "Mercado Pago",
                    mpPaymentId: responseData.mpPaymentId,
                    paymentStatus: "paid",
                    paidAmount: chargeTarget,
                    paymentBreakdown: [{ method: responseData.paymentMethodDisplayName || "Mercado Pago", amount: chargeTarget, paymentMethodId: null, installmentNumber: 1 }],
                    splitPayments: [],
                    isPendingDelivery,
                });
            } else if (status === "pending" && paymentMethod === "pix") {
                const pix = responseData.pixData;
                if (pix?.qrCode && pix?.qrCodeBase64) {
                    setMpPixData({ qrCode: pix.qrCode, qrCodeBase64: pix.qrCodeBase64 });
                    setMpStep("pix");
                } else {
                    setMpBrickError("Dados do Pix não retornados pelo provedor.");
                }
            } else if (status === "pending" && (paymentMethod === "bolbradesco" || paymentMethod === "boleto" || paymentMethod === "ticket")) {
                const boleto = responseData.boletoData;
                if (boleto?.barcode || boleto?.ticketUrl) {
                    setMpBoletoData(boleto);
                    setMpStep("boleto");
                } else {
                    setMpBrickError("Dados do Boleto não retornados pelo provedor.");
                }
            } else if (status === "in_process" || status === "pending") {
                // Payment in analysis - register as pending
                handleStartProcessing({
                    paymentMethod: responseData.paymentMethodDisplayName || "Mercado Pago",
                    paymentProvider: "Mercado Pago",
                    mpPaymentId: responseData.mpPaymentId,
                    paymentStatus: "unpaid",
                    paidAmount: 0,
                    paymentBreakdown: [],
                    splitPayments: [],
                    isPendingDelivery,
                });
            } else {
                setMpBrickError(`Pagamento não aprovado. Status: ${status || "desconhecido"}`);
                setMpStep("error");
            }
        } catch (error: any) {
            console.error("Erro ao processar pagamento ERP MP:", error);
            setMpBrickError(error.message || "Falha ao processar o pagamento.");
            setMpStep("error");
        } finally {
            setMpIsProcessing(false);
        }
    };

    const handleMpConfirmPix = () => {
        handleStartProcessing({
            paymentMethod: "Pix (Mercado Pago)",
            paymentProvider: "Mercado Pago",
            mpPaymentId: mpPaymentId,
            paymentStatus: "paid",
            paidAmount: chargeTarget,
            paymentBreakdown: [{ method: "Pix (Mercado Pago)", amount: chargeTarget, paymentMethodId: null, installmentNumber: 1 }],
            splitPayments: [],
            isPendingDelivery,
        });
    };

    const handleMpCopyPixCode = () => {
        if (mpPixData?.qrCode) {
            navigator.clipboard.writeText(mpPixData.qrCode);
            setMpCopied(true);
            toast({ title: "Código Pix copiado!", description: "Use a opção 'Pix Copia e Cola' no banco." });
            setTimeout(() => setMpCopied(false), 2000);
        }
    };

    const activeSplitLegs = useMemo(
        () => payments.filter((p) => p.method && p.amount > 0.009),
        [payments],
    );

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
                    method: p.method || '-',
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
        }, 500);
        return () => {
            active = false;
            clearTimeout(t);
        };
    }, [view, partnerId, chargeTarget, activeSplitLegs, payments]);

    // Auto-fill amount logic
    useEffect(() => {
        if (view === 'money' || view === 'card' || view === 'pix' || view === 'store_credit') {
            if (userManuallyChangedRef.current) return;
            setIsPixGenerated(false);
            let initialAmt = 0;
            if (editingPaymentIndex !== null) {
                const currentSlot = payments[editingPaymentIndex];
                if (Number(currentSlot.installmentNumber) > 1) {
                    setInstallments(String(currentSlot.installmentNumber));
                }
                if (currentSlot.amount > 0) {
                    initialAmt = Number(currentSlot.amount);
                } else {
                    const otherPaid = payments.reduce((acc, p, idx) => idx !== editingPaymentIndex ? acc + p.amount : acc, 0);
                    const needed = Math.max(0, netChargeTarget - otherPaid);
                    initialAmt = needed > 0 ? needed : 0;
                }
            } else {
                initialAmt = Math.max(0, netChargeTarget);
            }
            setPaymentBaseAmount(initialAmt);
            setCalcBaseAmount(initialAmt);
            userManuallyChangedRef.current = false;
        }
    }, [view, editingPaymentIndex, netChargeTarget, payments]);

    // Debounce base amount input typing to recalculate payment method details
    useEffect(() => {
        const handler = setTimeout(() => {
            setCalcBaseAmount(paymentBaseAmount);
        }, 500);
        return () => clearTimeout(handler);
    }, [paymentBaseAmount]);

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
            setInstallmentOptions([]);
            setIsPaymentCalculationLoading(false);
            return;
        }
        const currentViewIsCardLike = view === "card" || view === "pix" || view === "money" || view === "store_credit";
        if (!currentViewIsCardLike) {
            setPaymentCalculation(null);
            setInstallmentOptions([]);
            setIsPaymentCalculationLoading(false);
            return;
        }
        const installmentNumber = Math.max(1, Number(installments || 1));
        // In split mode, calculate discount/fee based on the leg's amount (calcBaseAmount), not the full total
        const base = editingPaymentIndex !== null
            ? Math.max(0, Number(calcBaseAmount || 0))
            : netChargeTarget;

        const currentMethod = selectedMethodId ? activeMethods.find((m: any) => m.id === selectedMethodId) : null;
        const feeBearer = (currentMethod?.fee_bearer || "merchant") as "merchant" | "customer";

        // Only compute full installment options when method or amount changes
        const shouldComputeOptions = selectedMethodId !== lastOptionsConfigRef.current.methodId
            || base !== lastOptionsConfigRef.current.amount;
        if (shouldComputeOptions) {
            lastOptionsConfigRef.current = { methodId: selectedMethodId, feeBearer, amount: base };
        }

        setIsPaymentCalculationLoading(true);
        calculatePaymentMethodAmountsAction({
            originalAmount: base,
            paymentMethodId: selectedMethodId,
            installmentNumber,
            feeBearer,
            includeInstallmentOptions: shouldComputeOptions,
        }).then((res: any) => {
            if (!active) return;
            if (res?.success) {
                setPaymentCalculation(res);
                // Only overwrite installment options when server computed fresh ones
                if (res.installmentOptions && res.installmentOptions.length > 0) {
                    setInstallmentOptions(res.installmentOptions);
                }
                // Only override paymentBaseAmount in single-payment mode, not split legs
                if (res.finalAmount != null && Number.isFinite(res.finalAmount) && editingPaymentIndex === null) {
                    if (!userManuallyChangedRef.current) {
                        setPaymentBaseAmount(res.finalAmount);
                        const nextInput = res.finalAmount > 0 ? String(Math.round(res.finalAmount * 100)) : "";
                        setCashCalculatorInput(nextInput);
                    }
                }
            } else {
                setPaymentCalculation(null);
                setInstallmentOptions([]);
            }
            setIsPaymentCalculationLoading(false);
        });
        return () => {
            active = false;
        };
    }, [selectedMethodId, installments, chargeTarget, view, editingPaymentIndex, calcBaseAmount, activeMethods]);


    const handleQuickDenomination = (val: number) => {
        userManuallyChangedRef.current = true;
        setCashCalculatorInput(val > 0 ? String(Math.round(val * 100)) : "");
        setPaymentBaseAmount(val);
    };

    const handleMoneyInputSync = (val: number) => {
        userManuallyChangedRef.current = true;
        setPaymentBaseAmount(val);
        setCashCalculatorInput(val > 0 ? String(Math.round(val * 100)) : "");
    };

    const handlePaymentBaseAmountChange = (val: number) => {
        userManuallyChangedRef.current = true;
        setPaymentBaseAmount(val);
    };

    const handleCashNumpadInput = (key: string) => {
        userManuallyChangedRef.current = true;
        const nextRaw = key === '.'
            ? (cashCalculatorInput.includes('.') ? cashCalculatorInput : `${cashCalculatorInput || '0'}.`)
            : `${cashCalculatorInput}${key}`;
        setCashCalculatorInput(nextRaw);
        setPaymentBaseAmount(parseCalculatorInput(nextRaw));
    };

    const handleCashNumpadDelete = () => {
        userManuallyChangedRef.current = true;
        const nextRaw = cashCalculatorInput.slice(0, -1);
        setCashCalculatorInput(nextRaw);
        setPaymentBaseAmount(parseCalculatorInput(nextRaw));
    };

    const splitBaseSum = useMemo(
        () => payments.reduce((acc, p) => acc + (p.method && p.amount > 0.009 ? p.amount : 0), 0),
        [payments],
    );

    const legFinalCharged =
        paymentCalculation?.success && chargeTarget > 0.009
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

    const finalTotalWithMethodPricing = legFinalCharged != null && Number.isFinite(legFinalCharged) ? legFinalCharged : chargeTarget;

    const finalDueForLeg = legFinalCharged != null && Number.isFinite(legFinalCharged) ? legFinalCharged : chargeTarget;

    // Compara o valor base que o operador digitou contra o valor total com a precificação do método aplicado
    const isAllocationUnderpaid = paymentBaseAmount < finalTotalWithMethodPricing - 0.005;
    const isUnderpaid = view === 'split'
        ? ((splitPreview && 'success' in splitPreview && splitPreview.success ? splitPreview.finalTotal : splitBaseSum) < chargeTarget - 0.005)
        : isAllocationUnderpaid;

    const isOverpaid = !isAllocationUnderpaid && paymentBaseAmount > finalTotalWithMethodPricing + 0.005;
    const changeAmount = isOverpaid ? paymentBaseAmount - finalTotalWithMethodPricing : 0;

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
        if (view === 'money' || view === 'pix' || view === 'card' || view === 'store_credit') {
            if (isAllocationUnderpaid) {
                return paymentBaseAmount;
            } else {
                return finalTotalWithMethodPricing;
            }
        }
        return paymentBaseAmount;
    }, [view, splitPreview, splitBaseSum, editingPaymentIndex, payments, paymentBaseAmount, isAllocationUnderpaid, finalTotalWithMethodPricing]);

    const { compactAlertPaid, compactAlertNeed } = useMemo(() => {
        if (view === 'split') {
            const paid = splitPreview && 'success' in splitPreview && splitPreview.success
                ? splitPreview.finalTotal
                : splitBaseSum;
            return { compactAlertPaid: paid, compactAlertNeed: chargeTarget };
        }
        if (editingPaymentIndex !== null) {
            return { compactAlertPaid: allocationTotal, compactAlertNeed: chargeTarget };
        }
        // Para pagamento único: compara o que o operador digitou vs o total calculado do método
        const need = finalTotalWithMethodPricing;
        const paid = isAllocationUnderpaid ? paymentBaseAmount : need;
        return { compactAlertPaid: paid, compactAlertNeed: need };
    }, [view, splitBaseSum, chargeTarget, editingPaymentIndex, allocationTotal, paymentBaseAmount, finalTotalWithMethodPricing, isAllocationUnderpaid, splitPreview]);

    const currentPricingTotals = useMemo(() => {
        if (view === 'split' && splitPreview && 'success' in splitPreview && splitPreview.success) {
            const rows = splitPreview.rows || [];
            const hasMerchantBearer = rows.some((row: any) => row?.feeBearer === "merchant");
            return {
                paymentMethodDiscountAmount: rows.reduce((acc: number, row: any) => acc + Number(row?.paymentMethodDiscountAmount || 0), 0),
                interestAmount: rows.reduce((acc: number, row: any) => acc + Number(row?.interestAmount || 0), 0),
                feeAmount: rows.reduce((acc: number, row: any) => acc + Number(row?.feeAmount || 0), 0),
                fixedFeeAmount: rows.reduce((acc: number, row: any) => acc + Number(row?.fixedFeeAmount || 0), 0),
                feeBearer: hasMerchantBearer ? "merchant" as const : "customer" as const,
            };
        }
        if (paymentCalculation?.success) {
            return {
                paymentMethodDiscountAmount: Number(paymentCalculation.paymentMethodDiscountAmount || 0),
                interestAmount: Number(paymentCalculation.interestAmount || 0),
                feeAmount: Number(paymentCalculation.feeAmount || 0),
                fixedFeeAmount: Number(paymentCalculation.fixedFeeAmount || 0),
                feeBearer: paymentCalculation.feeBearer,
                appliedDiscountPercent: Number(paymentCalculation.appliedDiscountPercent || 0),
                appliedFeePercent: Number(paymentCalculation.appliedFeePercent || 0),
                appliedInterestPercent: Number(paymentCalculation.appliedInterestPercent || 0),
            };
        }
        return {
            paymentMethodDiscountAmount: 0,
            interestAmount: 0,
            feeAmount: 0,
            fixedFeeAmount: 0,
            feeBearer: "merchant" as const,
            appliedDiscountPercent: 0,
            appliedFeePercent: 0,
            appliedInterestPercent: 0,
        };
    }, [view, splitPreview, paymentCalculation]);

    const displayTransactionTotal = paymentStatus === "success" && successSnapshot
        ? successSnapshot.displayOrderTotal
        : view === 'split'
            ? chargeTarget
            : (view === 'money' || view === 'card' || view === 'pix' || view === 'store_credit')
                ? finalTotalWithMethodPricing
                : total;

    const receiptPricingDetails = useMemo(() => {
        const source = paymentStatus === "success" && successSnapshot
            ? {
                paymentMethodDiscountAmount: successSnapshot.paymentMethodDiscountAmount,
                interestAmount: successSnapshot.interestAmount,
                feeAmount: successSnapshot.feeAmount,
                fixedFeeAmount: successSnapshot.fixedFeeAmount,
                feeBearer: successSnapshot.feeBearer,
                appliedDiscountPercent: successSnapshot.appliedDiscountPercent,
                appliedFeePercent: successSnapshot.appliedFeePercent,
                appliedInterestPercent: successSnapshot.appliedInterestPercent,
            }
            : currentPricingTotals;

        const isMerchant = source.feeBearer === "merchant";

        if (isMerchant) {
            const juros = Number(source.interestAmount || 0);
            const taxa = Number(source.feeAmount || 0);
            const custo = Number(source.fixedFeeAmount || 0);
            const totalAbsorbed = juros + taxa + custo;

            const tooltipRows = [
                juros > 0 ? { label: "Juros", value: formatCurrency(juros) } : null,
                taxa > 0 ? { label: "Taxa", value: formatCurrency(taxa) } : null,
                custo > 0 ? { label: "Custo do método", value: formatCurrency(custo) } : null,
            ].filter(Boolean) as Array<{ label: string; value: string }>;

            return [
                source.paymentMethodDiscountAmount > 0 ? { label: `Desc. meio pagamento${source.appliedDiscountPercent ? ` (${source.appliedDiscountPercent}%)` : ''}`, amount: source.paymentMethodDiscountAmount, prefix: '-', tone: 'positive' } : null,
                totalAbsorbed > 0.009 ? {
                    label: "Taxas/juros absorvidos",
                    amount: totalAbsorbed,
                    isAbsorbed: true,
                    tooltipTitle: "Custos absorvidos pela empresa",
                    tooltipRows,
                } : null,
            ].filter(Boolean);
        }

        return [
            source.paymentMethodDiscountAmount > 0 ? { label: `Desc. meio pagamento${source.appliedDiscountPercent ? ` (${source.appliedDiscountPercent}%)` : ''}`, amount: source.paymentMethodDiscountAmount, prefix: '-', tone: 'positive' } : null,
            source.interestAmount > 0 ? { label: `Juros${source.appliedInterestPercent ? ` (${source.appliedInterestPercent}%)` : ''}`, amount: source.interestAmount, prefix: '+', tone: 'neutral' } : null,
            source.feeAmount > 0 ? { label: `Taxas${source.appliedFeePercent ? ` (${source.appliedFeePercent}%)` : ''}`, amount: source.feeAmount, tone: 'neutral' } : null,
            source.fixedFeeAmount > 0 ? { label: "Custo do método", amount: source.fixedFeeAmount, prefix: '+', tone: 'neutral' } : null,
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

    const selectedMethodObj = selectedMethodId ? activeMethods.find((m: any) => m.id === selectedMethodId) : null;
    const selectedMethodHasPaymentCost = Boolean(selectedMethodObj) && (
        Number(selectedMethodObj?.fee_percent || 0) > 0.009 ||
        Number(selectedMethodObj?.fee_fixed || 0) > 0.009 ||
        Number(paymentCalculation?.interestAmount || 0) > 0.009 ||
        Number(paymentCalculation?.feeAmount || 0) > 0.009 ||
        installmentOptions.some((opt: any) => Number(opt?.totalInterest || 0) > 0.009 || Number(opt?.totalFee || 0) > 0.009)
    );

    const getBaseAmountFromFinal = (finalAmt: number) => {
        if (!paymentCalculation?.success || !selectedMethodObj) {
            return finalAmt;
        }
        const feePercent = Math.max(0, Number(selectedMethodObj.fee_percent || 0));
        const feeFixed = Math.max(0, Number(selectedMethodObj.fee_fixed || 0));
        const feeBearer = selectedMethodObj.fee_bearer || "merchant";
        const discountPercent = Number(selectedMethodObj.discount_percent || 0);
        const totalInterestPercent = Number(paymentCalculation.appliedInterestPercent || 0);

        const d = discountPercent / 100;
        const r = totalInterestPercent / 100;
        const fp = feePercent / 100;
        const fx = feeFixed;

        const A = (1 - d) * (1 + r);
        if (A <= 0) return finalAmt;

        if (feeBearer === "customer") {
            if (finalAmt <= fx) return 0;
            return (finalAmt - fx) / (A * (1 + fp));
        } else {
            return finalAmt / A;
        }
    };

    // Poll payment status for pre-created Pix/Boleto order
    useEffect(() => {
        if (!preCreatedOrderId) return;
        if (mpStep !== "pix" && mpStep !== "boleto") return;

        let intervalId: any;
        let isChecking = false;

        const checkStatus = async () => {
            if (isChecking) return;
            isChecking = true;
            try {
                const response = await fetch("/api/orders/sync-payment-status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orderId: preCreatedOrderId }),
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.newStatus === "paid" || data.paymentStatus === "approved") {
                        const remainingPartial = 0;
                        const snapshotBreakdown = [
                            { method: mpStep === "pix" ? "Pix (Mercado Pago)" : "Boleto (Mercado Pago)", amount: chargeTarget }
                        ];

                        setSuccessSnapshot({
                            subTotal,
                            itemCount,
                            shippingFee: Number(shippingFee || 0),
                            otherCosts: Number(otherCosts || 0),
                            discountAmount: Number(discountAmount || 0),
                            total,
                            displayOrderTotal: displayTransactionTotal,
                            totalPaid: chargeTarget,
                            change: 0,
                            isUnderpaid: false,
                            remainingPartial,
                            paymentMethodDiscountAmount: Number(currentPricingTotals.paymentMethodDiscountAmount || 0),
                            interestAmount: Number(currentPricingTotals.interestAmount || 0),
                            feeAmount: Number(currentPricingTotals.feeAmount || 0),
                            fixedFeeAmount: Number(currentPricingTotals.fixedFeeAmount || 0),
                            feeBearer: currentPricingTotals.feeBearer,
                            appliedDiscountPercent: currentPricingTotals.appliedDiscountPercent,
                            appliedFeePercent: currentPricingTotals.appliedFeePercent,
                            appliedInterestPercent: currentPricingTotals.appliedInterestPercent,
                            receiptCart: Array.isArray(cart) ? cart.map((row: any) => ({ ...row })) : [],
                            paymentBreakdown: snapshotBreakdown,
                        });

                        setSaleId(data.orderNumber || "DDT000000");
                        setPaymentStatus('success');
                        setPreCreatedOrderId(null); // Stop polling
                    }
                }
            } catch (error) {
                console.error("Error polling payment status:", error);
            } finally {
                isChecking = false;
            }
        };

        intervalId = setInterval(checkStatus, 3000);

        return () => {
            clearInterval(intervalId);
        };
    }, [preCreatedOrderId, mpStep, chargeTarget, subTotal, itemCount, shippingFee, otherCosts, discountAmount, total, displayTransactionTotal, currentPricingTotals, cart]);

    const getTitle = () => {
        const selectedTypeLabel =
            selectedMethodType === "pix" ? "Pix" :
                selectedMethodType === "cash" ? "Dinheiro" :
                    selectedMethodType === "card" ? "Cartão" : "Método";
        const methodSuffix = selectedMethodObj?.name ? ` ("${selectedMethodObj.name}")` : '';
        switch (view) {
            case 'methods': return 'Método de Pagamento';
            case 'method_type_select': return `Selecionar ${selectedTypeLabel}`;
            case 'money': return `Dinheiro${methodSuffix}`;
            case 'card': return `Cartão${methodSuffix}`;
            case 'pix': return `Pix${methodSuffix}`;
            case 'split': return 'Dividir Pagamento';
            case 'split_method_select': return 'Selecionar Método';
            case 'mercadopago': return mpStep === 'pix' ? 'Pix (Mercado Pago)' : mpStep === 'boleto' ? 'Boleto (Mercado Pago)' : 'Mercado Pago';
            default: return 'Pagamento';
        }
    };

    const handleGoBack = () => {
        if (view === 'mercadopago') {
            // Clean up brick when going back
            if (mpBrickIdRef.current) {
                try { mpBrickIdRef.current.unmount(); } catch { }
                mpBrickIdRef.current = null;
            }
            mpBrickInitializedRef.current = false;
            setMpBrickReady(false);
            setMpBrickError(null);
            setMpStep('brick');
            setMpPixData(null);
            setMpBoletoData(null);
            setMpPaymentId(null);
            setView('methods');
        } else if (view === 'money' || view === 'card' || view === 'pix' || view === 'store_credit') {
            resetSelectedMethodPricing();
            if (editingPaymentIndex !== null) {
                setView('split_method_select');
            } else if (isMarketplaceOrder) {
                // Marketplace orders: back from payment input closes the modal
                // since they can't change the payment method
                onClose();
            } else {
                setView('methods');
            }
        } else if (view === 'split_method_select') {
            resetSelectedMethodPricing({ resetInstallments: false });
            if (splitSelectedType) {
                setSplitSelectedType(null);
            } else {
                setView('split');
                setEditingPaymentIndex(null);
            }
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
            const formattedLabel = getFormattedMethodLabel(method.name, method.type);
            const newPayments = [...payments];
            newPayments[editingPaymentIndex] = {
                ...newPayments[editingPaymentIndex],
                method: formattedLabel,
                paymentMethodId: method.id,
            };
            setPayments(newPayments);
            setPaymentCalculation(null);
            setSelectedMethodId(method.id);
            userManuallyChangedRef.current = false;
            setInstallments(String(newPayments[editingPaymentIndex]?.installmentNumber || 1));
            const normalizedType = normalizeMethodType(method.type);
            setView(getTargetViewForMethodType(normalizedType));
        }
    };

    const openMethodTypeSelection = (methodType: string) => {
        resetSelectedMethodPricing({ clearType: false });

        if (methodType === "store_credit") {
            setView("store_credit");
            return;
        }

        const methodsOfType = activeMethods.filter((method: any) => normalizeMethodType(method.type) === methodType);

        if (methodsOfType.length === 0 && methodType !== "cash") {
            toast({
                title: "Sem métodos ativos",
                description: `Nenhum método deste tipo ativo encontrado.`,
                variant: "destructive",
            });
            return;
        }

        if (methodsOfType.length === 1) {
            const only = methodsOfType[0];
            setSelectedMethodId(only.id);
            userManuallyChangedRef.current = false;
            setPaymentCalculation(null);
            setView(getTargetViewForMethodType(methodType));
            return;
        }

        if (methodsOfType.length === 0 && methodType === "cash") {
            setView("money");
            return;
        }

        setSelectedMethodType(methodType);
        setView("method_type_select");
    };

    const buildConfirmPayload = (isUnpaidRegister?: boolean) => {
        const hasCreditLeg = useStoreCredit && effectiveCreditApplied > 0.009;

        const storeCreditLeg = hasCreditLeg ? [{
            method: 'store_credit',
            amount: effectiveCreditApplied,
            amountReceived: effectiveCreditApplied,
            adjustmentType: 'none',
            adjustmentPercent: 0,
            adjustmentAmount: 0,
            effectiveAmount: effectiveCreditApplied,
            netAmount: effectiveCreditApplied,
            feeBearer: 'merchant',
            paymentMethodDiscountAmount: 0,
            interestAmount: 0,
            feeAmount: 0,
            fixedFeeAmount: 0,
            paymentMethodId: null,
            installmentNumber: 1,
        }] : [];

        const isCreditOnlyConfirm = view === 'methods' && hasCreditLeg;

        let selectedLegs: any[] = [];

        if (isCreditOnlyConfirm) {
            selectedLegs = [];
        } else if (view === 'split') {
            const splitFinalCharged =
                splitPreview && 'success' in splitPreview && splitPreview.success
                    ? splitPreview.finalTotal
                    : null;

            selectedLegs = payments
                .filter((payment) => payment.method && payment.amount > 0.009)
                .map((payment, i) => {
                    const pr = splitPreview && 'success' in splitPreview && splitPreview.success
                        ? splitPreview.rows[i]
                        : null;
                    const finalAmt = Number(pr?.finalAmount ?? payment.amount ?? 0);
                    return {
                        method: payment.method,
                        amount: finalAmt,
                        amountReceived: isUnpaidRegister ? 0 : Number(pr?.amountReceived ?? payment.amount ?? 0),
                        adjustmentType: pr?.adjustmentType || 'none',
                        adjustmentPercent: Number(pr?.adjustmentPercent || 0),
                        adjustmentAmount: Number(pr?.adjustmentAmount || 0),
                        effectiveAmount: Number(pr?.effectiveAmount ?? finalAmt),
                        netAmount: Number(pr?.netAmount ?? finalAmt),
                        feeBearer: pr?.feeBearer || null,
                        paymentMethodDiscountAmount: Number(pr?.paymentMethodDiscountAmount || 0),
                        interestAmount: Number(pr?.interestAmount || 0),
                        feeAmount: Number(pr?.feeAmount || 0),
                        fixedFeeAmount: Number(pr?.fixedFeeAmount || 0),
                        paymentMethodId: payment.paymentMethodId || null,
                        installmentNumber: Math.max(1, Number(payment.installmentNumber || 1)),
                    };
                });
        } else {
            const isUnpaid = isUnpaidRegister || (netChargeTarget > 0 && paymentBaseAmount === 0);
            const methodLeg = {
                method: (() => {
                    if (isMarketplaceOrder && originalPaymentMethod) {
                        return formatPaymentMethodToFullLabel(originalPaymentMethod);
                    }
                    const selectedMethodObj = selectedMethodId ? activeMethods.find((method: any) => method.id === selectedMethodId) : null;
                    if (selectedMethodObj) {
                        return getFormattedMethodLabel(selectedMethodObj.name, selectedMethodObj.type);
                    }
                    if (isUnpaid) {
                        return 'Pendente';
                    }
                    const fallbackName = view === 'money' ? 'Dinheiro' : (view === 'pix' ? 'Pix' : 'Cartão');
                    const fallbackType = view === 'money' ? 'cash' : (view === 'pix' ? 'pix' : 'card');
                    return getFormattedMethodLabel(fallbackName, fallbackType);
                })(),
                amount: isUnpaid ? 0 : Number(totalPaidCalculated || 0),
                amountReceived: isUnpaid ? 0 : (view === 'money'
                    ? (wantsChange ? Math.max(payWithAmount, totalPaidCalculated) : Math.max(paymentBaseAmount, totalPaidCalculated))
                    : Number(paymentCalculation?.amountReceived ?? totalPaidCalculated ?? 0)),
                wantsChange: view === 'money' ? wantsChange : undefined,
                payWithAmount: view === 'money' && wantsChange ? payWithAmount : undefined,
                changeAmount: isUnpaid ? 0 : (view === 'money'
                    ? (wantsChange
                        ? Number((payWithAmount - totalPaidCalculated).toFixed(2))
                        : (paymentBaseAmount > totalPaidCalculated
                            ? Number((paymentBaseAmount - totalPaidCalculated).toFixed(2))
                            : 0))
                    : 0),
                adjustmentType: paymentCalculation?.adjustmentType || 'none',
                adjustmentPercent: Number(paymentCalculation?.adjustmentPercent || 0),
                adjustmentAmount: Number(paymentCalculation?.adjustmentAmount || 0),
                effectiveAmount: isUnpaid ? 0 : Number(paymentCalculation?.effectiveAmount ?? totalPaidCalculated ?? 0),
                netAmount: isUnpaid ? 0 : Number(paymentCalculation?.netAmount ?? totalPaidCalculated ?? 0),
                feeBearer: paymentCalculation?.feeBearer || null,
                paymentMethodDiscountAmount: Number(paymentCalculation?.paymentMethodDiscountAmount || 0),
                interestAmount: Number(paymentCalculation?.interestAmount || 0),
                feeAmount: Number(paymentCalculation?.feeAmount || 0),
                fixedFeeAmount: Number(paymentCalculation?.fixedFeeAmount || 0),
                paymentMethodId: selectedMethodId || null,
                installmentNumber: Math.max(1, Number(installments || 1)),
            };

            selectedLegs = [methodLeg].filter((l) => l.amount > 0.009 || isUnpaidRegister);
        }

        const rawPaymentBreakdown = [...storeCreditLeg, ...selectedLegs];
        const newPaymentBreakdown = rawPaymentBreakdown;

        const validExistingBreakdown = existingPaidAmount > 0.009 ? (existingPaymentBreakdown || []) : [];

        const mergedPaymentBreakdown = [...validExistingBreakdown, ...newPaymentBreakdown]
            .filter((entry: any) => entry?.method && (Number(entry?.amount || 0) > 0.009 || isUnpaidRegister));

        const paymentMethod = Array.from(new Set(mergedPaymentBreakdown.map((entry: any) => formatPaymentMethodToFullLabel(entry.method)))).join(', ') || 'Método não definido';

        const splitFinalCharged =
            view === 'split' && splitPreview && 'success' in splitPreview && splitPreview.success
                ? splitPreview.finalTotal
                : null;

        const singleRegisterAmount =
            view !== 'split' ? (isUnpaidRegister ? 0 : (effectiveCreditApplied + (isCreditOnlyConfirm ? 0 : totalPaidCalculated))) : (effectiveCreditApplied + (splitFinalCharged || 0));

        const paidToRegister =
            existingPaidAmount + singleRegisterAmount;

        const isUnderpaid = paidToRegister < chargeTarget - 0.005;

        return {
            paymentMethod: paymentMethod || 'Método não definido',
            paymentBreakdown: mergedPaymentBreakdown,
            splitPayments: view === 'split' ? payments : [],
            paymentStatus: isUnpaidRegister ? 'unpaid' : (isUnderpaid ? 'partially_paid' : 'paid'),
            isPendingDelivery,
            paidAmount: paidToRegister
        };
    };

    const handleGeneratePixWithKey = async (keyToUse: string, typeToUse: string) => {
        if (!selectedMethodId) return;
        setIsGeneratingPix(true);
        try {
            const payload = generateStaticPix(
                keyToUse,
                paymentBaseAmount,
                selectedStore?.name || "Loja",
                "",
                "DUDIT",
                typeToUse
            );
            const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 });
            setPixQrData({ payload, qrDataUrl });
            setShowPixQrModal(true);
        } catch (err) {
            console.error("Error generating static Pix:", err);
        } finally {
            setIsGeneratingPix(false);
        }
    };

    const handleGeneratePix = async () => {
        if (!selectedMethodId) return;

        setIsGeneratingPix(true);
        try {
            const res = await getPaymentMethodDetailsAction(selectedMethodId);
            if (res.success && res.method.pix_key) {
                setHasPixKey(true);
                const payload = generateStaticPix(
                    res.method.pix_key,
                    paymentBaseAmount,
                    selectedStore?.name || "Loja",
                    "",
                    "DUDIT",
                    res.method.pix_key_type
                );
                const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 });
                setPixQrData({ payload, qrDataUrl });
                setShowPixQrModal(true);
            } else {
                setHasPixKey(false);
                setShowWarningModal(true);
                setShowKeyInputs(true);
            }
        } catch (err) {
            console.error("Error generating static Pix:", err);
        } finally {
            setIsGeneratingPix(false);
        }
    };

    const handleStartProcessing = async (forcedPayload?: any, isUnpaidRegister?: boolean) => {
        if (view === 'money' && wantsChange && payWithAmount < totalPaidCalculated && !isUnpaidRegister) {
            toast({
                title: "Valor de troco inválido",
                description: `O valor pago (R$ ${payWithAmount.toFixed(2)}) deve ser maior ou igual ao valor a receber (R$ ${totalPaidCalculated.toFixed(2)}).`,
                variant: "destructive",
            });
            return;
        }

        const remainingPartial = Math.max(0, displayTransactionTotal - totalPaidCalculated)
        const payload = forcedPayload || buildConfirmPayload(isUnpaidRegister);
        setLastPaymentPayload(payload);

        if (payload?.isPreCreate) {
            try {
                const result = await onConfirm(payload);
                if (result?.success) {
                    setPreCreatedOrderId(result.orderId || null);
                } else {
                    console.error("Error pre-creating order:", result?.error);
                    toast({
                        title: "Erro ao pré-criar pedido",
                        description: result?.error || "Não foi possível registrar o pedido no banco de dados.",
                        variant: "destructive",
                    });
                }
            } catch (error: any) {
                console.error("Unexpected error pre-creating order:", error);
                toast({
                    title: "Erro inesperado",
                    description: "Ocorreu um problema ao pré-criar o pedido.",
                    variant: "destructive",
                });
            }
            return;
        }

        // Build per-method summary for success snapshot using payload breakdown data
        const snapshotBreakdown: Array<{ method: string; amount: number }> = []
        if (payload?.paymentBreakdown) {
            payload.paymentBreakdown.forEach((p: any) => {
                snapshotBreakdown.push({ method: p.method || '', amount: p.amount })
            })
        }

        const isPendingPayment = isUnpaidRegister || paymentPendingType !== 'none';
        const snapshotTotalPaid = isPendingPayment ? existingPaidAmount : totalPaidCalculated;
        const snapshotIsUnderpaid = isPendingPayment ? (displayTransactionTotal > existingPaidAmount + 0.005) : isUnderpaid;
        const snapshotRemainingPartial = isPendingPayment ? Math.max(0, displayTransactionTotal - existingPaidAmount) : remainingPartial;
        const snapshotChange = isPendingPayment ? 0 : changeAmount;

        setSuccessSnapshot({
            subTotal,
            itemCount,
            shippingFee: Number(shippingFee || 0),
            otherCosts: Number(otherCosts || 0),
            discountAmount: Number(discountAmount || 0),
            total,
            displayOrderTotal: displayTransactionTotal,
            totalPaid: snapshotTotalPaid,
            change: snapshotChange,
            isUnderpaid: snapshotIsUnderpaid,
            remainingPartial: snapshotRemainingPartial,
            paymentMethodDiscountAmount: Number(currentPricingTotals.paymentMethodDiscountAmount || 0),
            interestAmount: Number(currentPricingTotals.interestAmount || 0),
            feeAmount: Number(currentPricingTotals.feeAmount || 0),
            fixedFeeAmount: Number(currentPricingTotals.fixedFeeAmount || 0),
            feeBearer: currentPricingTotals.feeBearer,
            appliedDiscountPercent: currentPricingTotals.appliedDiscountPercent,
            appliedFeePercent: currentPricingTotals.appliedFeePercent,
            appliedInterestPercent: currentPricingTotals.appliedInterestPercent,
            receiptCart: Array.isArray(cart) ? cart.map((row: any) => ({ ...row })) : [],
            paymentBreakdown: snapshotBreakdown,
        })
        setPaymentStatus('processing');

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
    const standardTransition = { duration: 0.15, ease: [0.4, 0, 0.2, 1] as const };

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

    if (!isVisible) return null;
    const isCloseLocked = paymentStatus === 'processing';
    const handleSafeClose = () => {
        if (isCloseLocked) return;
        onClose();
    };
    const isSinglePricingBusy =
        (view === 'money' || view === 'card' || view === 'pix' || view === 'store_credit') &&
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
        const methodObj = paymentMethodId ? activeMethods.find((m: any) => m.id === paymentMethodId) : null;
        const typeFromId = methodObj?.type;
        const resolvedType = typeFromId || (method ? normalizeMethodType(method) : 'other');
        if (resolvedType === 'cash') return MoneyIcon;
        if (resolvedType === 'pix') return QRCodeIcon;
        if (['credit_card', 'debit_card'].includes(resolvedType)) return CreditCardIcon;
        if (resolvedType === 'bank_transfer') return FileIcon;
        const label = (method || '').toLowerCase();
        if (label.includes('pix')) return QRCodeIcon;
        if (label.includes('dinheiro')) return MoneyIcon;
        if (label.includes('credito') || label.includes('cartão') || label.includes('cartao') || label.includes('débito') || label.includes('debito')) return CreditCardIcon;
        if (label.includes('transferência') || label.includes('transferencia') || label.includes('ted') || label.includes('doc')) return FileIcon;
        return TagIcon;
    }

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

                    {/* Customer Info Section */}
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <UserProfileImage
                                fullName={customer?.name || 'Consumidor Final'}
                                imageUrl={customer?.image_url || customer?.avatar_url || customer?.avatarUrl || customer?.image}
                                className="w-12 h-12 text-white font-medium text-lg shrink-0"
                            />
                            <div className="flex flex-col overflow-hidden">
                                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[180px]">{customer?.name || 'Consumidor Final'}</span>
                                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">{headerSubtitle}</span>
                            </div>
                        </div>
                        <div className="flex flex-col items-end text-right justify-center">
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
                            pricingDetails={receiptPricingDetails}
                            deliveryBreakdown={deliveryBreakdown}
                        />
                    </div>
                </div>

                {/* --- RIGHT COLUMN: PAYMENT INPUTS --- */}
                <div className="w-full md:w-[60%] bg-white dark:bg-dark-surface flex flex-col relative h-full">

                    {/* Header */}
                    {paymentStatus === 'input' && (
                        <div className="px-6 py-6 md:px-10 md:pt-10 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3 overflow-hidden">
                                {view !== 'methods' && !isMarketplaceOrder && !(existingPaidAmount > 0.009) && (
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
                                            <div className="md:hidden flex items-center justify-between mb-6 px-1">
                                                <div className="flex items-center gap-4">
                                                    <UserProfileImage
                                                        fullName={customer?.name || 'Consumidor Final'}
                                                        imageUrl={customer?.image_url || customer?.avatar_url || customer?.avatarUrl || customer?.image}
                                                        className="w-12 h-12 text-white font-medium text-lg shrink-0"
                                                    />
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[150px]">{customer?.name || 'Consumidor Final'}</span>
                                                        <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">{headerSubtitle}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end text-right justify-center">
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">{formatDate(new Date())}</span>
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">{formatTime(new Date())}</span>
                                                </div>
                                            </div>

                                            {isLoadingMethods && activeMethods.length === 0 ? (
                                                <div className="grid grid-cols-2 gap-4">
                                                    {[1, 2, 3, 4, 5, 6].map((i) => (
                                                        <div key={i} className="flex flex-col items-center justify-center gap-2 md:gap-3 h-28 md:h-32 rounded-2xl border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-dark-border/10 animate-pulse">
                                                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gray-200 dark:bg-dark-border/50" />
                                                            <div className="h-3 w-20 bg-gray-200 dark:bg-dark-border/50 rounded" />
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-4">
                                                    {allowDepositCharge && mpConnected && existingPaidAmount <= 0.009 && depositChargeAmount > 0.009 && (
                                                        <div className="p-4 border border-brand-border dark:border-dark-border rounded-xl bg-brand-gray/30 dark:bg-dark-border/20">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Gerar cobrança de sinal{effectiveDepositPercent ? ` (${effectiveDepositPercent}%)` : ""}</p>
                                                                    <p className="text-xs text-brand-inactive-text">Pix Mercado Pago - {formatCurrency(depositChargeAmount)}</p>
                                                                </div>
                                                                <Button variant="filled" onClick={handleGenerateDepositCharge} isLoading={generatingDepositPix}>
                                                                    {depositMpPixData ? "Visualizar Pix" : "Gerar Pix"}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {customerCredit > 0.009 && (
                                                         <div className="p-4 rounded-2xl border border-green-300 dark:border-green-800/50 bg-green-50/80 dark:bg-green-950/20 shadow-sm transition-all">
                                                             <div className="flex items-center justify-between gap-3">
                                                                 <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                     <Checkbox
                                                                         id="use-store-credit-checkbox"
                                                                         checked={useStoreCredit}
                                                                         onChange={(checked: any) => {
                                                                             setUseStoreCredit(Boolean(checked));
                                                                         }}
                                                                     />
                                                                     <div className="min-w-0 flex-1">
                                                                         <span className="font-bold text-sm text-brand-dark dark:text-dark-heading block truncate">
                                                                             Usar crédito do cliente
                                                                         </span>
                                                                         <span className="text-xs text-brand-green font-semibold block mt-0.5">
                                                                             Saldo disponível: {formatCurrency(customerCredit)}
                                                                         </span>
                                                                     </div>
                                                                 </div>
                                                                 {useStoreCredit && (
                                                                     <div className="w-32 shrink-0">
                                                                         <MoneyInput
                                                                             value={storeCreditToUse}
                                                                             onChange={(val: any) => {
                                                                                 const num = Math.min(customerCredit, Math.min(chargeTarget, Math.max(0, Number(val || 0))));
                                                                                 setStoreCreditToUse(num);
                                                                             }}
                                                                             className="text-right font-bold text-sm h-9"
                                                                         />
                                                                     </div>
                                                                 )}
                                                             </div>
                                                             {useStoreCredit && (
                                                                 <div className="mt-3 pt-2.5 border-t border-green-200 dark:border-green-800/40 flex justify-between items-center text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                                     <span>Abatido no crédito: <strong className="text-brand-green">{formatCurrency(effectiveCreditApplied)}</strong></span>
                                                                     <span>Restante a pagar: <strong className="text-brand-primary">{formatCurrency(netChargeTarget)}</strong></span>
                                                                 </div>
                                                             )}
                                                             {useStoreCredit && netChargeTarget <= 0.009 && (
                                                                 <div className="mt-3">
                                                                     <Button
                                                                         variant="filled"
                                                                         className="w-full h-11 text-sm font-bold bg-brand-green text-white hover:bg-brand-green/90"
                                                                         onClick={() => handleStartProcessing()}
                                                                     >
                                                                         Confirmar Pagamento com Crédito ({formatCurrency(effectiveCreditApplied)})
                                                                     </Button>
                                                                 </div>
                                                             )}
                                                         </div>
                                                     )}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {availableMethodTypes.has("cash") && (
                                                            <PaymentMethodCard
                                                                icon={MoneyIcon}
                                                                label="Dinheiro"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => openMethodTypeSelection("cash")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("pix") && (
                                                            <PaymentMethodCard
                                                                icon={QRCodeIcon}
                                                                label="Pix"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => openMethodTypeSelection("pix")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("credit_card") && (
                                                            <PaymentMethodCard
                                                                icon={CreditCardIcon}
                                                                label="Cartão de Crédito"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => openMethodTypeSelection("credit_card")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("debit_card") && (
                                                            <PaymentMethodCard
                                                                icon={CreditCardIcon}
                                                                label="Cartão de Débito"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => openMethodTypeSelection("debit_card")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("bank_transfer") && (
                                                            <PaymentMethodCard
                                                                icon={FileIcon}
                                                                label="Transferência"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => openMethodTypeSelection("bank_transfer")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("other") && (
                                                            <PaymentMethodCard
                                                                icon={TagIcon}
                                                                label="Outros"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => openMethodTypeSelection("other")}
                                                            />
                                                        )}
                                                        <PaymentMethodCard
                                                            icon={SplitIcon}
                                                            label="Dividir"
                                                            disabled={isMarketplaceOrder}
                                                            onClick={() => { resetSelectedMethodPricing({ clearType: true }); setView('split'); }}
                                                        />
                                                        {mpConnected && !isMarketplaceOrder && (
                                                            <button
                                                                onClick={() => { resetSelectedMethodPricing({ clearType: true }); setMpStep("brick"); setView('mercadopago'); }}
                                                                className="flex flex-col items-center justify-center gap-2 md:gap-3 h-28 md:h-32 rounded-2xl border border-brand-border dark:border-dark-border transition-colors group bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/20"
                                                            >
                                                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#00b1ea]/10 flex items-center justify-center transition-colors group-hover:bg-white dark:group-hover:bg-dark-surface overflow-hidden">
                                                                    <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="MP" className="w-6 h-6 md:w-7 md:h-7 object-contain" />
                                                                </div>
                                                                <span className="font-bold text-xs md:text-sm text-brand-dark dark:text-dark-heading">Mercado Pago</span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    {!lockPaymentCompletion && (
                                                        <div className="mt-4">
                                                            <Button
                                                                variant="outline"
                                                                className="w-full h-12 text-sm font-bold border-brand-border dark:border-dark-border"
                                                                onClick={() => handleStartProcessing(undefined, true)}
                                                            >
                                                                Registrar venda (sem pagamento)
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </motion.div>
                                    )}

                                    {view === 'money' && (
                                        <motion.div key="money" variants={contentVariants} initial="initial" animate="animate" exit="exit" className={cn("w-full h-full flex flex-col items-center px-2", isSinglePricingBusy && "opacity-60")}>
                                            {isMarketplaceOrder && (
                                                <div className="w-full max-w-sm mb-4">
                                                    <InfoCard color="blue" title="Método escolhido pelo cliente" message="Pagamento via marketplace - não é possível alterar o  método de pagamento." />
                                                </div>
                                            )}
                                            <CompactPaymentStatusAlert totalPaid={compactAlertPaid} totalNeed={compactAlertNeed} />
                                            <div className="w-full max-w-sm space-y-3">
                                                <div className="min-w-0 flex-1">
                                                    <PaymentAmountLabel
                                                        label="Valor a receber"
                                                        calculation={paymentCalculation}
                                                        baseAllocated={calcBaseAmount}
                                                    />
                                                    <MoneyInput
                                                        value={paymentBaseAmount}
                                                        onChange={handleMoneyInputSync}
                                                        className="font-bold text-lg"
                                                    />
                                                </div>
                                                <div className="flex items-center space-x-2 mt-2 select-none">
                                                    <Checkbox
                                                        id="needs-change-checkbox"
                                                        label="Precisa de troco?"
                                                        checked={wantsChange}
                                                        onChange={(val: any) => {
                                                            const isChecked = typeof val === "boolean" ? val : Boolean(val?.target?.checked);
                                                            setWantsChange(isChecked);
                                                            if (isChecked && payWithAmount <= paymentBaseAmount) {
                                                                setPayWithAmount(paymentBaseAmount);
                                                            }
                                                        }} />
                                                </div>
                                                {wantsChange && (
                                                    <div className="mt-3 space-y-3 animate-fade-in">
                                                        <MoneyInput
                                                            label="Pagará com quanto?"
                                                            value={payWithAmount}
                                                            onChange={(val: any) => setPayWithAmount(Number(val || 0))}
                                                            className="font-bold"
                                                        />
                                                        {payWithAmount > paymentBaseAmount && (
                                                            <div className="p-3 bg-blue-50 dark:bg-dark-border/20 border border-blue-200 dark:border-blue-900/30 rounded-xl text-sm flex justify-between items-center font-medium">
                                                                <span className="text-brand-dark dark:text-dark-heading">Levar troco:</span>
                                                                <span className="font-bold text-brand-primary">
                                                                    {formatCurrency(payWithAmount - paymentBaseAmount)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
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
                                            <></>
                                            {isSinglePricingBusy && (
                                                <div className="mb-4 flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
                                                    Calculando valor a cobrar...
                                                </div>
                                            )}
                                            <Numpad onInput={handleCashNumpadInput} onDelete={handleCashNumpadDelete} />
                                        </motion.div>
                                    )}

                                    {view === 'store_credit' && (
                                        <motion.div key="store_credit" variants={contentVariants} initial="initial" animate="animate" exit="exit" className={cn("flex flex-col items-center justify-start pt-0 w-full", isSinglePricingBusy && "opacity-60")}>
                                            <div className="w-full max-w-sm space-y-4">
                                                {isMarketplaceOrder && (
                                                    <InfoCard color="blue" title="Método escolhido pelo cliente" message="Pagamento via marketplace - não é possível alterar o método de pagamento." />
                                                )}
                                                <CompactPaymentStatusAlert totalPaid={compactAlertPaid} totalNeed={compactAlertNeed} />
                                                <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 rounded-xl p-4 text-sm mb-2 text-center w-full">
                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">Saldo de Crédito disponível: </span>
                                                    <span className="font-bold text-brand-green">{formatCurrency(getCustomerCredit(customer, fetchedCustomerCredit))}</span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <PaymentAmountLabel
                                                        label="Valor do crédito a utilizar"
                                                        calculation={paymentCalculation}
                                                        baseAllocated={calcBaseAmount}
                                                    />
                                                    <MoneyInput
                                                        value={paymentBaseAmount}
                                                        onChange={(val: any) => {
                                                            const maxCredit = getCustomerCredit(customer, fetchedCustomerCredit);
                                                            const num = maxCredit > 0 ? Math.min(maxCredit, Number(val || 0)) : Number(val || 0);
                                                            handlePaymentBaseAmountChange(num);
                                                        }}
                                                        className="font-bold text-lg"
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {view === 'pix' && (
                                        <motion.div key="pix" variants={contentVariants} initial="initial" animate="animate" exit="exit" className={cn("flex flex-col items-center justify-start pt-0 w-full", isSinglePricingBusy && "opacity-60")}>
                                            <div className="w-full max-w-sm space-y-4">
                                                {isMarketplaceOrder && (
                                                    <InfoCard color="blue" title="Método escolhido pelo cliente" message="Pagamento via marketplace - não é possível alterar o método de pagamento." />
                                                )}
                                                <CompactPaymentStatusAlert totalPaid={compactAlertPaid} totalNeed={compactAlertNeed} />
                                                <div className="min-w-0 flex-1">
                                                    <PaymentAmountLabel
                                                        label="Valor a receber"
                                                        calculation={paymentCalculation}
                                                        baseAllocated={calcBaseAmount}
                                                    />
                                                    <MoneyInput
                                                        value={paymentBaseAmount}
                                                        onChange={handlePaymentBaseAmountChange}
                                                        className="font-bold text-lg"
                                                    />
                                                </div>

                                                <></>
                                                {isSinglePricingBusy && (
                                                    <div className="flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-border border-t-brand-green" />
                                                        Calculando valor a cobrar...
                                                    </div>
                                                )}

                                                {showKeyInputs ? (
                                                    <div className="space-y-4 border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50/50 dark:bg-yellow-900/10 p-4 rounded-xl text-left">
                                                        <h5 className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">
                                                            Cadastrar Chave Pix temporária/padrão
                                                        </h5>

                                                        <FormDropdown
                                                            label="Tipo de chave"
                                                            placeholder="Selecione o tipo"
                                                            value={tempPixKeyType}
                                                            setValue={(val: any) => setTempPixKeyType(val)}
                                                            options={[
                                                                { value: "cpf", label: "CPF" },
                                                                { value: "cnpj", label: "CNPJ" },
                                                                { value: "email", label: "E-mail" },
                                                                { value: "phone", label: "Celular" },
                                                                { value: "random", label: "Chave Aleatória" },
                                                            ]}
                                                        />

                                                        {tempPixKeyType === "cpf" && (
                                                            <CpfCnpjInput
                                                                label="Chave PIX (CPF)"
                                                                placeholder="000.000.000-00"
                                                                value={tempPixKey}
                                                                onChange={(e) => setTempPixKey(e.target.value)}
                                                                name="pix_key"
                                                            />
                                                        )}
                                                        {tempPixKeyType === "cnpj" && (
                                                            <CpfCnpjInput
                                                                label="Chave PIX (CNPJ)"
                                                                placeholder="00.000.000/0000-00"
                                                                value={tempPixKey}
                                                                onChange={(e) => setTempPixKey(e.target.value)}
                                                                name="pix_key_cnpj"
                                                            />
                                                        )}
                                                        {tempPixKeyType === "email" && (
                                                            <EmailInput
                                                                label="Chave PIX (E-mail)"
                                                                placeholder="exemplo@email.com"
                                                                value={tempPixKey}
                                                                onChange={(e) => setTempPixKey(e.target.value)}
                                                            />
                                                        )}
                                                        {tempPixKeyType === "phone" && (
                                                            <PhoneInput
                                                                label="Chave PIX (Celular)"
                                                                placeholder="(00) 00000-0000"
                                                                value={tempPixKey}
                                                                onChange={(e) => setTempPixKey(e.target.value)}
                                                            />
                                                        )}
                                                        {tempPixKeyType === "random" && (
                                                            <Input
                                                                label="Chave PIX (Aleatória)"
                                                                placeholder="123e4567-e89b-12d3-a456-426614174000"
                                                                value={tempPixKey}
                                                                onChange={(e) => setTempPixKey(e.target.value)}
                                                            />
                                                        )}

                                                        <Button
                                                            variant="filled"
                                                            className="w-full h-12 mt-2"
                                                            onClick={() => {
                                                                if (tempPixKey) {
                                                                    setShowConfirmSaveModal(true);
                                                                }
                                                            }}
                                                            isLoading={isGeneratingPix}
                                                            disabled={paymentBaseAmount <= 0 || !tempPixKey}
                                                        >
                                                            Gerar QR Code
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        variant="filled"
                                                        className="w-full h-12"
                                                        onClick={handleGeneratePix}
                                                        isLoading={isGeneratingPix}
                                                        disabled={paymentBaseAmount <= 0}
                                                    >
                                                        Gerar QR Code
                                                    </Button>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}

                                    {view === 'card' && (
                                        <motion.div key="card" variants={contentVariants} initial="initial" animate="animate" exit="exit" className={cn("flex flex-col items-center justify-start pt-6 w-full max-w-sm mx-auto", isSinglePricingBusy && "opacity-60")}>
                                            {isMarketplaceOrder && (
                                                <div className="w-full mb-4">
                                                    <InfoCard color="blue" title="Método escolhido pelo cliente" message="Pagamento via marketplace - não é possível alterar o método de pagamento." />
                                                </div>
                                            )}
                                            <CompactPaymentStatusAlert totalPaid={compactAlertPaid} totalNeed={compactAlertNeed} />
                                            <div className="mb-8 text-center">
                                                <div className="text-4xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                                                    {formatCurrency(paymentBaseAmount)}
                                                </div>
                                            </div>
                                            <div className="w-full text-left space-y-4">
                                                <div className="min-w-0 flex-1">
                                                    <PaymentAmountLabel
                                                        label="Valor a receber"
                                                        calculation={paymentCalculation}
                                                        baseAllocated={calcBaseAmount}
                                                    />
                                                    <MoneyInput
                                                        value={paymentBaseAmount}
                                                        onChange={handlePaymentBaseAmountChange}
                                                        className="font-bold text-lg"
                                                    />
                                                </div>
                                                {selectedMethodObj && normalizeMethodType(selectedMethodObj.type) !== 'debit_card' && (
                                                    isMarketplaceOrder ? (
                                                        <div className="rounded-xl bg-gray-50 dark:bg-dark-border/20 p-4">
                                                            <div className="text-xs text-brand-inactive-text uppercase tracking-wide font-bold mb-1">Parcelas</div>
                                                            <div className="font-bold text-brand-dark dark:text-dark-heading">
                                                                {(() => {
                                                                    if (installmentOptions.length > 0) {
                                                                        const opt = installmentOptions.find(o => String(o.installments) === installments) || installmentOptions[0];
                                                                        return formatInstallmentOptionLabel(opt);
                                                                    }
                                                                    const maxInst = Math.max(1, Number(selectedMethodObj?.max_installments || 1));
                                                                    if (view === 'card' && maxInst > 1) {
                                                                        const num = Math.min(maxInst, Math.max(1, Number(installments)));
                                                                        return `${num}x de ${formatCurrency(paymentBaseAmount / num)} (Total: ${formatCurrency(paymentBaseAmount)})`;
                                                                    }
                                                                    return `1x de ${formatCurrency(paymentBaseAmount)} (Total: ${formatCurrency(paymentBaseAmount)})`;
                                                                })()}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <FormDropdown
                                                            label="Parcelas"
                                                            value={String(installments)}
                                                            setValue={(value) => {
                                                                userManuallyChangedRef.current = false;
                                                                setInstallments(value);
                                                            }}
                                                            options={
                                                                (() => {
                                                                    if (installmentOptions.length > 0) {
                                                                        return installmentOptions.map(opt => ({
                                                                            value: String(opt.installments),
                                                                            label: formatInstallmentOptionLabel(opt)
                                                                        }));
                                                                    }
                                                                    const maxInst = Math.max(1, Number(selectedMethodObj?.max_installments || 1));
                                                                    if (view === 'card' && maxInst > 1) {
                                                                        return Array.from({ length: maxInst }, (_, i) => {
                                                                            const num = i + 1;
                                                                            return {
                                                                                value: String(num),
                                                                                label: `${num}x de ${formatCurrency(paymentBaseAmount / num)} (Total: ${formatCurrency(paymentBaseAmount)})`
                                                                            };
                                                                        });
                                                                    }
                                                                    return [{ value: "1", label: "1x de " + formatCurrency(paymentBaseAmount) + ` (Total: ${formatCurrency(paymentBaseAmount)})` }];
                                                                })()
                                                            }
                                                        />
                                                    )
                                                )}
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
                                                <div className="grid grid-cols-1 gap-4">
                                                    {payments.map((p, idx) => {
                                                        const li = activeSplitLegs.findIndex((l) => l.id === p.id);
                                                        const pr = splitPreview && 'success' in splitPreview && splitPreview.success && li >= 0
                                                            ? splitPreview.rows[li] as any
                                                            : null;
                                                        const amtReceived = Number(pr?.amountReceived ?? p.amount ?? 0)
                                                        const adjType = pr?.adjustmentType || 'none'
                                                        const adjAmt = Number(pr?.adjustmentAmount || 0)
                                                        const effAmt = Number(pr?.effectiveAmount ?? amtReceived)
                                                        const netAmt = Number(pr?.netAmount ?? effAmt)
                                                        const adjPct = Number(pr?.adjustmentPercent || 0)
                                                        const showAdjustment = adjType !== 'none' && adjAmt > 0.005
                                                        return (
                                                            <div key={p.id} onClick={() => { if (isMarketplaceOrder || existingPaidAmount > 0.009) return; setEditingPaymentIndex(idx); setSplitSelectedType(null); setView('split_method_select'); }}
                                                                className="border border-brand-border dark:border-dark-border rounded-lg p-4 cursor-pointer hover:bg-brand-light-bg dark:hover:bg-dark-card-bg transition-colors">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    {getIconForMethod(p.method, p.paymentMethodId)({})}
                                                                    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{p.method || "Selecionar método"}</span>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                                                    <span className="text-brand-inactive-text">Recebido:</span>
                                                                    <span className="text-right font-medium text-brand-dark dark:text-dark-heading">{formatCurrency(amtReceived)}</span>
                                                                    {showAdjustment && (
                                                                        <>
                                                                            <span className="text-brand-inactive-text">
                                                                                {adjType === 'discount' ? 'Desconto:' : 'Taxa:'}
                                                                            </span>
                                                                            <span className={`text-right font-medium ${adjType === 'discount' ? 'text-green-600' : 'text-amber-600'}`}>
                                                                                {adjType === 'discount' ? `−${formatCurrency(adjAmt)} (${adjPct}%)` : `+${formatCurrency(adjAmt)} (${adjPct}%)`}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                    <span className="text-brand-inactive-text">Abate:</span>
                                                                    <span className="text-right font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(effAmt)}</span>
                                                                    {adjType === 'fee' && pr?.feeBearer === 'merchant' && (
                                                                        <>
                                                                            <span className="text-brand-inactive-text">Líquido:</span>
                                                                            <span className="text-right font-medium text-brand-inactive-text">{formatCurrency(netAmt)}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {splitPreview && 'success' in splitPreview && splitPreview.success && (
                                                    <div className="mt-4 flex flex-col gap-2 border-t border-brand-border dark:border-dark-border pt-4">
                                                        <div className="flex justify-between items-baseline text-sm">
                                                            <span className="text-brand-inactive-text">Total do pedido:</span>
                                                            <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(chargeTarget)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-baseline text-sm">
                                                            <span className="text-brand-inactive-text">Total pago:</span>
                                                            <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(splitPreview.finalTotal)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-baseline border-t border-dashed border-brand-border dark:border-dark-border pt-2">
                                                            {splitPreview.finalTotal >= chargeTarget - 0.005 ? (
                                                                splitPreview.finalTotal > chargeTarget + 0.005 ? (
                                                                    <>
                                                                        <span className="text-sm font-bold text-green-600">Troco:</span>
                                                                        <span className="text-lg font-bold text-green-600">
                                                                            {formatCurrency(splitPreview.finalTotal - chargeTarget)}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Valor total atingido:</span>
                                                                        <span className="text-lg font-bold text-green-600">OK</span>
                                                                    </>
                                                                )
                                                            ) : (
                                                                <>
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">Saldo restante:</span>
                                                                    <span className="text-lg font-bold text-amber-600">
                                                                        {formatCurrency(Math.max(0, chargeTarget - splitPreview.finalTotal))}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}

                                    {view === 'split_method_select' && (
                                        <motion.div key="split_method_select" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="w-full">
                                            {!splitSelectedType ? (
                                                <>
                                                    <h3 className="text-sm font-bold text-brand-inactive-text mb-4 tracking-wide uppercase">Selecione o tipo</h3>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {availableMethodTypes.has("cash") && (
                                                            <PaymentMethodCard
                                                                icon={MoneyIcon}
                                                                label="Dinheiro"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => setSplitSelectedType("cash")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("pix") && (
                                                            <PaymentMethodCard
                                                                icon={QRCodeIcon}
                                                                label="Pix"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => setSplitSelectedType("pix")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("credit_card") && (
                                                            <PaymentMethodCard
                                                                icon={CreditCardIcon}
                                                                label="Cartão de Crédito"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => setSplitSelectedType("credit_card")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("debit_card") && (
                                                            <PaymentMethodCard
                                                                icon={CreditCardIcon}
                                                                label="Cartão de Débito"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => setSplitSelectedType("debit_card")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("bank_transfer") && (
                                                            <PaymentMethodCard
                                                                icon={FileIcon}
                                                                label="Transferência"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => setSplitSelectedType("bank_transfer")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("store_credit") && (
                                                            <PaymentMethodCard
                                                                icon={TagIcon}
                                                                label="Crédito do cliente"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => {
                                                                    const customerCredit = getCustomerCredit(customer, fetchedCustomerCredit);
                                                                    const remainingToPay = Math.max(0, chargeTarget - splitBaseSum);
                                                                    const defaultAmt = customerCredit > 0 ? Math.min(customerCredit, remainingToPay) : remainingToPay;
                                                                    const newLeg = {
                                                                        id: Date.now(),
                                                                        method: "store_credit",
                                                                        paymentMethodId: null,
                                                                        amount: defaultAmt,
                                                                        installmentNumber: 1,
                                                                    };
                                                                    if (editingPaymentIndex !== null && editingPaymentIndex >= 0) {
                                                                        const copy = [...payments];
                                                                        copy[editingPaymentIndex] = newLeg;
                                                                        setPayments(copy);
                                                                    } else {
                                                                        setPayments((prev: any) => [...prev, newLeg]);
                                                                    }
                                                                    setEditingPaymentIndex(null);
                                                                    setSplitSelectedType(null);
                                                                    setView("split");
                                                                }}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("other") && (
                                                            <PaymentMethodCard
                                                                icon={TagIcon}
                                                                label="Outros"
                                                                disabled={isMarketplaceOrder}
                                                                onClick={() => setSplitSelectedType("other")}
                                                            />
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <button
                                                            onClick={() => setSplitSelectedType(null)}
                                                            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center text-brand-dark dark:text-dark-heading hover:bg-gray-200 dark:hover:bg-dark-border transition-colors shrink-0"
                                                        >
                                                            <ChevronLeftIcon size={16} />
                                                        </button>
                                                        <h3 className="text-sm font-bold text-brand-inactive-text tracking-wide uppercase">Selecione o método</h3>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {activeMethods
                                                            .filter((method: any) => normalizeMethodType(method.type) === splitSelectedType)
                                                            .map((method: any) => {
                                                                const normalizedType = normalizeMethodType(method.type);
                                                                const MethodIcon = normalizedType === "cash"
                                                                    ? MoneyIcon
                                                                    : normalizedType === "pix"
                                                                        ? QRCodeIcon
                                                                        : normalizedType === "bank_transfer"
                                                                            ? FileIcon
                                                                            : ["credit_card", "debit_card"].includes(normalizedType)
                                                                                ? CreditCardIcon
                                                                                : TagIcon;
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
                                                </>
                                            )}
                                        </motion.div>
                                    )}

                                    {view === 'method_type_select' && (
                                        <motion.div key="method_type_select" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="w-full">
                                            <div className="grid grid-cols-2 gap-4">
                                                {activeMethods
                                                    .filter((method: any) => normalizeMethodType(method.type) === selectedMethodType)
                                                    .map((method: any) => {
                                                        const normalizedType = normalizeMethodType(method.type);
                                                        const MethodIcon = normalizedType === "cash"
                                                            ? MoneyIcon
                                                            : normalizedType === "pix"
                                                                ? QRCodeIcon
                                                                : normalizedType === "bank_transfer"
                                                                    ? FileIcon
                                                                    : ["credit_card", "debit_card"].includes(normalizedType)
                                                                        ? CreditCardIcon
                                                                        : TagIcon;
                                                        const targetView = getTargetViewForMethodType(normalizedType);
                                                        return (
                                                            <PaymentMethodCard
                                                                key={`single-${method.id}`}
                                                                icon={MethodIcon}
                                                                label={method.name}
                                                                onClick={() => {
                                                                    setPaymentCalculation(null);
                                                                    setSelectedMethodId(method.id);
                                                                    userManuallyChangedRef.current = false;
                                                                    setView(targetView);
                                                                }}
                                                            />
                                                        );
                                                    })}
                                            </div>
                                        </motion.div>
                                    )}
                                    {view === 'mercadopago' && (
                                        <motion.div key="mercadopago" variants={contentVariants} initial="initial" animate="animate" exit="exit" className="w-full h-full flex flex-col">
                                            {mpStep === 'brick' && (
                                                <div className="w-full flex flex-col items-center">
                                                    {!mpBrickReady && !mpBrickError && (
                                                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                                                            <Spinner size={32} className="text-brand-green" />
                                                            <p className="text-sm font-medium text-brand-inactive-text">Carregando checkout Mercado Pago...</p>
                                                        </div>
                                                    )}
                                                    {mpBrickError && (
                                                        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                                                            <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                                                <CancelCircleIcon size={32} className="text-brand-red" />
                                                            </div>
                                                            <p className="text-sm font-medium text-brand-red max-w-sm">{mpBrickError}</p>
                                                            <Button variant="outline" onClick={() => { setMpBrickError(null); mpBrickInitializedRef.current = false; setMpBrickReady(false); initializeMpBrick(); }} className="mt-2">
                                                                Tentar novamente
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {mpIsProcessing && (
                                                        <div className="absolute inset-0 bg-white/80 dark:bg-dark-surface/80 z-50 flex flex-col items-center justify-center gap-4">
                                                            <Spinner size={32} className="text-brand-green" />
                                                            <p className="text-sm font-medium text-brand-inactive-text">Processando pagamento...</p>
                                                        </div>
                                                    )}
                                                    <div id="erpPaymentBrick_container" className="w-full" />
                                                </div>
                                            )}

                                            {mpStep === 'pix' && mpPixData && (
                                                <div className="flex flex-col items-center px-2 pt-4">
                                                    <div className="text-center mb-6">
                                                        <div className="w-16 h-16 rounded-full bg-[#00b1ea]/10 flex items-center justify-center mx-auto mb-4">
                                                            <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="MP" className="w-8 h-8 object-contain" />
                                                        </div>
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">Pix gerado via Mercado Pago</h3>
                                                        <p className="text-sm text-brand-inactive-text">Escaneie o QR Code ou copie o código</p>
                                                    </div>

                                                    <div className="bg-white p-5 rounded-2xl border border-brand-border dark:border-dark-border mb-6 shadow-sm">
                                                        <img src={`data:image/png;base64,${mpPixData.qrCodeBase64}`} alt="QR Code Pix" className="w-48 h-48 mx-auto" />
                                                    </div>

                                                    <div className="text-center mb-4">
                                                        <span className="text-3xl font-black text-brand-dark dark:text-dark-heading">{formatCurrency(chargeTarget)}</span>
                                                    </div>

                                                    <div className="w-full max-w-sm relative mb-6">
                                                        <input
                                                            type="text" readOnly
                                                            value={mpPixData.qrCode}
                                                            className="w-full pl-4 pr-12 py-4 rounded-xl bg-gray-100 dark:bg-dark-border/30 text-sm text-brand-inactive-text border border-transparent focus:border-brand-green outline-none font-medium truncate"
                                                        />
                                                        <button
                                                            onClick={handleMpCopyPixCode}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-200 dark:hover:bg-dark-border/50 rounded-lg transition-colors text-brand-dark dark:text-dark-heading"
                                                        >
                                                            {mpCopied ? <CheckCircleIcon size={18} className="text-brand-green" /> : <CopyIcon size={18} />}
                                                        </button>
                                                    </div>

                                                    <Button variant="filled" className="w-full max-w-sm h-12" onClick={handleMpConfirmPix}>
                                                        Confirmar pagamento recebido
                                                    </Button>
                                                    <p className="text-xs text-brand-inactive-text mt-3 text-center max-w-sm">
                                                        Confirme após o cliente realizar o Pix. O status será atualizado automaticamente pelo webhook.
                                                    </p>
                                                </div>
                                            )}

                                            {mpStep === 'boleto' && mpBoletoData && (
                                                <div className="flex flex-col items-center px-2 pt-4">
                                                    <div className="text-center mb-6">
                                                        <div className="w-16 h-16 rounded-full bg-[#00b1ea]/10 flex items-center justify-center mx-auto mb-4">
                                                            <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="MP" className="w-8 h-8 object-contain" />
                                                        </div>
                                                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">Boleto gerado via Mercado Pago</h3>
                                                        <p className="text-sm text-brand-inactive-text">Compartilhe o boleto com o cliente</p>
                                                    </div>

                                                    <div className="text-center mb-6">
                                                        <span className="text-3xl font-black text-brand-dark dark:text-dark-heading">{formatCurrency(chargeTarget)}</span>
                                                    </div>

                                                    {mpBoletoData.barcode && (
                                                        <div className="w-full max-w-sm relative mb-4">
                                                            <input
                                                                type="text" readOnly value={mpBoletoData.barcode}
                                                                className="w-full pl-4 pr-12 py-4 rounded-xl bg-gray-100 dark:bg-dark-border/30 text-sm text-brand-inactive-text border border-transparent outline-none font-medium truncate"
                                                            />
                                                            <button
                                                                onClick={() => { navigator.clipboard.writeText(mpBoletoData.barcode); toast({ title: "Linha digitável copiada!" }); }}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-200 rounded-lg transition-colors text-brand-dark"
                                                            >
                                                                <CopyIcon size={18} />
                                                            </button>
                                                        </div>
                                                    )}

                                                    {mpBoletoData.ticketUrl && (
                                                        <a href={mpBoletoData.ticketUrl} target="_blank" rel="noopener noreferrer" className="w-full max-w-sm mb-4">
                                                            <Button variant="outline" className="w-full h-12">
                                                                <PrinterIcon size={18} className="mr-2" />
                                                                Abrir Boleto
                                                            </Button>
                                                        </a>
                                                    )}

                                                    <Button variant="filled" className="w-full max-w-sm h-12 mt-2" onClick={() => {
                                                        handleStartProcessing({
                                                            paymentMethod: "Boleto (Mercado Pago)",
                                                            paymentProvider: "Mercado Pago",
                                                            mpPaymentId: mpPaymentId,
                                                            paymentStatus: "unpaid",
                                                            paidAmount: 0,
                                                            paymentBreakdown: [],
                                                            splitPayments: [],
                                                            isPendingDelivery,
                                                        });
                                                    }}>
                                                        Registrar venda (pagamento pendente)
                                                    </Button>
                                                </div>
                                            )}

                                            {mpStep === 'mp_redirect' && (
                                                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                                                    <div className="w-20 h-20 rounded-full bg-[#00b1ea]/10 flex items-center justify-center mb-2">
                                                        <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="MP" className="w-10 h-10 object-contain" />
                                                    </div>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Nova aba aberta</h3>
                                                    <p className="text-sm text-brand-inactive-text max-w-sm">
                                                        O pagamento será processado na aba do Mercado Pago. Após a conclusão, volte aqui para registrar a venda.
                                                    </p>
                                                    <Button variant="outline" className="mt-4 h-12 px-8" onClick={() => {
                                                        handleStartProcessing({
                                                            paymentMethod: "Mercado Pago",
                                                            paymentProvider: "Mercado Pago",
                                                            mpPaymentId: mpPaymentId,
                                                            paymentStatus: "unpaid",
                                                            paidAmount: 0,
                                                            paymentBreakdown: [],
                                                            splitPayments: [],
                                                            isPendingDelivery,
                                                        });
                                                    }}>
                                                        Registrar venda (pendente)
                                                    </Button>
                                                </div>
                                            )}

                                            {mpStep === 'error' && (
                                                <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                                                    <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                                        <CancelCircleIcon size={32} className="text-brand-red" />
                                                    </div>
                                                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Erro no pagamento</h3>
                                                    <p className="text-sm text-brand-red max-w-sm">{mpBrickError || "Ocorreu um erro ao processar o pagamento."}</p>
                                                    <Button variant="outline" onClick={() => { setMpStep("brick"); setMpBrickError(null); mpBrickInitializedRef.current = false; }} className="mt-2">
                                                        Tentar novamente
                                                    </Button>
                                                </div>
                                            )}
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
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                                        imageAlt="Não foi possível concluir a venda"
                                        title="Não foi possível concluir a venda"
                                        subtitle={errorMessage}
                                    />
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
                                                    {successSnapshot.totalPaid === 0
                                                        ? `Pagamento pendente, falta receber: ${formatCurrency(successSnapshot.remainingPartial)}`
                                                        : `Venda paga parcialmente, restante a pagar: ${formatCurrency(successSnapshot.remainingPartial)}`
                                                    }
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

                                    {/* Payment method breakdown */}
                                    {successSnapshot?.paymentBreakdown && successSnapshot.paymentBreakdown.length > 1 && (
                                        <div className="mb-6 border-t border-brand-border dark:border-dark-border pt-4">
                                            <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-3">Formas de pagamento</span>
                                            <div className="space-y-2">
                                                {successSnapshot.paymentBreakdown.map((entry, i) => (
                                                    <div key={i} className="flex justify-between items-center py-1">
                                                        <span className="text-sm text-brand-dark dark:text-dark-heading">{entry.method}</span>
                                                        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(entry.amount)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Cards Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                                        <SuccessActionCard
                                            icon={FileIcon}
                                            label="Imprimir recibo"
                                            onClick={() => setPrintOrderId(saleId)}
                                        />
                                        <SuccessActionCard
                                            icon={PrinterIcon}
                                            label="Imprimir NFC-e"
                                            onClick={() => setPrintOrderId(saleId)}
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
                                <ActionFooter showConfirm={false} />
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
                            {(view === 'money' || view === 'card' || view === 'pix' || view === 'store_credit') && (
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

                            {/* 5. Mercado Pago Footer (brick has its own button, pix/boleto have inline buttons) */}
                            {view === 'mercadopago' && (
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
                                        deliveryBreakdown={deliveryBreakdown}
                                    />
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>



            {showWarningModal && (
                <AlertModal
                    title="Chave Pix Não Cadastrada"
                    message="Este método de pagamento Pix não possui uma chave cadastrada. Por favor, preencha os dados da chave Pix para gerar o QR Code."
                    variant="warning"
                    isOpen={showWarningModal}
                    onClose={() => setShowWarningModal(false)}
                    confirmText="Ok"
                />
            )}

            {showConfirmSaveModal && (
                <AlertModal
                    title="Salvar Chave Pix?"
                    message="Deseja salvar esta chave Pix e o tipo dela como padrão para as próximas cobranças deste método de pagamento?"
                    variant="info"
                    isOpen={showConfirmSaveModal}
                    onClose={async () => {
                        setShowConfirmSaveModal(false);
                        await handleGeneratePixWithKey(tempPixKey, tempPixKeyType);
                    }}
                    onConfirm={async () => {
                        if (!selectedMethodId) return;
                        setShowConfirmSaveModal(false);
                        setSavingPixKey(true);
                        try {
                            await updatePaymentMethodAction(selectedMethodId, {
                                pixKeyType: tempPixKeyType,
                                pixKey: tempPixKey
                            });
                            setHasPixKey(true);
                            invalidate();
                        } catch (err) {
                            console.error("Error saving Pix key:", err);
                        } finally {
                            setSavingPixKey(false);
                        }
                        await handleGeneratePixWithKey(tempPixKey, tempPixKeyType);
                    }}
                    confirmText="Sim, salvar"
                    cancelText="Não, apenas gerar"
                    isLoading={savingPixKey}
                />
            )}

            {pixQrData && (
                <PixQrDisplayModal
                    isOpen={showPixQrModal}
                    onClose={() => {
                        setShowPixQrModal(false);
                        setPixQrData(null);
                    }}
                    qrCode={pixQrData.qrDataUrl}
                    payload={pixQrData.payload}
                    amount={paymentBaseAmount}
                    onConfirmPayment={async () => {
                        setShowPixQrModal(false);
                        setPixQrData(null);
                        await handleStartProcessing();
                    }}
                />
            )}

            {depositMpPixData && (
                <PixQrDisplayModal
                    isOpen={showDepositPixModal}
                    onClose={() => {
                        setShowDepositPixModal(false);
                    }}
                    qrCode={`data:image/png;base64,${depositMpPixData.qrCodeBase64}`}
                    payload={depositMpPixData.qrCode}
                    amount={depositChargeAmount}
                    onVerifyPayment={handleVerifyDepositPayment}
                    isVerifying={isCheckingDepositStatus}
                    onSendWhatsApp={customer?.phone ? handleSendDepositWhatsApp : undefined}
                />
            )}

            {printOrderId && (
                <SaleReceiptPrintModal
                    isOpen={!!printOrderId}
                    onClose={() => setPrintOrderId(null)}
                    orderId={printOrderId}
                />
            )}
        </div>
    );
};

export default PaymentModal;
