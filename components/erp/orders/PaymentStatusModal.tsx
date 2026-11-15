import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Button,
  InfoCard,
  IconPlaceholder,
  ListItem,
  Barcode,
  Spinner,
  Input,
  Badge,
  AlertModal,
  Tooltip,
} from "@/components/reusable";
import {
  CheckCircleIcon,
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
  MoneyIcon,
  PrinterIcon,
  CopyIcon,
} from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import {
  updateOrdersStatusInBatchAction,
  getFreshOrderPaymentDataAction,
} from "@/app/actions/erp/orders";
import { getDepositBalanceManualPolicyAction } from "@/app/actions/erp/deposit-balance-policy";
import {
  findReceivableLegIndex,
  normalizeOrderPaymentBreakdown,
} from "@/lib/payments/payment-ledger";
import {
  FINANCIAL_FREEZE_INFO_MESSAGE,
  getOrderDepositSummary,
  getOrderPaidAmount,
  getOrderRemainingBalance,
  getOrderTotalAmount,
  isOrderFinanciallyFrozen,
  resolveSituationFromPaid,
  DEPOSIT_STATUS_LABELS,
  shouldShowSinal,
  canPaySinal,
} from "@/lib/payments/order-financial-state";
import { DepositReceiptsSection } from "@/components/erp/payments/shared/DepositReceiptsSection";
import { BalancePaymentCollector } from "@/components/erp/payments/BalancePaymentCollector";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { formatPaymentMethodToFullLabel } from "@/components/erp/payments/shared/payment-utils";
import { useModalLayer } from "@/lib/modal-stack";
import type { PaymentBreakdownLeg } from "@/components/erp/payments/shared/payment-utils";
import { UserProfileImage } from "@/lib/utils/UserProfileImage";
import { ReceiptScallopEdge } from "../POSComponents";
import SaleReceiptPrintModal from "@/components/erp/orders/receipt/SaleReceiptPrintModal";
import { fetchJSONWithCSRF } from "@/lib/utils/fetch-with-csrf";

const standardTransition = {
  type: "spring" as const,
  stiffness: 380,
  damping: 30,
};

interface PaymentStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  partnerId: string;
  onSuccess?: () => void;
}

const SuccessActionCard = React.memo(
  ({
    icon: Icon,
    label,
    onClick,
  }: {
    icon: any;
    label: string;
    onClick?: () => void;
  }) => (
    <div
      className="flex items-center gap-3 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/20 cursor-pointer transition-colors group"
      onClick={onClick}
    >
      <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center shrink-0 group-hover:bg-white dark:group-hover:bg-dark-surface">
        <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
      </div>
      <div className="flex-1">
        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading block">
          {label}
        </span>
      </div>
      <ChevronRightIcon size={16} className="text-brand-inactive-text" />
    </div>
  ),
);

function normalizeBreakdown(order: any): PaymentBreakdownLeg[] {
  if (
    Array.isArray(order.payment_breakdown) &&
    order.payment_breakdown.length > 0
  ) {
    const normalized = normalizeOrderPaymentBreakdown(
      order.payment_breakdown,
      Number(order.paid_amount ?? order.paidAmount ?? 0),
    );
    if (normalized.length > 0) {
      return normalized as PaymentBreakdownLeg[];
    }
  }
  return [
    {
      method: order.payment_method || "Dinheiro",
      amount: Number(order.total_amount || 0),
      effectiveAmount: Number(order.total_amount || 0),
      amountReceived: Number(order.paid_amount || order.paidAmount || 0),
      paymentMethodId: order.payment_method_id || null,
      installmentNumber: 1,
    },
  ];
}

const TransactionReceiptContent = ({
  cart,
  totalOrder,
  totalPaid,
  totalRemaining,
  depositSummary,
  orderNumber,
}: any) => (
  <div className="bg-brand-gray dark:bg-dark-border/50 rounded-t-2xl p-6 pb-12 flex flex-col relative h-full border border-brand-border dark:border-dark-border border-b-0">
    <div className="mb-6 flex justify-between items-center">
      <h3 className="text-md font-bold text-brand-dark dark:text-dark-heading">
        Detalhes da Transação
      </h3>
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
        {shouldShowSinal(depositSummary) &&
          depositSummary.initialChargeAmount > 0 &&
          depositSummary.payDepositOnly && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                Sinal{orderNumber ? ` - ${orderNumber}` : ""} (
                {depositSummary.depositPercent}%)
              </span>
              <span className="font-bold text-brand-dark dark:text-dark-heading">
                {formatCurrency(depositSummary.initialChargeAmount)}
                <span className="text-xs font-normal text-brand-inactive-text ml-1">
                  (
                  {depositSummary.sinalPaid ? "pago" : "pendente"}
                  )
                </span>
              </span>
            </div>
          )}
        <div className="flex justify-between items-center text-sm">
          <span className="text-brand-inactive-text dark:text-dark-body font-medium">
            Total
          </span>
          <span className="font-bold text-brand-dark dark:text-dark-heading">
            {formatCurrency(totalOrder)}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-brand-inactive-text dark:text-dark-body font-medium">
            Recebido
          </span>
          <span className="font-bold text-brand-green">
            {formatCurrency(totalPaid)}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">
          Restante
        </span>
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
  onSuccess,
}: PaymentStatusModalProps) {
  const { toast } = useToast();

  // z-index dinâmico: este modal abre acima de tudo que já estava aberto.
  const zIndex = useModalLayer(isOpen);

  const [isAnimating, setIsAnimating] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<
    "input" | "processing" | "success" | "error"
  >("input");
  const [errorMessage, setErrorMessage] = useState("");
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
    title: "Receber saldo",
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
    pixData?: {
      qrCode: string;
      qrCodeBase64: string;
      ticketUrl?: string;
    } | null;
    boletoData?: { barcode: string; ticketUrl: string } | null;
    paymentId?: string | number;
    paymentMethod?: string;
    paymentStatus?: string;
    chargeAmount?: number;
    orderDetails?: { items?: any[] };
  } | null>(null);
  const [copiedMp, setCopiedMp] = useState(false);
  const [manualPolicy, setManualPolicy] = useState<{
    loaded: boolean;
    enabled: boolean;
    canOverride: boolean;
    role: string | null;
  }>({ loaded: false, enabled: false, canOverride: false, role: null });
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [showMpPendingConfirm, setShowMpPendingConfirm] = useState(false);
  const [showConfirmSinalModal, setShowConfirmSinalModal] = useState(false);
  const [confirmingSinal, setConfirmingSinal] = useState(false);
  const [selectedReceiptLeg, setSelectedReceiptLeg] = useState<PaymentBreakdownLeg | null>(null);
  const loading = paymentStatus === "processing";

  useEffect(() => {
    if (isOpen) {
      setCurrentOrder(order);
      setPendingLegs([]);
      setSelectedReceiptLeg(null);
      setCanSubmitBalance(false);
      setPaymentStatus("input");
      setErrorMessage("");
      setSuccessSnapshot(null);
      setPrintOrderId(null);
      setMpLoading(false);
      setMpPaymentData(null);
      setCopiedMp(false);
      setManualPolicy({
        loaded: false,
        enabled: false,
        canOverride: false,
        role: null,
      });
      setShowOverrideConfirm(false);
      setOverrideEnabled(false);
      setShowMpPendingConfirm(false);
      setShowConfirmSinalModal(false);
      setConfirmingSinal(false);
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
  const depositSummary = targetOrder
    ? getOrderDepositSummary(targetOrder)
    : null;
  const totalOrder = targetOrder ? getOrderTotalAmount(targetOrder) : 0;
  const totalPaid = targetOrder ? getOrderPaidAmount(targetOrder) : 0;
  const totalRemaining = targetOrder
    ? getOrderRemainingBalance(targetOrder)
    : 0;
  const baseFrozen = targetOrder
    ? isOrderFinanciallyFrozen(targetOrder)
    : false;
  const frozen =
    baseFrozen && !(depositSummary?.usesDeposit && totalRemaining > 0.009);

  const targetOrderId = targetOrder?.id || targetOrder?.originalId;

  useEffect(() => {
    if (!isOpen || !targetOrderId) return;
    let cancelled = false;

    getFreshOrderPaymentDataAction(targetOrderId, partnerId)
      .then((res) => {
        if (!cancelled && res.success && res.order) {
          setCurrentOrder((prev: any) => ({
            ...(prev || {}),
            ...res.order,
            updated_at: res.order.updated_at,
            paid_amount: res.order.paid_amount,
            paidAmount: res.order.paid_amount,
            total_amount: res.order.total_amount,
            totalAmount: res.order.total_amount,
            situation: res.order.situation,
            payment_breakdown: res.order.payment_breakdown,
          }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetOrderId, partnerId]);

  const isMpOrder = Boolean(
    targetOrder?.payment_provider === "Mercado Pago" ||
    targetOrder?.mp_payment_id ||
    breakdown.some((leg) => {
      const m = String(leg?.method || "").toLowerCase();
      const p = String(leg?.provider || "").toLowerCase();
      return p.includes("mercado pago") || m.includes("mercado pago");
    }),
  );

  useEffect(() => {
    if (!isOpen || !depositSummary?.usesDeposit) return;
    let cancelled = false;

    getDepositBalanceManualPolicyAction(partnerId)
      .then((result) => {
        if (cancelled) return;
        setManualPolicy({
          loaded: true,
          enabled: Boolean(result.enabled),
          canOverride: Boolean(result.canOverride),
          role: result.role || null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setManualPolicy({
          loaded: true,
          enabled: false,
          canOverride: false,
          role: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, partnerId, depositSummary?.usesDeposit, targetOrder?.id]);

  useEffect(() => {
    if (!isOpen || !targetOrder) return;
    const targetOrderId = targetOrder.id || targetOrder.originalId;
    const fullyPaid =
      targetOrder.situation === "paid" || totalRemaining <= 0.009;

    // Busca a cobrança do MP apenas quando ainda há algo a pagar online:
    // sinal pendente (QR já gerado) ou pedido sem sinal.
    const shouldFetchMpPayment = Boolean(
      !fullyPaid &&
      targetOrderId &&
      (canPaySinal(depositSummary) ||
        (isMpOrder && !depositSummary?.usesDeposit)),
    );

    if (shouldFetchMpPayment) {
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
          if (data?.updatedAt) {
            setCurrentOrder((prev: any) =>
              prev ? { ...prev, updated_at: data.updatedAt } : prev,
            );
          }
        })
        .catch((err) => {
          console.error(
            "Error fetching MP payment in PaymentStatusModal:",
            err,
          );
          setMpPaymentData(null);
        })
        .finally(() => {
          setMpLoading(false);
        });
    } else {
      setMpPaymentData(null);
    }
  }, [
    isOpen,
    targetOrder?.id,
    targetOrder?.originalId,
    targetOrder?.situation,
    totalRemaining,
    isMpOrder,
    depositSummary?.usesDeposit,
    depositSummary?.sinalPaid,
    depositSummary?.depositStatus,
  ]);

  const displayOrderNumber = useMemo(() => {
    if (!targetOrder) return "";
    return (
      targetOrder.order_number ??
      targetOrder.orderNumber ??
      targetOrder.number ??
      `#${String(targetOrder.id || targetOrder.originalId || "").substring(0, 8)}`
    );
  }, [targetOrder]);

  const cashEntry = Array.isArray(breakdown)
    ? breakdown.find((entry: any) => {
      const m = String(entry?.method || "")
        .toLowerCase()
        .trim();
      return m === "cash" || m === "dinheiro";
    })
    : null;
  const wantsChange =
    (cashEntry as any)?.wantsChange ??
    String(targetOrder?.payment_method || "")
      .toLowerCase()
      .includes("troco para");
  const payWithAmount =
    (cashEntry as any)?.payWithAmount ??
    (() => {
      const match = String(targetOrder?.payment_method || "").match(
        /troco para R\$\s*([\d,.]+)/i,
      );
      if (match) {
        const cleanNum = match[1].replace(/\./g, "").replace(",", ".");
        return Number(cleanNum);
      }
      return null;
    })();
  const cashChangeAmount =
    wantsChange && payWithAmount
      ? payWithAmount - Number(targetOrder?.total_amount || 0)
      : 0;

  const lockedMethod = null;
  const lockedInstallments = null;

  const pendingNewAmount = useMemo(
    () =>
      pendingLegs.reduce(
        (sum, leg) => sum + Number(leg.amountReceived ?? leg.amount ?? 0),
        0,
      ),
    [pendingLegs],
  );

  const receiptCart = useMemo(() => {
    const items =
      targetOrder?.order_items ||
      targetOrder?.items ||
      mpPaymentData?.orderDetails?.items ||
      [];
    return items.map((item: any) => ({
      name: item.products?.name || item.product_name || item.name || "Item",
      quantity: Number(item.quantity || 1),
      unitPrice: Number(
        item.product_price ||
        item.unit_price ||
        item.unitPrice ||
        item.price ||
        0,
      ),
    }));
  }, [targetOrder, mpPaymentData]);

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
        body: JSON.stringify({ orderId: targetOrderId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.updatedAt) {
          setCurrentOrder((prev: any) =>
            prev ? { ...prev, updated_at: data.updatedAt } : prev,
          );
        }
        if (
          data.newStatus === "paid" ||
          data.newStatus === "partially_paid" ||
          data.paymentStatus === "approved"
        ) {
          toast({
            title: "Pagamento confirmado",
            description: "Status atualizado com sucesso.",
          });
          onSuccess?.();
          handleSafeClose();
        } else {
          toast({
            title: "Aguardando",
            description: "O pagamento ainda consta como pendente.",
          });
        }
      } else {
        toast({
          title: "Erro ao sincronizar",
          description: "Não foi possível verificar o pagamento.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao sincronizar.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleConfirmSinalReceipt = async () => {
    const targetOrderId = targetOrder.id || targetOrder.originalId;
    if (!targetOrderId || confirmingSinal) return;

    setConfirmingSinal(true);
    try {
      const data = await fetchJSONWithCSRF<any>("/api/orders/confirm-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          orderId: targetOrderId,
          ...(mpPaymentData?.paymentId
            ? { mpPaymentId: mpPaymentData.paymentId }
            : {}),
        },
      });

      if (data?.success) {
        setCurrentOrder((prev: any) => ({
          ...prev,
          situation: data.situation,
          paid_amount: data.paidAmount,
          paidAmount: data.paidAmount,
          payment_method: data.paymentMethod,
          payment_breakdown: data.paymentBreakdown,
          ...(data.checkoutFulfillment
            ? { checkout_fulfillment: data.checkoutFulfillment }
            : {}),
        }));
        setMpPaymentData(null);
        setShowConfirmSinalModal(false);
        toast({
          title: "Sinal confirmado",
          description: "O recebimento do sinal foi registrado manualmente.",
        });
        onSuccess?.();
      }
    } catch (err: any) {
      console.error("Error confirming deposit in PaymentStatusModal:", err);
      toast({
        title: "Erro ao confirmar",
        description:
          err?.message || "Não foi possível confirmar o recebimento do sinal.",
        variant: "destructive",
      });
    } finally {
      setConfirmingSinal(false);
    }
  };

  const isFullyPaid =
    targetOrder?.situation === "paid" || totalRemaining <= 0.009;
  const mustPaySinalOnline = Boolean(
    depositSummary?.usesDeposit && !depositSummary.sinalPaid,
  );
  const manualBalanceAllowed =
    !depositSummary?.usesDeposit ||
    (depositSummary.sinalPaid &&
      (manualPolicy.enabled || overrideEnabled));
  const isManualBalanceOverride = Boolean(
    depositSummary?.usesDeposit &&
    depositSummary.sinalPaid &&
    !manualPolicy.enabled &&
    overrideEnabled,
  );

  // MP Pix/Boleto QR code está sendo exibido inline (sem sinal/deposit) —
  // nesse caso não deve mostrar o BalancePaymentCollector nem permitir
  // recebimento manual, pois o QR Code já contém o valor definido.
  const isMpPaymentPendingInline = Boolean(
    isMpOrder &&
    !isFullyPaid &&
    !depositSummary?.usesDeposit &&
    (mpPaymentData?.pixData || mpPaymentData?.boletoData),
  );

  // Handler for the "Salvar recebimento" button.
  // When the order is via Mercado Pago (Pix/Boleto) and the payment hasn't been
  // confirmed by webhook yet (QR code displayed inline), show a confirmation
  // modal before saving manually.
  const handleSaveReceipt = async () => {
    if (isMpPaymentPendingInline) {
      setShowMpPendingConfirm(true);
      return;
    }
    await handleSubmit();
  };

  const handleSubmit = async () => {
    const targetOrderId = targetOrder.id || targetOrder.originalId;
    if (isFullyPaid) {
      toast({
        title: "Aviso",
        description: "Este pedido já está pago.",
        variant: "warning",
      });
      return;
    }
    if (mustPaySinalOnline) {
      toast({
        title: "Sinal online obrigatório",
        description: "O sinal deve ser pago online pelo checkout.",
        variant: "warning",
      });
      return;
    }
    if (!manualBalanceAllowed) {
      toast({
        title: "Recebimento presencial desativado",
        description:
          "Ative a configuração de saldo presencial ou use o override autorizado.",
        variant: "warning",
      });
      return;
    }
    if (pendingNewAmount <= 0.009) {
      toast({
        title: "Aviso",
        description: "Informe o valor recebido.",
        variant: "warning",
      });
      return;
    }

    setPaymentStatus("processing");
    try {
      const updatedBreakdown = breakdown.map((leg) => ({ ...leg }));
      for (const pendingLeg of pendingLegs) {
        let legRemaining = Number(
          pendingLeg.amountReceived ?? pendingLeg.amount ?? 0,
        );

        while (legRemaining > 0.009) {
          const legIndex = findReceivableLegIndex(
            updatedBreakdown as any,
            pendingLeg as any,
          );
          if (legIndex < 0) break;

          const leg = updatedBreakdown[legIndex];
          const legCapacity = Math.max(
            0,
            Number(leg.amount || 0) - Number(leg.amountReceived || 0),
          );
          if (legCapacity <= 0.009) break;

          const toAdd = Math.min(legCapacity, legRemaining);
          leg.amountReceived = Number(
            (Number(leg.amountReceived || 0) + toAdd).toFixed(2),
          );
          legRemaining = Number((legRemaining - toAdd).toFixed(2));
        }

        if (legRemaining > 0.009) {
          for (const leg of updatedBreakdown) {
            const normalizedMethod = String(leg.method || "").toLowerCase();
            if (
              normalizedMethod === "método não definido" ||
              normalizedMethod === "metodo nao definido" ||
              !leg.method
            ) {
              leg.method = pendingLeg.method;
              leg.paymentMethodId = pendingLeg.paymentMethodId;
              leg.installmentNumber = pendingLeg.installmentNumber;
              const legCapacity = Math.max(
                0,
                Number(leg.amount || 0) - Number(leg.amountReceived || 0),
              );
              const toAdd = Math.min(legCapacity, legRemaining);
              leg.amountReceived = Number(
                (Number(leg.amountReceived || 0) + toAdd).toFixed(2),
              );
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
            adjustmentType: "none",
            adjustmentPercent: 0,
            adjustmentAmount: 0,
          } as any);
        }
      }

      const hasRealLeg = updatedBreakdown.some((leg: any) => {
        const norm = String(leg.method || "").toLowerCase();
        return (
          !norm.includes("não definido") &&
          !norm.includes("metodo nao definido") &&
          !norm.includes("pendente")
        );
      });

      const finalBreakdown = hasRealLeg
        ? updatedBreakdown.filter((leg: any) => {
          const norm = String(leg.method || "").toLowerCase();
          return (
            !norm.includes("não definido") &&
            !norm.includes("metodo nao definido") &&
            !norm.includes("pendente")
          );
        })
        : updatedBreakdown;

      const isFullPaymentOfBalance =
        pendingNewAmount >= totalRemaining - 0.005 ||
        pendingNewAmount >= totalOrder - 0.005;
      const nextPaidAmount = isFullPaymentOfBalance
        ? totalOrder
        : totalPaid + pendingNewAmount;
      const nextSituation = resolveSituationFromPaid(
        nextPaidAmount,
        totalOrder,
      );

      const res = await updateOrdersStatusInBatchAction({
        orderIds: [targetOrderId],
        partnerId,
        actionType: "payment_status",
        statusValue: nextSituation,
        paidAmount: nextPaidAmount,
        paymentBreakdown: finalBreakdown,
        manualBalanceOverride: isManualBalanceOverride || undefined,
        expectedUpdatedAt: targetOrder.updated_at,
        expectedPaidAmount: totalPaid,
        expectedTotalAmount: totalOrder,
      });

      if (res.success) {
        const updated = {
          ...targetOrder,
          order_number:
            targetOrder.order_number ??
            targetOrder.orderNumber ??
            targetOrder.number,
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
        setPaymentStatus("success");
        onSuccess?.();
      } else {
        setErrorMessage(res.error || "Falha ao registrar recebimento.");
        setPaymentStatus("error");
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Ocorreu um erro ao salvar o pagamento.");
      setPaymentStatus("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ zIndex }}
    >
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
            <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
              Resumo
            </h2>
          </div>

          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <UserProfileImage
                fullName={targetOrder.customer_name || "Consumidor Final"}
                className="w-12 h-12 text-white font-medium text-lg shrink-0"
              />
              <div className="flex flex-col overflow-hidden">
                <span className="font-bold text-lg text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[180px]">
                  {targetOrder.customer_name || "Consumidor Final"}
                </span>
                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">
                  Venda de Itens
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end text-right justify-center">
              <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">
                {formatDate(new Date(targetOrder.created_at || Date.now()))}
              </span>
              <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">
                {formatTime(new Date(targetOrder.created_at || Date.now()))}
              </span>
            </div>
          </div>

          <div className="relative w-full flex-1 min-h-0 flex flex-col rounded-2xl">
            <TransactionReceiptContent
              cart={receiptCart}
              totalOrder={totalOrder}
              totalPaid={totalPaid}
              totalRemaining={totalRemaining}
              depositSummary={depositSummary}
              orderNumber={targetOrder?.order_number}
              itemCount={receiptCart.length}
              customerName={targetOrder.customer_name}
            />
          </div>
        </div>

        {/* --- RIGHT COLUMN: ACTIONS & COLLECTOR --- */}
        <div className="w-full md:w-[60%] bg-white dark:bg-dark-surface flex flex-col relative h-full">
          {/* Header */}
          {paymentStatus === "input" && (
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
              <button
                onClick={handleSafeClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading hover:bg-gray-200 transition-colors"
              >
                <XIcon size={20} />
              </button>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-32 md:pb-10 relative custom-scrollbar flex flex-col">
            <AnimatePresence mode="wait">
              {/* === STATE: INPUT === */}
              {paymentStatus === "input" && (
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
                      <InfoCard
                        color="orange"
                        message={FINANCIAL_FREEZE_INFO_MESSAGE}
                      />
                    )}
                    {wantsChange && payWithAmount !== null && (
                      <InfoCard
                        color="blue"
                        message={`Necessǭrio ter ${formatCurrency(cashChangeAmount)} de troco para uma transa��ǜo de ${formatCurrency(payWithAmount)}.`}
                      />
                    )}
                    {mustPaySinalOnline && (
                      <InfoCard
                        color="blue"
                        title="Sinal online obrigatório"
                        message="O sinal deve ser pago online pelo checkout via Mercado Pago. O saldo restante só pode ser recebido depois da confirmação do sinal."
                      />
                    )}
                    {depositSummary?.usesDeposit &&
                      depositSummary.sinalPaid &&
                      !isFullyPaid &&
                      manualPolicy.loaded &&
                      !manualPolicy.enabled && (
                        <InfoCard
                          color={overrideEnabled ? "blue" : "orange"}
                          title={
                            overrideEnabled
                              ? "Override autorizado"
                              : "Pagamento presencial do saldo desativado"
                          }
                          message={
                            overrideEnabled
                              ? "O recebimento presencial do saldo será registrado com override e ficará registrado no histórico do pedido."
                              : "Ative “Permitir pagamento presencial do saldo” nas configurações de pagamento ou use um override autorizado para registrar o recebimento no local."
                          }
                          bottomElement={
                            manualPolicy.canOverride && !overrideEnabled ? (
                              <Button
                                variant="link"
                                onClick={() => setShowOverrideConfirm(true)}
                              >
                                Autorizar
                              </Button>
                            ) : undefined
                          }
                        />
                      )}
                  </div>

                  {!isFullyPaid && canPaySinal(depositSummary) && (
                    <div className="flex flex-col gap-4 rounded-2xl border border-brand-border dark:border-dark-border p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex border border-brand-border dark:border-dark-border items-center justify-center shrink-0">
                          <img
                            src="https://img.dudit.com.br/static/icons/payments/Pix.png"
                            alt="Pix"
                            className="w-5 h-5 object-contain"
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5 flex-wrap">
                            Pix do sinal
                            <Badge
                              variant="orange"
                              className="whitespace-nowrap scale-90"
                            >
                              Pendente
                            </Badge>
                          </h4>
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                            Escaneie o QR Code ou copie o código Pix
                          </p>
                        </div>
                      </div>

                      {mpLoading && !mpPaymentData?.pixData ? (
                        <div className="flex flex-col items-center justify-center py-6 text-brand-inactive-text">
                          <Spinner
                            size={20}
                            className="mb-2 text-brand-primary"
                          />
                          <span className="text-xs">
                            Carregando cobrança do sinal...
                          </span>
                        </div>
                      ) : mpPaymentData?.pixData ? (
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
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body block">
                              Valor do sinal
                            </span>
                            <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                              {formatCurrency(
                                depositSummary?.initialChargeAmount ||
                                depositSummary?.depositAmount ||
                                mpPaymentData.chargeAmount ||
                                0,
                              )}
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
                                    navigator.clipboard.writeText(
                                      mpPaymentData.pixData.qrCode,
                                    );
                                    setCopiedMp(true);
                                    toast({
                                      title: "Copiado!",
                                      description:
                                        "Código Pix copiado para a área de transferência.",
                                    });
                                    setTimeout(
                                      () => setCopiedMp(false),
                                      2000,
                                    );
                                  }
                                }}
                                className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                title="Copiar chave Pix"
                              >
                                {copiedMp ? (
                                  <CheckCircleIcon
                                    size={16}
                                    className="text-brand-green"
                                  />
                                ) : (
                                  <CopyIcon size={16} />
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : !mpLoading ? (
                        <InfoCard
                          color="orange"
                          title="Cobrança não encontrada"
                          message="Não encontramos o Pix do sinal no Mercado Pago. Você ainda pode confirmar o recebimento manualmente se o cliente já pagou."
                        />
                      ) : null}

                      <InfoCard
                        color="orange"
                        message="A confirmação é automática. Se o pagamento não for identificado, use “Confirmar recebimento”."
                        className="w-full mb-4"
                      />

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 h-11"
                          onClick={handleSyncMpPayment}
                          disabled={syncing || confirmingSinal}
                        >
                          {syncing ? (
                            <Spinner size={12} className="mr-1.5" />
                          ) : null}
                          Verificar
                        </Button>
                        <Button
                          className="flex-1 h-11"
                          onClick={() => setShowConfirmSinalModal(true)}
                          isLoading={confirmingSinal}
                          disabled={syncing}
                        >
                          Confirmar recebimento
                        </Button>
                      </div>
                    </div>
                  )}

                  {isMpOrder &&
                    !isFullyPaid &&
                    !depositSummary?.usesDeposit && (
                      <div className="flex flex-col gap-4">
                        {/* Header do card MP */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex border border-brand-border dark:border-dark-border items-center justify-center shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-dark-border/90 transition-colors">
                              <img
                                src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                                alt="Mercado Pago"
                                className="w-5 h-5 object-contain"
                              />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5 flex-wrap">
                                {mpPaymentData?.boletoData
                                  ? "Boleto Mercado Pago"
                                  : "Pix Mercado Pago"}
                                <Tooltip text="Pendente">
                                  <Badge
                                    variant="orange"
                                    className="whitespace-nowrap scale-90 shrink-0"
                                  >
                                  </Badge>
                                </Tooltip>
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
                            {syncing ? (
                              <Spinner size={12} className="mr-1.5" />
                            ) : null}
                            Verificar
                          </Button>
                        </div>

                        {/* Loading */}
                        {mpLoading && !mpPaymentData && (
                          <div className="flex flex-col items-center justify-center py-6 text-brand-inactive-text">
                            <Spinner
                              size={20}
                              className="mb-2 text-brand-primary"
                            />
                            <span className="text-xs">
                              Carregando dados da cobrança...
                            </span>
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
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block">
                                Valor do Pix
                              </span>
                              <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(
                                  mpPaymentData.chargeAmount || totalRemaining,
                                )}
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
                                      navigator.clipboard.writeText(
                                        mpPaymentData.pixData.qrCode,
                                      );
                                      setCopiedMp(true);
                                      toast({
                                        title: "Copiado!",
                                        description:
                                          "Código Pix copiado para a área de transferência.",
                                      });
                                      setTimeout(
                                        () => setCopiedMp(false),
                                        2000,
                                      );
                                    }
                                  }}
                                  className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                  title="Copiar chave Pix"
                                >
                                  {copiedMp ? (
                                    <CheckCircleIcon
                                      size={16}
                                      className="text-brand-green"
                                    />
                                  ) : (
                                    <CopyIcon size={16} />
                                  )}
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
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block">
                                Valor do Boleto
                              </span>
                              <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(
                                  mpPaymentData.chargeAmount || totalRemaining,
                                )}
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
                                      navigator.clipboard.writeText(
                                        mpPaymentData.boletoData.barcode,
                                      );
                                      setCopiedMp(true);
                                      toast({
                                        title: "Copiado!",
                                        description:
                                          "Código de barras do boleto copiado.",
                                      });
                                      setTimeout(
                                        () => setCopiedMp(false),
                                        2000,
                                      );
                                    }
                                  }}
                                  className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                  title="Copiar linha digitável"
                                >
                                  {copiedMp ? (
                                    <CheckCircleIcon
                                      size={16}
                                      className="text-brand-green"
                                    />
                                  ) : (
                                    <CopyIcon size={16} />
                                  )}
                                </Button>
                                {mpPaymentData.boletoData.ticketUrl && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      window.open(
                                        mpPaymentData!.boletoData!.ticketUrl,
                                        "_blank",
                                      )
                                    }
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
                    orderNumber={targetOrder?.order_number}
                    onSyncMp={
                      targetOrder.mp_payment_id ||
                        targetOrder.payment_provider === "Mercado Pago"
                        ? handleSyncMpPayment
                        : undefined
                    }
                    syncing={syncing}
                    onSelectLeg={(leg) => setSelectedReceiptLeg({ ...leg })}
                    hasRemainingBalance={!isFullyPaid && totalRemaining > 0.009}
                  />

                  {!isFullyPaid &&
                    totalRemaining > 0.009 &&
                    manualBalanceAllowed &&
                    !isMpPaymentPendingInline ? (
                    <BalancePaymentCollector
                      partnerId={partnerId}
                      storeId={targetOrder?.store_id}
                      remainingBalance={totalRemaining}
                      disabled={loading || syncing}
                      onLegsReady={onLegsReady}
                      onValidityChange={setCanSubmitBalance}
                      lockedMethodLabel={lockedMethod}
                      lockedInstallments={lockedInstallments}
                      targetLeg={selectedReceiptLeg}
                      onClearTargetLeg={() => setSelectedReceiptLeg(null)}
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
              {paymentStatus === "processing" && (
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
                  <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                    Processando recebimento...
                  </h2>
                  <p className="text-brand-inactive-text dark:text-dark-body text-sm">
                    Por favor, aguarde enquanto registramos o pagamento.
                  </p>
                </motion.div>
              )}

              {/* === STATE: ERROR === */}
              {paymentStatus === "error" && (
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
              {paymentStatus === "success" && (
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
                      <p className="text-brand-inactive-text dark:text-dark-body font-medium text-md">
                        Recebimento concluído com sucesso
                      </p>
                    </div>
                  </div>

                  {successSnapshot?.isUnderpaid && (
                    <div className="mb-6">
                      <div className="w-full py-3 px-4 rounded-lg flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/30">
                        <div className="w-1.5 h-4 rounded-full bg-yellow-500"></div>
                        <span className="font-bold text-sm flex-1 text-yellow-700 dark:text-yellow-400">
                          Recebido parcialmente, restante a pagar:{" "}
                          {formatCurrency(successSnapshot.remainingPartial)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 mb-10 mt-4 border-l-4 border-brand-dark dark:border-dark-heading pl-6">
                    <div>
                      <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">
                        Total da venda
                      </span>
                      <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(
                          successSnapshot?.displayOrderTotal || totalOrder,
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-1">
                        Total recebido
                      </span>
                      <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(
                          successSnapshot?.totalPaid || totalPaid,
                        )}
                      </div>
                    </div>
                  </div>

                  {successSnapshot?.paymentBreakdown &&
                    successSnapshot.paymentBreakdown.length > 0 && (
                      <div className="mb-6 border-t border-brand-border dark:border-dark-border pt-4">
                        <span className="block text-md font-medium text-brand-inactive-text dark:text-dark-body mb-3">
                          {successSnapshot.paymentBreakdown.length > 1 ? "Formas de pagamento" : "Forma de pagamento"}
                        </span>
                        <div className="space-y-2">
                          {successSnapshot.paymentBreakdown.map(
                            (entry: any, i: number) => (
                              <div
                                key={i}
                                className="flex justify-between items-center py-1"
                              >
                                <span className="text-sm text-brand-dark dark:text-dark-heading">
                                  {formatPaymentMethodToFullLabel(entry.method) || entry.method}
                                </span>
                                <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                  {formatCurrency(entry.amount)}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                  <div className="grid grid-cols-1 gap-4 mb-8">
                    <ListItem
                      icon={FileIcon}
                      title="Imprimir recibo"
                      description="Gerar e imprimir recibo da venda"
                      className="px-4 py-3 gap-4"
                      onClick={() =>
                        setPrintOrderId(
                          targetOrder.id || targetOrder.originalId,
                        )
                      }
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Action Bar */}
          {paymentStatus === "input" &&
            !isFullyPaid &&
            totalRemaining > 0.009 &&
            !mustPaySinalOnline && (
              <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 h-[52px]"
                  onClick={handleSafeClose}
                  disabled={loading || syncing}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 h-[52px]"
                  onClick={handleSaveReceipt}
                  disabled={
                    loading ||
                    syncing ||
                    (!canSubmitBalance && !isMpPaymentPendingInline)
                  }
                  isLoading={loading}
                >
                  Salvar recebimento
                </Button>
              </div>
            )}

          {paymentStatus === "success" && (
            <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30 flex">
              <Button className="flex-1 h-[52px]" onClick={handleSafeClose}>
                Finalizar
              </Button>
            </div>
          )}

          {paymentStatus === "error" && (
            <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30 flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-[52px]"
                onClick={handleSafeClose}
              >
                Cancelar
              </Button>
              <Button className="flex-1 h-[52px]" onClick={handleSubmit}>
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

      <AlertModal
        isOpen={showOverrideConfirm}
        onClose={() => setShowOverrideConfirm(false)}
        onConfirm={() => {
          setOverrideEnabled(true);
          setShowOverrideConfirm(false);
        }}
        variant="warning"
        title="Autorizar recebimento presencial?"
        message="A configuração de pagamento presencial do saldo está desativada. Ao continuar, o recebimento será registrado com override e ficará no histórico do pedido com o seu usuário."
        confirmText="Autorizar e continuar"
        cancelText="Cancelar"
      />

      <AlertModal
        isOpen={showMpPendingConfirm}
        onClose={() => setShowMpPendingConfirm(false)}
        onConfirm={() => {
          setShowMpPendingConfirm(false);
          handleSubmit();
        }}
        variant="warning"
        title="Pagamento não detectado ainda?"
        message="O pagamento via Mercado Pago ainda não foi confirmado automaticamente. Se o cliente já realizou o pagamento, aguarde alguns segundos e clique em 'Verificar' ou sincronize manualmente. Deseja marcar o recebimento manualmente mesmo assim?"
        confirmText="Sim, marcar como recebido"
        cancelText="Cancelar"
      />

      <AlertModal
        isOpen={showConfirmSinalModal}
        onClose={() => {
          if (!confirmingSinal) setShowConfirmSinalModal(false);
        }}
        onConfirm={handleConfirmSinalReceipt}
        variant="warning"
        title="Pagamento não detectado"
        message="Ainda não identificamos o pagamento do sinal via Mercado Pago. Confirme apenas se o cliente já realizou o Pix. O sinal será marcado como recebido manualmente e não será cancelado por expiração."
        confirmText="Sim, confirmar recebimento"
        cancelText="Cancelar"
        isLoading={confirmingSinal}
      />
    </div>
  );
}
