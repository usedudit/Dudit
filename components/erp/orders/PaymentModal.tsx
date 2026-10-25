import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRealtimeRecord } from '@/hooks/use-realtime-record';
import { useTheme } from 'next-themes';
import {
    XIcon,
    ChevronLeftIcon,
    CreditCardIcon,
    MoneyIcon,
    QRCodeIcon,
    CopyIcon,
    ColumnsIcon as SplitIcon,
    ChevronUpIcon,
    PrinterIcon,
    FileIcon,
    TagIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    InfoIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Checkbox, MoneyInput, Badge, Tooltip, Spinner, FormDropdown, InfoCard, DefaultModal, ListItem, IconPlaceholder } from '@/components/reusable';
import { hasReceivedMpPayment } from '@/lib/payments/order-financial-state';
import { ReceiptContent, PaymentMethodCard, SplitPaymentCard, Numpad } from '../POSComponents';
import { UserProfileImage } from '@/lib/utils/UserProfileImage';
import { calculatePaymentMethodAmountsAction, previewSplitPaymentBreakdownAction } from '@/app/actions/erp/payment-methods';
import { useToast } from "@/components/ui/use-toast";
import { cn, formatCurrency, formatDate, formatNumber, formatTime } from '@/lib/utils';
import SaleReceiptPrintModal from '@/components/erp/orders/receipt/SaleReceiptPrintModal';
import BottomSheet from '@/components/BottomSheet';
import { getMercadoPagoStatusAction, checkMercadoPagoPaymentStatusAction, type MpAcceptedPaymentMethods } from '@/app/actions/mercadopago';
import { getServiceCheckoutSettingsAction } from '@/app/actions/marketplace/service-checkout-settings';
import { buildDepositCheckoutMeta } from '@/lib/services/marketplace-deposit-meta';
import { fetchJSONWithCSRF } from '@/lib/utils/fetch-with-csrf';
import { formatPaymentMethodLabel } from '@/lib/utils/payment-method-label';
import { usePaymentMethods } from '@/hooks/use-payment-methods';
import { useStore } from '@/lib/store-context';
import { usePermissions } from '@/lib/permission-context';
import { hasMinimumPlan } from '@/lib/subscription/plan-tier';
import { useModalLayer } from '@/lib/modal-stack';
import { getPOSCustomerDetailsAction } from '@/app/actions/erp/pdv';
import { calculatePaymentAmounts } from '@/lib/payments/calculation';

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
import { text } from 'stream/consumers';
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
    const installmentCostAmount = Number(calculation.installmentCostAmount || 0);
    const fixedInterestAmount = Math.max(0, juros - installmentCostAmount);
    const feeBearer = calculation.feeBearer || "merchant";
    const installmentFeeBearer = calculation.installmentFeeBearer || "merchant";
    const isMerchantFee = feeBearer === "merchant";
    const isMerchantInstallment = installmentFeeBearer === "merchant";
    const absorbedInterest = isMerchantFee ? fixedInterestAmount : 0;
    const customerInterest = !isMerchantFee ? fixedInterestAmount : 0;
    const absorbedInstallmentCost = isMerchantInstallment ? installmentCostAmount : 0;
    const customerInstallmentCost = !isMerchantInstallment ? installmentCostAmount : 0;
    const totalAbsorbed = absorbedInterest + taxa + custoMetodo + absorbedInstallmentCost;
    return (
        <div className="relative group/payinfo inline-flex shrink-0">
            <Badge variant="gray" icon={<InfoIcon className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body" />} className="cursor-help" />
            <div className="pointer-events-none absolute bottom-full right-0 z-[120] mb-2 hidden min-w-[240px] max-w-[min(100vw,280px)] rounded-xl border border-brand-border bg-white p-3 text-left text-xs shadow-xl group-hover/payinfo:block dark:border-dark-border dark:bg-dark-surface">
                <div className="mb-2 font-bold text-brand-dark dark:text-dark-heading">Detalhes do meio de pagamento</div>
                <div className="space-y-1.5 text-brand-dark dark:text-dark-heading">
                    <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Subtotal</span><span className="font-semibold">{formatCurrency(base)}</span></div>
                    {disc > 0 && <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Desc. meio pagamento</span><span className="font-semibold">− {formatCurrency(disc)}</span></div>}
                    {customerInterest > 0 && <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Juros (fixos)</span><span className="font-semibold">+ {formatCurrency(customerInterest)}</span></div>}
                    {customerInstallmentCost > 0 && <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Juros (parcelamento)</span><span className="font-semibold">+ {formatCurrency(customerInstallmentCost)}</span></div>}
                    {!isMerchantFee && taxa > 0 && <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Taxa</span><span className="font-semibold">+ {formatCurrency(taxa)}</span></div>}
                    {!isMerchantFee && custoMetodo > 0 && <div className="flex justify-between gap-3"><span className="text-brand-inactive-text">Custo do método</span><span className="font-semibold">+ {formatCurrency(custoMetodo)}</span></div>}
                    {totalAbsorbed > 0.009 && (
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
    const installmentCostAmount = Number(calculation.installmentCostAmount || 0);
    const fixedInterestAmount = Math.max(0, juros - installmentCostAmount);
    const taxa = Number(calculation.feeAmount || 0);
    const custoMetodo = Number(calculation.fixedFeeAmount || 0);
    const final = Number(calculation.finalAmount || 0);
    const feeBearer = calculation.feeBearer || "merchant";
    const installmentFeeBearer = calculation.installmentFeeBearer || "merchant";
    const isMerchantFee = feeBearer === "merchant";
    const isMerchantInstallment = installmentFeeBearer === "merchant";

    const rows = [
        { label: 'Subtotal', value: formatCurrency(base) },
        disc > 0 ? { label: 'Desconto', value: `- ${formatCurrency(disc)}` } : null,
        (!isMerchantFee && fixedInterestAmount > 0) ? { label: 'Juros (fixos)', value: `+ ${formatCurrency(fixedInterestAmount)}` } : null,
        (!isMerchantInstallment && installmentCostAmount > 0) ? { label: 'Juros (parcelamento)', value: `+ ${formatCurrency(installmentCostAmount)}` } : null,
        (!isMerchantFee && taxa > 0) ? { label: 'Taxa', value: `+ ${formatCurrency(taxa)}` } : null,
        (!isMerchantFee && custoMetodo > 0) ? { label: 'Custo do método', value: `+ ${formatCurrency(custoMetodo)}` } : null,
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
    installment_fee_bearer?: "merchant" | "customer" | null;
    installment_fees?: Array<{ installment_number: number; fee_percent: number }>;
};

function calculatePaymentDetailsLocally(
    method: PartnerPaymentMethod,
    originalAmount: number,
    installmentNumber: number,
    includeInstallmentOptions: boolean,
) {
    const feeBearer = (method.fee_bearer || "merchant") as "merchant" | "customer";
    const installmentFeeBearer = (method.installment_fee_bearer || "merchant") as "merchant" | "customer";
    const config = {
        feePercent: Number(method.fee_percent || 0),
        feeFixed: Number(method.fee_fixed || 0),
        feeBearer,
        installmentFeeBearer,
        discountPercent: Number(method.discount_percent || 0),
        maxInstallments: Math.max(1, Number(method.max_installments || 1)),
        installmentFees: (method.installment_fees || []).map((row) => ({
            installmentNumber: Number(row.installment_number || 0),
            feePercent: Number(row.fee_percent || 0),
        })),
    };
    const normalizedAmount = Math.max(0, Number(originalAmount || 0));
    const options: any[] = [];

    if (includeInstallmentOptions && normalizeMethodType(method.type) === "credit_card" && config.maxInstallments > 1) {
        for (let i = 1; i <= config.maxInstallments; i += 1) {
            const row = calculatePaymentAmounts({ originalAmount: normalizedAmount, paymentMethod: config, installmentNumber: i });
            options.push({
                installments: i,
                installmentValue: row.installmentAmounts[0] || row.finalAmount / i,
                hasInterest: row.interestAmount > 0.009 && (feeBearer === "customer" || installmentFeeBearer === "customer"),
                totalInterest: row.interestAmount,
                installmentCostAmount: row.installmentCostAmount || 0,
                totalFee: row.feeAmount,
                fixedFee: row.fixedFeeAmount,
                feeBearer,
                installmentFeeBearer,
                finalAmount: row.finalAmount,
            });
        }
    }

    const row = calculatePaymentAmounts({ originalAmount: normalizedAmount, paymentMethod: config, installmentNumber });
    const adjustmentAmount = Number((row.paymentMethodDiscountAmount + row.interestAmount + row.feeAmount + row.fixedFeeAmount).toFixed(2));
    const adjustmentType = row.paymentMethodDiscountAmount > 0.009
        ? "discount"
        : (row.interestAmount > 0.009 ? "interest" : (row.feeAmount > 0.009 || row.fixedFeeAmount > 0.009 ? "fee" : "none"));
    const adjustmentPercent = adjustmentType === "discount"
        ? row.appliedDiscountPercent
        : (adjustmentType === "interest" ? row.appliedInterestPercent : row.appliedFeePercent);
    const installmentCostAmount = Number(row.installmentCostAmount || 0);
    const fixedInterestAmount = Number(row.interestAmount || 0) - installmentCostAmount;
    const absorbedAmount = Number((
        (feeBearer === "merchant" ? fixedInterestAmount + row.feeAmount + row.fixedFeeAmount : 0)
        + (installmentFeeBearer === "merchant" ? installmentCostAmount : 0)
    ).toFixed(2));

    return {
        success: true,
        installmentOptions: options,
        finalAmount: row.finalAmount,
        paymentMethodDiscountAmount: row.paymentMethodDiscountAmount,
        feeAmount: row.feeAmount,
        fixedFeeAmount: row.fixedFeeAmount,
        interestAmount: row.interestAmount,
        installmentCostAmount,
        amountBeforeInterest: row.amountBeforeInterest,
        amountBeforeFee: row.amountBeforeFee,
        installmentNumber: row.installmentNumber,
        installmentAmounts: row.installmentAmounts,
        appliedDiscountPercent: row.appliedDiscountPercent,
        appliedFeePercent: row.appliedFeePercent,
        appliedInterestPercent: row.appliedInterestPercent,
        amountReceived: row.finalAmount,
        adjustmentType,
        adjustmentPercent,
        adjustmentAmount,
        effectiveAmount: row.finalAmount,
        netAmount: Number((row.finalAmount - absorbedAmount).toFixed(2)),
        feeBearer,
        installmentFeeBearer,
    };
}

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
    const installmentCostAmount = Number(opt?.installmentCostAmount || 0);
    const fixedInterestAmount = Math.max(0, interestAmount - installmentCostAmount);
    const feeAmount = Number(opt?.totalFee || 0);
    const fixedFeeAmount = Number(opt?.fixedFee || 0);
    const feeBearer = opt?.feeBearer || "merchant";
    const installmentFeeBearer = opt?.installmentFeeBearer || "merchant";
    const passesCostToCustomer = feeBearer !== "merchant" || installmentFeeBearer !== "merchant";

    const parts = [];
    if (fixedInterestAmount > 0.009) parts.push("juros");
    if (installmentCostAmount > 0.009) parts.push("custo de parcelamento");
    if (feeAmount > 0.009) parts.push("taxa");
    if (fixedFeeAmount > 0.009) parts.push("custo fixo");

    const pricingName = parts.length > 0 ? parts.join("/") : "taxa";
    const pricingAmount = fixedInterestAmount + installmentCostAmount + feeAmount + fixedFeeAmount;

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
    /** Indica se o pedido foi feito via Mercado Pago (bloqueia troca de método). */
    originalPaymentProvider?: string
    /** Quando o pedido tem serviços, permite gerar cobrança de sinal via MP antes do pagamento integral. */
    allowDepositCharge?: boolean
    depositChargeAmount?: number
    depositPercentage?: number
    deliveryBreakdown?: Record<string, unknown> | null
    orderId?: string
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
    originalPaymentProvider,
    allowDepositCharge = false,
    depositChargeAmount = 0,
    depositPercentage: propsDepositPercentage,
    deliveryBreakdown,
    orderId,
}: PaymentModalProps) => {
    const { toast } = useToast();
    const { selectedStore } = useStore();
    const { planSlug } = usePermissions();
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const isFreePlan = !hasMinimumPlan(planSlug, "crescer");

    // MP orders: customer already selected the payment method at checkout.
    // Lock the method selection to prevent changes.
    const isMpOrder = useMemo(() => {
        if (!originalPaymentProvider) return false;
        const providerNorm = String(originalPaymentProvider).toLowerCase().trim();
        if (!providerNorm.includes("mercado pago")) return false;
        // Only lock when a real payment method was already chosen at checkout.
        const methodNorm = String(originalPaymentMethod || "").toLowerCase().trim();
        if (!methodNorm || methodNorm === "não informado" || methodNorm === "nao informado") return false;
        return true;
    }, [originalPaymentProvider, originalPaymentMethod]);

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
        }).catch(() => { });
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

    // z-index dinâmico: este modal/painel abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen);

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
    const [mpIsCheckingStatus, setMpIsCheckingStatus] = useState(false);
    const mpInstanceRef = useRef<any>(null);
    const mpBricksBuilderRef = useRef<any>(null);
    const mpBrickIdRef = useRef<any>(null);
    const mpBrickInitializedRef = useRef(false);
    const mpPaymentQuoteRef = useRef<string | null>(null);


    const [depositMpPixData, setDepositMpPixData] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
    const [depositMpPaymentId, setDepositMpPaymentId] = useState<string | null>(null);
    const [depositMeta, setDepositMeta] = useState<Record<string, unknown> | null>(null);
    const [depositPaid, setDepositPaid] = useState(false);
    const [generatingDepositPix, setGeneratingDepositPix] = useState(false);
    const [showDepositPixModal, setShowDepositPixModal] = useState(false);
    const [isCheckingDepositStatus, setIsCheckingDepositStatus] = useState(false);
    const [showMpPixModal, setShowMpPixModal] = useState(false);
    const [isCheckingMpPixStatus, setIsCheckingMpPixStatus] = useState(false);
    const [isRegeneratingDepositPix, setIsRegeneratingDepositPix] = useState(false);
    const [isRegeneratingMpPix, setIsRegeneratingMpPix] = useState(false);
    const [mpPixGeneratedAt, setMpPixGeneratedAt] = useState<number | null>(null);
    const [depositPixGeneratedAt, setDepositPixGeneratedAt] = useState<number | null>(null);
    const [boletoGeneratedAt, setBoletoGeneratedAt] = useState<number | null>(null);
    const [isRegeneratingBoleto, setIsRegeneratingBoleto] = useState(false);
    const mpBrickFormDataRef = useRef<any>(null);
    const [existingSinalLoaded, setExistingSinalLoaded] = useState(false);

    // Load existing sinal QR code data from MP when order already has a deposit
    useEffect(() => {
        if (!isOpen || !orderId || !allowDepositCharge) return;
        if (existingPaidAmount > 0.009 || existingSinalLoaded) return;

        fetch("/api/orders/retry-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
        })
            .then(async (res) => { return res.ok ? res.json() : null; })
            .then((data) => {
                if (data && data.pixData && depositChargeAmount > 0.009) {
                    setDepositMpPixData({ qrCode: data.pixData.qrCode, qrCodeBase64: data.pixData.qrCodeBase64 });
                    setDepositPixGeneratedAt(Date.now());
                    setDepositMpPaymentId(data.paymentId || data.mpPaymentId || null);
                    setExistingSinalLoaded(true);
                }
            })
            .catch(() => { })
    }, [isOpen, orderId, allowDepositCharge, existingPaidAmount, existingSinalLoaded, depositChargeAmount]);

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
                    setDepositPaid(true);

                    // If the order already exists (edit flow), sync the deposit payment
                    // to update paid_amount, situation, and checkout_fulfillment.depositCheckout
                    if (orderId) {
                        try {
                            await fetchJSONWithCSRF<any>("/api/orders/sync-payment-status", {
                                method: "POST",
                                body: { orderId },
                                headers: { "Content-Type": "application/json" },
                            });
                        } catch (syncErr) {
                            console.error("Error syncing deposit payment:", syncErr);
                        }
                    }
                    invalidate();
                } else {
                    const isExpired = (res.status === "cancelled" || res.status === "expired" || res.status === "failed") ||
                        (depositPixGeneratedAt !== null && (Date.now() - depositPixGeneratedAt > PIX_EXPIRATION_MS));
                    if (isExpired) {
                        toast({ title: "Pix expirado", description: "O QR Code do sinal expirou. Regenerando..." });
                        await handleRegenerateDepositCharge();
                    } else {
                        toast({ title: "Aguardando pagamento", description: "O Pix do sinal ainda não consta como pago." });
                    }
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
        if (isAlreadyFullyPaid) {
            toast({ title: "Pedido já quitado", description: "Este pedido já foi totalmente pago e não possui saldo pendente.", variant: "destructive" });
            return;
        }
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
            if (!mpPaymentQuoteRef.current) {
                const quoteData = await fetchJSONWithCSRF<any>("/api/mercadopago/create-preference", {
                    method: "POST",
                    body: {
                        products: cart.map((item: any) => ({
                            id: item.productId || item.id,
                            variant_id: item.variantId || item.variant_id || undefined,
                            service_id: item.serviceId || item.service_id || undefined,
                            name: item.name,
                            quantity: item.quantity,
                        })),
                        partnerId,
                        quoteOnly: true,
                    },
                });
                mpPaymentQuoteRef.current = quoteData.payment_quote || null;
            }
            if (!mpPaymentQuoteRef.current) throw new Error("Não foi possível validar a cotação do pagamento.");
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
                    orderId,
                    amount: depositChargeAmount,
                    paymentQuote: mpPaymentQuoteRef.current,
                    description: `Sinal - ${customerName || "Cliente"}`,
                    isDepositCharge: true,
                    depositMeta: buildDepositCheckoutMeta({
                        payDepositOnly: true,
                        depositPercent: Number(effectiveDepositPercent || propsDepositPercentage || 0),
                        serviceDepositAmount: depositChargeAmount,
                        fullOrderTotal: total,
                        initialChargeAmount: depositChargeAmount,
                        paymentProvider: "Mercado Pago",
                    }),
                },
            });
            if (res?.pixData?.qrCode) {
                setDepositMpPixData({ qrCode: res.pixData.qrCode, qrCodeBase64: res.pixData.qrCodeBase64 });
                setDepositPixGeneratedAt(Date.now());
                setDepositMpPaymentId(res.mpPaymentId);
                setDepositMeta(buildDepositCheckoutMeta({
                    payDepositOnly: true,
                    depositPercent: Number(effectiveDepositPercent || propsDepositPercentage || 0),
                    serviceDepositAmount: depositChargeAmount,
                    fullOrderTotal: total,
                    initialChargeAmount: depositChargeAmount,
                    paymentProvider: "Mercado Pago",
                }));
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

    const PIX_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutos

    const handleRegenerateDepositCharge = async () => {
        if (isAlreadyFullyPaid) return;
        if (depositChargeAmount <= 0.009) return;
        setIsRegeneratingDepositPix(true);
        try {
            if (!mpPaymentQuoteRef.current) {
                const quoteData = await fetchJSONWithCSRF<any>("/api/mercadopago/create-preference", {
                    method: "POST",
                    body: {
                        products: cart.map((item: any) => ({
                            id: item.productId || item.id,
                            variant_id: item.variantId || item.variant_id || undefined,
                            service_id: item.serviceId || item.service_id || undefined,
                            name: item.name,
                            quantity: item.quantity,
                        })),
                        partnerId,
                        quoteOnly: true,
                    },
                });
                mpPaymentQuoteRef.current = quoteData.payment_quote || null;
            }
            if (!mpPaymentQuoteRef.current) throw new Error("Não foi possível validar a cotação do pagamento.");
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
                    orderId,
                    amount: depositChargeAmount,
                    paymentQuote: mpPaymentQuoteRef.current,
                    description: `Sinal - ${customerName || "Cliente"}`,
                    isDepositCharge: true,
                    depositMeta: buildDepositCheckoutMeta({
                        payDepositOnly: true,
                        depositPercent: Number(effectiveDepositPercent || propsDepositPercentage || 0),
                        serviceDepositAmount: depositChargeAmount,
                        fullOrderTotal: total,
                        initialChargeAmount: depositChargeAmount,
                        paymentProvider: "Mercado Pago",
                    }),
                },
            });
            if (res?.pixData?.qrCode) {
                setDepositMpPixData({ qrCode: res.pixData.qrCode, qrCodeBase64: res.pixData.qrCodeBase64 });
                setDepositPixGeneratedAt(Date.now());
                setDepositMpPaymentId(res.mpPaymentId);
                setDepositMeta(buildDepositCheckoutMeta({
                    payDepositOnly: true,
                    depositPercent: Number(effectiveDepositPercent || propsDepositPercentage || 0),
                    serviceDepositAmount: depositChargeAmount,
                    fullOrderTotal: total,
                    initialChargeAmount: depositChargeAmount,
                    paymentProvider: "Mercado Pago",
                }));
                toast({ title: "Pix regenerado", description: "Novo QR Code do sinal gerado." });
            } else {
                toast({ title: "Erro", description: res?.error || "Falha ao regenerar Pix.", variant: "destructive" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Erro", description: "Não foi possível regenerar a cobrança de sinal.", variant: "destructive" });
        } finally {
            setIsRegeneratingDepositPix(false);
        }
    };

    const handleRegenerateMpPix = async () => {
        if (isAlreadyFullyPaid) return;
        setIsRegeneratingMpPix(true);
        try {
            if (!mpPaymentQuoteRef.current) {
                const quoteData = await fetchJSONWithCSRF<any>("/api/mercadopago/create-preference", {
                    method: "POST",
                    body: {
                        products: cart.map((item: any) => ({
                            id: item.productId || item.id,
                            variant_id: item.variantId || item.variant_id || undefined,
                            service_id: item.serviceId || item.service_id || undefined,
                            name: item.name,
                            quantity: item.quantity,
                        })),
                        partnerId,
                        quoteOnly: true,
                    },
                });
                mpPaymentQuoteRef.current = quoteData.payment_quote || null;
            }
            if (!mpPaymentQuoteRef.current) throw new Error("Não foi possível validar a cotação do pagamento.");
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
                    orderId,
                    amount: chargeTarget,
                    paymentQuote: mpPaymentQuoteRef.current,
                    description: `Venda ERP - ${customerName || "Cliente"}`,
                },
            });
            if (res?.pixData?.qrCode) {
                setMpPixData({ qrCode: res.pixData.qrCode, qrCodeBase64: res.pixData.qrCodeBase64 });
                setMpPixGeneratedAt(Date.now());
                if (res.mpPaymentId) setMpPaymentId(res.mpPaymentId);
                toast({ title: "Pix regenerado", description: "Novo QR Code gerado." });
            } else {
                toast({ title: "Erro", description: res?.error || "Falha ao regenerar Pix.", variant: "destructive" });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Erro", description: "Não foi possível regenerar o Pix.", variant: "destructive" });
        } finally {
            setIsRegeneratingMpPix(false);
        }
    };

    // Split: user-defined base amount per method (not weights / percentages)
    const [payments, setPayments] = useState<{
        id: number
        method: string | null
        paymentMethodId: string | null
        amount: number
        installmentNumber: number
        paymentMethodDiscountAmount?: number
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
    // Reaproveita respostas idênticas durante a mesma venda. Trocar entre telas
    // do modal não deve disparar novamente a mesma Server Action.
    const paymentCalculationCacheRef = useRef<Map<string, any>>(new Map());
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
        installmentCostAmount?: number
        feeAmount: number
        fixedFeeAmount: number
        feeBearer: "merchant" | "customer" | null
        installmentFeeBearer?: "merchant" | "customer" | null
        appliedDiscountPercent?: number
        appliedFeePercent?: number
        appliedInterestPercent?: number
        receiptCart: any[]
        paymentBreakdown?: Array<{ method: string; amount: number }>
    } | null>(null)

    const subTotal = cart.reduce((acc: number, item: any) => acc + (item.unitPrice * item.quantity), 0);
    const total = subTotal + shippingFee + otherCosts - discountAmount;
    const chargeTarget = Math.max(0, Number(amountDue ?? total));
    // Full order value (not just the remaining charge): amountDue is the outstanding balance.
    const fullOrderTotal = amountDue !== undefined ? existingPaidAmount + amountDue : total;
    const isAlreadyFullyPaid = (amountDue !== undefined && amountDue <= 0.009) || (existingPaidAmount > 0.009 && chargeTarget <= 0.009);

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
    const { methods: availableMethods, isLoading: isLoadingMethods, invalidate } = usePaymentMethods(isOpen ? partnerId : '', selectedStore?.id);

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

        const refreshOnChange = () => {
            paymentCalculationCacheRef.current.clear();
            invalidate();
        };

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
            paymentCalculationCacheRef.current.clear();
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
            setShowMpPixModal(false);
            setMpPixGeneratedAt(null);
            setMpBoletoData(null);
            setBoletoGeneratedAt(null);
            setMpPaymentId(null);
            setPreCreatedOrderId(null);
            mpPaymentQuoteRef.current = null;
            mpBrickFormDataRef.current = null;
            setMpIsCheckingStatus(false);
            setIsCheckingMpPixStatus(false);
            mpBrickInitializedRef.current = false;
            if (mpBrickIdRef.current) {
                try { mpBrickIdRef.current.unmount(); } catch { }
                mpBrickIdRef.current = null;
            }
        }
        // Não depender de `total`: se o pai zerar o carrinho (ex.: PDV) o total cai e apagava a tela de sucesso.
    }, [isOpen]);

    // Marketplace/MP orders: auto-navigate to the original method (locked).
    // Partial/sinal remainder: stay on the methods list so the seller can choose how to receive the rest.
    useEffect(() => {
        if (!isOpen || isLoadingMethods) return;
        // Only auto-navigate if we're on the initial methods screen
        if (view !== 'methods') return;

        const isMarketplace = (isMarketplaceOrder || isMpOrder) && !!originalPaymentMethod;
        if (!isMarketplace) return;

        if (existingPaymentBreakdown && existingPaymentBreakdown.length > 1) {
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
        const targetMethodLabel = originalPaymentMethod || 'Dinheiro';

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
        const restoredMethodId = existingPaymentBreakdown?.[0]?.paymentMethodId || null;

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
    }, [isOpen, isMarketplaceOrder, isMpOrder, originalPaymentMethod, existingPaymentBreakdown, isLoadingMethods, activeMethods, view]);

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

        // Carregar script de segurança do Mercado Pago para Device ID / Antifraude
        if (!document.getElementById("mp-security-script")) {
            const securityScript = document.createElement("script");
            securityScript.id = "mp-security-script";
            securityScript.src = "https://www.mercadopago.com/v2/security.js";
            securityScript.setAttribute("view", "checkout");
            securityScript.async = true;
            document.body.appendChild(securityScript);
        }

        if ((window as any).MercadoPago) {
            setMpSdkLoaded(true);
            return;
        }
        const script = document.createElement("script");
        script.id = "mp-js-v2-script";
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
            const mp = new (window as any).MercadoPago(mpPublicKey, {
                locale: "pt-BR",
                advancedFraudPrevention: true,
            });
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
                            service_id: item.serviceId || undefined,
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
            mpPaymentQuoteRef.current = preferenceData.payment_quote || null;

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
                            customVariables: isDark ? {
                                textPrimaryColor: "#f0f0f0",
                                textSecondaryColor: "#a1a1aa",
                                inputBackgroundColor: "#24252b",
                                formBackgroundColor: "#18181b",
                                baseColor: "#059669",
                                baseColorFirstVariant: "#059669E6",
                                baseColorSecondVariant: "#059669E6",
                                errorColor: "#f04438",
                                successColor: "#059669",
                                outlinePrimaryColor: "#3f3f46",
                                outlineSecondaryColor: "#3f3f46",
                                buttonTextColor: "#FFFFFF",
                                fontSizeExtraSmall: "12px",
                                fontSizeSmall: "14px",
                                fontSizeMedium: "15px",
                                fontSizeLarge: "17px",
                                fontSizeExtraLarge: "20px",
                                fontWeightNormal: "400",
                                fontWeightSemiBold: "600",
                                formInputsTextTransform: "none",
                                inputVerticalPadding: "12px",
                                inputHorizontalPadding: "16px",
                                inputBorderWidth: "1px",
                                inputFocusedBorderWidth: "1px",
                                inputFocusedBoxShadow: "0 0 0 3px rgba(5,150,105,0.3)",
                                inputErrorFocusedBoxShadow: "0 0 0 3px rgba(239,68,68,0.3)",
                                borderRadiusSmall: "6px",
                                borderRadiusMedium: "8px",
                                borderRadiusLarge: "12px",
                                formPadding: "16px",
                            } : {
                                textPrimaryColor: "#003229",
                                textSecondaryColor: "#6b7280",
                                inputBackgroundColor: "#FFFFFF",
                                formBackgroundColor: "#FFFFFF",
                                baseColor: "#059669",
                                baseColorFirstVariant: "#059669E6",
                                baseColorSecondVariant: "#059669E6",
                                errorColor: "#f04438",
                                successColor: "#059669",
                                outlinePrimaryColor: "#ebebeb",
                                outlineSecondaryColor: "#ebebeb",
                                buttonTextColor: "#FFFFFF",
                                fontSizeExtraSmall: "12px",
                                fontSizeSmall: "14px",
                                fontSizeMedium: "15px",
                                fontSizeLarge: "17px",
                                fontSizeExtraLarge: "20px",
                                fontWeightNormal: "400",
                                fontWeightSemiBold: "600",
                                formInputsTextTransform: "none",
                                inputVerticalPadding: "12px",
                                inputHorizontalPadding: "16px",
                                inputBorderWidth: "1px",
                                inputFocusedBorderWidth: "1px",
                                inputFocusedBoxShadow: "0 0 0 3px rgba(5,150,105,0.15)",
                                inputErrorFocusedBoxShadow: "0 0 0 3px rgba(239,68,68,0.15)",
                                borderRadiusSmall: "6px",
                                borderRadiusMedium: "8px",
                                borderRadiusLarge: "12px",
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
        if (isAlreadyFullyPaid) {
            toast({
                title: "Pedido já quitado",
                description: "Este pedido já foi totalmente pago e não possui saldo pendente.",
                variant: "destructive",
            });
            return;
        }
        setMpIsProcessing(true);
        setMpBrickError(null);
        try {
            const resolvedFormData = formData.formData || formData;
            mpBrickFormDataRef.current = resolvedFormData;
            const deviceId = (window as any).MP_DEVICE_SESSION_ID || null;

            const responseData = await fetchJSONWithCSRF<any>("/api/mercadopago/process-erp-payment", {
                method: "POST",
                body: {
                    orderId,
                    paymentFormData: resolvedFormData,
                    deviceId,
                    partnerId,
                    amount: chargeTarget,
                    paymentQuote: mpPaymentQuoteRef.current,
                    description: `Venda ERP - ${customer?.name || "Cliente"}`,
                },
            });

            if (responseData.mpPaymentId) setMpPaymentId(responseData.mpPaymentId);

            const status = responseData.paymentStatus;
            const paymentMethod = responseData.paymentMethod;

            if (status === "approved") {
                // Payment approved - register the sale via onConfirm.
                // Merge with existing legs (e.g. sinal already paid) so we don't drop them.
                const mpLabel = responseData.paymentMethodDisplayName || "Mercado Pago";
                const existingLegs = existingPaymentBreakdown?.filter((e: any) => e?.method && (Number(e?.amount || 0) > 0.009 || Number(e?.amountReceived || 0) > 0.009)) || [];
                const mpLeg = {
                    method: mpLabel,
                    amount: chargeTarget,
                    amountReceived: chargeTarget,
                    paymentMethodId: null,
                    installmentNumber: 1,
                    provider: "Mercado Pago",
                    interestAmount: 0,
                    feeAmount: 0,
                    fixedFeeAmount: 0,
                    feeBearer: "merchant",
                };
                handleStartProcessing({
                    paymentMethod: mpLabel,
                    paymentProvider: "Mercado Pago",
                    mpPaymentId: responseData.mpPaymentId,
                    paymentStatus: "paid",
                    paidAmount: existingPaidAmount + chargeTarget,
                    paymentBreakdown: [...existingLegs, mpLeg],
                    splitPayments: [],
                    isPendingDelivery,
                });
            } else if (status === "pending" && paymentMethod === "pix") {
                const pix = responseData.pixData;
                if (pix?.qrCode && pix?.qrCodeBase64) {
                    setMpPixData({ qrCode: pix.qrCode, qrCodeBase64: pix.qrCodeBase64 });
                    setMpPixGeneratedAt(Date.now());
                    setMpStep("pix");
                    setShowMpPixModal(true);
                } else {
                    setMpBrickError("Dados do Pix não retornados pelo provedor.");
                }
            } else if (status === "pending" && (paymentMethod === "bolbradesco" || paymentMethod === "boleto" || paymentMethod === "ticket")) {
                const boleto = responseData.boletoData;
                if (boleto?.barcode || boleto?.ticketUrl) {
                    setMpBoletoData(boleto);
                    setBoletoGeneratedAt(Date.now());
                    setMpStep("boleto");
                } else {
                    setMpBrickError("Dados do Boleto não retornados pelo provedor.");
                }
            } else if (status === "in_process" || status === "pending") {
                const isRedirectPayment = ["account_money", "consumer_credits", "mercadopago"].includes(paymentMethod);
                if (isRedirectPayment) {
                    setMpStep("mp_redirect");
                } else {
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
                }
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
        const existingLegs = existingPaymentBreakdown?.filter((e: any) => e?.method && (Number(e?.amount || 0) > 0.009 || Number(e?.amountReceived || 0) > 0.009)) || [];
        const mpLeg = {
            method: "Pix (Mercado Pago)",
            amount: chargeTarget,
            amountReceived: chargeTarget,
            paymentMethodId: null,
            installmentNumber: 1,
            provider: "Mercado Pago",
            interestAmount: 0,
            feeAmount: 0,
            fixedFeeAmount: 0,
            feeBearer: "merchant",
        };
        handleStartProcessing({
            paymentMethod: "Pix (Mercado Pago)",
            paymentProvider: "Mercado Pago",
            mpPaymentId: mpPaymentId,
            paymentStatus: "paid",
            paidAmount: existingPaidAmount + chargeTarget,
            paymentBreakdown: [...existingLegs, mpLeg],
            splitPayments: [],
            isPendingDelivery,
        });
    };

    const handleVerifyMpPixPayment = async () => {
        if (!mpPaymentId) return;
        setIsCheckingMpPixStatus(true);
        try {
            const res = await checkMercadoPagoPaymentStatusAction(mpPaymentId);
            if (res && 'success' in res && res.success) {
                if (res.status === "approved") {
                    toast({ title: "Pix Pago!", description: "O pagamento foi confirmado." });
                    setShowMpPixModal(false);
                    setMpPixData(null);
                    setMpStep("brick");
                    setMpPaymentId(null);
                    invalidate();
                    handleMpConfirmPix();
                } else {
                    const isExpired = (res.status === "cancelled" || res.status === "expired" || res.status === "failed") ||
                        (mpPixGeneratedAt !== null && (Date.now() - mpPixGeneratedAt > PIX_EXPIRATION_MS));
                    if (isExpired) {
                        toast({ title: "Pix expirado", description: "O QR Code expirou. Regenerando..." });
                        await handleRegenerateMpPix();
                    } else {
                        toast({ title: "Aguardando pagamento", description: "O Pix ainda não consta como pago." });
                    }
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
            setIsCheckingMpPixStatus(false);
        }
    };

    const handleSendMpPixWhatsApp = () => {
        if (!mpPixData || !customer?.phone) return;
        const formattedAmount = formatCurrency(chargeTarget);
        const customerName = (customer?.name || customer?.full_name || customer?.fullName || customer?.customer_name || "").trim();
        const messageText = `Olá, *${customerName || "Cliente"}*! 🌟\n\n` +
            `Aqui está o código Pix Copia e Cola para o pagamento do seu pedido no valor de *${formattedAmount}*:\n\n` +
            `\`${mpPixData.qrCode}\`\n\n` +
            `Assim que realizar o pagamento, nosso sistema irá confirmar de forma automática! 😉`;
        const encodedMsg = encodeURIComponent(messageText);
        const phone = String(customer.phone).replace(/\D/g, "");
        window.open(`https://wa.me/55${phone}?text=${encodedMsg}`, "_blank");
    };

    const BOLETO_EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias

    const handleVerifyBoletoPayment = async () => {
        if (!mpPaymentId) return;
        setIsCheckingMpPixStatus(true);
        try {
            const res = await checkMercadoPagoPaymentStatusAction(mpPaymentId);
            if (res && 'success' in res && res.success) {
                if (res.status === "approved") {
                    const mpLabel = "Boleto (Mercado Pago)";
                    const existingLegs = existingPaymentBreakdown?.filter((e: any) => e?.method && (Number(e?.amount || 0) > 0.009 || Number(e?.amountReceived || 0) > 0.009)) || [];
                    const mpLeg = {
                        method: mpLabel,
                        amount: chargeTarget,
                        amountReceived: chargeTarget,
                        paymentMethodId: null,
                        installmentNumber: 1,
                        provider: "Mercado Pago",
                        interestAmount: 0,
                        feeAmount: 0,
                        fixedFeeAmount: 0,
                        feeBearer: "merchant",
                    };
                    handleStartProcessing({
                        paymentMethod: mpLabel,
                        paymentProvider: "Mercado Pago",
                        mpPaymentId: mpPaymentId,
                        paymentStatus: "paid",
                        paidAmount: existingPaidAmount + chargeTarget,
                        paymentBreakdown: [...existingLegs, mpLeg],
                        splitPayments: [],
                        isPendingDelivery,
                    });
                } else {
                    const isExpired = res.status === "cancelled" || res.status === "expired" || res.status === "failed" ||
                        (boletoGeneratedAt !== null && (Date.now() - boletoGeneratedAt > BOLETO_EXPIRATION_MS));
                    if (isExpired) {
                        toast({ title: "Boleto expirado", description: "O boleto expirou. Regenerando..." });
                        await handleRegenerateBoleto();
                    } else {
                        toast({ title: "Aguardando pagamento", description: "O boleto ainda não consta como pago." });
                    }
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
            setIsCheckingMpPixStatus(false);
        }
    };

    const handleRegenerateBoleto = async () => {
        if (!mpBrickFormDataRef.current || isAlreadyFullyPaid) return;
        setIsRegeneratingBoleto(true);
        try {
            const deviceId = (window as any).MP_DEVICE_SESSION_ID || null;
            const responseData = await fetchJSONWithCSRF<any>("/api/mercadopago/process-erp-payment", {
                method: "POST",
                body: {
                    orderId,
                    paymentFormData: mpBrickFormDataRef.current,
                    deviceId,
                    partnerId,
                    amount: chargeTarget,
                    paymentQuote: mpPaymentQuoteRef.current,
                    description: `Venda ERP - ${customer?.name || "Cliente"}`,
                },
            });
            if (responseData.mpPaymentId) setMpPaymentId(responseData.mpPaymentId);

            const status = responseData.paymentStatus;
            const paymentMethod = responseData.paymentMethod;
            if (status === "approved") {
                const mpLabel = responseData.paymentMethodDisplayName || "Boleto (Mercado Pago)";
                const existingLegs = existingPaymentBreakdown?.filter((e: any) => e?.method && (Number(e?.amount || 0) > 0.009 || Number(e?.amountReceived || 0) > 0.009)) || [];
                const mpLeg = {
                    method: mpLabel,
                    amount: chargeTarget,
                    amountReceived: chargeTarget,
                    paymentMethodId: null,
                    installmentNumber: 1,
                    provider: "Mercado Pago",
                    interestAmount: 0,
                    feeAmount: 0,
                    fixedFeeAmount: 0,
                    feeBearer: "merchant",
                };
                handleStartProcessing({
                    paymentMethod: mpLabel,
                    paymentProvider: "Mercado Pago",
                    mpPaymentId: responseData.mpPaymentId,
                    paymentStatus: "paid",
                    paidAmount: existingPaidAmount + chargeTarget,
                    paymentBreakdown: [...existingLegs, mpLeg],
                    splitPayments: [],
                    isPendingDelivery,
                });
            } else if (status === "pending" && (paymentMethod === "bolbradesco" || paymentMethod === "boleto" || paymentMethod === "ticket")) {
                const boleto = responseData.boletoData;
                if (boleto?.barcode || boleto?.ticketUrl) {
                    setMpBoletoData(boleto);
                    setBoletoGeneratedAt(Date.now());
                    setMpStep("boleto");
                    toast({ title: "Boleto regenerado", description: "Novo boleto gerado via Mercado Pago." });
                } else {
                    setMpBrickError("Dados do Boleto não retornados pelo provedor.");
                }
            } else {
                setMpBrickError(`Status inesperado do pagamento: ${status}`);
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Erro", description: "Não foi possível regenerar o boleto.", variant: "destructive" });
        } finally {
            setIsRegeneratingBoleto(false);
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
                    const otherPaid = payments.reduce((acc, p, idx) => {
                        if (idx === editingPaymentIndex) return acc;
                        return acc + Math.max(0, Number(p.amount || 0));
                    }, 0);
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
        // In split mode, calculate discount/fee based on the leg's amount (calcBaseAmount), not the full total.
        // For single-leg partial payments, price only the amount being charged now - not the full remaining.
        const singleLegPartialBase =
            editingPaymentIndex === null &&
                paymentBaseAmount > 0.009 &&
                paymentBaseAmount < netChargeTarget - 0.009
                ? paymentBaseAmount
                : null;
        const base = editingPaymentIndex !== null
            ? Math.max(0, Number(calcBaseAmount || 0))
            : (singleLegPartialBase ?? netChargeTarget);

        const currentMethod = selectedMethodId ? activeMethods.find((m: any) => m.id === selectedMethodId) : null;
        const feeBearer = (currentMethod?.fee_bearer || "merchant") as "merchant" | "customer";

        // Only compute full installment options when method or amount changes
        const shouldComputeOptions = selectedMethodId !== lastOptionsConfigRef.current.methodId
            || base !== lastOptionsConfigRef.current.amount;
        if (shouldComputeOptions) {
            lastOptionsConfigRef.current = { methodId: selectedMethodId, feeBearer, amount: base };
        }

        const calculationCacheKey = JSON.stringify({
            methodId: selectedMethodId,
            amount: base,
            installmentNumber,
            feeBearer,
            includeInstallmentOptions: shouldComputeOptions,
        });
        const cachedCalculation = paymentCalculationCacheRef.current.get(calculationCacheKey);
        if (cachedCalculation) {
            setPaymentCalculation(cachedCalculation);
            if (cachedCalculation.installmentOptions?.length > 0) {
                setInstallmentOptions(cachedCalculation.installmentOptions);
            }
            setIsPaymentCalculationLoading(false);
            return;
        }

        setIsPaymentCalculationLoading(true);
        const calculationPromise = currentMethod
            ? Promise.resolve(calculatePaymentDetailsLocally(
                currentMethod as PartnerPaymentMethod,
                base,
                installmentNumber,
                shouldComputeOptions,
            ))
            : calculatePaymentMethodAmountsAction({
                originalAmount: base,
                paymentMethodId: selectedMethodId,
                installmentNumber,
                feeBearer,
                includeInstallmentOptions: shouldComputeOptions,
            });
        calculationPromise.then((res: any) => {
            if (!active) return;
            if (res?.success) {
                paymentCalculationCacheRef.current.set(calculationCacheKey, res);
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
        }).catch(() => {
            if (!active) return;
            setPaymentCalculation(null);
            setInstallmentOptions([]);
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
        ? splitBaseSum < chargeTarget - 0.005
        : isAllocationUnderpaid;

    const splitTotalAbated = useMemo(() => {
        return splitBaseSum;
    }, [splitBaseSum]);

    const isOverpaid = view === 'split'
        ? splitTotalAbated > chargeTarget + 0.005
        : !isAllocationUnderpaid && paymentBaseAmount > finalTotalWithMethodPricing + 0.005;

    const changeAmount = view === 'money' && wantsChange
        ? Math.max(0, payWithAmount - paymentBaseAmount)
        : view === 'split'
            ? Math.max(0, splitTotalAbated - chargeTarget)
            : (isOverpaid ? paymentBaseAmount - finalTotalWithMethodPricing : 0);

    /** Valor efetivo pago / a registrar (líquido do método quando houver cálculo). */
    const totalPaidCalculated = useMemo(() => {
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
            return { compactAlertPaid: splitBaseSum, compactAlertNeed: chargeTarget };
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
            const installmentCostAmount = Number(paymentCalculation.installmentCostAmount || 0);
            const interestAmount = Number(paymentCalculation.interestAmount || 0);
            const fixedInterestAmount = Math.max(0, interestAmount - installmentCostAmount);
            return {
                paymentMethodDiscountAmount: Number(paymentCalculation.paymentMethodDiscountAmount || 0),
                interestAmount,
                fixedInterestAmount,
                installmentCostAmount,
                feeAmount: Number(paymentCalculation.feeAmount || 0),
                fixedFeeAmount: Number(paymentCalculation.fixedFeeAmount || 0),
                feeBearer: paymentCalculation.feeBearer,
                installmentFeeBearer: paymentCalculation.installmentFeeBearer || "merchant",
                appliedDiscountPercent: Number(paymentCalculation.appliedDiscountPercent || 0),
                appliedFeePercent: Number(paymentCalculation.appliedFeePercent || 0),
                appliedInterestPercent: Number(paymentCalculation.appliedInterestPercent || 0),
            };
        }
        return {
            paymentMethodDiscountAmount: 0,
            interestAmount: 0,
            fixedInterestAmount: 0,
            installmentCostAmount: 0,
            feeAmount: 0,
            fixedFeeAmount: 0,
            feeBearer: "merchant" as const,
            installmentFeeBearer: "merchant" as const,
            appliedDiscountPercent: 0,
            appliedFeePercent: 0,
            appliedInterestPercent: 0,
        };
    }, [view, splitPreview, paymentCalculation]);

    const displayTransactionTotal = paymentStatus === "success" && successSnapshot
        ? successSnapshot.displayOrderTotal
        : view === 'split'
            ? (splitPreview && 'success' in splitPreview && splitPreview.success ? splitPreview.finalTotal : chargeTarget)
            : (view === 'money' || view === 'card' || view === 'pix' || view === 'store_credit')
                ? finalTotalWithMethodPricing
                : total;

    const receiptPricingDetails = useMemo(() => {
        const source = paymentStatus === "success" && successSnapshot
            ? {
                paymentMethodDiscountAmount: successSnapshot.paymentMethodDiscountAmount,
                interestAmount: successSnapshot.interestAmount,
                installmentCostAmount: successSnapshot.installmentCostAmount,
                feeAmount: successSnapshot.feeAmount,
                fixedFeeAmount: successSnapshot.fixedFeeAmount,
                feeBearer: successSnapshot.feeBearer,
                installmentFeeBearer: successSnapshot.installmentFeeBearer || "merchant",
                appliedDiscountPercent: successSnapshot.appliedDiscountPercent,
                appliedFeePercent: successSnapshot.appliedFeePercent,
                appliedInterestPercent: successSnapshot.appliedInterestPercent,
            }
            : currentPricingTotals;

        const installmentCostAmount = Number(source.installmentCostAmount || 0);
        const interestAmount = Number(source.interestAmount || 0);
        const fixedInterestAmount = Math.max(0, interestAmount - installmentCostAmount);
        const isMerchantFee = source.feeBearer === "merchant";
        const isMerchantInstallment = (source.installmentFeeBearer || "merchant") === "merchant";

        const absorbedInterest = isMerchantFee ? fixedInterestAmount : 0;
        const customerInterest = !isMerchantFee ? fixedInterestAmount : 0;
        const absorbedInstallmentCost = isMerchantInstallment ? installmentCostAmount : 0;
        const customerInstallmentCost = !isMerchantInstallment ? installmentCostAmount : 0;

        const totalAbsorbed = absorbedInterest + Number(source.feeAmount || 0) + Number(source.fixedFeeAmount || 0) + absorbedInstallmentCost;

        const tooltipRows = [
            customerInterest > 0.009 ? { label: "Juros (fixos)", value: formatCurrency(customerInterest) } : null,
            customerInstallmentCost > 0.009 ? { label: "Custo de parcelamento", value: formatCurrency(customerInstallmentCost) } : null,
            (isMerchantFee && (fixedInterestAmount + Number(source.feeAmount || 0) + Number(source.fixedFeeAmount || 0)) > 0.009)
                ? { label: "Juros/taxas absorvidos", value: formatCurrency(fixedInterestAmount + Number(source.feeAmount || 0) + Number(source.fixedFeeAmount || 0)) } : null,
            (isMerchantInstallment && installmentCostAmount > 0.009)
                ? { label: "Custo de parcelamento absorvido", value: formatCurrency(installmentCostAmount) } : null,
        ].filter(Boolean) as Array<{ label: string; value: string }>;

        return [
            source.paymentMethodDiscountAmount > 0 ? { label: `Desc. meio pagamento${source.appliedDiscountPercent ? ` (${source.appliedDiscountPercent}%)` : ''}`, amount: source.paymentMethodDiscountAmount, prefix: '-', tone: 'positive' } : null,
            customerInterest > 0.009 ? { label: "Juros", amount: customerInterest, prefix: '+', tone: 'neutral' } : null,
            customerInstallmentCost > 0.009 ? { label: "Juros (parcelamento)", amount: customerInstallmentCost, prefix: '+', tone: 'neutral' } : null,
            (!isMerchantFee && Number(source.feeAmount || 0) > 0.009) ? { label: `Taxas${source.appliedFeePercent ? ` (${source.appliedFeePercent}%)` : ''}`, amount: Number(source.feeAmount || 0), tone: 'neutral' } : null,
            (!isMerchantFee && Number(source.fixedFeeAmount || 0) > 0.009) ? { label: "Custo do método", amount: Number(source.fixedFeeAmount || 0), prefix: '+', tone: 'neutral' } : null,
            totalAbsorbed > 0.009 ? {
                label: "Taxas/juros absorvidos",
                amount: totalAbsorbed,
                isAbsorbed: true,
                tooltipTitle: "Custos absorvidos pela empresa",
                tooltipRows,
            } : null,
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

    const handlePaymentApproved = useCallback((orderNumber?: string) => {
        const paidNow = existingPaidAmount + chargeTarget;
        const isUnder = paidNow < fullOrderTotal - 0.005;
        const remainingPartial = Math.max(0, fullOrderTotal - paidNow);
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
            displayOrderTotal: fullOrderTotal,
            totalPaid: paidNow,
            change: 0,
            isUnderpaid: isUnder,
            remainingPartial,
            paymentMethodDiscountAmount: Number(currentPricingTotals.paymentMethodDiscountAmount || 0),
            interestAmount: Number(currentPricingTotals.interestAmount || 0),
            installmentCostAmount: Number(currentPricingTotals.installmentCostAmount || 0),
            feeAmount: Number(currentPricingTotals.feeAmount || 0),
            fixedFeeAmount: Number(currentPricingTotals.fixedFeeAmount || 0),
            feeBearer: currentPricingTotals.feeBearer,
            installmentFeeBearer: currentPricingTotals.installmentFeeBearer || "merchant",
            appliedDiscountPercent: currentPricingTotals.appliedDiscountPercent,
            appliedFeePercent: currentPricingTotals.appliedFeePercent,
            appliedInterestPercent: currentPricingTotals.appliedInterestPercent,
            receiptCart: Array.isArray(cart) ? cart.map((row: any) => ({ ...row })) : [],
            paymentBreakdown: snapshotBreakdown,
        });

        setSaleId(orderNumber || "DDT000000");
        setPaymentStatus('success');
        setPreCreatedOrderId(null);
    }, [mpStep, chargeTarget, existingPaidAmount, fullOrderTotal, subTotal, itemCount, shippingFee, otherCosts, discountAmount, total, currentPricingTotals, cart]);

    // Realtime: updates POS in < 80ms as soon as Mercado Pago webhook updates the order
    useRealtimeRecord<{ situation?: string; payment_status?: string; order_number?: string }>({
        table: "orders",
        id: preCreatedOrderId,
        enabled: !!preCreatedOrderId && (mpStep === "pix" || mpStep === "boleto"),
        onUpdate: (record) => {
            if (record?.situation === "paid" || record?.payment_status === "approved") {
                handlePaymentApproved(record.order_number);
            }
        },
    });

    // Initial check + safety fallback (eliminating the 3-second rapid polling loop)
    useEffect(() => {
        if (!preCreatedOrderId) return;
        if (mpStep !== "pix" && mpStep !== "boleto") return;

        let isMounted = true;

        const checkStatus = async () => {
            try {
                const response = await fetch("/api/orders/sync-payment-status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orderId: preCreatedOrderId }),
                });
                if (!isMounted) return;
                if (response.ok) {
                    const data = await response.json();
                    if (data.newStatus === "paid" || data.paymentStatus === "approved") {
                        handlePaymentApproved(data.orderNumber);
                    }
                }
            } catch (error) {
                console.error("Error checking payment status:", error);
            }
        };

        // Run one immediate check in case order is already paid
        void checkStatus();

        // One gentle fallback at 15s in case websocket connection dropped
        const fallbackTimer = setTimeout(() => {
            if (isMounted) void checkStatus();
        }, 15000);

        return () => {
            isMounted = false;
            clearTimeout(fallbackTimer);
        };
    }, [preCreatedOrderId, mpStep, handlePaymentApproved]);

    const getTitle = () => {
        const selectedTypeLabel =
            selectedMethodType === "pix" ? "Pix" :
                selectedMethodType === "cash" ? "Dinheiro" :
                    selectedMethodType === "credit_card" ? "Cartão de Crédito" :
                        selectedMethodType === "debit_card" ? "Cartão de Débito" :
                            selectedMethodType === "card" ? "Cartão" : "Método";

        let cardTitle = "Cartão";
        if (selectedMethodObj) {
            const canonical = normalizeMethodType(selectedMethodObj.type);
            if (canonical === "credit_card") cardTitle = "Cartão de Crédito";
            else if (canonical === "debit_card") cardTitle = "Cartão de Débito";
        }

        const methodSuffix = (!isFreePlan && selectedMethodObj?.name && !["pix", "dinheiro", "cartao", "cartão", "cartão de crédito", "cartao de credito", "cartão de débito", "cartao de debito"].includes(selectedMethodObj.name.toLowerCase().trim()))
            ? ` (${selectedMethodObj.name})`
            : '';

        switch (view) {
            case 'methods': return 'Método de Pagamento';
            case 'method_type_select': return `Selecionar ${selectedTypeLabel}`;
            case 'money': return `Dinheiro${methodSuffix}`;
            case 'card': return `${cardTitle}${methodSuffix}`;
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
            setShowMpPixModal(false);
            setMpPixGeneratedAt(null);
            setIsCheckingMpPixStatus(false);
            setMpBoletoData(null);
            setBoletoGeneratedAt(null);
            setMpPaymentId(null);
            setView('methods');
        } else if (view === 'money' || view === 'card' || view === 'pix' || view === 'store_credit') {
            resetSelectedMethodPricing();
            if (editingPaymentIndex !== null) {
                setView('split_method_select');
            } else if (isMarketplaceOrder || isMpOrder) {
                // Marketplace/MP orders: back from payment input closes the modal
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
            const pmDiscount = Number(paymentCalculation?.paymentMethodDiscountAmount || 0);
            const newPayments = [...payments];
            newPayments[editingPaymentIndex] = {
                ...newPayments[editingPaymentIndex],
                amount: newAmount,
                paymentMethodDiscountAmount: pmDiscount,
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
            if (isFreePlan) {
                userManuallyChangedRef.current = false;
                setPaymentCalculation(null);
                setView(getTargetViewForMethodType(methodType));
                return;
            }
            toast({
                title: "Sem métodos ativos",
                description: `Nenhum método deste tipo ativo encontrado.`,
                variant: "destructive",
            });
            return;
        }

        if (isFreePlan || methodsOfType.length === 1) {
            const only = methodsOfType[0];
            if (only) {
                setSelectedMethodId(only.id);
            }
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
                        installmentFeeBearer: pr?.installmentFeeBearer || "merchant",
                        installmentCostAmount: Number(pr?.installmentCostAmount || 0),
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
            const isPartialSingleLeg = !isUnpaid && paymentBaseAmount > 0.009 && paymentBaseAmount < netChargeTarget - 0.009;
            const methodLegAmount = isPartialSingleLeg
                ? paymentBaseAmount
                : Number(paymentCalculation?.finalAmount ?? finalTotalWithMethodPricing ?? netChargeTarget);
            const actualReceived = isUnpaid ? 0 : (view === 'money'
                ? (wantsChange ? Math.max(payWithAmount, paymentBaseAmount) : Math.max(paymentBaseAmount, paymentBaseAmount))
                : isPartialSingleLeg
                    ? paymentBaseAmount
                    : Number(paymentCalculation?.amountReceived ?? paymentBaseAmount ?? 0));

            const methodLeg = {
                method: (() => {
                    const baseLabel = (() => {
                        if (isMarketplaceOrder && originalPaymentMethod) {
                            return formatPaymentMethodToFullLabel(originalPaymentMethod);
                        }
                        const selectedMethodObj = selectedMethodId ? activeMethods.find((method: any) => method.id === selectedMethodId) : null;
                        if (selectedMethodObj) {
                            return getFormattedMethodLabel(selectedMethodObj.name, selectedMethodObj.type);
                        }
                        if (isUnpaid && !selectedMethodId) {
                            return 'Pendente';
                        }
                        const fallbackName = view === 'money' ? 'Dinheiro' : (view === 'pix' ? 'Pix' : 'Cartão');
                        const fallbackType = view === 'money' ? 'cash' : (view === 'pix' ? 'pix' : 'card');
                        return getFormattedMethodLabel(fallbackName, fallbackType);
                    })();
                    return baseLabel;
                })(),
                amount: (isUnpaid && !selectedMethodId) ? 0 : methodLegAmount,
                amountReceived: actualReceived,
                wantsChange: view === 'money' ? wantsChange : undefined,
                payWithAmount: view === 'money' && wantsChange ? payWithAmount : undefined,
                changeAmount: (isUnpaid || actualReceived <= 0.009) ? 0 : (view === 'money'
                    ? (wantsChange
                        ? Number((payWithAmount - methodLegAmount).toFixed(2))
                        : (paymentBaseAmount > methodLegAmount
                            ? Number((paymentBaseAmount - methodLegAmount).toFixed(2))
                            : 0))
                    : 0),
                adjustmentType: paymentCalculation?.adjustmentType || 'none',
                adjustmentPercent: Number(paymentCalculation?.adjustmentPercent || 0),
                adjustmentAmount: Number(paymentCalculation?.adjustmentAmount || 0),
                effectiveAmount: (isUnpaid && !selectedMethodId) ? 0 : Number(paymentCalculation?.effectiveAmount ?? methodLegAmount),
                netAmount: (isUnpaid && !selectedMethodId) ? 0 : Number(paymentCalculation?.netAmount ?? methodLegAmount),
                feeBearer: paymentCalculation?.feeBearer || null,
                installmentFeeBearer: paymentCalculation?.installmentFeeBearer || "merchant",
                installmentCostAmount: Number(paymentCalculation?.installmentCostAmount || 0),
                paymentMethodDiscountAmount: Number(paymentCalculation?.paymentMethodDiscountAmount || 0),
                interestAmount: Number(paymentCalculation?.interestAmount || 0),
                feeAmount: Number(paymentCalculation?.feeAmount || 0),
                fixedFeeAmount: Number(paymentCalculation?.fixedFeeAmount || 0),
                paymentMethodId: selectedMethodId || null,
                installmentNumber: Math.max(1, Number(installments || 1)),
            };

            selectedLegs = [methodLeg].filter((l) => l.amount > 0.009 || isUnpaidRegister || selectedMethodId !== null);
        }

        const rawPaymentBreakdown = [...storeCreditLeg, ...selectedLegs];
        const newPaymentBreakdown = rawPaymentBreakdown;

        // Keep existing legs even when nothing was received yet (e.g. pending sinal)
        // so "Valores por meio" can show sinal + new payment side by side.
        const validExistingBreakdown = (existingPaymentBreakdown || [])
            .filter((entry: any) => entry?.method && (Number(entry?.amount || 0) > 0.009 || Number(entry?.amountReceived || 0) > 0.009));

        const newMethodKeys = new Set(newPaymentBreakdown.map((entry: any) => String(entry?.method || "").toLowerCase().trim()));
        const mergedPaymentBreakdown = [...validExistingBreakdown, ...newPaymentBreakdown]
            .filter((entry: any, index: number, arr: any[]) => {
                if (!entry?.method) return false;
                if (Number(entry?.amount || 0) <= 0.009 && !isUnpaidRegister && !entry?.paymentMethodId) return false;
                const key = `${String(entry.method).toLowerCase().trim()}::${Number(entry.amountReceived || 0).toFixed(2)}`;
                return arr.findIndex((e: any) => `${String(e?.method || "").toLowerCase().trim()}::${Number(e?.amountReceived || 0).toFixed(2)}` === key) === index
                    || !newMethodKeys.has(String(entry.method).toLowerCase().trim())
                    || index >= validExistingBreakdown.length;
            });

        const paymentMethod = Array.from(new Set(mergedPaymentBreakdown.map((entry: any) => formatPaymentMethodToFullLabel(entry.method)))).join(', ') || 'Método não definido';

        const splitFinalCharged =
            view === 'split' && splitPreview && 'success' in splitPreview && splitPreview.success
                ? splitPreview.finalTotal
                : null;

        const singleRegisterAmount =
            view !== 'split' ? (isUnpaidRegister ? 0 : (effectiveCreditApplied + (isCreditOnlyConfirm ? 0 : (view === 'money' && wantsChange ? Math.max(payWithAmount, paymentBaseAmount) : paymentBaseAmount)))) : (effectiveCreditApplied + (splitFinalCharged || 0));

        const paidToRegister =
            existingPaidAmount + singleRegisterAmount;

        // Compare against the full order value - chargeTarget may be only the remaining balance.
        const isUnderpaid = paidToRegister < fullOrderTotal - 0.005;

        // Incorporate deposit payment into the payload when it was generated and confirmed
        let finalPaidAmount = paidToRegister;
        let finalPaymentStatus = isUnpaidRegister ? 'unpaid' : (isUnderpaid ? (paidToRegister <= 0.005 ? 'unpaid' : 'partially_paid') : 'paid');
        let finalPaymentBreakdown = mergedPaymentBreakdown;
        let finalMpPaymentId: string | undefined = undefined;
        let finalPaymentProvider: string | undefined = undefined;
        let finalCheckoutFulfillment: Record<string, unknown> | null = null;

        if (depositMpPaymentId && depositMeta) {
            const depositLeg = {
                method: "Pix (Mercado Pago)",
                amount: depositChargeAmount,
                amountReceived: depositPaid ? depositChargeAmount : 0,
                adjustmentType: 'none',
                adjustmentPercent: 0,
                adjustmentAmount: 0,
                effectiveAmount: depositChargeAmount,
                netAmount: depositChargeAmount,
                feeBearer: 'merchant',
                paymentMethodDiscountAmount: 0,
                interestAmount: 0,
                feeAmount: 0,
                fixedFeeAmount: 0,
                paymentMethodId: null,
                installmentNumber: 1,
                provider: "Mercado Pago",
                paymentStatus: depositPaid ? "approved" : "pending",
                mpPaymentMethodId: "pix",
            };

            // Add deposit leg to breakdown (prepend since it was paid first)
            finalPaymentBreakdown = [depositLeg, ...mergedPaymentBreakdown.filter(
                (e: any) => !(e?.provider && String(e.provider).toLowerCase().includes("mercado pago"))
            )];

            if (depositPaid) {
                finalPaidAmount = existingPaidAmount + depositChargeAmount + singleRegisterAmount;

                const remainingAfterAll = finalPaidAmount - fullOrderTotal;
                if (remainingAfterAll >= -0.005) {
                    finalPaymentStatus = 'paid';
                } else if (finalPaidAmount > 0.005) {
                    finalPaymentStatus = 'partially_paid';
                } else {
                    finalPaymentStatus = 'unpaid';
                }
            }

            finalMpPaymentId = depositMpPaymentId;
            finalPaymentProvider = "Mercado Pago";
            finalCheckoutFulfillment = {
                ...(depositMeta as Record<string, unknown>),
                depositCheckout: {
                    ...depositMeta,
                    depositStatus: depositPaid ? "paid" : "pending",
                },
            } as Record<string, unknown>;
        }

        // Recompute paymentMethod from final breakdown (includes deposit leg if generated)
        const finalPaymentMethod = Array.from(new Set(finalPaymentBreakdown.map((entry: any) => formatPaymentMethodToFullLabel(entry.method)))).join(', ') || paymentMethod || 'Método não definido';

        return {
            paymentMethod: finalPaymentMethod,
            paymentBreakdown: finalPaymentBreakdown,
            splitPayments: view === 'split' ? payments : [],
            paymentStatus: finalPaymentStatus,
            isPendingDelivery,
            paidAmount: finalPaidAmount,
            ...(finalMpPaymentId ? { mpPaymentId: finalMpPaymentId } : {}),
            ...(finalPaymentProvider ? { paymentProvider: finalPaymentProvider } : {}),
            ...(finalCheckoutFulfillment ? { checkoutFulfillment: finalCheckoutFulfillment } : {}),
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
        if (isAlreadyFullyPaid && !isUnpaidRegister) {
            toast({
                title: "Pedido já quitado",
                description: "Este pedido já foi totalmente pago e não possui saldo pendente.",
                variant: "destructive",
            });
            return;
        }
        if (view === 'money' && wantsChange && payWithAmount <= paymentBaseAmount + 0.005 && !isUnpaidRegister) {
            toast({
                title: "Valor de troco inválido",
                description: `O valor pago em dinheiro (R$ ${payWithAmount.toFixed(2)}) deve ser estritamente maior que o valor da venda (R$ ${paymentBaseAmount.toFixed(2)}) quando a opção "Precisa de troco" está marcada.`,
                variant: "destructive",
            });
            return;
        }

        let payload = forcedPayload || buildConfirmPayload(isUnpaidRegister);

        // If a deposit was generated and paid (new-order flow), merge deposit
        // metadata into the payload so the order is created with the deposit
        // already recorded. The forcedPayload path (MP Pix/Boleto approval) bypasses
        // buildConfirmPayload, so we must inject deposit info here.
        if (depositMpPaymentId && depositMeta && !payload.checkoutFulfillment) {
            const depositLeg = {
                method: "Pix (Mercado Pago)",
                amount: depositChargeAmount,
                amountReceived: depositPaid ? depositChargeAmount : 0,
                adjustmentType: 'none',
                adjustmentPercent: 0,
                adjustmentAmount: 0,
                effectiveAmount: depositChargeAmount,
                netAmount: depositChargeAmount,
                feeBearer: 'merchant' as const,
                paymentMethodDiscountAmount: 0,
                interestAmount: 0,
                feeAmount: 0,
                fixedFeeAmount: 0,
                paymentMethodId: null,
                installmentNumber: 1,
                provider: "Mercado Pago",
                paymentStatus: depositPaid ? "approved" : "pending",
                mpPaymentMethodId: "pix",
            };

            const existingBreakdown = Array.isArray(payload.paymentBreakdown) ? payload.paymentBreakdown : [];
            const filteredBreakdown = existingBreakdown.filter((e: any) => {
                const p = String(e?.provider || "").toLowerCase();
                const m = String(e?.method || "").toLowerCase();
                return !p.includes("mercado pago") && !m.includes("mercado pago");
            });

            payload = {
                ...payload,
                paymentBreakdown: [depositLeg, ...filteredBreakdown],
                ...(depositPaid ? {
                    paidAmount: (Number(payload.paidAmount || 0) + depositChargeAmount),
                    mpPaymentId: payload.mpPaymentId || depositMpPaymentId,
                    paymentProvider: payload.paymentProvider || "Mercado Pago",
                    checkoutFulfillment: {
                        ...(depositMeta as Record<string, unknown>),
                        depositCheckout: {
                            ...depositMeta,
                            depositStatus: "paid",
                        },
                    } as Record<string, unknown>,
                    paymentStatus: (() => {
                        const totalPaid = Number(payload.paidAmount || 0) + depositChargeAmount;
                        if (totalPaid >= fullOrderTotal - 0.005) return 'paid';
                        if (totalPaid > 0.005) return 'partially_paid';
                        return 'unpaid';
                    })(),
                } : {
                    mpPaymentId: payload.mpPaymentId || depositMpPaymentId,
                    paymentProvider: payload.paymentProvider || "Mercado Pago",
                    checkoutFulfillment: {
                        ...(depositMeta as Record<string, unknown>),
                        depositCheckout: {
                            ...depositMeta,
                            depositStatus: "pending",
                        },
                    } as Record<string, unknown>,
                }),
            };
        }

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
        const payloadPaidAmount = Number(payload?.paidAmount ?? 0);
        const snapshotTotalPaid = isPendingPayment
            ? existingPaidAmount
            : (view === 'money' && wantsChange
                ? Math.max(payWithAmount, totalPaidCalculated)
                : (payloadPaidAmount > 0.009 ? payloadPaidAmount : totalPaidCalculated));
        const snapshotIsUnderpaid = isPendingPayment
            ? (fullOrderTotal > existingPaidAmount + 0.005)
            : (Math.min(snapshotTotalPaid, fullOrderTotal) < fullOrderTotal - 0.005);
        const snapshotRemainingPartial = Math.max(0, fullOrderTotal - Math.min(snapshotTotalPaid, fullOrderTotal));
        const snapshotChange = isPendingPayment ? 0 : (view === 'money' && wantsChange ? Math.max(0, payWithAmount - paymentBaseAmount) : changeAmount);

        setSuccessSnapshot({
            subTotal,
            itemCount,
            shippingFee: Number(shippingFee || 0),
            otherCosts: Number(otherCosts || 0),
            discountAmount: Number(discountAmount || 0),
            total,
            displayOrderTotal: fullOrderTotal,
            totalPaid: snapshotTotalPaid,
            change: snapshotChange,
            isUnderpaid: snapshotIsUnderpaid,
            remainingPartial: snapshotRemainingPartial,
            paymentMethodDiscountAmount: Number(currentPricingTotals.paymentMethodDiscountAmount || 0),
            interestAmount: Number(currentPricingTotals.interestAmount || 0),
            installmentCostAmount: Number(currentPricingTotals.installmentCostAmount || 0),
            feeAmount: Number(currentPricingTotals.feeAmount || 0),
            fixedFeeAmount: Number(currentPricingTotals.fixedFeeAmount || 0),
            feeBearer: currentPricingTotals.feeBearer,
            installmentFeeBearer: currentPricingTotals.installmentFeeBearer || "merchant",
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
        } catch (error: any) {
            setSuccessSnapshot(null);
            const userMsg = error?.message || (typeof error === 'string' ? error : null);
            setErrorMessage(userMsg || "Ocorreu um problema ao concluir o pagamento. Você pode tentar novamente.");
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ zIndex }}>
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
                                {view !== 'methods' && !isMarketplaceOrder && !isMpOrder && (
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
                                                        <ListItem
                                                            icon={<img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain shrink-0" />}
                                                            title={`Sinal - ${formatCurrency(depositChargeAmount)}`}
                                                            description="Mercado Pago"
                                                            onClick={() => {
                                                                if (depositMpPixData) {
                                                                    setShowDepositPixModal(true);
                                                                } else {
                                                                    handleGenerateDepositCharge();
                                                                }
                                                            }}
                                                            className="px-4 py-3"
                                                            right={
                                                                <Button
                                                                    variant="link"
                                                                    size="sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (depositMpPixData) {
                                                                            setShowDepositPixModal(true);
                                                                        } else {
                                                                            handleGenerateDepositCharge();
                                                                        }
                                                                    }}
                                                                    disabled={generatingDepositPix}
                                                                >
                                                                    {generatingDepositPix ? <Spinner size={12} className="mr-1.5" /> : null}
                                                                    Pagar agora
                                                                </Button>
                                                            }
                                                        />
                                                    )}
                                                    {customerCredit > 0.009 && (
                                                        <div className="p-4 rounded-2xl border border-brand-green transition-all">
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
                                                                            className="h-9"
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {useStoreCredit && (
                                                                <div className="mt-3 pt-2.5 border-t border-brand-green flex justify-between items-center text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                                    <span>Abatido no crédito: <strong className="text-brand-green">{formatCurrency(effectiveCreditApplied)}</strong></span>
                                                                    <span>Restante a pagar: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(netChargeTarget)}</strong></span>
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
                                                    {isAlreadyFullyPaid && (
                                                        <div className="w-full mb-4">
                                                            <InfoCard color="orange" title="Pedido já quitado" message="Este pedido já foi totalmente pago e não possui saldo pendente para cobrança." />
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {availableMethodTypes.has("cash") && (
                                                            <PaymentMethodCard
                                                                icon={MoneyIcon}
                                                                label="Dinheiro"
                                                                disabled={isMarketplaceOrder || isMpOrder || isAlreadyFullyPaid}
                                                                onClick={() => openMethodTypeSelection("cash")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("pix") && (
                                                            <PaymentMethodCard
                                                                icon={QRCodeIcon}
                                                                label="Pix"
                                                                disabled={isMarketplaceOrder || isMpOrder || isAlreadyFullyPaid}
                                                                onClick={() => openMethodTypeSelection("pix")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("credit_card") && (
                                                            <PaymentMethodCard
                                                                icon={CreditCardIcon}
                                                                label="Cartão de Crédito"
                                                                disabled={isMarketplaceOrder || isMpOrder || isAlreadyFullyPaid}
                                                                onClick={() => openMethodTypeSelection("credit_card")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("debit_card") && (
                                                            <PaymentMethodCard
                                                                icon={CreditCardIcon}
                                                                label="Cartão de Débito"
                                                                disabled={isMarketplaceOrder || isMpOrder || isAlreadyFullyPaid}
                                                                onClick={() => openMethodTypeSelection("debit_card")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("bank_transfer") && (
                                                            <PaymentMethodCard
                                                                icon={FileIcon}
                                                                label="Transferência"
                                                                disabled={isMarketplaceOrder || isMpOrder || isAlreadyFullyPaid}
                                                                onClick={() => openMethodTypeSelection("bank_transfer")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("other") && (
                                                            <PaymentMethodCard
                                                                icon={TagIcon}
                                                                label="Outros"
                                                                disabled={isMarketplaceOrder || isMpOrder || isAlreadyFullyPaid}
                                                                onClick={() => openMethodTypeSelection("other")}
                                                            />
                                                        )}
                                                        <PaymentMethodCard
                                                            icon={SplitIcon}
                                                            label="Dividir"
                                                            disabled={isMarketplaceOrder || isMpOrder || isAlreadyFullyPaid}
                                                            onClick={() => { resetSelectedMethodPricing({ clearType: true }); setView('split'); }}
                                                        />
                                                        {mpConnected && !isMarketplaceOrder && !isMpOrder && !isAlreadyFullyPaid && (
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
                                                                setPayWithAmount(0);
                                                            }
                                                        }} />
                                                </div>
                                                {wantsChange && (
                                                    <div className="mt-3 space-y-3 animate-fade-in">
                                                        <MoneyInput
                                                            label="Pagará com quanto?"
                                                            value={payWithAmount}
                                                            onChange={(val: any) => setPayWithAmount(Number(val || 0))}
                                                        />
                                                        {payWithAmount > paymentBaseAmount ? (
                                                            <InfoCard color="blue" title="Troco" message={formatCurrency(payWithAmount - paymentBaseAmount)} />
                                                        ) : (
                                                            <p className="text-xs font-semibold text-brand-orange">
                                                                O valor pago deve ser maior que {formatCurrency(paymentBaseAmount)} para haver troco.
                                                            </p>
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
                                                {(isMarketplaceOrder || isMpOrder) && (
                                                    <InfoCard color="blue" title="Método escolhido pelo cliente" message="Pagamento via marketplace - não é possível alterar o método de pagamento." />
                                                )}
                                                <CompactPaymentStatusAlert totalPaid={compactAlertPaid} totalNeed={compactAlertNeed} />
                                                {!isMpOrder && (
                                                    <>
                                                        <div className="min-w-0 flex-1">
                                                            <PaymentAmountLabel
                                                                label="Valor a receber"
                                                                calculation={paymentCalculation}
                                                                baseAllocated={calcBaseAmount}
                                                            />
                                                            <MoneyInput
                                                                value={paymentBaseAmount}
                                                                onChange={handlePaymentBaseAmountChange}
                                                            />
                                                        </div>

                                                        <></>
                                                        {isSinglePricingBusy && (
                                                            <div className="flex items-center gap-2 text-sm font-medium text-brand-inactive-text">
                                                                <Spinner />
                                                                Calculando valor a cobrar...
                                                            </div>
                                                        )}

                                                        {showKeyInputs ? (
                                                            <div className="space-y-4 text-left">
                                                                <h5 className="text-sm font-semibold text-brand-dark dark:text-dark-heading pt-4 border-t border-brand-border dark:border-dark-border">
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
                                                                    onClick={async () => {
                                                                        if (tempPixKey) {
                                                                            if (isFreePlan) {
                                                                                await handleGeneratePixWithKey(tempPixKey, tempPixKeyType);
                                                                            } else {
                                                                                setShowConfirmSaveModal(true);
                                                                            }
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
                                                    </>
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
                                                    />
                                                </div>
                                                {!isFreePlan && selectedMethodObj && normalizeMethodType(selectedMethodObj.type) !== 'debit_card' && (
                                                    isMarketplaceOrder ? (
                                                        <div>
                                                            <div className="text-brand-inactive-text dark:text-dark-body font-medium mb-1">Parcelas</div>
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
                                                                    if (maxInst > 1) {
                                                                        return Array.from({ length: maxInst }, (_, idx) => {
                                                                            const count = idx + 1;
                                                                            const single = count > 0 ? paymentBaseAmount / count : paymentBaseAmount;
                                                                            return {
                                                                                value: String(count),
                                                                                label: `${count}x de ${formatCurrency(single)} (Total: ${formatCurrency(paymentBaseAmount)})`
                                                                            };
                                                                        });
                                                                    }
                                                                    return [{
                                                                        value: "1",
                                                                        label: `1x de ${formatCurrency(paymentBaseAmount)} (Total: ${formatCurrency(paymentBaseAmount)})`
                                                                    }];
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
                                                                disabled={isMarketplaceOrder || isMpOrder}
                                                                onClick={() => setSplitSelectedType("cash")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("pix") && (
                                                            <PaymentMethodCard
                                                                icon={QRCodeIcon}
                                                                label="Pix"
                                                                disabled={isMarketplaceOrder || isMpOrder}
                                                                onClick={() => setSplitSelectedType("pix")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("credit_card") && (
                                                            <PaymentMethodCard
                                                                icon={CreditCardIcon}
                                                                label="Cartão de Crédito"
                                                                disabled={isMarketplaceOrder || isMpOrder}
                                                                onClick={() => setSplitSelectedType("credit_card")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("debit_card") && (
                                                            <PaymentMethodCard
                                                                icon={CreditCardIcon}
                                                                label="Cartão de Débito"
                                                                disabled={isMarketplaceOrder || isMpOrder}
                                                                onClick={() => setSplitSelectedType("debit_card")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("bank_transfer") && (
                                                            <PaymentMethodCard
                                                                icon={FileIcon}
                                                                label="Transferência"
                                                                disabled={isMarketplaceOrder || isMpOrder}
                                                                onClick={() => setSplitSelectedType("bank_transfer")}
                                                            />
                                                        )}
                                                        {availableMethodTypes.has("store_credit") && (
                                                            <PaymentMethodCard
                                                                icon={TagIcon}
                                                                label="Crédito do cliente"
                                                                disabled={isMarketplaceOrder || isMpOrder}
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
                                                                disabled={isMarketplaceOrder || isMpOrder}
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
                                                            <IconPlaceholder
                                                                placeholderType="image"
                                                                imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                                                                imageAlt="Não foi possível concluir a venda"
                                                                title="Não foi possível concluir a venda"
                                                                subtitle={mpBrickError}
                                                                buttons={[{ text: "Tentar novamente", action: () => { setMpBrickError(null); mpBrickInitializedRef.current = false; setMpBrickReady(false); initializeMpBrick(); }, variant: "outline" }]}
                                                            />
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
                                                        <a href={mpBoletoData.ticketUrl} target="_blank" rel="noopener noreferrer" className="w-full max-w-sm mb-2">
                                                            <Button variant="outline" className="w-full h-12">
                                                                <PrinterIcon size={18} className="mr-2" />
                                                                Abrir Boleto
                                                            </Button>
                                                        </a>
                                                    )}

                                                    <Button variant="link" className="w-full max-w-sm h-12 mb-2" onClick={handleVerifyBoletoPayment} isLoading={isCheckingMpPixStatus}>
                                                        Verificar pagamento
                                                    </Button>

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
                                                        <img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-10 h-10 object-contain" />
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
                                                    <IconPlaceholder
                                                        placeholderType="image"
                                                        imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                                                        imageAlt="Não foi possível concluir a venda"
                                                        title="Não foi possível concluir a venda"
                                                        subtitle={mpBrickError || "Ocorreu um erro ao processar o pagamento."}
                                                        buttons={[{
                                                            text: "Tentar novamente",
                                                            action: () => { setMpStep("brick"); setMpBrickError(null); mpBrickInitializedRef.current = false; },
                                                        }]}
                                                    />
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
                                        buttons={[
                                            {
                                                text: "Voltar e ajustar venda",
                                                action: () => {
                                                    setPaymentStatus('input');
                                                },
                                                variant: "filled",
                                            }
                                        ]}
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
                                            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(successSnapshot ? successSnapshot.displayOrderTotal : fullOrderTotal)}</div>
                                        </div>
                                        <div>
                                            <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">Total recebido</span>
                                            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(successSnapshot ? successSnapshot.totalPaid : (view === 'money' && wantsChange ? payWithAmount : totalPaidCalculated))}</div>
                                        </div>
                                        {(successSnapshot ? successSnapshot.change : changeAmount) > 0 && (
                                            <div>
                                                <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">Troco</span>
                                                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{formatCurrency(successSnapshot ? successSnapshot.change : changeAmount)}</div>
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
                                    <div className="grid grid-cols-1 gap-4 mb-8">
                                        <ListItem
                                            icon={FileIcon}
                                            title="Imprimir recibo"
                                            description="Gerar e imprimir recibo da venda"
                                            className="px-4 py-3 gap-4"
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
                                            : (paymentBaseAmount <= 0.009
                                                ? "Registrar venda (sem pagamento)"
                                                : (isUnderpaid ? "Salvar Parcialmente" : "Registrar Venda"))
                                    }
                                    disabledText={isSinglePricingBusy ? "Calculando valores..." : "Verifique os valores"}
                                    buttonVariant={
                                        editingPaymentIndex !== null
                                            ? "filled"
                                            : (paymentBaseAmount <= 0.009 || isUnderpaid ? "outline" : "default")
                                    }
                                    disabled={isSinglePricingBusy}
                                    onCustomConfirm={
                                        editingPaymentIndex !== null
                                            ? () => handleSplitPaymentUpdate(Number(paymentBaseAmount || 0))
                                            : (paymentBaseAmount <= 0.009 ? () => handleStartProcessing(undefined, true) : undefined)
                                    }
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
                <BottomSheet
                    isOpen={isReceiptOpen}
                    onClose={() => setIsReceiptOpen(false)}
                    title="Resumo do Pedido"
                >
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
                </BottomSheet>
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
                        setDepositPixGeneratedAt(null);
                    }}
                    qrCode={`data:image/png;base64,${depositMpPixData.qrCodeBase64}`}
                    payload={depositMpPixData.qrCode}
                    amount={depositChargeAmount}
                    subtitle="Sinal / Entrada"
                    onVerifyPayment={handleVerifyDepositPayment}
                    isVerifying={isCheckingDepositStatus}
                    onSendWhatsApp={customer?.phone ? handleSendDepositWhatsApp : undefined}
                />
            )}

            {mpPixData && (
                <PixQrDisplayModal
                    isOpen={showMpPixModal}
                    onClose={() => {
                        setShowMpPixModal(false);
                        setMpPixData(null);
                        setMpStep("brick");
                        setMpPixGeneratedAt(null);
                    }}
                    qrCode={`data:image/png;base64,${mpPixData.qrCodeBase64}`}
                    payload={mpPixData.qrCode}
                    amount={chargeTarget}
                    onConfirmPayment={() => {
                        setShowMpPixModal(false);
                        handleMpConfirmPix();
                    }}
                    onVerifyPayment={handleVerifyMpPixPayment}
                    isVerifying={isCheckingMpPixStatus}
                    onSendWhatsApp={customer?.phone ? handleSendMpPixWhatsApp : undefined}
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
