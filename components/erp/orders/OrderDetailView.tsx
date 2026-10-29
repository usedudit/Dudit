"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeftIcon,
  ThreeDotsIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  XIcon,
  ClockIcon,
  ReturnIcon,
  CalendarIcon,
} from "@/lib/icons";
import { AppointmentSheet } from "@/components/erp/appointments/sheets/AppointmentSheet";
import {
  Button,
  Badge,
  ActionsDropdown,
  ThreeDotsLoader,
  InfoCard,
  CustomerCard,
  CustomerMobileBar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ListItem,
  FormSection,
  Pagination,
  Tooltip,
} from "@/components/reusable";
import { usePermissions } from "@/lib/permission-context";
import { useSidebar } from "@/lib/sidebar-context";
import {
  getOrderDetailsAction,
  getOrderHistoryAction,
} from "@/app/actions/erp/orders";
import { getOrderDeliverySummaryAction } from "@/app/actions/erp/deliveries";
import { OrderHistoryTab } from "./OrderHistoryTab";
import { OrderAttachmentsTab } from "./OrderAttachmentsTab";
import { CarrierLabelAction } from "./CarrierLabelAction";
import { OrderFiscalSection } from "./OrderFiscalSection";
import { useNotification } from "@/hooks/use-notification";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import {
  formatCurrency,
  formatDateTime,
  formatTime,
  formatDayMonth,
  formatQuantityWithUnit,
  formatUnitPriceWithUnit,
} from "@/lib/utils";
import { getPaymentStatusMeta } from "@/lib/orders/status";
import { FadeIn } from "@/components/animations/FadeIn";
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label";
import { PaymentMethodIndicator } from "@/components/erp/transactions/PaymentMethodIndicator";
import { hasMinimumPlan } from "@/lib/subscription/plan-tier";
import { useStore } from "@/lib/store-context";
import { parseAddressString } from "./CreateOrder";
import BottomSheet from "@/components/BottomSheet";
import DefaultModal from "@/components/reusable/DefaultModal";
import SaleReceiptPrintModal from "@/components/erp/orders/receipt/SaleReceiptPrintModal";
import { getOrderFinancialBreakdownAction } from "@/app/actions/erp/order-financial-breakdown";
import type { FinancialBreakdownData } from "@/app/actions/erp/order-financial-breakdown";
import {
  hasReceivedMpPayment,
  getOrderDepositSummary,
  DEPOSIT_STATUS_LABELS,
  shouldShowSinal,
  canPaySinal,
} from "@/lib/payments/order-financial-state";
import {
  cleanOrderNotes,
  normalizeOrderSource,
} from "@/lib/orders/order-utils";
import {
  DeliveryStatusTimeline,
  DeliveryDriverSection,
  DeliverySummarySection,
  getOutboundCarrierShipment,
  isCarrierDeliveryOrder,
  type DeliveryDriverInfo,
} from "@/components/erp/shared/DeliveryTabContent";

const MERCADO_PAGO_ICON =
  "https://img.dudit.com.br/static/icons/payments/MercadoPago.png";
const PIX_ICON_URL = "https://img.dudit.com.br/static/icons/payments/Pix.png";

const formatProductQuantity = (qty: number, unit?: string | null) => {
  return formatQuantityWithUnit(qty, unit);
};

const formatProductUnitPrice = (price: number, unit?: string | null) => {
  return formatUnitPriceWithUnit(price, unit);
};

const getServiceScheduleInfo = (item: any, order: any) => {
  const appointments = order?.appointments || [];
  const matchingAppt = appointments.find(
    (appt: any) =>
      (appt.order_item_id && appt.order_item_id === item.id) ||
      (appt.service_id &&
        item.service_id &&
        appt.service_id === item.service_id) ||
      appt.service_name?.toLowerCase() === item.product_name?.toLowerCase(),
  );
  if (matchingAppt && matchingAppt.start_date && matchingAppt.start_time) {
    return {
      appointment: matchingAppt,
      date: matchingAppt.start_date,
      time: matchingAppt.start_time,
    };
  }

  const lines = order?.checkout_fulfillment?.lines || [];
  const matchingLine = lines.find(
    (line: any) =>
      line.itemType === "service_booking" &&
      line.bookingMetadata?.serviceName?.toLowerCase() ===
      item.product_name?.toLowerCase(),
  );
  if (
    matchingLine?.bookingMetadata?.date &&
    matchingLine?.bookingMetadata?.time
  ) {
    return {
      appointment: null,
      date: matchingLine.bookingMetadata.date,
      time: matchingLine.bookingMetadata.time,
    };
  }

  return null;
};

const formatServiceSchedule = (dateStr: string, timeStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const day = parts[2];
  const month = parts[1];
  const year = parts[0];
  let timeFormatted = "";
  if (timeStr) {
    const timeParts = timeStr.split(":");
    if (timeParts.length >= 2) {
      timeFormatted = ` às ${timeParts[0]}:${timeParts[1]}`;
    }
  }
  return `${day}/${month}/${year}${timeFormatted}`;
};

const formatReturnReasonLabel = (rawReason?: string | null): string => {
  if (!rawReason) return "Não informado";
  const r = String(rawReason).trim().toLowerCase();

  const labels: Record<string, string> = {
    defective: "Item com defeito",
    wrong_item: "Item errado",
    damaged: "Item danificado",
    different_from_description: "Diferente da descrição",
    missing_parts: "Faltam partes",
    arrived_late: "Chegou atrasado",
    changed_mind: "Mudou de ideia",
    other: "Outro",
    wrong_size: "Tamanho errado / incompatível",
    regret: "Desistência / arrependimento",
    not_as_described: "Diferente do anúncio",
    delayed: "Atraso na entrega",
    outro: "Outro",
    defeito: "Item com defeito",
    item_errado: "Item errado",
    "item errado": "Item errado",
    "recebi item errado": "Item errado",
    arrependimento: "Desistência / arrependimento",
    tamanho: "Tamanho errado / incompatível",
    danificado: "Item danificado",
    diferente_da_descricao: "Diferente da descrição",
    faltando_partes: "Faltam partes",
    chegou_atrasado: "Chegou atrasado",
    mudou_de_ideia: "Mudou de ideia",
  };

  if (labels[r]) return labels[r];

  return r.charAt(0).toUpperCase() + r.slice(1);
};

const formatReturnConditionLabel = (rawCondition?: string | null): string => {
  if (!rawCondition) return "Não informado";
  const c = String(rawCondition).trim().toLowerCase();
  if (c === "sealed" || c === "lacrado") return "Lacrado";
  if (c === "damaged" || c === "danificado") return "Danificado";
  if (c === "opened" || c === "aberto") return "Aberto";
  return c.charAt(0).toUpperCase() + c.slice(1);
};

const getReturnStatusMeta = (status: string) => {
  switch (status) {
    case "PENDING_REVIEW":
      return { label: "Pendente", variant: "orange" as const };
    case "UNDER_ANALYSIS":
      return { label: "Em análise", variant: "blue" as const };
    case "WAITING_CUSTOMER":
      return { label: "Aguardando cliente", variant: "purple" as const };
    case "WAITING_ITEM_RETURN":
      return { label: "Aguardando devolução", variant: "purple" as const };
    case "APPROVED":
      return { label: "Aprovada", variant: "green" as const };
    case "REJECTED":
      return { label: "Recusada", variant: "red" as const };
    case "PROCESSING":
      return { label: "Processando", variant: "blue" as const };
    case "RESOLVED":
      return { label: "Concluída", variant: "green" as const };
    case "EXPIRED":
      return { label: "Expirada", variant: "red" as const };
    case "ESCALATED":
      return { label: "Escalada", variant: "red" as const };
    default:
      return { label: "Pendente", variant: "orange" as const };
  }
};

interface OrderDetailViewProps {
  orderId: string;
  partnerId: string;
  onBack: () => void;
  onEditOrder: (order: any, reason?: string) => void;
  onUpdateDeliveryStatus: (order: any) => void;
  onUpdatePaymentStatus: (order: any) => void;
  onCancelOrder: (order: any) => void;
  onOpenNotes: (order: any) => void;
  initialOrder?: any;
  /** True while the parent entity cache is fetching the full order. */
  detailLoading?: boolean;
  initialTab?: string;
}

export default function OrderDetailView({
  orderId,
  partnerId,
  onBack,
  onEditOrder,
  onUpdateDeliveryStatus,
  onUpdatePaymentStatus,
  onCancelOrder,
  onOpenNotes,
  initialOrder,
  detailLoading = false,
  initialTab,
}: OrderDetailViewProps) {
  const { role, canRbac, planSlug } = usePermissions();
  const { selectedStore } = useStore();

  const [isScrolled, setIsScrolled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isFullOrder = Boolean(
    initialOrder &&
    (initialOrder.order_items || initialOrder.items) &&
    !initialOrder.__partial,
  );
  const [order, setOrder] = useState<any>(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder || detailLoading);
  const [activeTab, setActiveTab] = useState(initialTab || "summary");

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab(initialTab);
  }, [initialTab]);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [deliverySummary, setDeliverySummary] = useState<any | null>(null);
  const [isStepsSheetOpen, setIsStepsSheetOpen] = useState(false);
  const [printModalOrderId, setPrintModalOrderId] = useState<string | null>(
    null,
  );
  const [showFinancialBreakdown, setShowFinancialBreakdown] = useState(false);
  const [financialData, setFinancialData] =
    useState<FinancialBreakdownData | null>(null);
  const [financialLoading, setFinancialLoading] = useState(false);
  const ITEMS_PER_PAGE = 8;
  const [itemPage, setItemPage] = useState(1);
  const { error: notifyError, success: notifySuccess } = useNotification();
  const [isAppointmentSheetOpen, setIsAppointmentSheetOpen] = useState(false);
  const [selectedOrderItemForAppointment, setSelectedOrderItemForAppointment] =
    useState<any>(null);
  const [appointmentDefaultDate] = useState(() => new Date());
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);

  const handleSaveAppointmentFromOrder = async (data: any) => {
    try {
      const { createAppointmentsAction } =
        await import("@/app/actions/erp/appointments");
      const payload = Array.isArray(data) ? data : [data];
      const res = await createAppointmentsAction(payload);
      if (res && res.success) {
        if (notifySuccess)
          notifySuccess(
            "Agendamento criado",
            "Agendamento vinculado ao pedido com sucesso.",
          );
        setIsAppointmentSheetOpen(false);
        setSelectedOrderItemForAppointment(null);
        const refreshed = await getOrderDetailsAction(orderId, partnerId);
        if (refreshed && "success" in refreshed && refreshed.success) {
          setOrder(refreshed.data);
        }
      } else {
        if (notifyError)
          notifyError("Erro", res?.error || "Erro ao criar agendamento.");
      }
    } catch (err: any) {
      if (notifyError)
        notifyError("Erro", err?.message || "Erro ao criar agendamento.");
    }
  };

  const handleBack = useCallback(() => onBack(), [onBack]);

  const refreshOrder = useCallback(async () => {
    const refreshed = await getOrderDetailsAction(orderId, partnerId);
    if (refreshed && "success" in refreshed && refreshed.success) {
      setOrder(refreshed.data);
    }
  }, [orderId, partnerId]);

  const { setHeaderOverride } = useSidebar();

  useEffect(() => {
    setHeaderOverride({
      title: order?.order_number
        ? `Pedido ${order.order_number}`
        : "Detalhes do pedido",
      onBack: handleBack,
      isSubPage: true,
    });
    return () => setHeaderOverride(null);
  }, [order?.order_number, handleBack, setHeaderOverride]);

  useEffect(() => {
    setItemPage(1);
  }, [order?.order_items?.length]);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setIsScrolled(scrollContainerRef.current.scrollTop > 5);
    }
  }, []);

  useEffect(() => {
    if (detailLoading) return;

    if (initialOrder && (initialOrder.order_items || initialOrder.items) && !initialOrder.__partial) {
      setOrder(initialOrder);
      setLoading(false);
    }
  }, [detailLoading, initialOrder]);

  // The parent entity cache owns the full-detail request. Fetch here only when
  // this component was mounted without a usable initial order (for example a
  // direct fallback render or after a failed cache request). This avoids two
  // identical getOrderDetailsAction calls when opening a row from the list.
  useEffect(() => {
    if (detailLoading) return;
    if (initialOrder && (initialOrder.order_items || initialOrder.items) && !initialOrder.__partial) {
      return;
    }

    let mounted = true;

    async function load() {
      try {
        // Only show loading spinner if we have NO data at all
        if (!initialOrder && !order) setLoading(true);

        const res = await getOrderDetailsAction(orderId, partnerId);
        if (!mounted) return;

        if (res && "success" in res && res.success) {
          setOrder(res.data);
        } else {
          const errorMsg =
            res && "error" in res && typeof res.error === "string"
              ? res.error
              : "Erro ao carregar detalhes do pedido";
          console.error(
            "[OrderDetailView] error loading order details:",
            errorMsg,
          );
          if (!initialOrder && !order) {
            notifyError("Erro", errorMsg);
            onBack();
          }
        }
      } catch (err: any) {
        console.error("[OrderDetailView] failed to fetch order details:", err);
        if (!initialOrder && !order) {
          notifyError("Erro", err?.message || "Erro desconhecido");
          onBack();
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [detailLoading, initialOrder, orderId, partnerId, notifyError, onBack]);

  // Lazy load delivery summary only when delivery tab is active
  useEffect(() => {
    if (activeTab !== "delivery") return;
    let mounted = true;
    async function loadDelivery() {
      if (!orderId || !partnerId) return;
      const res = await getOrderDeliverySummaryAction({ partnerId, orderId });
      if (!mounted) return;
      if (res.success) {
        setDeliverySummary(res.data);
      } else {
        setDeliverySummary(null);
      }
    }
    loadDelivery();
    return () => {
      mounted = false;
    };
  }, [activeTab, orderId, partnerId]);

  const loadFinancialBreakdown = useCallback(async () => {
    if (financialData) {
      setShowFinancialBreakdown((prev) => !prev);
      return;
    }
    setFinancialLoading(true);
    const res = await getOrderFinancialBreakdownAction(orderId, partnerId);
    if (res.success) {
      setFinancialData(res.data);
      setShowFinancialBreakdown(true);
    } else {
      notifyError("Erro", res.error || "Erro ao carregar dados financeiros");
    }
    setFinancialLoading(false);
  }, [orderId, partnerId, financialData, notifyError]);

  useEffect(() => {
    async function loadHistory() {
      if (activeTab !== "history" || historyLoaded) return;
      setHistoryLoading(true);
      const res = await getOrderHistoryAction(orderId, partnerId);
      if (res.success) {
        setHistoryEntries(res.data || []);
        setHistoryLoaded(true);
      } else {
        notifyError("Erro", res.error);
      }
      setHistoryLoading(false);
    }
    loadHistory();
  }, [activeTab, historyLoaded, orderId, partnerId, notifyError]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
        <ThreeDotsLoader />
      </div>
    );
  }

  if (!order) return null;

  const pageTitle = `Pedido ${order.order_number}`;
  const paymentStatus = getPaymentStatusMeta(order.situation);
  const pendingSuffix =
    paymentStatus.label !== "Pago" ? ` (${paymentStatus.label})` : "";
  const remainingPaymentAmount = Math.max(
    0,
    Number(order.total_amount || 0) - Number(order.paid_amount || 0),
  );
  const hasPendingPayment =
    order.situation !== "paid" &&
    order.situation !== "cancelled" &&
    remainingPaymentAmount > 0.009;

  const breakdown = Array.isArray(order.payment_breakdown)
    ? order.payment_breakdown
    : [];
  const paymentEntry = breakdown.find(
    (e: any) => e?.method && !e?.checkoutPricing,
  );
  const installmentCount = paymentEntry?.installmentNumber || 1;
  const mpLeg = breakdown.find(
    (e: any) =>
      String(e?.provider || "")
        .toLowerCase()
        .includes("mercado pago") ||
      String(e?.method || "")
        .toLowerCase()
        .includes("mercado pago"),
  );
  const mpPaymentStatus = mpLeg?.paymentStatus;
  const mpPaymentStatusDetail = mpLeg?.paymentStatusDetail;
  const mpTotalFeeAmount = mpLeg?.feeAmount;
  const mpFeeDetails:
    Array<{ type: string; amount: number; feePayer: string }> | undefined =
    mpLeg?.feeDetails;
  const mpNetReceivedAmount = mpLeg?.amountReceived;

  const translateMpStatus = (status: string) => {
    const map: Record<string, string> = {
      approved: "Aprovado",
      pending: "Pendente",
      authorized: "Autorizado",
      in_process: "Em processamento",
      in_mediation: "Em mediação",
      rejected: "Rejeitado",
      cancelled: "Cancelado",
      refunded: "Reembolsado",
      charged_back: "Estornado",
      expired: "Expirado",
    };
    return map[status?.toLowerCase()] || status;
  };

  const translateMpStatusDetail = (detail: string) => {
    const map: Record<string, string> = {
      accredited: "Aprovado",
      pending_review: "Em análise",
      pending_capitation: "Aguardando captura",
      credited: "Creditado",
      already_refunded: "Já reembolsado",
      partially_refunded: "Parcialmente reembolsado",
      deviation: "Desvio",
    };
    return map[detail?.toLowerCase()] || detail;
  };

  const getCardBrandInfo = (mpPaymentMethodId: string | null) => {
    const brands: Record<string, { label: string; icon: string }> = {
      visa: { label: "Visa", icon: "Visa.png" },
      mastercard: { label: "Mastercard", icon: "Mastercard.png" },
      elo: { label: "Elo", icon: "Elo.png" },
      amex: { label: "Amex", icon: "Amex.png" },
      hipercard: { label: "Hipercard", icon: "Hipercard.png" },
      discover: { label: "Discover", icon: "Discover.png" },
      diners: { label: "Diners", icon: "Diners.png" },
      jcb: { label: "JCB", icon: "JCB.png" },
    };
    return brands[(mpPaymentMethodId || "").toLowerCase()] || null;
  };

  const buildInstallmentSchedule = () => {
    const count = Number(mpLeg?.installmentNumber || installmentCount || 0);
    if (count <= 1) return [];
    const amount = Number(mpLeg?.installmentAmount || 0);
    const baseDate = order.mp_date_approved
      ? new Date(order.mp_date_approved)
      : new Date(order.created_at || new Date());
    const grossAmount = Number(mpLeg?.amount || 0);
    const perInstallment =
      amount > 0 ? amount : Math.round((grossAmount / count) * 100) / 100;
    const diff = Math.round((grossAmount - perInstallment * count) * 100) / 100;
    const schedule: Array<{
      number: number;
      total: number;
      dueDate: string;
      amount: number;
    }> = [];
    for (let i = 0; i < count; i++) {
      const due = new Date(baseDate);
      due.setMonth(due.getMonth() + (i + 1));
      const day = String(due.getDate()).padStart(2, "0");
      const month = String(due.getMonth() + 1).padStart(2, "0");
      const year = due.getFullYear();
      schedule.push({
        number: i + 1,
        total: count,
        dueDate: `${day}/${month}/${year}`,
        amount:
          i === count - 1
            ? Math.round((perInstallment + diff) * 100) / 100
            : perInstallment,
      });
    }
    return schedule;
  };

  const isMercadoPago = hasReceivedMpPayment(order);
  const paymentMethodIndicatorLabel: string | null = (() => {
    const methodEntries = breakdown.filter(
      (b: any) => b?.method && !b?.checkoutPricing,
    );
    const paidMethodEntries = methodEntries.filter(
      (b: any) => Number(b?.amountReceived ?? b?.amount ?? 0) > 0.009,
    );
    const paidLabels = Array.from(
      new Set(
        paidMethodEntries
          .map((b: any) =>
            String(b?.method || "")
              .toLowerCase()
              .trim(),
          )
          .filter(Boolean),
      ),
    );
    let pmLabel: string | null = null;

    if (paidLabels.length > 1) {
      pmLabel = "Múltiplos meios";
    } else if (paidMethodEntries.length === 1) {
      pmLabel = paidMethodEntries[0]?.method || order.payment_method || null;
    } else {
      pmLabel = methodEntries[0]?.method || order.payment_method || null;
    }

    if (
      pmLabel &&
      methodEntries.length === 1 &&
      methodEntries[0]?.installmentNumber > 1
    ) {
      pmLabel = `${pmLabel} - ${methodEntries[0].installmentNumber}x`;
    }
    return pmLabel;
  })();

  const getPaymentStatusDisplay = (situation: string) => {
    switch (situation) {
      case "paid":
        return {
          label: "Pago",
          color: "text-green-700 dark:text-green-400",
          Icon: CheckCircleIcon,
        };
      case "partially_paid":
        return {
          label: "Parcialmente Pago",
          color: "text-brand-orange dark:text-orange-400",
          Icon: ClockIcon,
        };
      case "pending":
      case "unpaid":
        return {
          label: "Pendente",
          color: "text-brand-inactive-text dark:text-dark-body",
          Icon: ClockIcon,
        };
      case "cancelled":
        return {
          label: "Cancelado",
          color: "text-red-700 dark:text-red-400",
          Icon: XIcon,
        };
      case "awaiting_pickup_payment":
        return {
          label: "Aguardando pagamento na retirada",
          color: "text-brand-orange dark:text-orange-400",
          Icon: ClockIcon,
        };
      default:
        const meta = getPaymentStatusMeta(situation);
        return {
          label: meta.label,
          color: "text-gray-700 dark:text-gray-400",
          Icon: AlertCircleIcon,
        };
    }
  };

  const renderPaymentMethodValue = () => {
    const statusDisplay = getPaymentStatusDisplay(order.situation);
    const StatusIcon = statusDisplay.Icon;

    return (
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <PaymentMethodIndicator
          label={paymentMethodIndicatorLabel}
          provider={order.payment_provider}
          simplify
        />
        <span className="text-brand-border dark:text-dark-border">|</span>
        <span
          className={`inline-flex items-center gap-1 font-bold ${statusDisplay.color}`}
        >
          <StatusIcon size={14} className="shrink-0" />
          <span>{statusDisplay.label}</span>
        </span>
      </div>
    );
  };

  const paymentBreakdown =
    Array.isArray(order.payment_breakdown) && order.payment_breakdown.length > 0
      ? order.payment_breakdown.filter((entry: any) => entry?.method)
      : Number(order.paid_amount || 0) > 0 && order.payment_method
        ? [
          {
            method: order.payment_method,
            amount: Number(order.paid_amount || 0),
          },
        ]
        : [];
  const itemCount = Number(order.order_items?.length || 0);
  const sortedOrderItems = [...(order.order_items || [])].sort(
    (a: any, b: any) => {
      if (a.is_gift && !b.is_gift) return 1;
      if (!a.is_gift && b.is_gift) return -1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    },
  );
  const totalItemPages = Math.ceil(sortedOrderItems.length / ITEMS_PER_PAGE);
  const paginatedItems = sortedOrderItems.slice(
    (itemPage - 1) * ITEMS_PER_PAGE,
    itemPage * ITEMS_PER_PAGE,
  );
  const itemsLabel = itemCount === 1 ? "1 item" : `${itemCount} itens`;
  const couponDiscountAmount = Math.max(
    0,
    Number(order.coupon_discount_amount || 0),
  );
  const paymentMethodDiscountAmount = Math.max(
    0,
    Number(order.payment_method_discount_amount || 0),
  );
  const paymentMethodExtraAmount = Math.max(
    0,
    Number(order.payment_method_extra_amount || 0),
  );

  const hasDetailedAmounts = paymentBreakdown.some(
    (e: any) =>
      e.interestAmount !== undefined ||
      e.feeAmount !== undefined ||
      e.fixedFeeAmount !== undefined,
  );
  // When legs carry explicit fee fields (even zeros), trust those sums and ignore
  // a stale payment_method_extra_amount column (e.g. wrongly set to the sinal amount).
  const breakdownTotals = hasDetailedAmounts
    ? paymentBreakdown.reduce(
      (acc: any, e: any) => {
        const feeBearer = String(e?.feeBearer || "merchant")
          .toLowerCase()
          .trim();
        const installmentFeeBearer = String(
          e?.installmentFeeBearer || "merchant",
        )
          .toLowerCase()
          .trim();
        const isCustomerFeeBearer =
          feeBearer === "customer" || feeBearer === "buyer";
        const isCustomerInstallmentBearer =
          installmentFeeBearer === "customer" ||
          installmentFeeBearer === "buyer";
        const entryInterest = Number(e.interestAmount || 0);
        const entryInstallmentCost = Number(e.installmentCostAmount || 0);
        const entryFixedInterest = Math.max(
          0,
          entryInterest - entryInstallmentCost,
        );
        const entryFee = Number(e.feeAmount || 0);
        const entryFixedFee = Number(e.fixedFeeAmount || 0);

        // Customer-visible portions
        if (isCustomerFeeBearer) {
          acc.customerInterest += entryFixedInterest;
          acc.customerFee += entryFee;
          acc.customerFixedFee += entryFixedFee;
        } else {
          acc.merchantInterest += entryFixedInterest;
          acc.merchantFee += entryFee;
          acc.merchantFixedFee += entryFixedFee;
        }
        if (isCustomerInstallmentBearer) {
          acc.customerInterest += entryInstallmentCost;
        } else {
          acc.merchantInterest += entryInstallmentCost;
        }
        return acc;
      },
      {
        customerInterest: 0,
        merchantInterest: 0,
        customerFee: 0,
        merchantFee: 0,
        customerFixedFee: 0,
        merchantFixedFee: 0,
      },
    )
    : {
      customerInterest: 0,
      merchantInterest: 0,
      customerFee: 0,
      merchantFee: 0,
      customerFixedFee: 0,
      merchantFixedFee: 0,
    };
  const customerVisibleFeeTotal =
    breakdownTotals.customerInterest +
    breakdownTotals.customerFee +
    breakdownTotals.customerFixedFee;
  const effectivePaymentMethodExtraAmount = hasDetailedAmounts
    ? customerVisibleFeeTotal > 0.009
      ? paymentMethodExtraAmount
      : 0
    : paymentMethodExtraAmount;

  const detailedInterestAmount = breakdownTotals.customerInterest;
  const detailedFeeAmount = breakdownTotals.customerFee;
  const detailedFixedFeeAmount = breakdownTotals.customerFixedFee;
  const subtotalValue =
    Number(order.subtotal_value || 0) > 0
      ? Number(order.subtotal_value || 0)
      : Number(order.total_amount || 0) -
      Number(order.delivery_fee || 0) -
      Number(order.additional_costs || 0) +
      Number(order.discount_value || 0) +
      couponDiscountAmount +
      paymentMethodDiscountAmount -
      effectivePaymentMethodExtraAmount;
  const totalReceived = paymentBreakdown.reduce(
    (sum: number, e: any) => sum + Number(e?.amountReceived || 0),
    0,
  );
  const changeAmount =
    totalReceived > 0.005
      ? Math.max(0, totalReceived - Number(order.total_amount || 0))
      : Math.max(
        0,
        Number(order.paid_amount || 0) - Number(order.total_amount || 0),
      );
  const cashEntry = Array.isArray(order.payment_breakdown)
    ? order.payment_breakdown.find((entry: any) => {
      const m = String(entry?.method || "")
        .toLowerCase()
        .trim();
      return m === "cash" || m === "dinheiro";
    })
    : null;
  const wantsChange =
    cashEntry?.wantsChange ??
    String(order.payment_method || "")
      .toLowerCase()
      .includes("troco para");
  const payWithAmount =
    cashEntry?.payWithAmount ??
    (() => {
      const match = String(order.payment_method || "").match(
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
      ? payWithAmount - Number(order.total_amount || 0)
      : 0;

  const cleanNotes = cleanOrderNotes(order.notes);
  const cancelNote = (
    String(order.notes || "").match(/Pedido cancelado por:[\s\S]*$/)?.[0] || ""
  ).trim();
  const canEdit = order.situation !== "cancelled";
  const isPickupOrder = order.delivery_type === "pickup";
  const isPaidOrder = ["paid", "partially_paid"].includes(order.situation);

  const isMarketplaceOrder =
    order.order_source === "Marketplace" ||
    order.order_source === "Online Store" ||
    order.order_source === "Vitrine Online";

  const sourceServiceOrder = order.source_service_order || null;
  const sourceQuote = order.source_quote || null;
  const sourceSubscriptionId = order.recurring_subscription_id || null;

  const getSourceSubtitle = () => {
    if (sourceServiceOrder) {
      return `Ordem de Serviço • OS #${sourceServiceOrder?.order_number || ""}`;
    }
    if (sourceQuote) {
      return `Orçamento • ${sourceQuote?.quote_number || ""}`;
    }
    if (order.order_source === "Assinatura") {
      return order.payment_method === "Assinatura (Créditos)"
        ? "Assinatura • Créditos - sem cobrança adicional"
        : "Assinatura";
    }
    return normalizeOrderSource(order.order_source);
  };

  const itemsBaseSubtotal = (sortedOrderItems || []).reduce(
    (sum: number, item: any) =>
      sum + Number(item.subtotal || item.product_price * item.quantity || 0),
    0,
  );
  const isDepositOrder = Boolean(
    order?.checkout_fulfillment?.depositCheckout?.payDepositOnly ||
    order?.checkout_fulfillment?.depositCheckout?.usesDeposit,
  );
  const depositSummary = getOrderDepositSummary(order);
  const hasItemDiscount =
    isMarketplaceOrder &&
    !isDepositOrder &&
    itemsBaseSubtotal > 0 &&
    subtotalValue > 0 &&
    Math.abs(itemsBaseSubtotal - subtotalValue) > 0.005;
  const itemDiscountRatio = hasItemDiscount
    ? subtotalValue / itemsBaseSubtotal
    : 1;

  const getItemDiscountedPrice = (item: any) => {
    const basePrice = Number(item.product_price || 0);
    if (item.is_gift || item.is_promotional) return basePrice;
    if (!hasItemDiscount) return basePrice;
    const discounted = basePrice * itemDiscountRatio;
    return Math.round(discounted * 100) / 100;
  };

  // Detect if order has services vs products for dynamic timeline labels
  const orderItems = order.order_items || [];
  const hasOnlyServices =
    order.order_source === "admin_service_order" ||
    order.order_source === "Ordem de Serviço" ||
    (orderItems.length > 0 &&
      orderItems.every(
        (item: any) => item.service_id || item.line_type === "service_booking",
      ));
  const hasAnyService = orderItems.some(
    (item: any) => item.service_id || item.line_type === "service_booking",
  );
  const hasMixedItems = hasAnyService && !hasOnlyServices;

  const timelineDate = (isActive: boolean) => {
    if (!isActive) return { date: "", time: "" };
    const when = order.updated_at || order.created_at;
    return { date: formatDayMonth(when), time: formatTime(when) };
  };

  const getTimelineSteps = (status: string) => {
    const baseDate = formatDayMonth(order.created_at);
    const baseTime = formatTime(order.created_at);

    const isPaid = ["paid", "partially_paid"].includes(order.situation);
    const isCancelled = order.situation === "cancelled";

    if (isCancelled) {
      const cancelledAt = order.updated_at || order.created_at;
      return [
        {
          label: "Pedido Realizado",
          date: baseDate,
          time: baseTime,
          active: true,
        },
        {
          label: isPaid ? "Pago" : "Aguardando pagamento",
          date: baseDate,
          time: baseTime,
          active: true,
        },
        {
          label: "Cancelado",
          date: formatDayMonth(cancelledAt),
          time: formatTime(cancelledAt),
          active: true,
        },
      ];
    }

    const isPreparing = [
      "preparing",
      "sent",
      "delivered",
      "pickup_available",
      "delivery_failed",
    ].includes(status);
    const isSent = [
      "sent",
      "delivered",
      "delivery_failed",
      "pickup_available",
    ].includes(status);
    const isDelivered = [
      "delivered",
      "pickup_available",
      "delivery_failed",
    ].includes(status);

    const preparingMeta = timelineDate(isPaid && isPreparing);
    const sentMeta = timelineDate(isPaid && isSent);
    const finalMeta = timelineDate(isPaid && isDelivered);
    const paymentMeta = timelineDate(isPaid);

    const isPickup = isPickupOrder;

    let finalLabel = isPickup ? "Pedido retirado" : "Pedido entregue";
    if (status === "delivery_failed") {
      finalLabel = isPickup
        ? "Retirada não realizada"
        : "Falha na entrega";
    }

    if (hasOnlyServices) {
      return [
        {
          label: "Pedido Realizado",
          date: baseDate,
          time: baseTime,
          active: true,
        },
        {
          label: isPaid ? "Pago" : "Aguardando pagamento",
          date: isPaid ? paymentMeta.date : baseDate,
          time: isPaid ? paymentMeta.time : baseTime,
          active: true,
        },
        {
          label: "Em andamento",
          date: isPaid && isPreparing ? preparingMeta.date : undefined,
          time: isPaid && isPreparing ? preparingMeta.time : undefined,
          active: isPaid && isPreparing,
        },
        {
          label: "Concluído",
          date:
            isPaid && isDelivered && status === "delivered"
              ? finalMeta.date
              : undefined,
          time:
            isPaid && isDelivered && status === "delivered"
              ? finalMeta.time
              : undefined,
          active: isPaid && isDelivered && status === "delivered",
        },
      ];
    }

    if (hasMixedItems) {
      const servicesCount = orderItems.filter(
        (item: any) => !item.product_id && !item.variant_id,
      ).length;
      const productsCount = orderItems.filter(
        (item: any) => item.product_id || item.variant_id,
      ).length;
      const serviceText =
        servicesCount === 1
          ? "1 serviço sendo realizado"
          : `${servicesCount} serviços sendo realizados`;
      const productText =
        productsCount === 1
          ? "1 produto sendo preparado"
          : `${productsCount} produtos sendo preparados`;

      return [
        {
          label: "Pedido Realizado",
          date: baseDate,
          time: baseTime,
          active: true,
        },
        {
          label: isPaid ? "Pago" : "Aguardando pagamento",
          date: isPaid ? paymentMeta.date : baseDate,
          time: isPaid ? paymentMeta.time : baseTime,
          active: true,
        },
        {
          label: "Em progresso",
          date: isPaid && isPreparing ? preparingMeta.date : undefined,
          time: isPaid && isPreparing ? preparingMeta.time : undefined,
          active: isPaid && isPreparing,
          subLabel: [serviceText, productText],
        },
        {
          label: "Finalizado",
          date: isPaid && isSent ? sentMeta.date : undefined,
          time: isPaid && isSent ? sentMeta.time : undefined,
          active: isPaid && isSent,
        },
        {
          label: "Concluído",
          date: isPaid && isDelivered ? finalMeta.date : undefined,
          time: isPaid && isDelivered ? finalMeta.time : undefined,
          active: isPaid && isDelivered,
        },
      ];
    }

    return [
      {
        label: "Pedido Realizado",
        date: baseDate,
        time: baseTime,
        active: true,
      },
      {
        label: isPaid ? "Pago" : "Aguardando pagamento",
        date: isPaid ? paymentMeta.date : baseDate,
        time: isPaid ? paymentMeta.time : baseTime,
        active: true,
      },
      {
        label: "Em andamento",
        date: isPaid && isPreparing ? preparingMeta.date : undefined,
        time: isPaid && isPreparing ? preparingMeta.time : undefined,
        active: isPaid && isPreparing,
      },
      {
        label: isPickup ? "Pronto para retirada" : "Enviado",
        date: isPaid && isSent ? sentMeta.date : undefined,
        time: isPaid && isSent ? sentMeta.time : undefined,
        active: isPaid && isSent,
      },
      {
        label: finalLabel,
        date: isPaid && isDelivered ? finalMeta.date : undefined,
        time: isPaid && isDelivered ? finalMeta.time : undefined,
        active: isPaid && isDelivered,
      },
    ];
  };

  const timelineSteps = getTimelineSteps(order.delivery_status);

  const PaymentRow = ({
    label,
    value,
  }: {
    label: string;
    value: React.ReactNode;
  }) => (
    <div className="flex justify-between items-start text-[14px] gap-4">
      <span className="text-brand-inactive-text dark:text-dark-body font-medium">
        {label}
      </span>
      <div className="text-right">{value}</div>
    </div>
  );

  return (
    <>
      <FadeIn>
        <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col h-full w-full"
          >
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0"
            >
              {/* Sticky Header */}
              <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                  {/* Back button - desktop only */}
                  <div
                    className={`absolute -left-12 top-7 h-full hidden lg:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}
                  >
                    <Button
                      variant="filled"
                      onClick={handleBack}
                      className="w-10 h-10 p-0 flex items-center justify-center"
                    >
                      <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                    </Button>
                  </div>

                  {/* Title row */}
                  <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                      <h1
                        className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}
                      >
                        <span className="hidden md:inline truncate">
                          {pageTitle}
                        </span>
                        <Badge variant={paymentStatus.variant}>
                          {paymentStatus.label}
                        </Badge>
                      </h1>

                      <div
                        className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}
                      >
                        Criado em {formatDateTime(order.created_at)} •{" "}
                        {getSourceSubtitle()}
                      </div>
                    </div>

                    {/* Desktop action buttons */}
                    <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                      <ActionsDropdown
                        onPrint={() =>
                          setPrintModalOrderId(order.id || order.order_number)
                        }
                        onEdit={
                          canEdit && canRbac("orders.edit")
                            ? () => onEditOrder(order)
                            : undefined
                        }
                        onCancel={
                          order.situation === "cancelled"
                            ? () => onOpenNotes(order)
                            : () => onCancelOrder(order)
                        }
                        onPaymentStatus={
                          order.situation !== "cancelled"
                            ? () => onUpdatePaymentStatus(order)
                            : undefined
                        }
                        onDeliveryStatus={
                          order.situation !== "cancelled" && !hasOnlyServices
                            ? () => onUpdateDeliveryStatus(order)
                            : undefined
                        }
                        cancelLabel={
                          order.situation === "cancelled"
                            ? "Observação"
                            : "Cancelar"
                        }
                      />
                    </div>
                  </div>

                  {/* Tabs */}
                  <div
                    className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}
                  >
                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                      <TabsTrigger value="summary">Dados gerais</TabsTrigger>
                      {!isPickupOrder && (
                        <TabsTrigger value="delivery">Entrega</TabsTrigger>
                      )}
                      <TabsTrigger value="attachments">Anexos</TabsTrigger>
                      <TabsTrigger value="history">Histórico</TabsTrigger>
                    </TabsList>
                  </div>
                </div>
              </div>

              {/* Tab Content */}
              <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsContent value="summary" className="mt-0">
                    <FadeIn key="summary">
                      {/* Desktop View */}
                      <div className="hidden lg:grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                        <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                          <div className="border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden mb-8">
                            <div className="bg-brand-gray dark:bg-dark-border/50 p-6 border-b border-brand-border dark:border-dark-border">
                              <div className="flex justify-between items-center flex-wrap gap-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                    {order.order_source === "Marketplace"
                                      ? "Origem da venda:"
                                      : "Responsável pela venda:"}
                                  </span>
                                  <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">
                                    {order.order_source === "Marketplace"
                                      ? order.order_source || "Marketplace"
                                      : order.seller_name || "Não informado"}
                                  </div>
                                </div>
                                {order.order_source !== "Marketplace" && (
                                  <div className="hidden md:flex items-center gap-1.5 text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                    Origem da venda:
                                    {sourceServiceOrder ? (
                                      <a
                                        href={`/erp/ordens-de-servico?view=${sourceServiceOrder.id}`}
                                        className="font-bold text-brand-primary hover:underline inline-flex items-center gap-1"
                                      >
                                        Ordem de Serviço #
                                        {sourceServiceOrder?.order_number || ""}
                                      </a>
                                    ) : sourceQuote ? (
                                      <a
                                        href={`/erp/orcamentos?view=${sourceQuote.id}`}
                                        className="font-bold text-brand-primary hover:underline inline-flex items-center gap-1"
                                      >
                                        Orçamento {sourceQuote.quote_number}
                                      </a>
                                    ) : sourceSubscriptionId ? (
                                      <a
                                        href={`/erp/recorrentes/assinaturas?view=${sourceSubscriptionId}`}
                                        className="font-bold text-brand-primary hover:underline inline-flex items-center gap-1"
                                      >
                                        Assinatura
                                      </a>
                                    ) : (
                                      <strong className="text-brand-dark dark:text-dark-heading">
                                        {normalizeOrderSource(
                                          order.order_source,
                                        )}
                                      </strong>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="bg-white dark:bg-dark-surface px-12 pt-12 pb-12">
                              <div className="relative px-4">
                                <div className="relative h-1.5 w-full bg-gray-100 dark:bg-dark-border/50 rounded-full flex items-center justify-between">
                                  <div
                                    className={`absolute left-0 h-full rounded-full transition-all duration-500 ${order.delivery_status === "delivery_failed" ? "bg-brand-red" : "bg-brand-dark dark:bg-dark-heading"}`}
                                    style={{
                                      width: `${timelineSteps.length <= 1 ? 0 : ((timelineSteps.filter((s) => s.active).length - 1) / (timelineSteps.length - 1)) * 100}%`,
                                    }}
                                  ></div>

                                  {timelineSteps.map((step, idx) => {
                                    const isLastFailed =
                                      order.delivery_status ===
                                      "delivery_failed" &&
                                      idx === timelineSteps.length - 1;
                                    return (
                                      <div
                                        key={idx}
                                        className="relative flex flex-col items-center"
                                      >
                                        <div className="absolute bottom-6 whitespace-nowrap flex flex-col items-center">
                                          <span
                                            className={`text-xs font-medium ${step.active ? (isLastFailed ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}
                                          >
                                            {step.label}
                                          </span>
                                        </div>
                                        <div
                                          className={`w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (isLastFailed ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}
                                        >
                                          {step.active && (
                                            <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full"></div>
                                          )}
                                        </div>
                                        <div className="absolute top-6 whitespace-nowrap flex flex-col items-center">
                                          {step.date ? (
                                            <div className="flex items-center gap-1 text-xs text-brand-inactive-text">
                                              <span>{step.date}</span>
                                              {step.time && (
                                                <span>{step.time}</span>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="text-xs font-medium text-gray-300 dark:text-dark-body/50">
                                              -
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          <FormSection title="Itens do Pedido" hasSeparator>
                            <div className="space-y-4">
                              {paginatedItems.map((item: any) => {
                                const isService =
                                  !!item.service_id ||
                                  item.line_type === "service_booking" ||
                                  item.line_type === "service" ||
                                  Boolean(item.services) ||
                                  item.products?.type === "service";
                                const scheduleInfo = isService
                                  ? getServiceScheduleInfo(item, order)
                                  : null;
                                return (
                                  <div
                                    key={item.id}
                                    className="flex items-start gap-4"
                                  >
                                    <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                      <img
                                        src={getR2ImageUrl(
                                          item.product_variants?.variant_options?.image ||
                                          item.product_variants?.image ||
                                          item.image ||
                                          item.products?.images ||
                                          item.services?.images ||
                                          null,
                                          "thumbnail",
                                        )}
                                        className="w-full h-full object-cover rounded-full"
                                        alt={item.product_name}
                                        onError={(e: any) => {
                                          e.target.src =
                                            "https://img.dudit.com.br/static/Placeholder.png";
                                        }}
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                          <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                            {item.product_name ||
                                              "Produto sem nome"}
                                          </h4>
                                          {item.is_gift && (
                                            <Badge variant="blue" icon={null}>
                                              Brinde
                                            </Badge>
                                          )}
                                          {(() => {
                                            const itemReturns = (
                                              order.return_requests || []
                                            ).flatMap((rr: any) => {
                                              const matchingItems = (
                                                rr.return_items || []
                                              ).filter(
                                                (ri: any) =>
                                                  ri.order_item_id === item.id,
                                              );
                                              return matchingItems.map(
                                                (ri: any) => ({
                                                  ...ri,
                                                  requestStatus: rr.status,
                                                  requestId: rr.id,
                                                  createdAt:
                                                    rr.created_at ||
                                                    rr.returnDate,
                                                }),
                                              );
                                            });

                                            if (itemReturns.length === 0)
                                              return null;

                                            const tooltipContent = (
                                              <div className="space-y-2 text-left p-1 min-w-[220px]">
                                                <div className="flex items-center gap-1.5 font-bold border-b border-dark-broder dark:border-brand-border pb-1.5 text-xs text-dark-heading dark:text-brand-dark">
                                                  <ReturnIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                                                  <span>
                                                    Histórico de Devolução /
                                                    Troca
                                                  </span>
                                                </div>
                                                <div className="space-y-2 divide-y divide-brand-border dark:divide-dark-border text-xs">
                                                  {itemReturns.map(
                                                    (ret: any, idx: number) => {
                                                      const statusMeta =
                                                        getReturnStatusMeta(
                                                          ret.requestStatus,
                                                        );
                                                      return (
                                                        <div
                                                          key={idx}
                                                          className="pt-1.5 first:pt-0 space-y-1"
                                                        >
                                                          <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs font-bold text-dark-heading dark:text-brand-dark">
                                                              DVL-
                                                              {ret.requestId
                                                                .slice(0, 6)
                                                                .toUpperCase()}
                                                            </span>
                                                            <Badge
                                                              variant={
                                                                statusMeta.variant
                                                              }
                                                              className="scale-90 font-medium"
                                                            >
                                                              {statusMeta.label}
                                                            </Badge>
                                                          </div>
                                                          <div className="text-xs text-dark-body dark:text-brand-dark space-y-0.5">
                                                            <p>
                                                              <strong>
                                                                Quantidade:
                                                              </strong>{" "}
                                                              {formatQuantityWithUnit(
                                                                ret.quantity,
                                                                ret.unit ||
                                                                item.products
                                                                  ?.unit,
                                                              )}
                                                            </p>
                                                            <p>
                                                              <strong>
                                                                Condição:
                                                              </strong>{" "}
                                                              {formatReturnConditionLabel(
                                                                ret.condition,
                                                              )}
                                                            </p>
                                                            <p>
                                                              <strong>
                                                                Motivo:
                                                              </strong>{" "}
                                                              {formatReturnReasonLabel(
                                                                ret.reason,
                                                              )}
                                                            </p>
                                                            {Number(
                                                              ret.refund_amount ||
                                                              0,
                                                            ) > 0 && (
                                                                <p>
                                                                  <strong>
                                                                    Valor
                                                                    reembolsado:
                                                                  </strong>{" "}
                                                                  {formatCurrency(
                                                                    Number(
                                                                      ret.refund_amount,
                                                                    ),
                                                                  )}
                                                                </p>
                                                              )}
                                                            {Number(
                                                              ret.store_credit_amount ||
                                                              0,
                                                            ) > 0 && (
                                                                <p>
                                                                  <strong>
                                                                    Vale-compra:
                                                                  </strong>{" "}
                                                                  {formatCurrency(
                                                                    Number(
                                                                      ret.store_credit_amount,
                                                                    ),
                                                                  )}
                                                                </p>
                                                              )}
                                                          </div>
                                                        </div>
                                                      );
                                                    },
                                                  )}
                                                </div>
                                              </div>
                                            );

                                            return (
                                              <Tooltip text={tooltipContent}>
                                                <Badge
                                                  variant="purple"
                                                  icon={
                                                    <ReturnIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300" />
                                                  }
                                                  className="cursor-pointer hover:opacity-90 px-1.5 py-0.5 min-w-0"
                                                />
                                              </Tooltip>
                                            );
                                          })()}
                                        </div>
                                        <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">
                                          {(() => {
                                            const displayPrice =
                                              getItemDiscountedPrice(item);
                                            const basePrice = Number(
                                              item.product_price || 0,
                                            );
                                            const displaySubtotal =
                                              displayPrice *
                                              Number(item.quantity || 1);
                                            if (item.is_gift) {
                                              return (
                                                <div className="flex items-center gap-1.5">
                                                  <span className="text-xs text-brand-inactive-text line-through font-normal">
                                                    {formatCurrency(
                                                      item.original_price || 0,
                                                    )}
                                                  </span>
                                                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                                    Grátis
                                                  </span>
                                                </div>
                                              );
                                            }
                                            if (hasItemDiscount) {
                                              return (
                                                <div className="flex items-center gap-1.5">
                                                  <span className="text-xs text-brand-inactive-text line-through font-normal">
                                                    {formatCurrency(
                                                      item.subtotal ||
                                                      basePrice *
                                                      item.quantity,
                                                    )}
                                                  </span>
                                                  <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(
                                                      displaySubtotal,
                                                    )}
                                                  </span>
                                                </div>
                                              );
                                            }
                                            return formatCurrency(
                                              item.subtotal ||
                                              basePrice * item.quantity,
                                            );
                                          })()}
                                        </span>
                                      </div>
                                      {isService ? (
                                        scheduleInfo ? (
                                          <div className="text-xs text-brand-inactive-text dark:text-dark-body mb-2">
                                            Data do agendamento:{" "}
                                            {formatServiceSchedule(
                                              scheduleInfo.date,
                                              scheduleInfo.time,
                                            )}
                                          </div>
                                        ) : (
                                          <div className="my-1.5 mb-2">
                                            <Button
                                              variant="link"
                                              onClick={() => {
                                                setSelectedOrderItemForAppointment(
                                                  item,
                                                );
                                                setIsAppointmentSheetOpen(true);
                                              }}
                                              leftIcon={
                                                <CalendarIcon size={12} />
                                              }
                                              className="text-xs p-0"
                                            >
                                              Criar agendamento
                                            </Button>
                                          </div>
                                        )
                                      ) : (
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">
                                          SKU:{" "}
                                          {item.product_variants?.sku ||
                                            item.products?.sku ||
                                            item.sku ||
                                            "N/A"}
                                        </div>
                                      )}
                                      <div className="flex items-center gap-2 text-xs mt-1">
                                        <span className="text-brand-inactive-text">
                                          {formatProductQuantity(
                                            item.quantity,
                                            item.products?.unit,
                                          )}
                                        </span>
                                        <span className="text-brand-border dark:text-dark-border">
                                          |
                                        </span>
                                        <span className="font-medium text-brand-dark dark:text-dark-heading">
                                          {(() => {
                                            const displayPrice =
                                              getItemDiscountedPrice(item);
                                            const basePrice = Number(
                                              item.product_price || 0,
                                            );
                                            if (item.is_gift) {
                                              return (
                                                <span className="flex items-center gap-1.5 inline-flex">
                                                  <span className="text-xs text-brand-inactive-text line-through font-normal">
                                                    {formatCurrency(
                                                      item.original_price || 0,
                                                    )}
                                                  </span>
                                                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                    Grátis
                                                  </span>
                                                </span>
                                              );
                                            }
                                            if (hasItemDiscount) {
                                              return (
                                                <span className="flex items-center gap-1.5 inline-flex">
                                                  <span className="text-xs text-brand-inactive-text line-through font-normal">
                                                    {formatProductUnitPrice(
                                                      basePrice,
                                                      item.products?.unit,
                                                    )}
                                                  </span>
                                                  <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatProductUnitPrice(
                                                      displayPrice,
                                                      item.products?.unit,
                                                    )}
                                                  </span>
                                                </span>
                                              );
                                            }
                                            return formatProductUnitPrice(
                                              basePrice,
                                              item.products?.unit,
                                            );
                                          })()}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </FormSection>

                          {totalItemPages > 1 && (
                            <div className="mt-2 mb-8">
                              <Pagination
                                currentPage={itemPage}
                                totalPages={totalItemPages}
                                onPageChange={setItemPage}
                              />
                            </div>
                          )}

                          <FormSection
                            title="Detalhes do Pagamento"
                            headerRight={
                              hasMinimumPlan(planSlug, "crescer") ? (
                                <button
                                  onClick={loadFinancialBreakdown}
                                  className="text-xs font-bold text-brand-link dark:text-blue-400 hover:underline shrink-0"
                                >
                                  {financialLoading
                                    ? "Carregando..."
                                    : showFinancialBreakdown
                                      ? "Ocultar lucro líquido"
                                      : "Ver lucro líquido"}
                                </button>
                              ) : null
                            }
                            hasSeparator
                          >
                            <div className="space-y-3">
                              <PaymentRow
                                label="Método de Pagamento"
                                value={renderPaymentMethodValue()}
                              />

                              {shouldShowSinal(depositSummary) &&
                                depositSummary.depositAmount > 0.009 && (
                                  <PaymentRow
                                    label="Sinal"
                                    value={
                                      <span className="text-brand-dark dark:text-dark-heading font-bold text-sm flex items-center gap-1.5">
                                        {formatCurrency(
                                          depositSummary.depositAmount,
                                        )}
                                        <span className="text-brand-border dark:text-dark-border">
                                          |
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-1 font-bold ${depositSummary.sinalPaid ? "text-brand-green" : "text-brand-orange"}`}
                                        >
                                          {depositSummary.sinalPaid ? (
                                            <CheckCircleIcon
                                              size={14}
                                              className="shrink-0 text-brand-green"
                                            />
                                          ) : (
                                            <ClockIcon
                                              size={14}
                                              className="shrink-0 text-brand-orange"
                                            />
                                          )}
                                        </span>
                                      </span>
                                    }
                                  />
                                )}

                              {isMercadoPago && (
                                <>
                                  {mpPaymentStatus && (
                                    <PaymentRow
                                      label="Status do Pagamento (MP)"
                                      value={
                                        <span className="text-brand-dark dark:text-dark-heading font-medium text-sm">
                                          {translateMpStatus(mpPaymentStatus)}
                                          {mpPaymentStatusDetail &&
                                            translateMpStatusDetail(
                                              mpPaymentStatusDetail,
                                            ) !==
                                            translateMpStatus(mpPaymentStatus)
                                            ? ` (${translateMpStatusDetail(mpPaymentStatusDetail)})`
                                            : ""}
                                          {order.mp_date_approved && (
                                            <span className="text-brand-inactive-text dark:text-dark-body font-normal ml-1">
                                              em{" "}
                                              {formatDateTime(
                                                order.mp_date_approved,
                                              )}
                                            </span>
                                          )}
                                        </span>
                                      }
                                    />
                                  )}
                                  {mpLeg?.cardLastDigits &&
                                    (() => {
                                      const brand = getCardBrandInfo(
                                        mpLeg.mpPaymentMethodId ||
                                        mpLeg.paymentMethodId ||
                                        null,
                                      );
                                      return (
                                        <PaymentRow
                                          label="Cartão"
                                          value={
                                            <span className="text-brand-dark dark:text-dark-heading font-medium text-sm flex items-center gap-1.5 justify-end">
                                              {brand && (
                                                <img
                                                  src={`https://img.dudit.com.br/static/icons/payments/${brand.icon}`}
                                                  alt={brand.label}
                                                  className="w-5 h-4 object-contain"
                                                />
                                              )}
                                              <span>
                                                •••• {mpLeg.cardLastDigits}
                                              </span>
                                            </span>
                                          }
                                        />
                                      );
                                    })()}
                                  {installmentCount > 1 && (
                                    <PaymentRow
                                      label="Parcelas"
                                      value={
                                        <span className="text-brand-dark dark:text-dark-heading font-medium text-sm flex items-center gap-2 justify-end">
                                          <span>
                                            {installmentCount}x de{" "}
                                            {formatCurrency(
                                              mpLeg?.installmentAmount ||
                                              Number(mpLeg?.amount || 0) /
                                              installmentCount,
                                            )}
                                          </span>
                                          <button
                                            onClick={() =>
                                              setShowInstallmentModal(true)
                                            }
                                            className="text-xs font-bold text-brand-link dark:text-blue-400 hover:underline shrink-0"
                                          >
                                            Ver parcelas
                                          </button>
                                        </span>
                                      }
                                    />
                                  )}
                                  {showFinancialBreakdown &&
                                    mpTotalFeeAmount != null && (
                                      <PaymentRow
                                        label="Taxa do Mercado Pago"
                                        value={
                                          <span className="text-brand-inactive-text dark:text-dark-body font-medium text-sm">
                                            {formatCurrency(mpTotalFeeAmount)}
                                          </span>
                                        }
                                      />
                                    )}
                                  {showFinancialBreakdown &&
                                    Array.isArray(mpFeeDetails) &&
                                    mpFeeDetails.length > 0 &&
                                    mpFeeDetails.map((fd, i) => {
                                      const feeTypeLabel =
                                        fd.type === "mercadopago_fee"
                                          ? "Taxa MP"
                                          : fd.type === "installment_fee"
                                            ? "Taxa de Parcelamento"
                                            : fd.type === "coupon_fee"
                                              ? "Taxa de Cupom"
                                              : fd.type === "application_fee"
                                                ? "Taxa de Aplicação"
                                                : fd.type || `Taxa ${i + 1}`;
                                      return (
                                        <PaymentRow
                                          key={i}
                                          label={feeTypeLabel}
                                          value={
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium text-sm">
                                              {formatCurrency(fd.amount)}
                                            </span>
                                          }
                                        />
                                      );
                                    })}
                                  {showFinancialBreakdown &&
                                    mpNetReceivedAmount != null && (
                                      <PaymentRow
                                        label="Valor Líquido Recebido"
                                        value={
                                          <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                            {formatCurrency(
                                              mpNetReceivedAmount,
                                            )}
                                          </span>
                                        }
                                      />
                                    )}
                                </>
                              )}

                              {(() => {
                                const paidBreakdown = paymentBreakdown.filter(
                                  (entry: any) =>
                                    Number(
                                      entry.amountReceived ?? entry.amount ?? 0,
                                    ) > 0.009,
                                );
                                if (
                                  paidBreakdown.length <= 1 &&
                                  !(
                                    paidBreakdown.length === 1 &&
                                    Number(order.paid_amount || 0) > 0.009 &&
                                    remainingPaymentAmount > 0.009
                                  )
                                )
                                  return null;
                                return (
                                  <PaymentRow
                                    label="Valores por meio"
                                    value={
                                      <div className="flex flex-col gap-1">
                                        {paidBreakdown.map(
                                          (entry: any, index: number) => {
                                            const received = Number(
                                              entry.amountReceived ??
                                              entry.amount ??
                                              0,
                                            );
                                            const baseAmount = Number(
                                              entry.amount || 0,
                                            );
                                            const displayAmount =
                                              received > 0.009
                                                ? received
                                                : baseAmount;
                                            return (
                                              <span
                                                key={`${entry.method}-${index}`}
                                                className="text-brand-dark dark:text-dark-heading font-bold text-sm"
                                              >
                                                {formatPaymentMethodLabel(
                                                  entry.method,
                                                  null,
                                                )}
                                                :{" "}
                                                {formatCurrency(displayAmount)}
                                                {baseAmount > 0.009 &&
                                                  received > 0.009 &&
                                                  Math.abs(
                                                    baseAmount - received,
                                                  ) > 0.009 ? (
                                                  <span className="text-brand-muted font-normal">
                                                    {" "}
                                                    (de{" "}
                                                    {formatCurrency(baseAmount)}
                                                    )
                                                  </span>
                                                ) : null}
                                              </span>
                                            );
                                          },
                                        )}
                                      </div>
                                    }
                                  />
                                );
                              })()}

                              <PaymentRow
                                label="Valor Original"
                                value={
                                  <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                    {formatCurrency(subtotalValue)}
                                  </span>
                                }
                              />

                              {!hasOnlyServices && (
                                <PaymentRow
                                  label="Tipo de Entrega"
                                  value={
                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                      {order.delivery_type === "pickup"
                                        ? "Retirada no local"
                                        : "Entrega no endereço"}
                                    </span>
                                  }
                                />
                              )}

                              {(Number(order.delivery_fee || 0) > 0 ||
                                order.delivery_payer === "seller" ||
                                Number(
                                  order.delivery_breakdown?.originalFee ||
                                  order.delivery_breakdown?.deliverySubsidy ||
                                  0,
                                ) > 0) && (
                                  <PaymentRow
                                    label="Valor da Entrega"
                                    value={
                                      <span className="text-brand-dark dark:text-dark-heading font-bold text-sm flex items-center gap-1.5 flex-wrap">
                                        {Number(order.delivery_fee || 0) > 0
                                          ? formatCurrency(order.delivery_fee)
                                          : formatCurrency(
                                            Number(
                                              order.delivery_breakdown
                                                ?.originalFee ||
                                              order.delivery_breakdown
                                                ?.deliverySubsidy ||
                                              0,
                                            ),
                                          )}
                                        {Number(order.delivery_fee || 0) ===
                                          0 && (
                                            <span className="text-brand-green">
                                              - Frete Grátis (Subsidiado pela loja)
                                            </span>
                                          )}
                                        {Number(order.delivery_fee || 0) > 0 &&
                                          order.delivery_payer === "seller" && (
                                            <span className="text-brand-orange">
                                              - Subsidiado pela loja
                                            </span>
                                          )}
                                        {Number(
                                          order.delivery_breakdown?.distanceKm ||
                                          0,
                                        ) > 0 && (
                                            <span className="text-xs text-brand-muted font-normal">
                                              ({order.delivery_breakdown.distanceKm}{" "}
                                              km)
                                            </span>
                                          )}
                                      </span>
                                    }
                                  />
                                )}

                              {Number(order.additional_costs || 0) > 0 && (
                                <PaymentRow
                                  label="Outros Custos"
                                  value={
                                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                      {formatCurrency(order.additional_costs)}
                                    </span>
                                  }
                                />
                              )}

                              {Number(order.discount_value || 0) > 0 && (
                                <PaymentRow
                                  label="Desconto do Pedido"
                                  value={
                                    <span className="text-brand-green font-bold">
                                      - {formatCurrency(order.discount_value)}
                                    </span>
                                  }
                                />
                              )}
                              {couponDiscountAmount > 0 && (
                                <PaymentRow
                                  label="Desconto por Cupom"
                                  value={
                                    <span className="text-brand-green font-bold">
                                      - {formatCurrency(couponDiscountAmount)}
                                    </span>
                                  }
                                />
                              )}
                              {paymentMethodDiscountAmount > 0 && (
                                <PaymentRow
                                  label={
                                    order.payment_method === "exchange"
                                      ? "Crédito de troca"
                                      : order.payment_method === "store_credit"
                                        ? "Vale-compra"
                                        : "Desconto do Método"
                                  }
                                  value={
                                    <span className="text-brand-green font-bold">
                                      -{" "}
                                      {formatCurrency(
                                        paymentMethodDiscountAmount,
                                      )}
                                    </span>
                                  }
                                />
                              )}
                              {!hasDetailedAmounts &&
                                effectivePaymentMethodExtraAmount > 0 && (
                                  <PaymentRow
                                    label="Taxa do Método"
                                    value={
                                      <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                        +{" "}
                                        {formatCurrency(
                                          effectivePaymentMethodExtraAmount,
                                        )}
                                      </span>
                                    }
                                  />
                                )}
                              {hasDetailedAmounts &&
                                detailedInterestAmount > 0 && (
                                  <PaymentRow
                                    label="Juros do Método"
                                    value={
                                      <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                        +{" "}
                                        {formatCurrency(detailedInterestAmount)}
                                      </span>
                                    }
                                  />
                                )}
                              {hasDetailedAmounts && detailedFeeAmount > 0 && (
                                <PaymentRow
                                  label="Taxa do Método"
                                  value={
                                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                      + {formatCurrency(detailedFeeAmount)}
                                    </span>
                                  }
                                />
                              )}
                              {hasDetailedAmounts &&
                                detailedFixedFeeAmount > 0 && (
                                  <PaymentRow
                                    label="Custo do Método"
                                    value={
                                      <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                        +{" "}
                                        {formatCurrency(detailedFixedFeeAmount)}
                                      </span>
                                    }
                                  />
                                )}

                              {changeAmount > 0.009 && (
                                <PaymentRow
                                  label="Troco"
                                  value={
                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                      {formatCurrency(changeAmount)}
                                    </span>
                                  }
                                />
                              )}
                              {wantsChange && payWithAmount !== null && (
                                <PaymentRow
                                  label="Troco Solicitado"
                                  value={
                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                      {formatCurrency(cashChangeAmount)} (para{" "}
                                      {formatCurrency(payWithAmount)})
                                    </span>
                                  }
                                />
                              )}
                              {order.is_refunded &&
                                Number(order.refunded_amount || 0) > 0 && (
                                  <PaymentRow
                                    label="Valor Reembolsado"
                                    value={
                                      <span className="text-brand-red font-bold">
                                        -{" "}
                                        {formatCurrency(
                                          order.refunded_amount || 0,
                                        )}
                                      </span>
                                    }
                                  />
                                )}

                              <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                                <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading">
                                  Total do Pedido
                                </span>
                                <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">
                                  {formatCurrency(order.total_amount)}
                                </span>
                              </div>
                            </div>
                          </FormSection>
                        </div>

                        <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 space-y-6 border-0 lg:border-l border-brand-border dark:border-dark-border">
                          {sourceServiceOrder && (
                            <InfoCard
                              title="Origem do Pedido"
                              message={`Ordem de Serviço #${sourceServiceOrder?.order_number || ""}`}
                              color="blue"
                              bottomElement={
                                <Button
                                  variant="link"
                                  onClick={() =>
                                    window.open(
                                      `/erp/ordens-de-servico?view=${sourceServiceOrder.id}`,
                                    )
                                  }
                                  type="button"
                                >
                                  Ver OS
                                </Button>
                              }
                            />
                          )}

                          {sourceQuote && (
                            <InfoCard
                              title="Origem do Pedido"
                              message={`Orçamento #${sourceQuote.quote_number}`}
                              color="blue"
                              bottomElement={
                                <Button
                                  variant="link"
                                  onClick={() =>
                                    window.open(
                                      `/erp/orcamentos?view=${sourceQuote.id}`,
                                    )
                                  }
                                  type="button"
                                >
                                  Ver Orçamento
                                </Button>
                              }
                            />
                          )}

                          {sourceSubscriptionId && (
                            <InfoCard
                              title="Origem do Pedido"
                              message={
                                order.payment_method === "Assinatura (Créditos)"
                                  ? "Assinatura • Créditos - sem cobrança adicional"
                                  : "Assinatura"
                              }
                              color="blue"
                              bottomElement={
                                <Button
                                  variant="link"
                                  onClick={() =>
                                    window.open(
                                      `/erp/recorrentes/assinaturas?tab=assinaturas&view=${sourceSubscriptionId}`,
                                    )
                                  }
                                  type="button"
                                >
                                  Ver Assinatura
                                </Button>
                              }
                            />
                          )}

                          {hasPendingPayment && (
                            <InfoCard
                              title="Valor ainda em aberto"
                              message={`Falta receber ${formatCurrency(remainingPaymentAmount)} para quitar este pedido.`}
                              color="orange"
                            />
                          )}

                          {(cleanNotes || cancelNote) && (
                            <InfoCard
                              title="Observações do Pedido"
                              message={[cleanNotes, cancelNote]
                                .filter(Boolean)
                                .join("\n")}
                              color="orange"
                            />
                          )}

                          {wantsChange && payWithAmount !== null && (
                            <InfoCard
                              title="Troco Necessário"
                              message={`Necessário ter ${formatCurrency(cashChangeAmount)} de troco para uma transação de ${formatCurrency(payWithAmount)}.`}
                              color="blue"
                            />
                          )}

                          <CustomerCard
                            customer={
                              order.customers ||
                              (order.customer_name
                                ? {
                                  name: order.customer_name,
                                  email: order.buyer_email || null,
                                  phone: null,
                                }
                                : null)
                            }
                            address={
                              order.customers?.addresses?.find(
                                (a: any) =>
                                  a.address_type === "primary" || a.is_default,
                              ) ||
                              order.customers?.addresses?.[0] ||
                              (order.delivery_address
                                ? parseAddressString(order.delivery_address)
                                : null)
                            }
                            billingAddress={order.customers?.addresses?.find(
                              (a: any) => a.address_type === "billing",
                            )}
                          />
                        </div>
                      </div>

                      {/* Mobile/Tablet View */}
                      <div className="lg:hidden space-y-6">
                        {/* 1. Steps (Timeline) */}
                        <FormSection title="" className="mt-0">
                          {(() => {
                            const activeSteps = timelineSteps.filter(
                              (s) => s.active,
                            );
                            const currentStep =
                              activeSteps[activeSteps.length - 1] ||
                              timelineSteps[0];
                            return (
                              <ListItem
                                title={currentStep.label}
                                description={
                                  currentStep.date
                                    ? `${currentStep.date} às ${currentStep.time}`
                                    : undefined
                                }
                                className="border-0 bg-transparent px-0 hover:bg-transparent"
                                showChevron={true}
                                onClick={() => setIsStepsSheetOpen(true)}
                                left={
                                  <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${order.delivery_status ===
                                      "delivery_failed"
                                      ? "bg-brand-red/10 text-brand-red"
                                      : "bg-brand-dark/10 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading"
                                      }`}
                                  >
                                    <div
                                      className={`w-2.5 h-2.5 rounded-full ${order.delivery_status ===
                                        "delivery_failed"
                                        ? "bg-brand-red"
                                        : "bg-brand-dark dark:bg-dark-heading"
                                        }`}
                                    />
                                  </div>
                                }
                              />
                            );
                          })()}
                        </FormSection>

                        {/* 1b. Origem da OS/Orçamento */}
                        {sourceServiceOrder && (
                          <FormSection title="" className="mt-0">
                            <InfoCard
                              title="Origem do Pedido"
                              message={`Ordem de Serviço #${sourceServiceOrder?.order_number || ""}`}
                              color="blue"
                              bottomElement={
                                <Button
                                  variant="link"
                                  onClick={() =>
                                    window.open(
                                      `/erp/ordens-de-servico?view=${sourceServiceOrder.id}`,
                                    )
                                  }
                                  type="button"
                                >
                                  Ver OS
                                </Button>
                              }
                            />
                          </FormSection>
                        )}

                        {sourceQuote && (
                          <FormSection title="" className="mt-0">
                            <InfoCard
                              title="Origem do Pedido"
                              message={`Orçamento #${sourceQuote.quote_number}`}
                              color="blue"
                              bottomElement={
                                <Button
                                  variant="link"
                                  onClick={() =>
                                    window.open(
                                      `/erp/orcamentos?view=${sourceQuote.id}`,
                                    )
                                  }
                                  type="button"
                                >
                                  Ver Orçamento
                                </Button>
                              }
                            />
                          </FormSection>
                        )}

                        {sourceSubscriptionId && (
                          <FormSection title="" className="mt-0">
                            <InfoCard
                              title="Origem do Pedido"
                              message={
                                order.payment_method === "Assinatura (Créditos)"
                                  ? "Assinatura • Créditos - sem cobrança adicional"
                                  : "Assinatura"
                              }
                              color="blue"
                              bottomElement={
                                <Button
                                  variant="link"
                                  onClick={() =>
                                    window.open(
                                      `/erp/recorrentes/assinaturas?tab=assinaturas&view=${sourceSubscriptionId}`,
                                    )
                                  }
                                  type="button"
                                >
                                  Ver Assinatura
                                </Button>
                              }
                            />
                          </FormSection>
                        )}

                        {/* 2. Observação */}
                        {(cleanNotes || cancelNote) && (
                          <FormSection title="" className="mt-0">
                            <InfoCard
                              title="Observações do Pedido"
                              message={[cleanNotes, cancelNote]
                                .filter(Boolean)
                                .join("\n")}
                              color="orange"
                            />
                          </FormSection>
                        )}

                        {/* 3. Cliente */}
                        {(() => {
                          const customerObj =
                            order.customers ||
                            (order.customer_name
                              ? {
                                name: order.customer_name,
                                email: order.buyer_email || null,
                                phone: null,
                              }
                              : null);
                          return customerObj ? (
                            <CustomerMobileBar
                              customer={customerObj}
                              address={
                                order.customers?.addresses?.find(
                                  (a: any) =>
                                    a.address_type === "primary" ||
                                    a.is_default,
                                ) ||
                                order.customers?.addresses?.[0] ||
                                (order.delivery_address
                                  ? parseAddressString(order.delivery_address)
                                  : null)
                              }
                              billingAddress={order.customers?.addresses?.find(
                                (a: any) => a.address_type === "billing",
                              )}
                            />
                          ) : null;
                        })()}

                        {/* 4. Itens do Pedido */}
                        <FormSection title="Itens do Pedido" className="mb-8">
                          <div className="space-y-4">
                            {paginatedItems.map((item: any) => {
                              const isService =
                                !!item.service_id ||
                                item.line_type === "service_booking" ||
                                item.line_type === "service" ||
                                Boolean(item.services) ||
                                item.products?.type === "service";
                              const scheduleInfo = isService
                                ? getServiceScheduleInfo(item, order)
                                : null;
                              return (
                                <div
                                  key={item.id}
                                  className="flex items-start gap-4"
                                >
                                  <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border">
                                    <img
                                      src={getR2ImageUrl(
                                        item.product_variants?.variant_options?.image ||
                                        item.product_variants?.image ||
                                        item.image ||
                                        item.products?.images ||
                                        item.services?.images ||
                                        null,
                                        "thumbnail",
                                      )}
                                      className="w-full h-full object-cover rounded-full"
                                      alt={item.product_name}
                                      onError={(e: any) => {
                                        e.target.src =
                                          "https://img.dudit.com.br/static/Placeholder.png";
                                      }}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                          {item.product_name ||
                                            "Produto sem nome"}
                                        </h4>
                                        {item.is_gift && (
                                          <Badge variant="blue" icon={null}>
                                            Brinde
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading">
                                        {(() => {
                                          const displayPrice =
                                            getItemDiscountedPrice(item);
                                          const basePrice = Number(
                                            item.product_price || 0,
                                          );
                                          const displaySubtotal =
                                            displayPrice *
                                            Number(item.quantity || 1);
                                          if (item.is_gift) {
                                            return (
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-xs text-brand-inactive-text line-through font-normal">
                                                  {formatCurrency(
                                                    item.original_price || 0,
                                                  )}
                                                </span>
                                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                                  Grátis
                                                </span>
                                              </div>
                                            );
                                          }
                                          if (hasItemDiscount) {
                                            return (
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-xs text-brand-inactive-text line-through font-normal">
                                                  {formatCurrency(
                                                    item.subtotal ||
                                                    basePrice * item.quantity,
                                                  )}
                                                </span>
                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                  {formatCurrency(
                                                    displaySubtotal,
                                                  )}
                                                </span>
                                              </div>
                                            );
                                          }
                                          return formatCurrency(
                                            item.subtotal ||
                                            basePrice * item.quantity,
                                          );
                                        })()}
                                      </span>
                                    </div>
                                    {isService ? (
                                      scheduleInfo ? (
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mb-2">
                                          Data do agendamento:{" "}
                                          {formatServiceSchedule(
                                            scheduleInfo.date,
                                            scheduleInfo.time,
                                          )}
                                        </div>
                                      ) : (
                                        <div className="my-1.5 mb-2">
                                          <Button
                                            variant="link"
                                            onClick={() => {
                                              setSelectedOrderItemForAppointment(
                                                item,
                                              );
                                              setIsAppointmentSheetOpen(true);
                                            }}
                                            leftIcon={
                                              <CalendarIcon size={12} />
                                            }
                                            className="text-xs p-0"
                                          >
                                            Criar agendamento
                                          </Button>
                                        </div>
                                      )
                                    ) : (
                                      <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">
                                        SKU:{" "}
                                        {item.product_variants?.sku ||
                                          item.products?.sku ||
                                          item.sku ||
                                          "N/A"}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 text-xs mt-1">
                                      <span className="text-brand-inactive-text">
                                        {formatProductQuantity(
                                          item.quantity,
                                          item.products?.unit,
                                        )}
                                      </span>
                                      <span className="text-brand-border dark:text-dark-border">
                                        |
                                      </span>
                                      <span className="font-medium text-brand-dark dark:text-dark-heading">
                                        {(() => {
                                          const displayPrice =
                                            getItemDiscountedPrice(item);
                                          const basePrice = Number(
                                            item.product_price || 0,
                                          );
                                          if (item.is_gift) {
                                            return (
                                              <span className="flex items-center gap-1.5 inline-flex">
                                                <span className="text-xs text-brand-inactive-text line-through font-normal">
                                                  {formatCurrency(
                                                    item.original_price || 0,
                                                  )}
                                                </span>
                                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                  Grátis
                                                </span>
                                              </span>
                                            );
                                          }
                                          if (hasItemDiscount) {
                                            return (
                                              <span className="flex items-center gap-1.5 inline-flex">
                                                <span className="text-xs text-brand-inactive-text line-through font-normal">
                                                  {formatProductUnitPrice(
                                                    basePrice,
                                                    item.products?.unit,
                                                  )}
                                                </span>
                                                <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                                  {formatProductUnitPrice(
                                                    displayPrice,
                                                    item.products?.unit,
                                                  )}
                                                </span>
                                              </span>
                                            );
                                          }
                                          return formatProductUnitPrice(
                                            basePrice,
                                            item.products?.unit,
                                          );
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </FormSection>

                        {totalItemPages > 1 && (
                          <div className="mt-2">
                            <Pagination
                              currentPage={itemPage}
                              totalPages={totalItemPages}
                              onPageChange={setItemPage}
                              inline
                            />
                          </div>
                        )}

                        {/* 5. Detalhes do Pagamento */}
                        <FormSection
                          title="Detalhes do Pagamento"
                          headerRight={
                            hasMinimumPlan(planSlug, "crescer") ? (
                              <button
                                onClick={loadFinancialBreakdown}
                                className="text-xs font-bold text-brand-link dark:text-blue-400 hover:underline shrink-0"
                              >
                                {financialLoading
                                  ? "Carregando..."
                                  : showFinancialBreakdown
                                    ? "Ocultar lucro líquido"
                                    : "Ver lucro líquido"}
                              </button>
                            ) : null
                          }
                          hasSeparator
                          className="mt-0"
                        >
                          <div className="space-y-3">
                            <PaymentRow
                              label="Método de Pagamento"
                              value={renderPaymentMethodValue()}
                            />

                            {shouldShowSinal(depositSummary) &&
                              depositSummary.depositAmount > 0.009 && (
                                <PaymentRow
                                  label="Sinal"
                                  value={
                                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm flex items-center gap-1.5">
                                      {formatCurrency(
                                        depositSummary.depositAmount,
                                      )}
                                      <span
                                        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${depositSummary.sinalPaid ? "bg-brand-green/10 text-brand-green" : "bg-brand-orange/10 text-brand-orange"}`}
                                      >
                                        {depositSummary.sinalPaid
                                          ? "pago"
                                          : "pendente"}
                                      </span>
                                    </span>
                                  }
                                />
                              )}

                            {isDepositOrder && depositSummary.sinalPaid && (
                              <PaymentRow
                                label="Saldo"
                                value={
                                  <span className="text-brand-dark dark:text-dark-heading font-bold text-sm flex items-center gap-1.5">
                                    {formatCurrency(
                                      depositSummary.remainingBalance,
                                    )}
                                    <span
                                      className={`text-xs font-semibold px-1.5 py-0.5 rounded ${depositSummary.remainingBalance <= 0.009 ? "bg-brand-green/10 text-brand-green" : "bg-brand-orange/10 text-brand-orange"}`}
                                    >
                                      {depositSummary.remainingBalance <= 0.009
                                        ? "pago"
                                        : "pendente"}
                                    </span>
                                  </span>
                                }
                              />
                            )}

                            {isMercadoPago && (
                              <>
                                {order.mp_payment_status && (
                                  <PaymentRow
                                    label="Status do Pagamento (MP)"
                                    value={
                                      <span className="text-brand-dark dark:text-dark-heading font-medium text-sm">
                                        {translateMpStatus(
                                          order.mp_payment_status,
                                        )}
                                        {order.mp_payment_status_detail &&
                                          translateMpStatusDetail(
                                            order.mp_payment_status_detail,
                                          ) !==
                                          translateMpStatus(
                                            order.mp_payment_status,
                                          )
                                          ? ` (${translateMpStatusDetail(order.mp_payment_status_detail)})`
                                          : ""}
                                        {order.mp_date_approved && (
                                          <span className="text-brand-inactive-text dark:text-dark-body font-normal ml-1">
                                            em{" "}
                                            {formatDateTime(
                                              order.mp_date_approved,
                                            )}
                                          </span>
                                        )}
                                      </span>
                                    }
                                  />
                                )}
                                {mpLeg?.cardLastDigits &&
                                  (() => {
                                    const brand = getCardBrandInfo(
                                      mpLeg.mpPaymentMethodId ||
                                      mpLeg.paymentMethodId ||
                                      null,
                                    );
                                    return (
                                      <PaymentRow
                                        label="Cartão"
                                        value={
                                          <span className="text-brand-dark dark:text-dark-heading font-medium text-sm flex items-center gap-1.5 justify-end">
                                            {brand && (
                                              <img
                                                src={`https://img.dudit.com.br/static/icons/payments/${brand.icon}`}
                                                alt={brand.label}
                                                className="w-5 h-4 object-contain"
                                              />
                                            )}
                                            <span>
                                              •••• {mpLeg.cardLastDigits}
                                            </span>
                                          </span>
                                        }
                                      />
                                    );
                                  })()}
                                {(order.mp_installments || installmentCount) >
                                  1 && (
                                    <PaymentRow
                                      label="Parcelas"
                                      value={
                                        <span className="text-brand-dark dark:text-dark-heading font-medium text-sm flex items-center gap-2 justify-end">
                                          <span>
                                            {order.mp_installments ||
                                              installmentCount}
                                            x de{" "}
                                            {formatCurrency(
                                              mpLeg?.installmentAmount ||
                                              Number(mpLeg?.amount || 0) /
                                              (order.mp_installments ||
                                                installmentCount),
                                            )}
                                          </span>
                                          <button
                                            onClick={() =>
                                              setShowInstallmentModal(true)
                                            }
                                            className="text-xs font-bold text-brand-link dark:text-blue-400 hover:underline shrink-0"
                                          >
                                            Ver parcelas
                                          </button>
                                        </span>
                                      }
                                    />
                                  )}
                                {showFinancialBreakdown &&
                                  order.mp_total_fee_amount != null && (
                                    <PaymentRow
                                      label="Taxa do Mercado Pago"
                                      value={
                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium text-sm">
                                          {formatCurrency(
                                            order.mp_total_fee_amount,
                                          )}
                                        </span>
                                      }
                                    />
                                  )}
                                {showFinancialBreakdown &&
                                  order.mp_net_received_amount != null && (
                                    <PaymentRow
                                      label="Valor Líquido Recebido"
                                      value={
                                        <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                          {formatCurrency(
                                            order.mp_net_received_amount,
                                          )}
                                        </span>
                                      }
                                    />
                                  )}
                              </>
                            )}

                            {(() => {
                              const paidBreakdown = paymentBreakdown.filter(
                                (entry: any) =>
                                  Number(
                                    entry.amountReceived ?? entry.amount ?? 0,
                                  ) > 0.009,
                              );
                              if (
                                paidBreakdown.length <= 1 &&
                                !(
                                  paidBreakdown.length === 1 &&
                                  Number(order.paid_amount || 0) > 0.009 &&
                                  remainingPaymentAmount > 0.009
                                )
                              )
                                return null;
                              return (
                                <PaymentRow
                                  label="Valores por meio"
                                  value={
                                    <div className="flex flex-col gap-1">
                                      {paidBreakdown.map(
                                        (entry: any, index: number) => {
                                          const received = Number(
                                            entry.amountReceived ??
                                            entry.amount ??
                                            0,
                                          );
                                          const baseAmount = Number(
                                            entry.amount || 0,
                                          );
                                          const displayAmount =
                                            received > 0.009
                                              ? received
                                              : baseAmount;
                                          return (
                                            <span
                                              key={`${entry.method}-${index}`}
                                              className="text-brand-dark dark:text-dark-heading font-bold text-sm"
                                            >
                                              {formatPaymentMethodLabel(
                                                entry.method,
                                                null,
                                              )}
                                              : {formatCurrency(displayAmount)}
                                              {baseAmount > 0.009 &&
                                                received > 0.009 &&
                                                Math.abs(baseAmount - received) >
                                                0.009 ? (
                                                <span className="text-brand-muted font-normal">
                                                  {" "}
                                                  (de{" "}
                                                  {formatCurrency(baseAmount)})
                                                </span>
                                              ) : null}
                                            </span>
                                          );
                                        },
                                      )}
                                    </div>
                                  }
                                />
                              );
                            })()}

                            <PaymentRow
                              label="Valor Original"
                              value={
                                <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                  {formatCurrency(subtotalValue)}
                                </span>
                              }
                            />

                            {!hasOnlyServices && (
                              <PaymentRow
                                label="Tipo de Entrega"
                                value={
                                  <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                    {order.delivery_type === "pickup"
                                      ? "Retirada no local"
                                      : "Entrega no endereço"}
                                  </span>
                                }
                              />
                            )}

                            {(Number(order.delivery_fee || 0) > 0 ||
                              order.delivery_payer === "seller" ||
                              Number(
                                order.delivery_breakdown?.originalFee ||
                                order.delivery_breakdown?.deliverySubsidy ||
                                0,
                              ) > 0) && (
                                <PaymentRow
                                  label="Valor da Entrega"
                                  value={
                                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm flex items-center gap-1.5 flex-wrap">
                                      {Number(order.delivery_fee || 0) > 0
                                        ? formatCurrency(order.delivery_fee)
                                        : formatCurrency(
                                          Number(
                                            order.delivery_breakdown
                                              ?.originalFee ||
                                            order.delivery_breakdown
                                              ?.deliverySubsidy ||
                                            0,
                                          ),
                                        )}
                                      {Number(order.delivery_fee || 0) === 0 && (
                                        <span className="text-brand-green">
                                          - Frete Grátis (Subsidiado pela loja)
                                        </span>
                                      )}
                                      {Number(order.delivery_fee || 0) > 0 &&
                                        order.delivery_payer === "seller" && (
                                          <span className="text-brand-orange">
                                            - Subsidiado pela loja
                                          </span>
                                        )}
                                      {Number(
                                        order.delivery_breakdown?.distanceKm || 0,
                                      ) > 0 && (
                                          <span className="text-xs text-brand-muted font-normal">
                                            ({order.delivery_breakdown.distanceKm}{" "}
                                            km)
                                          </span>
                                        )}
                                    </span>
                                  }
                                />
                              )}

                            {Number(order.additional_costs || 0) > 0 && (
                              <PaymentRow
                                label="Outros Custos"
                                value={
                                  <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                    {formatCurrency(order.additional_costs)}
                                  </span>
                                }
                              />
                            )}

                            {Number(order.discount_value || 0) > 0 && (
                              <PaymentRow
                                label="Desconto do Pedido"
                                value={
                                  <span className="text-brand-green font-bold">
                                    - {formatCurrency(order.discount_value)}
                                  </span>
                                }
                              />
                            )}
                            {couponDiscountAmount > 0 && (
                              <PaymentRow
                                label="Desconto por Cupom"
                                value={
                                  <span className="text-brand-green font-bold">
                                    - {formatCurrency(couponDiscountAmount)}
                                  </span>
                                }
                              />
                            )}
                            {paymentMethodDiscountAmount > 0 && (
                              <PaymentRow
                                label="Desconto do Método"
                                value={
                                  <span className="text-brand-green font-bold">
                                    -{" "}
                                    {formatCurrency(
                                      paymentMethodDiscountAmount,
                                    )}
                                  </span>
                                }
                              />
                            )}
                            {!hasDetailedAmounts &&
                              effectivePaymentMethodExtraAmount > 0 && (
                                <PaymentRow
                                  label="Taxa do Método"
                                  value={
                                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                      +{" "}
                                      {formatCurrency(
                                        effectivePaymentMethodExtraAmount,
                                      )}
                                    </span>
                                  }
                                />
                              )}
                            {hasDetailedAmounts &&
                              detailedInterestAmount > 0 && (
                                <PaymentRow
                                  label="Juros do Método"
                                  value={
                                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                      + {formatCurrency(detailedInterestAmount)}
                                    </span>
                                  }
                                />
                              )}
                            {hasDetailedAmounts && detailedFeeAmount > 0 && (
                              <PaymentRow
                                label="Taxa do Método"
                                value={
                                  <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                    + {formatCurrency(detailedFeeAmount)}
                                  </span>
                                }
                              />
                            )}
                            {hasDetailedAmounts &&
                              detailedFixedFeeAmount > 0 && (
                                <PaymentRow
                                  label="Custo do Método"
                                  value={
                                    <span className="text-brand-dark dark:text-dark-heading font-bold text-sm">
                                      + {formatCurrency(detailedFixedFeeAmount)}
                                    </span>
                                  }
                                />
                              )}

                            {changeAmount > 0.009 && (
                              <PaymentRow
                                label="Troco"
                                value={
                                  <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                    {formatCurrency(changeAmount)}
                                  </span>
                                }
                              />
                            )}
                            {wantsChange && payWithAmount !== null && (
                              <PaymentRow
                                label="Troco Solicitado"
                                value={
                                  <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                    {formatCurrency(cashChangeAmount)} (para{" "}
                                    {formatCurrency(payWithAmount)})
                                  </span>
                                }
                              />
                            )}
                            {order.is_refunded &&
                              Number(order.refunded_amount || 0) > 0 && (
                                <PaymentRow
                                  label="Valor Reembolsado"
                                  value={
                                    <span className="text-brand-red font-bold">
                                      -{" "}
                                      {formatCurrency(
                                        order.refunded_amount || 0,
                                      )}
                                    </span>
                                  }
                                />
                              )}

                            <div className="flex justify-between items-center pt-4 border-t border-brand-border dark:border-dark-border mt-3">
                              <span className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading">
                                Total do Pedido
                              </span>
                              <span className="font-bold text-2xl text-brand-dark dark:text-dark-heading tracking-tight">
                                {formatCurrency(order.total_amount)}
                              </span>
                            </div>
                          </div>
                        </FormSection>
                      </div>
                    </FadeIn>
                  </TabsContent>

                  <TabsContent value="history" className="mt-0">
                    <FadeIn key="history">
                      <OrderHistoryTab
                        entries={historyEntries}
                        loading={historyLoading}
                      />
                    </FadeIn>
                  </TabsContent>

                  <TabsContent value="attachments" className="mt-0">
                    <FadeIn key="attachments">
                      <OrderAttachmentsTab
                        orderId={order.id}
                        partnerId={partnerId}
                        isEditing={false}
                        readOnly={true}
                      />
                    </FadeIn>
                  </TabsContent>

                  <TabsContent value="delivery" className="mt-0">
                    <FadeIn key="delivery">
                      {(() => {
                        const ds = deliverySummary;
                        const isPickup = order.delivery_type === "pickup";
                        const outboundShipment =
                          getOutboundCarrierShipment(order);
                        const carrierDelivery = isCarrierDeliveryOrder(order);
                        const carrier = carrierDelivery
                          ? {
                            shipment: outboundShipment,
                            breakdown: order.delivery_breakdown,
                          }
                          : null;

                        const erpDriverInfo: DeliveryDriverInfo = order
                          .platform_driver?.isPlatformDriver
                          ? {
                            type: "platform",
                            name:
                              order.platform_driver.fullName ||
                              order.platform_driver.name ||
                              "Entregador",
                            avatarUrl:
                              order.platform_driver.avatarUrl ||
                              order.platform_driver.avatar_url ||
                              null,
                            isPlatformDriver: true,
                            totalDeliveries:
                              order.platform_driver.totalDeliveries ??
                              order.platform_driver.total_deliveries,
                            vehicleType:
                              order.platform_driver.vehicleType ||
                              order.platform_driver.vehicle_type,
                            driverStatus: order.platform_driver.status,
                            phone: order.platform_driver.phone,
                            platformDriverData: {
                              id:
                                order.platform_driver.id ||
                                order.platform_driver_id,
                              fullName:
                                order.platform_driver.fullName ||
                                order.platform_driver.name ||
                                "Entregador",
                              phone: order.platform_driver.phone,
                              avatarUrl:
                                order.platform_driver.avatarUrl ||
                                order.platform_driver.avatar_url ||
                                null,
                              vehicleType:
                                order.platform_driver.vehicleType ||
                                order.platform_driver.vehicle_type,
                              totalDeliveries:
                                order.platform_driver.totalDeliveries ??
                                order.platform_driver.total_deliveries,
                              status: order.platform_driver.status,
                              isPlatformDriver: true,
                              isPendingAcceptance:
                                order.platform_driver.isPendingAcceptance,
                            },
                          }
                          : ds?.driverName
                            ? {
                              type: "store",
                              name: ds.driverName,
                              avatarUrl: null,
                              isPlatformDriver: false,
                            }
                            : {
                              type: "none",
                              name: "Entrega própria",
                              isPlatformDriver: false,
                            };

                        return (
                          <div className="grid grid-cols-12 gap-y-6 lg:gap-y-0">
                            <div
                              className={`col-span-12 ${!isPickup ? "lg:col-span-8 lg:pr-12" : ""} space-y-6`}
                            >
                              <DeliveryStatusTimeline
                                deliveryStatus={
                                  ds?.status || order.delivery_status || ""
                                }
                                isPickup={isPickup}
                                isPaid={isPaidOrder}
                                orderCreatedAt={order.created_at}
                                orderUpdatedAt={order.updated_at}
                                carrier={carrier}
                              />

                              <OrderFiscalSection orderId={orderId} />

                              {!isPickup && (
                                <DeliveryDriverSection
                                  driverInfo={erpDriverInfo}
                                  deliveryStatus={order.delivery_status || ""}
                                  formatCurrency={formatCurrency}
                                  carrier={carrier}
                                  carrierLabelAction={
                                    carrierDelivery ? (
                                      <CarrierLabelAction
                                        orderId={orderId}
                                        partnerId={partnerId}
                                        onRefresh={refreshOrder}
                                      />
                                    ) : undefined
                                  }
                                />
                              )}
                            </div>

                            {!isPickup && (
                              <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 space-y-6 border-0 lg:border-l border-brand-border dark:border-dark-border">
                                <DeliverySummarySection
                                  order={order}
                                  driverInfo={erpDriverInfo}
                                  formatCurrency={formatCurrency}
                                  deliveryNumber={ds?.deliveryNumber}
                                  carrier={carrier}
                                  variant="sidebar"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </FadeIn>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </Tabs>
        </div>
      </FadeIn>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
        <ActionsDropdown
          fullWidth
          onPrint={() => setPrintModalOrderId(order.id || order.order_number)}
          onEdit={
            canEdit && canRbac("orders.edit")
              ? () => onEditOrder(order)
              : undefined
          }
          onCancel={
            order.situation === "cancelled"
              ? () => onOpenNotes(order)
              : () => onCancelOrder(order)
          }
          onPaymentStatus={
            order.situation !== "cancelled"
              ? () => onUpdatePaymentStatus(order)
              : undefined
          }
          onDeliveryStatus={
            order.situation !== "cancelled" && !hasOnlyServices
              ? () => onUpdateDeliveryStatus(order)
              : undefined
          }
          cancelLabel={
            order.situation === "cancelled" ? "Observação" : "Cancelar"
          }
          trigger={
            <Button variant="outline" className="w-full">
              <ThreeDotsIcon className="w-4 h-4 mr-2" />
              Opções
            </Button>
          }
        />
      </div>

      <BottomSheet
        isOpen={isStepsSheetOpen}
        onClose={() => setIsStepsSheetOpen(false)}
        title="Status do Pedido"
      >
        <div className="rounded-2xl overflow-hidden border border-brand-border dark:border-dark-border mb-5">
          <div className="bg-brand-gray dark:bg-dark-border/50 p-4 border-b border-brand-border dark:border-dark-border">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <span className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                  {order.order_source === "Marketplace"
                    ? "Origem da venda:"
                    : "Responsável pela venda:"}
                </span>
                <div className="flex items-center gap-1.5 font-bold text-brand-dark dark:text-dark-heading text-sm">
                  {order.order_source === "Marketplace"
                    ? order.order_source || "Marketplace"
                    : order.seller_name || "Não informado"}
                </div>
              </div>
              {order.order_source !== "Marketplace" && (
                <div className="flex items-center gap-1.5 text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                  Origem da venda:
                  {sourceServiceOrder ? (
                    <strong className="text-brand-dark dark:text-dark-heading">
                      Ordem de Serviço #{sourceServiceOrder?.order_number || ""}
                    </strong>
                  ) : sourceQuote ? (
                    <strong className="text-brand-dark dark:text-dark-heading">
                      Orçamento {sourceQuote.quote_number}
                    </strong>
                  ) : sourceSubscriptionId ? (
                    <strong className="text-brand-dark dark:text-dark-heading">
                      Assinatura
                    </strong>
                  ) : (
                    <strong className="text-brand-dark dark:text-dark-heading">
                      {normalizeOrderSource(order.order_source)}
                    </strong>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-0 my-4 px-2">
          {timelineSteps.map((step, idx) => {
            const isLastFailed =
              order.delivery_status === "delivery_failed" &&
              idx === timelineSteps.length - 1;
            return (
              <div
                key={idx}
                className="relative pl-6 pb-6 border-l-2 border-brand-border dark:border-dark-border last:border-l-transparent"
              >
                <div
                  className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 z-10 transition-colors duration-300 flex items-center justify-center ${step.active ? (isLastFailed ? "bg-brand-red border-brand-red" : "bg-brand-dark dark:bg-dark-heading border-brand-dark dark:border-dark-heading") : "bg-white dark:bg-dark-surface border-gray-300 dark:border-dark-border"}`}
                >
                  {step.active && (
                    <div className="w-1.5 h-1.5 bg-white dark:bg-dark-surface rounded-full"></div>
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <span
                    className={`text-sm font-semibold ${step.active ? (isLastFailed ? "text-brand-red" : "text-brand-dark dark:text-dark-heading") : "text-gray-400 dark:text-dark-body"}`}
                  >
                    {step.label}
                  </span>
                  {step.date ? (
                    <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                      {step.date} às {step.time}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-dark-body/50 mt-0.5">
                      -
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </BottomSheet>

      {printModalOrderId && (
        <SaleReceiptPrintModal
          isOpen={!!printModalOrderId}
          onClose={() => setPrintModalOrderId(null)}
          orderId={printModalOrderId}
        />
      )}

      {isAppointmentSheetOpen && (
        <AppointmentSheet
          mode="create"
          defaultDate={appointmentDefaultDate}
          linkedOrderId={order?.id}
          linkedOrderItemId={selectedOrderItemForAppointment?.id}
          allowedOrderServices={(() => {
            const rawItems =
              order?.order_items || order?.items || order?.orderItems || [];
            const filtered = rawItems.filter(
              (i: any) =>
                Boolean(i.service_id || i.serviceId) ||
                i.line_type === "service_booking" ||
                i.line_type === "service" ||
                i.is_service === true ||
                i.item_type === "service" ||
                Boolean(i.services) ||
                i.products?.type === "service" ||
                (selectedOrderItemForAppointment &&
                  i.id === selectedOrderItemForAppointment.id),
            );
            if (
              selectedOrderItemForAppointment &&
              !filtered.some(
                (i: any) => i.id === selectedOrderItemForAppointment.id,
              )
            ) {
              filtered.unshift(selectedOrderItemForAppointment);
            }
            return filtered.map((i: any) => ({
              id: i.service_id || i.serviceId || i.product_id || i.id,
              orderItemId: i.id,
              order_item_id: i.id,
              name: i.product_name || i.services?.name || i.name || "Serviço",
              price: Number(i.product_price || i.subtotal || i.price || 0),
              duration:
                i.services?.duration_minutes ||
                i.duration_minutes ||
                i.duration ||
                30,
              category_id: i.services?.category_id || null,
            }));
          })()}
          preselectedClient={
            order?.customer_id || order?.buyer_id || order?.customer_name
              ? {
                id: order?.customer_id || order?.buyer_id || null,
                name: order?.customer_name || "Cliente",
              }
              : null
          }
          partnerId={partnerId}
          storeId={order?.store_id}
          onClose={() => {
            setIsAppointmentSheetOpen(false);
            setSelectedOrderItemForAppointment(null);
          }}
          onSave={handleSaveAppointmentFromOrder}
          onEnterSelectionMode={() => { }}
        />
      )}

      <DefaultModal
        isOpen={showInstallmentModal}
        onClose={() => setShowInstallmentModal(false)}
        title="Parcelas - Cartão de Crédito"
        maxWidth="md"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border dark:border-dark-border">
                <th className="text-left py-2 px-3 text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                  Parcela
                </th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                  Vencimento
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              {buildInstallmentSchedule().map((inst) => (
                <tr
                  key={inst.number}
                  className="border-b border-brand-border/50 dark:border-dark-border/50 last:border-0"
                >
                  <td className="py-2.5 px-3 text-brand-dark dark:text-dark-heading font-medium">
                    {inst.number}/{inst.total}
                  </td>
                  <td className="py-2.5 px-3 text-brand-inactive-text dark:text-dark-body">
                    {inst.dueDate}
                  </td>
                  <td className="py-2.5 px-3 text-right text-brand-dark dark:text-dark-heading font-medium">
                    {formatCurrency(inst.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DefaultModal>

      <DefaultModal
        isOpen={showFinancialBreakdown && !!financialData}
        onClose={() => setShowFinancialBreakdown(false)}
        title="Lucro líquido"
        maxWidth="2xl"
      >
        <FinancialBreakdownDisplay
          data={financialData!}
          formatCurrency={formatCurrency}
        />
      </DefaultModal>
    </>
  );
}

function FinancialBreakdownDisplay({
  data,
  formatCurrency,
}: {
  data: FinancialBreakdownData;
  formatCurrency: (v: number) => string;
}) {
  const Section = ({
    section,
  }: {
    section: FinancialBreakdownData["revenue"];
  }) => (
    <div className="space-y-1.5">
      <h4 className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-1.5">
        {section.label}
      </h4>
      {section.lines.map((line, i) => (
        <div key={i} className="flex justify-between text-[13px]">
          <span className="text-brand-inactive-text dark:text-dark-body">
            {line.label}
          </span>
          <span
            className={`font-semibold ${line.value >= 0 ? "text-brand-dark dark:text-dark-heading" : "text-brand-red"}`}
          >
            {line.value >= 0
              ? formatCurrency(line.value)
              : `- ${formatCurrency(Math.abs(line.value))}`}
          </span>
        </div>
      ))}
      {section.total != null && (
        <div className="flex justify-between text-[13px] font-bold pt-1.5 border-t border-brand-border/50 dark:border-dark-border/50 mt-1.5">
          <span className="text-brand-dark dark:text-dark-heading">
            {section.label} total
          </span>
          <span
            className={
              section.total >= 0 ? "text-brand-green" : "text-brand-red"
            }
          >
            {section.total >= 0
              ? formatCurrency(section.total)
              : `- ${formatCurrency(Math.abs(section.total))}`}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="mt-4 mb-2 bg-brand-gray/40 dark:bg-dark-border/10 rounded-xl border border-brand-border/40 dark:border-dark-border/40 p-4 space-y-4 text-sm">
      <Section section={data.revenue} />

      <div className="border-t border-brand-border/50 dark:border-dark-border/50" />

      <Section section={data.discounts} />

      <div className="border-t border-brand-border/50 dark:border-dark-border/50" />

      <Section section={data.costs} />

      <div className="border-t-2 border-brand-border dark:border-dark-border" />

      <div className="space-y-1.5">
        <div className="flex justify-between text-[13px] font-bold pt-1">
          <span className="text-brand-inactive-text dark:text-dark-body">
            Total das deduções
          </span>
          <span className="text-brand-red">
            {formatCurrency(Math.abs(data.totalDeductions))}
          </span>
        </div>
      </div>

      <div className="border-t-2 border-brand-dark/20 dark:border-dark-heading/20" />

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm font-bold">
          <span className="text-brand-dark dark:text-dark-heading">
            Lucro líquido
          </span>
          <span
            className={
              data.netProfit >= 0 ? "text-brand-green" : "text-brand-red"
            }
          >
            {data.netProfit >= 0
              ? formatCurrency(data.netProfit)
              : `- ${formatCurrency(Math.abs(data.netProfit))}`}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-brand-inactive-text dark:text-dark-body">
            Margem líquida
          </span>
          <span
            className={`font-bold ${data.netMargin >= 0 ? "text-brand-green" : "text-brand-red"}`}
          >
            {data.netMargin >= 0
              ? `${data.netMargin.toFixed(2)}%`
              : `-${Math.abs(data.netMargin).toFixed(2)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}
