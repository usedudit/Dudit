"use client"

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    ChevronRightIcon, CreditCardIcon, XIcon, CheckCircleIcon, ClockIcon, AlertCircleIcon, MoneyIcon,
    WhatsappIcon, TruckIcon, ReturnIcon, RepeatIcon, MotorbikeIcon
} from '@/lib/icons';
import { motion } from 'framer-motion';
import { Button, Spinner, FormSection, ListItem, Tabs, TabsList, TabsTrigger, TabsContent, Input, FormDropdown, Checkbox, Badge, DefaultModal, QuantitySelector, ThreeDotsLoader, IconPlaceholder, Tooltip, InfoCard, AlertModal, FormTextarea } from '@/components/reusable';
import ProductImagesSection from '@/components/erp/product/ProductImagesSection';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import Link from 'next/link';
import { PaymentWrapper } from '@/components/PaymentWrapper';
import { createMarketplaceCancellationRequestAction, createMarketplaceReturnRequestAction } from '@/app/actions/erp/returns';
import { cancelBuyerOrderAction, confirmOrderFulfillmentAction, getOrderHistoryForBuyerAction } from '@/app/actions/marketplace/orders';
import { getPartnerReturnPolicyPublicAction } from '@/app/actions/marketplace/store-policies';
import { getOrderAttachmentsAction, getOrderAttachmentUrlAction } from '@/app/actions/erp/orders';
import { FileIcon, ShieldIcon } from '@/lib/icons';
import { formatFileSize } from '@/components/erp/orders/OrderAttachmentsTab';
import { HistoryTimeline } from '@/components/erp/shared/HistoryTimeline';
import { getProductUrl, getStoreUrl, getServiceUrl, getPlanUrl } from '@/lib/utils/url-generator';
import { useR2Upload } from '@/hooks/use-r2-upload';
import { canRequestOrderCancellation, canRequestPostFulfillmentResolution } from '@/lib/returns/calculations';
import { getPrimaryProductDisplayImage } from '@/lib/utils/product-display-images';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate, formatFullDate, formatTime, formatQuantityWithUnit, formatUnitPriceWithUnit, isStoreDeleted, resolveTimelineActorName, humanizeTimelineChangeLine, isInternalStockTimelineLine, isInternalErpIntegrationTimelineEntry, isInternalErpIntegrationTimelineLine } from '@/lib/utils';
import { formatPaymentMethodLabel } from '@/lib/utils/payment-method-label';
import { ReportReturnModal } from '@/components/marketplace/ReportReturnModal';
import { MarketplaceExchangeProductPicker, type MarketplaceSelectedExchangeItem } from '@/components/marketplace/MarketplaceExchangeProductPicker';
import { BuyerReturnRequestTab } from '@/components/marketplace/BuyerReturnRequestTab';
import { canReportReturnToDudit, getShippingPayerLabel } from '@/lib/returns/policy';
import {
    getReverseLogisticsMethodLabel,
    getReverseLogisticsStatusLabel,
    getReverseLogisticsCustomerDescription,
} from '@/lib/returns/types';
import { hasReceivedMpPayment, getOrderDepositSummary, shouldShowSinal, type OrderDepositSummary } from '@/lib/payments/order-financial-state';
import {
    DeliveryStatusTimeline,
    DeliveryDriverSection,
    DeliverySummarySection,
    getOutboundCarrierShipment,
    isCarrierDeliveryOrder,
    type DeliveryDriverInfo,
} from "@/components/erp/shared/DeliveryTabContent"
import { UserProfileImage } from '@/lib/utils/UserProfileImage';

interface MyOrderDetailPageProps {
    order: any;
    onBack: () => void;
}

type ReturnReasonCategory =
    | "buyer_remorse"
    | "size_fit"
    | "wrong_item"
    | "defective"
    | "damaged"
    | "not_as_described"
    | "missing_parts"
    | "arrived_late"
    | "other";

const RETURN_REASON_OPTIONS = [
    { value: "wrong_item", label: "Item errado" },
    { value: "defective", label: "Item com defeito" },
    { value: "damaged", label: "Item danificado" },
    { value: "different_from_description", label: "Diferente da descrição" },
    { value: "missing_parts", label: "Faltam partes" },
    { value: "arrived_late", label: "Chegou atrasado" },
    { value: "changed_mind", label: "Mudou de ideia" },
    { value: "other", label: "Outro" },
];

const RETURN_REASON_CATEGORY_MAP: Record<string, ReturnReasonCategory> = {
    wrong_item: "wrong_item",
    defective: "defective",
    damaged: "damaged",
    different_from_description: "not_as_described",
    missing_parts: "missing_parts",
    arrived_late: "arrived_late",
    changed_mind: "buyer_remorse",
    other: "other",
};

const getStatusConfig = (status: string, depositSummary?: OrderDepositSummary | null) => {
    switch (status) {
        case 'paid': return { label: 'Pago', color: 'text-brand-green', icon: CheckCircleIcon, statusText: 'Aprovado' };
        case 'pending': return { label: 'Pendente', color: 'text-brand-orange', icon: ClockIcon, statusText: 'Aguardando pagamento' };
        case 'payment_failed': return { label: 'Pagamento Recusado', color: 'text-brand-red', icon: XIcon, statusText: 'Tente outro método de pagamento' };
        case 'partially_paid': return {
            label: 'Parcialmente Pago',
            color: 'text-brand-green',
            icon: CheckCircleIcon,
            statusText: depositSummary?.usesDeposit
                ? ((depositSummary.depositStatus === 'paid' || depositSummary.depositStatus === 'partially_paid')
                    ? 'Sinal pago - saldo pendente'
                    : 'Sinal pendente - pagamento parcial')
                : 'Pagamento parcial - saldo pendente',
        };
        case 'in_process': return { label: 'Em Processamento', color: 'text-brand-orange', icon: ClockIcon, statusText: 'Pagamento em análise' };
        case 'shipped': return { label: 'Enviado', color: 'text-brand-blue', icon: TruckIcon, statusText: 'Em trânsito' };
        case 'delivered': return { label: 'Entregue', color: 'text-brand-green', icon: CheckCircleIcon, statusText: 'Pedido entregue' };
        case 'cancelled': return { label: 'Cancelado', color: 'text-brand-red', icon: XIcon, statusText: 'Cancelado' };
        case 'refunded': return { label: 'Reembolsado', color: 'text-purple-700', icon: MoneyIcon, statusText: 'Reembolsado' };
        case 'charged_back': return { label: 'Estornado', color: 'text-purple-700', icon: MoneyIcon, statusText: 'Estornado' };
        case 'returned': return { label: 'Devolvido', color: 'text-purple-700', icon: ReturnIcon, statusText: 'Devolvido' };
        case 'awaiting_pickup_payment': return { label: 'Pagamento na Retirada', color: 'text-brand-orange', icon: ClockIcon, statusText: 'Aguardando pagamento na loja' };
        case 'awaiting_payment': return { label: 'Aguardando Pagamento', color: 'text-brand-orange', icon: ClockIcon, statusText: 'Aguardando pagamento' };
        case 'unpaid': return { label: 'Não Pago', color: 'text-brand-orange', icon: ClockIcon, statusText: 'Sem pagamento' };
        case 'completed': return { label: 'Concluído', color: 'text-brand-green', icon: CheckCircleIcon, statusText: 'Concluído' };
        default: return { label: status || 'Desconhecido', color: 'text-gray-500 dark:text-dark-body', icon: AlertCircleIcon, statusText: status || 'Desconhecido' };
    }
};

const formatPartnerAddress = (addresses: any) => {
    const addr = Array.isArray(addresses) ? addresses[0] : addresses;
    if (!addr) return "Endereço não informado"
    if (typeof addr === "string") return addr
    return `${addr.street || ""}, ${addr.number || "S/N"}${addr.complement ? ` - ${addr.complement}` : ""}${addr.neighborhood ? ` - ${addr.neighborhood}` : ""}, ${addr.city || ""} - ${addr.state || ""}`.replace(/\s+/g, ' ').trim()
};

const getFulfillmentModeLabel = (mode?: string | null) => {
    switch (mode) {
        case "delivery": return "Entrega";
        case "pickup": return "Retirada no estabelecimento";
        case "on_site": return "No estabelecimento";
        case "customer_location": return "A domicílio";
        default: return "Nao informado";
    }
};

const getReturnRequestStatusConfig = (request: any): { title: string; description: string; color: "orange" | "green" | "gray" | "blue" | "red" | "yellow" | "purple" } => {
    const status = request.status;
    const isCancellation = request.request_type === "cancellation";
    const typeLabel = isCancellation ? "Cancelamento" : request.request_type === "return" ? "Devolução" : "Troca/Devolução";

    switch (status) {
        case "PENDING_REVIEW":
            return {
                title: `${typeLabel} em análise`,
                description: `Sua solicitação de ${typeLabel.toLowerCase()} foi enviada e está pendente de revisão pelo vendedor.`,
                color: "orange",
            };
        case "UNDER_ANALYSIS":
            return {
                title: `${typeLabel} sob análise`,
                description: `O vendedor está analisando as informações e evidências enviadas.`,
                color: "orange",
            };
        case "APPROVED":
            return {
                title: `${typeLabel} aprovada!`,
                description: `O vendedor aprovou sua solicitação.`,
                color: "green",
            };
        case "REJECTED":
            return {
                title: `${typeLabel} recusada`,
                description: `A solicitação foi recusada pelo vendedor.`,
                color: "red",
            };
        case "WAITING_CUSTOMER":
            return {
                title: `Aguardando você`,
                description: `O vendedor precisa de mais informações ou ações de sua parte.`,
                color: "blue",
            };
        case "WAITING_ITEM_RETURN":
            return {
                title: `Aguardando devolução do produto`,
                description: `Por favor, envie o produto de volta conforme as orientações do vendedor.`,
                color: "blue",
            };
        case "PROCESSING":
            return {
                title: `Processando devolução`,
                description: `O vendedor recebeu o produto e está processando o reembolso/troca.`,
                color: "blue",
            };
        case "RESOLVED": {
            let resMsg = `A solicitação de ${typeLabel.toLowerCase()} foi concluída com sucesso.`;
            if (request.refund_amount > 0) {
                resMsg += ` Valor reembolsado: ${formatCurrency(request.refund_amount)}.`;
            }
            if (request.store_credit_amount > 0) {
                resMsg += ` Crédito em conta: ${formatCurrency(request.store_credit_amount)}.`;
            }
            return {
                title: `${typeLabel} concluída`,
                description: resMsg,
                color: "green",
            };
        }
        case "EXPIRED":
            return {
                title: `Solicitação expirada`,
                description: `O prazo para esta solicitação expirou.`,
                color: "gray",
            };
        case "ESCALATED":
            return {
                title: `Em disputa/Moderação`,
                description: `A solicitação foi escalada para a mediação da Dudit.`,
                color: "purple",
            };
        default:
            return {
                title: `Status: ${status}`,
                description: `Sua solicitação está em status: ${status}`,
                color: "gray",
            };
    }
};

const formatProductQuantity = (qty: number, unit?: string | null, hidePrefix = false) => {
    if (!hidePrefix && (!unit || String(unit).trim().toUpperCase() === "UN")) {
        return `x${qty}`;
    }
    return formatQuantityWithUnit(qty, unit);
};

const formatProductUnitPrice = (price: number, unit?: string | null) => {
    return formatUnitPriceWithUnit(price, unit);
};

const getItemKindLabel = (item: any) => {
    const type = item.line_type || (item.service_id ? "service_booking" : item.recurring_plan_id ? "subscription" : "product");
    if (type === "service_booking") return "Servico";
    if (type === "subscription") return "Assinatura";
    return "Produto";
};

const findFulfillmentLine = (order: any, item: any) => {
    const lines = order.checkout_fulfillment?.lines || [];
    return lines.find((line: any) => {
        if (item.id && line.orderItemId === item.id) return true;
        if (item.service_id && line.serviceId === item.service_id) return true;
        if (item.recurring_plan_id && line.recurringPlanId === item.recurring_plan_id) return true;
        if (item.product_id && line.productId === item.product_id && (line.variantId || null) === (item.variant_id || null)) return true;
        return line.lineName === item.product_name;
    });
};

const getCheckoutPricingSnapshot = (order: any) => {
    const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
    const snapshot = breakdown.find((entry: any) => entry?.checkoutPricing)?.checkoutPricing;
    if (!snapshot) return null;
    return {
        subtotal: Number(snapshot.subtotal || 0),
        couponDiscount: Number(snapshot.couponDiscount || 0),
        paymentMethodDiscount: Number(snapshot.paymentMethodDiscount || 0),
        paymentMethodInterest: Number(snapshot.paymentMethodInterest || 0),
        paymentMethodFee: Number(snapshot.paymentMethodFee || 0),
        paymentMethodFixedFee: Number(snapshot.paymentMethodFixedFee || 0),
        deliveryFee: Number(snapshot.deliveryFee || 0),
        finalTotal: Number(snapshot.finalTotal || 0),
    };
};

const getCancellationReason = (notes?: string | null) => {
    if (!notes) return null;
    const match = notes.match(/Pedido cancelado por:[\s\S]*$/);
    if (match) {
        return match[0].trim();
    }
    return null;
};

const getClientTimelineSteps = (order: any) => {
    const createdIso = order.created_at;
    const paymentIso = order.mp_date_approved || order.updated_at || order.created_at;
    const updatedIso = order.updated_at || order.created_at;
    const fmtStep = (iso?: string) => (iso ? { date: formatFullDate(iso), time: formatTime(iso), iso } : {});

    const isPaid = ["paid", "partially_paid"].includes(order.situation);
    const isCancelled = order.situation === "cancelled";

    const orderItems = order.order_items || [];
    const hasOnlyServices = orderItems.length > 0 && orderItems.every((item: any) => item.service_id || item.line_type === "service_booking");
    const hasAnyService = orderItems.some((item: any) => item.service_id || item.line_type === "service_booking");
    const hasProducts = orderItems.some((item: any) => !item.service_id && !item.recurring_plan_id && item.line_type !== "service_booking" && item.line_type !== "subscription");
    const hasMixedItems = hasAnyService && hasProducts;

    const isPreparing = ["preparing", "sent", "delivered", "pickup_available", "delivery_failed"].includes(order.delivery_status);
    const isSent = ["sent", "delivered", "delivery_failed", "pickup_available"].includes(order.delivery_status);
    const isDelivered = ["delivered", "pickup_available", "delivery_failed"].includes(order.delivery_status);
    const isPickup = order.delivery_type === "pickup";

    const steps: { label: string; active: boolean; date?: string; time?: string; iso?: string; subLabel?: string | string[] }[] = [];

    if (isCancelled) {
        const cancelReason = getCancellationReason(order.notes);
        steps.push({ label: "Pedido Realizado", active: true, ...fmtStep(createdIso) });
        steps.push({
            label: isPaid ? "Pago" : "Aguardando pagamento",
            active: true,
            ...fmtStep(isPaid ? paymentIso : createdIso)
        });
        steps.push({
            label: "Cancelado",
            active: true,
            ...fmtStep(updatedIso),
            subLabel: cancelReason ? [cancelReason] : ["O pedido foi cancelado."]
        });
        return steps;
    }

    // 1. First Step
    steps.push({ label: "Pedido Realizado", active: true, ...fmtStep(createdIso) });

    // 2. Second Step: Payment
    steps.push({
        label: isPaid ? "Pago" : "Aguardando pagamento",
        active: true,
        ...fmtStep(isPaid ? paymentIso : createdIso)
    });

    if (hasOnlyServices) {
        // Service-only order:
        // 3. Em andamento
        steps.push({
            label: "Em andamento",
            active: isPaid && isPreparing,
            ...fmtStep(isPaid && isPreparing ? updatedIso : undefined)
        });
        // 4. Concluído
        steps.push({
            label: "Concluído",
            active: isPaid && isDelivered && order.delivery_status === "delivered",
            ...fmtStep(isPaid && isDelivered && order.delivery_status === "delivered" ? updatedIso : undefined)
        });
    } else if (hasMixedItems) {
        // Mixed order:
        // 3. Em Execução (with sub-labels)
        const servicesCount = orderItems.filter((item: any) => item.service_id || item.line_type === "service_booking").length;
        const productsCount = orderItems.filter((item: any) => !item.service_id && !item.recurring_plan_id && item.line_type !== "service_booking" && item.line_type !== "subscription").length;

        const serviceText = servicesCount === 1 ? "1 serviço sendo realizado" : `${servicesCount} serviços sendo realizados`;
        const productText = productsCount === 1 ? "1 produto sendo preparado" : `${productsCount} produtos sendo preparados`;

        steps.push({
            label: "Em progresso",
            active: isPaid && isPreparing,
            ...fmtStep(isPaid && isPreparing ? updatedIso : undefined),
            subLabel: [serviceText, productText]
        });

        // 4. Finalizado
        steps.push({
            label: "Finalizado",
            active: isPaid && isSent,
            ...fmtStep(isPaid && isSent ? updatedIso : undefined)
        });

        // 5. Concluído
        steps.push({
            label: "Concluído",
            active: isPaid && isDelivered && (order.delivery_status === "delivered" || order.delivery_status === "pickup_available"),
            ...fmtStep(isPaid && isDelivered && (order.delivery_status === "delivered" || order.delivery_status === "pickup_available") ? updatedIso : undefined)
        });
    } else {
        // Standard product-only order:
        // 3. Em andamento
        steps.push({
            label: "Em andamento",
            active: isPaid && isPreparing,
            ...fmtStep(isPaid && isPreparing ? updatedIso : undefined)
        });

        // 4. Pronto para retirada / Enviado
        steps.push({
            label: isPickup ? "Pronto para retirada" : "Enviado",
            active: isPaid && isSent,
            ...fmtStep(isPaid && isSent ? updatedIso : undefined)
        });

        // 5. Pedido retirado / Pedido entregue
        let finalLabel = isPickup ? "Pedido retirado" : "Pedido entregue";
        if (order.delivery_status === "delivery_failed") {
            finalLabel = isPickup ? "Retirada não realizada" : "Falha na entrega";
        }
        steps.push({
            label: finalLabel,
            active: isPaid && isDelivered && (order.delivery_status === "delivered" || order.delivery_status === "pickup_available" || order.delivery_status === "delivery_failed"),
            ...fmtStep(isPaid && isDelivered ? updatedIso : undefined)
        });
    }

    return steps;
};

const getDeliveryTimelineSteps = (order: any) => {
    const carrierShipment = getOutboundCarrierShipment(order);
    const isCarrierOrder = order.delivery_breakdown?.source === "superfrete" || !!carrierShipment;
    if (isCarrierOrder) {
        const fmtStep = (iso?: string | null) => (iso ? { date: formatFullDate(iso), time: formatTime(iso), iso } : {});
        const steps: { label: string; active: boolean; date?: string; time?: string; iso?: string; subLabel?: string }[] = [];
        const shipmentStatus = carrierShipment?.status || "";
        const isPaid = ["paid", "partially_paid", "delivered"].includes(order.situation);
        const postedActive = ["posted", "in_transit", "delivered"].includes(shipmentStatus);
        const transitActive = ["in_transit", "delivered"].includes(shipmentStatus);
        const deliveredActive = shipmentStatus === "delivered";

        steps.push({ label: "Em preparação", active: true, ...fmtStep(order.created_at) });

        if (shipmentStatus === "cancelled" || shipmentStatus === "failed") {
            steps.push({
                label: shipmentStatus === "failed" ? "Falha no envio" : "Envio cancelado",
                active: true,
                ...fmtStep(carrierShipment?.updated_at || carrierShipment?.created_at),
            });
            return steps;
        }

        steps.push({
            label: "Postado",
            active: postedActive,
            ...fmtStep(postedActive ? carrierShipment?.paid_at || carrierShipment?.updated_at || carrierShipment?.created_at : null),
        });
        steps.push({
            label: "Em trânsito",
            active: transitActive,
            ...fmtStep(transitActive ? carrierShipment?.updated_at : null),
        });
        steps.push({
            label: "Pedido entregue",
            active: deliveredActive,
            ...fmtStep(deliveredActive ? carrierShipment?.delivered_at : null),
        });
        return steps;
    }

    const driver = order.delivery_driver;
    if (!driver) return [];

    const fmtStep = (iso?: string | null) => (iso ? { date: formatFullDate(iso), time: formatTime(iso), iso } : {});

    const steps: { label: string; active: boolean; date?: string; time?: string; iso?: string; subLabel?: string }[] = [];

    // 1. Atribuído
    steps.push({
        label: "Pedido atribuído a um entregador",
        active: true,
        ...fmtStep(driver.assigned_at),
    });

    // 2. Aceitou
    steps.push({
        label: "Entregador aceitou a entrega",
        active: !!driver.accepted_at,
        ...fmtStep(driver.accepted_at),
    });

    // 3. Coletou
    steps.push({
        label: "Pedido coletado pelo entregador",
        active: !!driver.picked_up_at,
        ...fmtStep(driver.picked_up_at),
    });

    // 4. Saiu para entrega
    steps.push({
        label: "Saiu para entrega",
        active: !!driver.out_for_delivery_at,
        ...fmtStep(driver.out_for_delivery_at),
    });

    // 5. Entregue ou Falha
    if (driver.status === "failed") {
        steps.push({
            label: "Falha na entrega",
            active: true,
            ...fmtStep(driver.failed_at || driver.completed_at),
            subLabel: driver.failure_reason || "Não foi possível realizar a entrega.",
        });
    } else {
        steps.push({
            label: "Pedido entregue",
            active: !!driver.completed_at || driver.status === "delivered",
            ...fmtStep(driver.completed_at),
        });
    }

    return steps;
};

const getDeliveryStatusLabel = (status?: string | null) => {
    switch (status) {
        case "pending": return { label: "Pendente", color: "text-brand-orange" as const };
        case "not_sent": return { label: "Não enviado", color: "text-gray-500 as const" as any };
        case "preparing": return { label: "Preparando", color: "text-brand-orange" as const };
        case "sent": return { label: "Enviado", color: "text-brand-blue as const" as any };
        case "delivered": return { label: "Entregue", color: "text-brand-green" as const };
        case "pickup_available": return { label: "Pronto para retirada", color: "text-brand-green" as const };
        case "delivery_failed": return { label: "Falha na entrega", color: "text-brand-red" as const };
        case "cancelled": return { label: "Cancelado", color: "text-brand-red" as const };
        default: return { label: status || "Não informado", color: "text-gray-500 as const" as any };
    }
};

const getAssignmentStatusLabel = (status?: string | null) => {
    switch (status) {
        case "assigned": return "Atribuído";
        case "accepted": return "Aceito";
        case "picked_up": return "Coletado";
        case "out_for_delivery": return "A caminho";
        case "delivered": return "Entregue";
        case "failed": return "Falhou";
        case "cancelled": return "Cancelado";
        default: return status || "Desconhecido";
    }
};

export const MyOrderDetailPage = ({ order, onBack }: MyOrderDetailPageProps) => {
    const router = useRouter();
    const { toast } = useToast();
    const [isShippingModalOpen, setIsShippingModalOpen] = useState(false);
    const [loadingPayment, setLoadingPayment] = useState(false);
    const [showPixModal, setShowPixModal] = useState(false);
    const [pixData, setPixData] = useState<any>(null);
    const [boletoData, setBoletoData] = useState<any>(null);
    const [pixOrderDetails, setPixOrderDetails] = useState<any>(null);
    const [chargedAmount, setChargedAmount] = useState<number>(Number(order?.total_amount || 0));
    const [isCanceling, setIsCanceling] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("changed_mind");
    const [cancelDetails, setCancelDetails] = useState("");
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [reportReturnOpen, setReportReturnOpen] = useState(false);
    const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
    const [returnReason, setReturnReason] = useState("changed_mind");
    const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});
    const [returnResolution, setReturnResolution] = useState<"exchange" | "refund" | "store_credit">("refund");
    const [returnMessage, setReturnMessage] = useState("");
    const [returnItems, setReturnItems] = useState<Record<string, number>>({});
    const [returnConditions, setReturnConditions] = useState<Record<string, "sealed" | "opened" | "damaged">>({});
    const [returnServiceItems, setReturnServiceItems] = useState<Record<string, boolean>>({});
    const [returnEvidence, setReturnEvidence] = useState<(string | File)[]>([]);
    const [returnModalTab, setReturnModalTab] = useState<string>("items");
    const [isBottomSummaryOpen, setIsBottomSummaryOpen] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [deliveryOtp, setDeliveryOtp] = useState<any>(order?.delivery_otp || null);
    const [isConfirmReceiptModalOpen, setIsConfirmReceiptModalOpen] = useState(false);

    useEffect(() => {
        if (order?.delivery_otp) {
            setDeliveryOtp(order.delivery_otp);
            return;
        }
        if (order?.id && order.delivery_type !== "pickup" && order.situation !== "cancelled") {
            import("@/app/actions/delivery-otp").then(({ getCustomerOrderDeliveryOtpAction }) => {
                getCustomerOrderDeliveryOtpAction({ orderId: order.id }).then((res) => {
                    if (res.success && res.data?.requiresOtp) {
                        setDeliveryOtp(res.data);
                    }
                }).catch(() => { });
            });
        }
    }, [order?.id, order?.delivery_otp, order?.delivery_type, order?.situation]);
    const [sellerReturnCapabilities, setSellerReturnCapabilities] = useState<{
        hasReturnsModule: boolean;
        phone: string | null;
        loaded: boolean;
    }>({
        hasReturnsModule: true,
        phone: null,
        loaded: false,
    });
    const evidenceUploader = useR2Upload({
        endpoint: "/api/r2/returns-evidence",
        allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });

    const handleBack = useCallback(() => onBack(), [onBack]);

    useEffect(() => {
        if (returnResolution === "exchange") {
            setReturnServiceItems({});
        }
    }, [returnResolution]);

    const handleConfirmFulfillment = async () => {
        try {
            setIsConfirming(true);
            const res = await confirmOrderFulfillmentAction(order.id);
            if (res && "error" in res && res.error) {
                toast({
                    title: "Erro ao confirmar",
                    description: res.error,
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "Sucesso!",
                    description: "Status de entrega/execução atualizado.",
                });
                router.refresh();
            }
        } catch (e: any) {
            toast({
                title: "Erro",
                description: e?.message || "Ocorreu um erro ao processar a confirmação.",
                variant: "destructive",
            });
        } finally {
            setIsConfirming(false);
        }
    };

    const [activeTab, setActiveTab] = useState<"details" | "history" | "attachments" | "delivery" | "return">("details");
    const [attachments, setAttachments] = useState<any[]>([]);
    const [loadingAttachments, setLoadingAttachments] = useState(false);
    const [storePolicy, setStorePolicy] = useState<any>(null);
    const [buyerAuditEntries, setBuyerAuditEntries] = useState<any[]>([]);
    const [loadingBuyerHistory, setLoadingBuyerHistory] = useState(false);

    // Fetch order history for buyer when the history tab is active
    useEffect(() => {
        if (!order?.id || activeTab !== "history") return;
        let cancelled = false;
        setLoadingBuyerHistory(true);
        getOrderHistoryForBuyerAction(order.id)
            .then((res) => {
                if (cancelled) return;
                if (res.success && Array.isArray(res.data)) {
                    setBuyerAuditEntries(res.data);
                }
            })
            .catch((err) => console.error("[MyOrderDetailPage] Error loading history:", err))
            .finally(() => {
                if (!cancelled) setLoadingBuyerHistory(false);
            });
        return () => {
            cancelled = true;
        };
    }, [order?.id, activeTab]);

    // Fetch store policy and seller return capabilities (plan & module)
    useEffect(() => {
        if (!order?.partner_id) return;
        getPartnerReturnPolicyPublicAction(order.partner_id)
            .then((res) => {
                if (res?.success && res?.data) {
                    if (res.data.policy && !storePolicy && !order.return_policy_snapshot) {
                        setStorePolicy(res.data.policy);
                    }
                    setSellerReturnCapabilities({
                        hasReturnsModule: res.data.hasReturnsModule ?? false,
                        phone: res.data.phone || null,
                        loaded: true,
                    });
                }
            })
            .catch((err) => console.error("[MyOrderDetailPage] Error loading store policy/capabilities:", err));
    }, [order?.partner_id, order?.return_policy_snapshot, storePolicy]);

    // Lazy load attachments only when the attachments tab is active
    useEffect(() => {
        if (!order?.id || activeTab !== "attachments") return;
        if (attachments.length > 0) return;
        setLoadingAttachments(true);
        getOrderAttachmentsAction(order.id)
            .then(res => {
                if (res.success && res.data) {
                    setAttachments(res.data);
                }
            })
            .catch(err => console.error("Erro ao carregar anexos:", err))
            .finally(() => setLoadingAttachments(false));
    }, [order?.id, activeTab, attachments.length]);

    const handleDownloadAttachment = async (fileKey: string, fileName: string) => {
        try {
            const res = await getOrderAttachmentUrlAction(order.id, fileKey)
            if (res.success) {
                window.open(res.downloadUrl, "_blank")
            } else {
                toast({ description: res.error || "Erro ao obter arquivo." })
            }
        } catch (err) {
            toast({ description: "Erro ao abrir documento." })
        }
    }

    const remainingQuantities = useMemo(() => {
        const remaining: Record<string, number> = {}
        const orderItems = order?.order_items || []
        const returnedQtyMap: Record<string, number> = {}
        const requests = order?.return_requests || []

        requests.forEach((rr: any) => {
            if (rr.deleted_at) return
            const status = String(rr.status || "").toUpperCase()
            if (status === "CANCELLED") return
            const riList = rr.return_items || []
            riList.forEach((ri: any) => {
                if (ri.order_item_id) {
                    returnedQtyMap[ri.order_item_id] = (returnedQtyMap[ri.order_item_id] || 0) + (ri.quantity || 0)
                }
            })
        })

        orderItems.forEach((item: any) => {
            const returned = returnedQtyMap[item.id] || 0
            const isServiceItem = !!item.service_id || item.line_type === "service_booking"
            const itemQuantity = isServiceItem ? (item.quantity || 1) : (item.quantity || 0)
            remaining[item.id] = Math.max(0, itemQuantity - returned)
        })

        return remaining
    }, [order])

    const hasReturnableItems = useMemo(() => {
        return Object.values(remainingQuantities).some((qty: number) => qty > 0)
    }, [remainingQuantities])

    const latestReturnRequest = useMemo(() => {
        if (!order?.return_requests || !Array.isArray(order.return_requests) || order.return_requests.length === 0) {
            return null;
        }
        const valid = order.return_requests.filter((r: any) => !r.deleted_at);
        if (valid.length === 0) return null;
        const inProgress = valid.find((r: any) =>
            ["PENDING_REVIEW", "UNDER_ANALYSIS", "APPROVED", "WAITING_CUSTOMER", "WAITING_ITEM_RETURN", "PROCESSING", "ESCALATED"].includes(r.status)
        );
        if (inProgress) return inProgress;
        return [...valid].sort((a: any, b: any) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        )[0];
    }, [order?.return_requests]);

    const activeReturnRequest = latestReturnRequest;
    const hasActiveReturn = Boolean(latestReturnRequest && ["PENDING_REVIEW", "UNDER_ANALYSIS", "APPROVED", "WAITING_CUSTOMER", "WAITING_ITEM_RETURN", "PROCESSING", "ESCALATED"].includes(latestReturnRequest.status));
    const returnStatusCfg = latestReturnRequest ? getReturnRequestStatusConfig(latestReturnRequest) : null;

    // Latest outbound shipment with tracking (SuperFrete / carrier labels)
    const trackedShipment = (() => {
        const shipments = Array.isArray(order.order_shipments)
            ? order.order_shipments.filter((s: any) => s.kind !== "return")
            : []
        shipments.sort((a: any, b: any) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        )
        return shipments.find((s: any) => s.tracking_number) || null
    })()

    const outboundShipment = getOutboundCarrierShipment(order)
    const carrierDelivery = isCarrierDeliveryOrder(order)
    const carrierInfo = carrierDelivery
        ? { shipment: outboundShipment, breakdown: order.delivery_breakdown }
        : null

    // Map deposit history entries from order fulfillment if available (instant fallback)
    const depositHistoryEntries = useMemo(() => {
        const history = (order?.checkout_fulfillment as any)?.depositCheckoutHistory;
        if (!Array.isArray(history) || history.length === 0) return [];
        return history.map((item: any, idx: number) => {
            const isCancelled = item.depositStatus === "cancelled" || item.action === "cancelled";
            const isCreated = item.action === "created" || item.depositStatus === "pending";
            const isPaid = item.depositStatus === "paid" || item.sinalPaid;
            const date = item.cancelledAt || item.createdAt || item.paidAt || item.depositPaidAt || order.created_at;
            const amount = Number(item.depositAmount || item.initialChargeAmount || 0);
            const amountStr = amount > 0 ? formatCurrency(amount) : null;

            if (isCancelled) {
                return {
                    id: `deposit-hist-cancel-${idx}`,
                    actor_name: "Sinal cancelado",
                    change_lines: [
                        "O sinal do pedido foi cancelado pelo vendedor.",
                        ...(amountStr ? [`Sinal: ${amountStr}`] : []),
                        ...(item.cancellationReason ? [`Motivo: ${item.cancellationReason}`] : []),
                    ],
                    created_at: date,
                    entry_type: "deposit_cancelled",
                };
            }
            if (isCreated) {
                return {
                    id: `deposit-hist-create-${idx}`,
                    actor_name: "Cobrança de sinal gerada",
                    change_lines: [
                        "Nova cobrança de sinal gerada via Mercado Pago.",
                        ...(amountStr ? [`Sinal: ${amountStr}`] : []),
                    ],
                    created_at: date,
                    entry_type: "deposit_created",
                };
            }
            if (isPaid) {
                return {
                    id: `deposit-hist-paid-${idx}`,
                    actor_name: "Sinal pago",
                    change_lines: [
                        "Recebimento do sinal confirmado.",
                        ...(amountStr ? [`Sinal: ${amountStr}`] : []),
                    ],
                    created_at: date,
                    entry_type: "deposit_paid",
                };
            }
            return null;
        }).filter(Boolean);
    }, [order?.checkout_fulfillment, order?.created_at]);

    const combinedHistoryEntries = useMemo(() => {
        const rawEntries = (buyerAuditEntries || []);

        const hasAuditDeposit = rawEntries.some((e: any) =>
            e.entry_type && String(e.entry_type).startsWith("deposit_")
        );
        const effectiveDepositEntries = hasAuditDeposit ? [] : depositHistoryEntries;

        const allRaw = [...rawEntries, ...effectiveDepositEntries];
        if (allRaw.length === 0) return [];

        const sanitized = allRaw
            .filter((entry: any) => !isInternalErpIntegrationTimelineEntry(entry))
            .map((entry: any) => {
            const metadata = entry.metadata || {};
            const actorName = resolveTimelineActorName({
                entry,
                viewer: "customer",
                orderCustomerName: order?.customer_name,
                storeName: order?.store?.name,
                buyerId: order?.buyer_id,
            });

            let changeLines = (entry.change_lines || []).map((line: string) => humanizeTimelineChangeLine(line)).filter(Boolean);

            // Filter out internal seller notes edits and internal ERP sync logs from customer view
            changeLines = changeLines.filter(
                (l: string) =>
                    !l.toLowerCase().includes("observações do pedido atualizadas") &&
                    !l.toLowerCase().includes("alterou as observações do pedido") &&
                    !isInternalStockTimelineLine(l) &&
                    !isInternalErpIntegrationTimelineLine(l),
            );

            // If event was a return rejection, filter out false refund/credit/exchange lines
            const isRejectedReturn = entry.entry_type === "return_rejected" ||
                metadata.to_status === "REJECTED" ||
                (entry.entry_type?.startsWith("return_") && changeLines.some((l: string) => l.toLowerCase().includes("recusad") || l.toLowerCase().includes("rejeitad")));

            if (isRejectedReturn) {
                changeLines = changeLines.filter((l: string) =>
                    !l.startsWith("Valor do reembolso:") &&
                    !l.startsWith("Status do reembolso:") &&
                    !l.startsWith("Saldo da troca enviado para:") &&
                    !l.startsWith("Vale-compra gerado:") &&
                    !l.startsWith("Pedido de troca criado:")
                );
            }

            return {
                ...entry,
                actor_name: actorName,
                change_lines: changeLines,
            };
        }).filter((e: any) => e.change_lines.length > 0);

        return sanitized.sort((a: any, b: any) => {
            // Most recent events first
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [buyerAuditEntries, depositHistoryEntries, order?.buyer_id, order?.customer_name, order?.store?.name]);

    const orderItems = order?.order_items || [];
    const hasOnlyServices = orderItems.length > 0 && orderItems.every((item: any) => item.service_id || item.line_type === "service_booking");
    const policyCommercial = (activeReturnRequest?.policy_snapshot || order?.return_policy_snapshot)?.commercial;
    const acceptsStoreCredit = policyCommercial ? (policyCommercial.accepts_store_credit ?? true) : (storePolicy ? (storePolicy.acceptsStoreCredit ?? true) : true);
    const acceptsSizeExchange = policyCommercial ? (policyCommercial.accepts_size_exchange ?? true) : (storePolicy ? (storePolicy.acceptsSizeExchange ?? true) : true);
    const acceptsColorExchange = policyCommercial ? (policyCommercial.accepts_color_exchange ?? true) : (storePolicy ? (storePolicy.acceptsColorExchange ?? true) : true);
    const acceptsAnyExchange = acceptsSizeExchange || acceptsColorExchange;

    const showExchangeOption = !hasOnlyServices && order?.delivery_status === "delivered" && acceptsAnyExchange;
    const showStoreCreditOption = acceptsStoreCredit;

    const resolutionOptions = useMemo(() => {
        const opts: { value: "exchange" | "refund" | "store_credit"; label: string }[] = [];
        if (showExchangeOption) {
            opts.push({ value: "exchange", label: "Troca" });
        }
        opts.push({ value: "refund", label: "Reembolso" });
        if (showStoreCreditOption) {
            opts.push({ value: "store_credit", label: "Vale-compra" });
        }
        return opts;
    }, [showExchangeOption, showStoreCreditOption]);

    useEffect(() => {
        if (resolutionOptions.length > 0 && !resolutionOptions.some(opt => opt.value === returnResolution)) {
            setReturnResolution(resolutionOptions[0].value);
        }
    }, [resolutionOptions, returnResolution]);

    const [selectedExchangeItems, setSelectedExchangeItems] = useState<MarketplaceSelectedExchangeItem[]>([]);

    const selectedReturnCreditAmount = useMemo(() => {
        const itemsList = Array.isArray(order?.order_items) ? order.order_items : [];
        return Object.entries(returnItems).reduce((sum, [orderItemId, qty]) => {
            const count = Number(qty || 0);
            if (count <= 0) return sum;
            const oi = itemsList.find((i: any) => i.id === orderItemId);
            if (!oi) return sum;
            const unitPrice = Number(oi.product_price || 0);
            return sum + unitPrice * count;
        }, 0);
    }, [returnItems, order?.order_items]);

    if (!order) return null;

    const orderNumber = order.order_number || order.id.slice(0, 8).toUpperCase();
    const dateStrFull = formatFullDate(order.created_at);
    const dateStrTime = formatTime(order.created_at);
    const isDepositOrder = Boolean(
        order?.checkout_fulfillment?.depositCheckout?.payDepositOnly ||
        order?.checkout_fulfillment?.depositCheckout?.usesDeposit,
    );
    const depositSummary = isDepositOrder ? getOrderDepositSummary(order) : null;
    const statusConfig = getStatusConfig(order.situation, depositSummary);
    const store = Array.isArray(order.stores) ? order.stores[0] : order.stores
    const storeImage = store?.logo_url
        ? getR2ImageUrl(store.logo_url)
        : "https://img.dudit.com.br/static/Placeholder.png";

    const isDelivery = order.delivery_type === "delivery";
    const sellerName = store?.name || "Loja Parceira";
    const totalAmount = Number(order.total_amount);

    const hasAnyService = orderItems.some((item: any) => item.service_id || item.line_type === "service_booking");
    const hasProducts = orderItems.some((item: any) => !item.service_id && !item.recurring_plan_id && item.line_type !== "service_booking" && item.line_type !== "subscription");
    const hasMixedItems = hasAnyService && hasProducts;
    const storeDeleted = isStoreDeleted(order);
    const isCancelled = order.situation === "cancelled";
    // Orders linked through an ERP customer are managed by the seller, but the
    // buyer owns them just like a marketplace order: cancellation, returns and
    // receipt confirmation follow the same rules.
    const isErpOrder = Boolean(order.is_erp_order);
    const canCancelOrder = canRequestOrderCancellation(order) && !hasActiveReturn;
    const canRequestResolution = canRequestPostFulfillmentResolution(order);
    const isPaidOrPartiallyPaid = ["paid", "partially_paid"].includes(order.situation);
    const showReturnRequestButton = isPaidOrPartiallyPaid && !canRequestOrderCancellation(order) && !isCancelled && hasReturnableItems && !storeDeleted;

    const returnButtonLabel = order.delivery_status === "delivered"
        ? (showExchangeOption ? "Solicitar troca ou devolução" : "Solicitar devolução")
        : (showStoreCreditOption ? "Solicitar reembolso ou vale-compra" : "Solicitar reembolso");
    const returnHistoryCount = Array.isArray(order.return_requests) ? order.return_requests.length : 0;

    const showConfirmReceiptButton = !isCancelled && hasProducts && ["sent", "shipped", "out_for_delivery"].includes(order.delivery_status || "");

    const renderFulfillmentButtons = () => {
        if (showConfirmReceiptButton) {
            return (
                <Button
                    variant="outline"
                    className="w-full h-12 font-bold border-brand-green text-brand-green hover:bg-brand-green/10"
                    onClick={() => setIsConfirmReceiptModalOpen(true)}
                    disabled={isConfirming}
                >
                    {isConfirming ? <Spinner size={16} className="text-brand-green mr-2" /> : "Confirmar Recebimento"}
                </Button>
            );
        }
        return null;
    };

    const isStoreCreditMethodString = (raw?: string | null) => {
        const m = String(raw || "").toLowerCase().trim();
        return (
            m === "store_credit" ||
            m === "vale-compra" ||
            m === "vale_compra" ||
            m === "vale compra" ||
            m.includes("store_credit") ||
            m.includes("vale-compra") ||
            m.includes("vale_compra") ||
            m.includes("crédito em loja") ||
            m.includes("credito em loja") ||
            m.includes("crédito do cliente") ||
            m.includes("credito do cliente")
        );
    };

    const storeCreditUsed = (() => {
        const colVal = Number(order.store_credit_amount || 0);
        if (colVal > 0.009) return colVal;
        const bd = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
        const fromBreakdown = bd.reduce((sum: number, e: any) => {
            if (isStoreCreditMethodString(e?.method)) {
                return sum + Number(e?.amountReceived ?? e?.effectiveAmount ?? e?.amount ?? 0);
            }
            return sum;
        }, 0);
        return fromBreakdown > 0.009 ? fromBreakdown : 0;
    })();

    const getPaymentTypeLabel = () => {
        if (order.payment_method === "Assinatura (Créditos)") {
            return "Assinatura (Créditos)";
        }
        let baseLabel = "Pix";
        const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
        const methodEntries = breakdown.filter((e: any) => e?.method);
        const paidMethodEntries = methodEntries.filter((e: any) => Number(e?.amountReceived ?? e?.amount ?? 0) > 0.009);
        const paidLabels = Array.from(new Set(paidMethodEntries.map((e: any) => String(e?.method || "").toLowerCase().trim()).filter(Boolean)));
        const hasMultiplePaidMethods = paidLabels.length > 1;

        if (hasMultiplePaidMethods) {
            baseLabel = "Múltiplos meios";
        } else if (paidMethodEntries.length === 1 || methodEntries.length === 1) {
            const rawMethod = (paidMethodEntries[0] || methodEntries[0]).method;
            const m = String(rawMethod || "").toLowerCase();
            if (isStoreCreditMethodString(m)) baseLabel = "Crédito em loja";
            else if (m === "pix" || m === "bank_transfer") baseLabel = "Pix";
            else if (m.includes("crédito") || m.includes("credito") || m.includes("credit")) baseLabel = "Cartão de Crédito";
            else if (m.includes("débito") || m.includes("debito") || m.includes("debit")) baseLabel = "Cartão de Débito";
            else if (m.includes("dinheiro") || m.includes("cash") || m.includes("money")) baseLabel = "Dinheiro";
            else if (m.includes("boleto") || m.includes("bolbradesco") || m === "ticket") baseLabel = "Boleto";
            else baseLabel = rawMethod;
        } else {
            const pm = String(order.payment_method || "").toLowerCase();
            if (isStoreCreditMethodString(pm)) baseLabel = "Crédito em loja";
            else if (pm === "pix" || pm === "bank_transfer") baseLabel = "Pix";
            else if (pm.includes("crédito") || pm.includes("credito") || pm.includes("credit")) baseLabel = "Cartão de Crédito";
            else if (pm.includes("débito") || pm.includes("debito") || pm.includes("debit")) baseLabel = "Cartão de Débito";
            else if (pm.includes("dinheiro") || pm.includes("cash") || pm.includes("money")) baseLabel = "Dinheiro";
            else if (pm.includes("boleto") || pm.includes("bolbradesco") || pm === "ticket") baseLabel = "Boleto";
            else baseLabel = order.payment_method || order.payment_provider || "Pix";
        }
        if (!hasMultiplePaidMethods) {
            const paymentEntry = paidMethodEntries[0] || methodEntries[0] || null;
            const installmentCount = paymentEntry?.installmentNumber || order.installments || 1;
            if (installmentCount > 1) {
                baseLabel = `${baseLabel} - ${installmentCount}x`;
            }
        }
        if (hasMultiplePaidMethods) {
            return baseLabel;
        }
        if (order.payment_method === "Assinatura (Créditos)") {
            return baseLabel;
        }
        if (hasReceivedMpPayment(order) && !baseLabel.toLowerCase().includes("mercado pago")) {
            return `Mercado Pago (${baseLabel})`;
        }
        return baseLabel;
    };

    const isExchangeOrder = order.order_source === "Troca" || !!order.exchange_return_request_id;
    const exchangeTotal = Number(order.total_amount || 0);
    const exchangeCredit = Number(order.paid_amount ?? order.amount_paid ?? 0);
    const exchangeShortfall = Math.max(0, Math.round((exchangeTotal - exchangeCredit) * 100) / 100);
    const isPendingExchangeShortfall = isExchangeOrder && exchangeShortfall > 0.009 && order.situation === "pending";
    const hasMercadoPagoOnline = order.payment_provider === "Mercado Pago" || Boolean(order.partners?.mp_public_key);

    const paymentMethodName = (() => {
        const rawLabel = getPaymentTypeLabel();
        const formatted = formatPaymentMethodLabel(rawLabel, null);
        if (isExchangeOrder && (!formatted || formatted.toLowerCase() === "exchange" || formatted.toLowerCase() === "pix")) {
            return "Crédito de Troca";
        }
        return formatted || rawLabel;
    })();
    const isMercadoPago = hasReceivedMpPayment(order) || order.payment_provider === "Mercado Pago" || (Boolean(order?.checkout_fulfillment?.depositCheckout?.payDepositOnly) && hasMercadoPagoOnline);
    const paymentMethodKey = `${paymentMethodName} ${order.payment_method || ""}`.toLowerCase();
    const isExchangeCreditPayment =
        paymentMethodKey.includes("crédito de troca") ||
        paymentMethodKey.includes("credito de troca") ||
        (isExchangeOrder && exchangeShortfall <= 0.009 && !hasReceivedMpPayment(order));
    const isPixPayment = !isExchangeCreditPayment && (paymentMethodKey.includes("pix") || paymentMethodKey.includes("bank_transfer"));
    const isBoletoPayment = paymentMethodKey.includes("boleto") || paymentMethodKey.includes("bolbradesco") || paymentMethodKey.includes("ticket");
    const hasUnspecifiedMpCharge = paymentMethodKey.includes("mercado pago");
    const isPaymentExpired = Boolean(
        order.situation !== "partially_paid" &&
        order.payment_expires_at &&
        new Date(order.payment_expires_at) < new Date(),
    );
    const hasMpChargeEntry = Array.isArray(order.payment_breakdown)
        ? order.payment_breakdown.some((entry: any) => String(entry?.provider || "").toLowerCase().includes("mercado pago"))
        : false;
    const isMpManagedOrder = isMercadoPago || hasMpChargeEntry || order.payment_provider === "Mercado Pago";
    const canRetryPayment =
        (order.situation === "pending" || order.situation === "payment_failed" || order.situation === "partially_paid") &&
        isMpManagedOrder &&
        !isPendingExchangeShortfall &&
        !isPaymentExpired &&
        (isPixPayment || isBoletoPayment || hasUnspecifiedMpCharge || order.situation === "payment_failed");
    const isStoreCreditPaymentOrder = isStoreCreditMethodString(paymentMethodName) || (storeCreditUsed > 0.009 && storeCreditUsed >= Number(order.total_amount || 0) - 0.009);
    const PaymentIconEl = (() => {
        const icons: React.ReactNode[] = [];
        const nameLower = paymentMethodName.toLowerCase();
        const isVoucherType =
            isExchangeCreditPayment ||
            isStoreCreditPaymentOrder ||
            isStoreCreditMethodString(order.payment_method) ||
            nameLower.includes("assinatura") ||
            nameLower.includes("subscription") ||
            nameLower.includes("vale-compra") ||
            nameLower.includes("vale_compra") ||
            nameLower.includes("crédito de troca") ||
            nameLower.includes("credito de troca") ||
            nameLower.includes("crédito do cliente") ||
            nameLower.includes("credito do cliente") ||
            nameLower.includes("crédito em loja") ||
            nameLower.includes("credito em loja") ||
            nameLower.includes("voucher");

        const showMpIcon = isMercadoPago && !isVoucherType;
        if (showMpIcon) {
            icons.push(
                <img key="mp" src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain shrink-0" />
            );
        }

        if (isVoucherType) {
            icons.push(
                <img key="vc" src="https://img.dudit.com.br/static/icons/payments/Voucher.png" alt={paymentMethodName} className="w-5 h-5 object-contain shrink-0" />
            );
        } else if (nameLower.includes("pix")) {
            icons.push(<img key="pix" src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain shrink-0" />);
        } else if (nameLower.includes("boleto")) {
            icons.push(<img key="boleto" src="https://img.dudit.com.br/static/icons/payments/Boleto.png" alt="Boleto" className="w-5 h-5 object-contain shrink-0" />);
        } else if (nameLower.includes("dinheiro") || nameLower.includes("cash") || nameLower.includes("money") || nameLower.includes("espécie")) {
            icons.push(<img key="money" src="https://img.dudit.com.br/static/icons/payments/Dinheiro.png" alt="Dinheiro" className="w-5 h-5 object-contain shrink-0" />);
        } else if (nameLower.includes("cartão") || nameLower.includes("cartao") || nameLower.includes("crédito") || nameLower.includes("credito") || nameLower.includes("credit") || nameLower.includes("débito") || nameLower.includes("debito") || nameLower.includes("debit")) {
            icons.push(<img key="card" src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain shrink-0" />);
        } else if (!showMpIcon) {
            icons.push(<CreditCardIcon key="default" size={20} className="text-brand-dark dark:text-dark-heading shrink-0" />);
        }
        return <div className="flex items-center gap-1.5">{icons}</div>;
    })();

    const renderPaymentExpirationCard = () => {
        if (isPendingExchangeShortfall) return null;
        if (
            order.situation === "partially_paid" &&
            depositSummary?.sinalPaid &&
            depositSummary.remainingBalance > 0.009 &&
            canRetryPayment
        ) {
            return (
                <InfoCard
                    message={`Sinal confirmado. Falta pagar ${formatCurrency(depositSummary.remainingBalance)} do saldo para concluir o pedido.`}
                    color="orange"
                    bottomElement={
                        <Button variant="link" onClick={handlePixClick} disabled={loadingPayment}>
                            {loadingPayment ? <Spinner size={14} className="mr-1" /> : null}
                            Pagar saldo
                        </Button>
                    }
                />
            );
        }
        if (!order.payment_expires_at) return null;
        if (order.situation !== "pending" && order.situation !== "payment_failed") return null;
        if (!isMpManagedOrder) return null;

        if (!canRetryPayment) {
            if (!isPaymentExpired) return null;
            return (
                <InfoCard
                    message={`O prazo de pagamento deste pedido expirou em ${formatFullDate(order.payment_expires_at)}. Caso o pagamento não seja realizado, o pedido será cancelado automaticamente.`}
                    color="red"
                />
            );
        }

        if (order.situation === "payment_failed") {
            return (
                <InfoCard
                    message={`Pagamento recusado. Pague novamente com Pix ou Boleto antes de ${formatFullDate(order.payment_expires_at)}.`}
                    color="red"
                    bottomElement={
                        <Button variant="link" onClick={handlePixClick} disabled={loadingPayment}>
                            {loadingPayment ? <Spinner size={14} className="mr-1" /> : null}
                            Pagar agora
                        </Button>
                    }
                />
            );
        }

        return (
            <InfoCard
                message={`O pagamento expira em ${formatFullDate(order.payment_expires_at)}.`}
                color="orange"
                bottomElement={
                    <Button variant="link" onClick={handlePixClick} disabled={loadingPayment}>
                        {loadingPayment ? <Spinner size={14} className="mr-1" /> : null}
                        Pagar agora
                    </Button>
                }
            />
        );
    };

    // Address Type Resolution
    const addressTypeLabel = "Endereço de Entrega";

    // ERP style detail row helper
    const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
        <div className="flex justify-between items-center text-sm gap-4 py-2.5 border-b border-brand-border/40 dark:border-dark-border/40 last:border-0">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <div className="text-right font-semibold text-brand-dark dark:text-dark-heading">{value}</div>
        </div>
    );

    // Pricing details mapping
    const pricingSnapshot = getCheckoutPricingSnapshot(order);
    const itemsSubtotal = (order.order_items || []).reduce(
        (sum: number, item: any) => sum + Number(item.subtotal ?? Number(item.product_price || 0) * Number(item.quantity || 0)),
        0
    );
    const couponDiscountVal = Math.max(0, Number(pricingSnapshot?.couponDiscount ?? order.discount_amount ?? order.discount_total ?? 0));
    const paymentMethodDiscountVal = Math.max(0, Number(pricingSnapshot?.paymentMethodDiscount ?? order.payment_method_discount_amount ?? 0));
    const shippingVal = Math.max(0, Number(pricingSnapshot?.deliveryFee ?? order.delivery_fee ?? order.shipping_total ?? 0));
    const subtotalVal = Number(pricingSnapshot?.subtotal ?? order.subtotal_original ?? itemsSubtotal);
    const totalVal = Number(order.total_amount || 0);

    // Effective payment fees: prefer breakdown explicit fields over stale column
    const breakdownEntries = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown.filter((e: any) => e?.method && !e?.checkoutPricing) : [];
    const hasDetailedBreakdownFees = breakdownEntries.some((e: any) => e.interestAmount !== undefined || e.feeAmount !== undefined || e.fixedFeeAmount !== undefined);
    const customerVisibleTotals = hasDetailedBreakdownFees
        ? breakdownEntries.reduce((acc: any, e: any) => {
            const feeBearer = String(e?.feeBearer || "merchant").toLowerCase().trim()
            const installmentFeeBearer = String(e?.installmentFeeBearer || "merchant").toLowerCase().trim()
            const isCustomerFeeBearer = feeBearer === "customer" || feeBearer === "buyer"
            const isCustomerInstallmentBearer = installmentFeeBearer === "customer" || installmentFeeBearer === "buyer"
            const entryInterest = Number(e.interestAmount || 0)
            const entryInstallmentCost = Number(e.installmentCostAmount || 0)
            const entryFixedInterest = Math.max(0, entryInterest - entryInstallmentCost)
            const entryFee = Number(e.feeAmount || 0)
            const entryFixedFee = Number(e.fixedFeeAmount || 0)
            if (isCustomerFeeBearer) {
                acc.interest += entryFixedInterest
                acc.fee += entryFee
                acc.fixedFee += entryFixedFee
            }
            if (isCustomerInstallmentBearer) {
                acc.interest += entryInstallmentCost
            }
            return acc
        }, { interest: 0, fee: 0, fixedFee: 0 })
        : { interest: 0, fee: 0, fixedFee: 0 }
    const paymentMethodInterestVal = hasDetailedBreakdownFees ? customerVisibleTotals.interest : Math.max(0, Number(pricingSnapshot?.paymentMethodInterest || 0));
    const paymentMethodFeeVal = hasDetailedBreakdownFees ? customerVisibleTotals.fee : Math.max(0, Number(pricingSnapshot?.paymentMethodFee || 0));
    const paymentMethodFixedFeeVal = hasDetailedBreakdownFees ? customerVisibleTotals.fixedFee : Math.max(0, Number(pricingSnapshot?.paymentMethodFixedFee || 0));

    const cashEntry = Array.isArray(order.payment_breakdown)
        ? order.payment_breakdown.find((entry: any) => {
            const m = String(entry?.method || "").toLowerCase().trim();
            return m === "cash" || m === "dinheiro";
        })
        : null
    const wantsChange = cashEntry?.wantsChange ?? order.wants_change ?? order.wantsChange ?? false;
    const payWithAmount = Number(cashEntry?.payWithAmount ?? order.pay_with_amount ?? order.payWithAmount ?? 0);
    const changeAmount = Math.max(0, payWithAmount > 0 && wantsChange ? payWithAmount - totalVal : 0);

    const effectiveSubtotal = isDepositOrder ? itemsSubtotal : subtotalVal;
    const hasItemDiscount = !isDepositOrder && itemsSubtotal > 0 && effectiveSubtotal > 0 && Math.abs(itemsSubtotal - effectiveSubtotal) > 0.005
    const itemDiscountRatio = hasItemDiscount ? effectiveSubtotal / itemsSubtotal : 1

    const getItemDiscountedPrice = (item: any) => {
        const basePrice = Number(item.product_price || 0)
        if (item.is_gift || item.is_promotional) return basePrice
        if (!hasItemDiscount) return basePrice
        const discounted = basePrice * itemDiscountRatio
        return Math.round(discounted * 100) / 100
    }

    const renderPriceSummary = () => {
        if (isExchangeOrder) {
            return (
                <div className="space-y-3">
                    <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                        <span>Subtotal da Troca</span>
                        <span className="text-brand-dark dark:text-dark-heading font-medium">{formatCurrency(exchangeTotal)}</span>
                    </div>
                    {exchangeCredit > 0 && (
                        <div className="flex justify-between text-sm text-brand-green font-medium">
                            <span>Crédito do Item Devolvido</span>
                            <span>-{formatCurrency(exchangeCredit)}</span>
                        </div>
                    )}
                    <div className="border-t border-brand-border dark:border-dark-border my-2 pt-2 flex justify-between items-end">
                        <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                            {exchangeShortfall > 0 ? "Diferença a Pagar" : "Total da Troca"}
                        </span>
                        <span className={`font-bold text-lg ${exchangeShortfall > 0 ? "text-brand-orange" : "text-brand-green"}`}>
                            {formatCurrency(exchangeShortfall > 0 ? exchangeShortfall : 0)}
                        </span>
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-3">
                <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                    <span>Subtotal</span>
                    <span className="text-brand-dark dark:text-dark-heading font-medium">{formatCurrency(itemsSubtotal)}</span>
                </div>
                {shippingVal > 0 ? (
                    <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                        <span>Entrega</span>
                        <span className="text-brand-dark dark:text-dark-heading font-medium">{formatCurrency(shippingVal)}</span>
                    </div>
                ) : (
                    <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                        <span>Entrega</span>
                        <span className="text-brand-dark dark:text-dark-heading font-medium">Grátis</span>
                    </div>
                )}
                {couponDiscountVal > 0 && (
                    <div className="flex justify-between text-sm text-brand-green">
                        <span>Desconto do cupom</span>
                        <span className="font-medium">-{formatCurrency(couponDiscountVal)}</span>
                    </div>
                )}
                {paymentMethodDiscountVal > 0 && (
                    <div className="flex justify-between text-sm text-brand-green">
                        <span>Desconto do pagamento</span>
                        <span className="font-medium">-{formatCurrency(paymentMethodDiscountVal)}</span>
                    </div>
                )}
                {storeCreditUsed > 0.009 && (
                    <div className="flex justify-between text-sm text-brand-green">
                        <span>Crédito em loja</span>
                        <span className="font-medium">-{formatCurrency(storeCreditUsed)}</span>
                    </div>
                )}
                {paymentMethodInterestVal > 0 && (
                    <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                        <span>Juros do pagamento</span>
                        <span className="text-brand-dark dark:text-dark-heading font-medium">+{formatCurrency(paymentMethodInterestVal)}</span>
                    </div>
                )}
                {paymentMethodFeeVal > 0 && (
                    <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                        <span>Taxa do pagamento</span>
                        <span className="text-brand-dark dark:text-dark-heading font-medium">+{formatCurrency(paymentMethodFeeVal)}</span>
                    </div>
                )}
                {paymentMethodFixedFeeVal > 0 && (
                    <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                        <span>Custo do método</span>
                        <span className="text-brand-dark dark:text-dark-heading font-medium">+{formatCurrency(paymentMethodFixedFeeVal)}</span>
                    </div>
                )}
                {wantsChange && payWithAmount > 0 && (
                    <div className="flex justify-between text-sm text-brand-dark dark:text-dark-heading">
                        <span>Troco Solicitado</span>
                        <span className="font-bold">{formatCurrency(changeAmount)} (para {formatCurrency(payWithAmount)})</span>
                    </div>
                )}
                <div className="border-t border-brand-border dark:border-dark-border my-2 pt-2 flex justify-between items-end">
                    <span className="text-md font-bold text-brand-dark dark:text-dark-heading">Total</span>
                    <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">{formatCurrency(Math.max(0, totalVal - storeCreditUsed))}</span>
                </div>
            </div>
        );
    };

    const handleWhatsAppExchangeDifference = () => {
        const rawPhone = sellerReturnCapabilities.phone || store?.phone || "";
        const cleanPhone = rawPhone.replace(/\D/g, "");
        if (!cleanPhone) {
            toast({
                title: "Telefone não informado",
                description: "O vendedor não possui um telefone de contato cadastrado para WhatsApp.",
                variant: "destructive",
            });
            return;
        }

        const phoneWithCountry = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
        const text = `Olá! Gostaria de combinar o pagamento da diferença da minha troca (Pedido #${orderNumber}). O valor a acertar é de ${formatCurrency(exchangeShortfall)}. Como podemos proceder para retirada/envio dos produtos?`;
        const whatsappUrl = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
        window.open(whatsappUrl, "_blank");
    };

    const handlePixClick = async () => {
        if (!canRetryPayment && !isPendingExchangeShortfall) return;
        try {
            setLoadingPayment(true);
            const response = await fetch("/api/orders/retry-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: order.id }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || "Erro ao carregar pagamento");
            }
            const data = await response.json();
            if (data.alreadyPaid) {
                toast({ title: "Pedido quitado", description: "O pagamento já foi registrado com sucesso." });
                router.refresh();
                return;
            }
            if (data.chargeAmount != null) {
                setChargedAmount(data.chargeAmount);
            }
            if (data.boletoData?.barcode || data.boletoData?.ticketUrl) {
                setPixData(null);
                setBoletoData(data.boletoData);
                setPixOrderDetails(data.orderDetails);
                setShowPixModal(true);
            } else if (data.pixData?.qrCodeBase64 || data.pixData?.qrCode) {
                setBoletoData(null);
                setPixData(data.pixData);
                setPixOrderDetails(data.orderDetails);
                setShowPixModal(true);
            } else {
                toast({
                    title: "Pagamento não disponível",
                    description: "Não foi possível recuperar os dados de pagamento para este pedido.",
                    variant: "destructive",
                });
            }
        } catch (err: any) {
            console.error(err);
            toast({
                title: "Erro ao gerar pagamento",
                description: err?.message || "Não foi possível carregar os dados de pagamento.",
                variant: "destructive"
            });
        } finally {
            setLoadingPayment(false);
        }
    };

    const handleCancelOrder = async () => {
        try {
            setIsCanceling(true);
            if (order.situation !== "paid") {
                const res = await cancelBuyerOrderAction(order.id);
                if (res.error) throw new Error(res.error);

                toast({
                    title: "Pedido cancelado",
                    description: "O pedido foi cancelado com sucesso."
                });

                setIsCancelModalOpen(false);
                router.refresh();
            } else {
                const res = await createMarketplaceCancellationRequestAction({
                    orderId: order.id,
                    reason: cancelReason,
                    details: cancelDetails,
                    idempotencyKey: `cancel:${order.id}:${Date.now()}`,
                });
                if (!res.success) throw new Error(res.error);

                toast({
                    title: "Solicitação enviada",
                    description: "O vendedor recebeu seu pedido de cancelamento."
                });

                setIsCancelModalOpen(false);
                router.refresh();
            }
        } catch (err: any) {
            toast({
                title: order.situation !== "paid" ? "Erro ao cancelar" : "Erro ao solicitar cancelamento",
                description: err.message || "Ocorreu um erro.",
                variant: "destructive"
            });
        } finally {
            setIsCanceling(false);
        }
    };

    const handleEvidenceUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;
        const remaining = Math.max(0, 5 - returnEvidence.length);
        const newFiles = Array.from(files).slice(0, remaining);
        setReturnEvidence(prev => [...prev, ...newFiles]);
        event.target.value = "";
    };

    const handleRemoveEvidence = (index: number) => {
        setReturnEvidence(prev => prev.filter((_, i) => i !== index));
    };

    const submitReturnRequest = async () => {
        const productItems = Object.entries(returnItems)
            .filter(([, quantity]) => Number(quantity) > 0)
            .map(([orderItemId, quantity]) => {
                const item = order.order_items?.find((i: any) => i.id === orderItemId);
                return {
                    order_item_id: orderItemId,
                    name: item?.products?.name || item?.product_name || "Produto",
                    quantity: Number(quantity),
                    reason: returnReasons[orderItemId] || returnReason || "changed_mind",
                    condition: returnConditions[orderItemId] || "opened"
                };
            });

        const serviceItems = Object.entries(returnServiceItems)
            .filter(([, checked]) => checked)
            .map(([orderItemId]) => {
                const item = order.order_items?.find((i: any) => i.id === orderItemId);
                return {
                    order_item_id: orderItemId,
                    name: item?.services?.name || item?.product_name || "Serviço",
                    quantity: 1,
                    reason: returnReasons[orderItemId] || returnReason || "changed_mind",
                    condition: "opened" as const
                };
            });

        const allItems = [...productItems, ...serviceItems];
        const primaryReason = allItems[0]?.reason || returnReason || "changed_mind";

        if (allItems.length === 0) {
            toast({ title: "Selecione ao menos um item", variant: "destructive" });
            return;
        }

        // WhatsApp fallback flow when seller doesn't have the returns module or is on free plan
        if (!sellerReturnCapabilities.hasReturnsModule) {
            const rawPhone = sellerReturnCapabilities.phone || store?.phone || "";
            const cleanPhone = rawPhone.replace(/\D/g, "");
            if (!cleanPhone) {
                toast({
                    title: "Telefone não disponível",
                    description: "O vendedor não possui um telefone de contato cadastrado para WhatsApp.",
                    variant: "destructive",
                });
                return;
            }

            const phoneWithCountry = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
            const resolutionLabel = returnResolution === "exchange" ? "Troca" : returnResolution === "store_credit" ? "Vale-compra" : "Devolução / Reembolso";
            const reasonLabels: Record<string, string> = {
                wrong_item: "Item errado",
                defective: "Item com defeito",
                damaged: "Item danificado",
                different_from_description: "Diferente da descrição",
                missing_parts: "Faltam partes",
                arrived_late: "Chegou atrasado",
                changed_mind: "Mudou de ideia",
                other: "Outro",
            };
            const conditionLabels: Record<string, string> = {
                opened: "Aberto",
                sealed: "Lacrado",
                damaged: "Danificado",
            };

            const lines: string[] = [
                `*Solicitação de ${resolutionLabel}* 📦`,
                "",
                `Olá! Gostaria de solicitar ${resolutionLabel.toLowerCase()} para itens do meu pedido realizado na Dudit.`,
                "",
                `*📋 Dados do Pedido:*`,
                `• *Pedido:* #${orderNumber}`,
                `• *Cliente:* ${order.customer_name || 'Cliente'}`,
                `• *Data:* ${dateStrFull}`,
                "",
                `*🎯 Resolução desejada:* ${resolutionLabel}`,
                `*📌 Motivo principal:* ${reasonLabels[primaryReason] || primaryReason}`,
                "",
                `*📦 Itens para ${resolutionLabel.toLowerCase()}:*`,
            ];

            productItems.forEach((p) => {
                const cond = conditionLabels[p.condition] || p.condition;
                const itemReason = reasonLabels[p.reason] || p.reason;
                lines.push(`• ${p.name} (x${p.quantity}) - Motivo: ${itemReason} - Condição: ${cond}`);
            });

            serviceItems.forEach((s) => {
                const itemReason = reasonLabels[s.reason] || s.reason;
                lines.push(`• ${s.name} (Serviço) - Motivo: ${itemReason}`);
            });

            if (returnMessage.trim()) {
                lines.push("");
                lines.push(`*💬 Mensagem / Observações:*`);
                lines.push(`"${returnMessage.trim()}"`);
            }

            lines.push("");
            lines.push(`📸 _Obs: Caso haja fotos ou vídeos do ocorrido, enviarei em seguida aqui na conversa._`);

            const whatsappUrl = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(lines.join("\n"))}`;
            window.open(whatsappUrl, "_blank");

            toast({
                title: "Redirecionando para o WhatsApp",
                description: "Abrindo o WhatsApp do vendedor para prosseguir com sua solicitação.",
            });
            setIsReturnModalOpen(false);
            return;
        }

        try {
            setIsSubmittingReturn(true);

            const uploadedEvidence: any[] = [];
            for (const file of returnEvidence) {
                if (file instanceof File) {
                    const uploaded = await evidenceUploader.uploadFile(file);
                    uploadedEvidence.push({
                        file_url: uploaded.publicUrl,
                        file_key: uploaded.key,
                        file_name: file.name,
                        file_type: uploaded.contentType || file.type,
                        file_size: file.size,
                    });
                } else if (typeof file === 'string') {
                    uploadedEvidence.push({ file_url: file });
                }
            }

            const result = await createMarketplaceReturnRequestAction({
                orderId: order.id,
                resolution: returnResolution,
                reason: primaryReason,
                reasonCategory: RETURN_REASON_CATEGORY_MAP[primaryReason] || "other",
                message: returnMessage,
                items: allItems.map((item) => ({
                    order_item_id: item.order_item_id,
                    quantity: item.quantity,
                    reason: item.reason,
                    condition: item.condition || "opened",
                })),
                exchangeItems: returnResolution === "exchange" && selectedExchangeItems.length > 0
                    ? selectedExchangeItems.map((ei) => ({
                        product_id: ei.product_id,
                        variant_id: ei.variant_id || null,
                        quantity: ei.quantity,
                        unit_price: ei.unit_price,
                        product_name: ei.product_name,
                        sku: ei.sku,
                        image: ei.image,
                    }))
                    : undefined,
                evidence: uploadedEvidence,
                idempotencyKey: `marketplace:${order.id}:${Date.now()}`,
            });
            if (!result.success) throw new Error(result.error);
            toast({ title: "Solicitação enviada", description: "A loja recebeu seu pedido de troca ou devolução." });
            setSelectedExchangeItems([]);
            setIsReturnModalOpen(false);
            router.refresh();
        } catch (err: any) {
            toast({ title: "Erro ao enviar", description: err.message || "Tente novamente.", variant: "destructive" });
        } finally {
            setIsSubmittingReturn(false);
        }
    };

    const renderSummaryContent = () => (
        <>
            <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                {order.order_items?.map((item: any) => {
                    const itemKind = getItemKindLabel(item);
                    const fulfillmentLine = findFulfillmentLine(order, item);
                    const fulfillmentMode = item.fulfillment_mode || fulfillmentLine?.fulfillmentMode;
                    const itemImage = getPrimaryProductDisplayImage({
                        images: item.products?.images || null,
                        video_thumbnail: item.products?.video_thumbnail || null,
                        fallback_variant_image: item.product_variants?.variant_options?.image || null,
                    });
                    const isService = !!item.service_id || item.line_type === "service_booking";
                    const isPlan = !!item.recurring_plan_id || item.line_type === "subscription";
                    const bookingDate = fulfillmentLine?.bookingMetadata?.date || null;
                    const bookingTime = fulfillmentLine?.bookingMetadata?.time || null;
                    const content = (
                        <>
                            <div className="w-14 h-14 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center shrink-0">
                                <img
                                    src={itemImage}
                                    alt={item.products?.name || item.product_name}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-full"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-brand-dark dark:text-dark-heading text-sm truncate group-hover:text-brand-green transition-colors">
                                    {item.is_gift && <span className="text-brand-green font-bold">[BRINDE] </span>}{item.products?.name || item.product_name}
                                </h3>
                                {isService ? (
                                    <>
                                        {bookingDate && bookingTime ? (
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                {formatDate(bookingDate)} às {bookingTime}
                                                {fulfillmentMode ? ` | Local: ${getFulfillmentModeLabel(fulfillmentMode)}` : ""}
                                            </div>
                                        ) : fulfillmentMode ? (
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                {getFulfillmentModeLabel(fulfillmentMode)}
                                            </div>
                                        ) : null}

                                    </>
                                ) : (
                                    <>
                                        {item.product_variants?.variant_name && (
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">{item.product_variants.variant_name}</div>
                                        )}
                                        {(() => {
                                            const selectedAddons = item.booking_metadata?.selectedAddons || fulfillmentLine?.selectedAddons
                                            if (!Array.isArray(selectedAddons) || selectedAddons.length === 0) return null

                                            const groupsMap: Record<string, any[]> = {}
                                            selectedAddons.forEach((a: any) => {
                                                const gTitle = a.groupTitle || (selectedAddons.length === 1 ? "Complemento" : "Complementos")
                                                if (!groupsMap[gTitle]) groupsMap[gTitle] = []
                                                groupsMap[gTitle].push(a)
                                            })

                                            return Object.entries(groupsMap).map(([title, groupList], gIdx) => (
                                                <div key={gIdx} className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                    {title}: <span className="font-medium text-brand-dark dark:text-dark-heading">{groupList.map((a: any) => `${a.optionName || a.name || a.title || "Adicional"}${(Number(a.price) || 0) > 0 ? ` (+${formatCurrency(Number(a.price))})` : ""}`).join(", ")}</span>
                                                </div>
                                            ))
                                        })()}
                                    </>
                                )}
                                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                    {(() => {
                                        const displayPrice = getItemDiscountedPrice(item)
                                        const basePrice = Number(item.product_price || 0)
                                        const hasDiscount = !item.is_gift && hasItemDiscount && Math.abs(basePrice - displayPrice) > 0.005
                                        if (item.is_gift) {
                                            return (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                </div>
                                            )
                                        }
                                        if (hasDiscount) {
                                            return (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatProductUnitPrice(basePrice, item.products?.unit)}</span>
                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatProductUnitPrice(displayPrice, item.products?.unit)}</span>
                                                </div>
                                            )
                                        }
                                        return formatProductUnitPrice(basePrice, item.products?.unit)
                                    })()}
                                </div>
                            </div>
                            <div className="text-sm text-brand-inactive-text dark:text-dark-body shrink-0 pr-1">
                                {!isService ? formatProductQuantity(item.quantity, item.products?.unit) : ""}
                            </div>
                        </>
                    );

                    let itemUrl = "";
                    if (isService) {
                        itemUrl = getServiceUrl({ ...item.services, id: item.service_id, short_id: item.services?.short_id }, store || order.partners);
                    } else if (isPlan) {
                        itemUrl = getPlanUrl({ ...item.recurring_plans, id: item.recurring_plan_id, short_id: item.recurring_plans?.short_id }, store || order.partners);
                    } else if (item.product_id) {
                        itemUrl = getProductUrl({ ...item.products, id: item.product_id, short_id: item.products?.short_id }, store || order.partners);
                    }


                    if (!itemUrl) {
                        return (
                            <div
                                key={item.id}
                                className="group flex flex-row items-center gap-4 py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                            >
                                {content}
                            </div>
                        );
                    }
                    return (
                        <Link
                            href={itemUrl}
                            prefetch={true}
                            key={item.id}
                            className="group flex flex-row items-center gap-4 cursor-pointer py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                        >
                            {content}
                        </Link>
                    );
                })}
            </div>

            <div className="border-t border-brand-border dark:border-dark-border my-6"></div>

            <div className="space-y-3 pb-6 border-b border-brand-border dark:border-dark-border mb-6">
                <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                    <span>Itens ({order.order_items?.length || 0})</span>
                    <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(itemsSubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                    <span>Entrega</span>
                    <span className="text-brand-dark dark:text-dark-heading">{isDelivery ? "A calcular/Grátis" : "Retirada Grátis"}</span>
                </div>
            </div>

            <div className="flex justify-between items-end">
                <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">Total</span>
                <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">{formatCurrency(totalAmount)}</span>
            </div>
        </>
    );

    const renderReturnRequestCard = () => {
        if (!activeReturnRequest || !returnStatusCfg) return null;
        const canReport = canReportReturnToDudit({
            status: activeReturnRequest.status,
            slaStatus: activeReturnRequest.sla_status,
            reportedToDuditAt: activeReturnRequest.reported_to_dudit_at,
        });

        const resolutionType = activeReturnRequest.approved_resolution || activeReturnRequest.desired_resolution;
        const resolutionLabel = resolutionType === "refund" ? "Reembolso" :
            resolutionType === "exchange" ? "Troca" :
                resolutionType === "store_credit" ? "Vale-compra" : "Sem resolução";
        const isResolved = activeReturnRequest.status === "RESOLVED" || activeReturnRequest.status === "APPROVED";
        const reverseMethod = activeReturnRequest.reverse_logistics_method || null;
        const reverseStatus = activeReturnRequest.reverse_logistics_status || null;
        const reverseFreightPayer = activeReturnRequest.return_freight_payer || null;
        const reverseTracking = activeReturnRequest.reverse_logistics_tracking_code || null;
        const reverseNotes = activeReturnRequest.reverse_logistics_notes || null;
        const reverseDesc = getReverseLogisticsCustomerDescription(reverseMethod);
        const returnShipment = Array.isArray(order.order_shipments)
            ? order.order_shipments.find((s: any) => s.kind === "return" && s.status !== "cancelled")
            : null;
        const exchangeItemsSnap = Array.isArray(activeReturnRequest.exchange_items_snapshot)
            ? activeReturnRequest.exchange_items_snapshot
            : [];

        return (
            <InfoCard
                title={returnStatusCfg.title}
                color={returnStatusCfg.color}
                message={
                    <span className="space-y-1 block">
                        <span>{returnStatusCfg.description}</span>
                        {isResolved && resolutionType && (
                            <span className="block mt-1">
                                <strong className="font-medium">Tipo de resolução:</strong> {resolutionLabel}
                            </span>
                        )}
                        {exchangeItemsSnap.length > 0 && (
                            <span className="block mt-1.5">
                                <strong className="font-medium">Produtos selecionados na troca:</strong>{" "}
                                {exchangeItemsSnap
                                    .map((ei: any) => `${ei.product_name || "Produto"} (${ei.quantity || 1}x${Number(ei.unit_price || 0) > 0 ? ` - ${formatCurrency(Number(ei.unit_price))}` : ""})`)
                                    .join(", ")}
                            </span>
                        )}
                        {reverseMethod && (
                            <span className="block mt-1.5">
                                <strong className="font-medium">Devolução do item:</strong> {getReverseLogisticsMethodLabel(reverseMethod)}
                                {reverseMethod !== "not_required" && reverseStatus ? ` (${getReverseLogisticsStatusLabel(reverseStatus)})` : ""}
                                {reverseDesc ? ` — ${reverseDesc}` : ""}
                            </span>
                        )}
                        {reverseFreightPayer && reverseMethod && reverseMethod !== "not_required" && reverseMethod !== "in_person" && (
                            <span className="block mt-1">
                                <strong className="font-medium">Frete da devolução:</strong> {getShippingPayerLabel(reverseFreightPayer)}
                            </span>
                        )}
                        {(returnShipment?.tracking_number || reverseTracking) && (
                            <span className="block mt-1">
                                <strong className="font-medium">Rastreio / referência:</strong>{" "}
                                {returnShipment?.tracking_url ? (
                                    <a href={returnShipment.tracking_url} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                                        {returnShipment.tracking_number || "Acompanhar envio"}
                                    </a>
                                ) : (
                                    returnShipment?.tracking_number || reverseTracking
                                )}
                            </span>
                        )}
                        {reverseNotes && (
                            <span className="block mt-1">
                                <strong className="font-medium">Instruções da loja:</strong> {reverseNotes}
                            </span>
                        )}
                        {isResolved && Number(activeReturnRequest.refund_amount || 0) > 0 && (
                            <span className="block mt-1">
                                <strong className="font-medium">Valor reembolsado:</strong> {formatCurrency(Number(activeReturnRequest.refund_amount))}
                            </span>
                        )}
                        {isResolved && Number(activeReturnRequest.store_credit_amount || 0) > 0 && (
                            <span className="block mt-1">
                                <strong className="font-medium">Vale-compra gerado:</strong> {formatCurrency(Number(activeReturnRequest.store_credit_amount))}
                            </span>
                        )}
                        {activeReturnRequest.seller_notes && (
                            <span className="block mt-1 font-medium">
                                Observações do vendedor: {activeReturnRequest.seller_notes}
                            </span>
                        )}
                        {activeReturnRequest.reported_to_dudit_at && (
                            <span className="block mt-1">
                                Reporte enviado à Dudit em {formatDate(activeReturnRequest.reported_to_dudit_at)}.
                            </span>
                        )}
                    </span>
                }
                bottomElement={
                    <div className="flex flex-wrap items-center gap-4">
                        <Button
                            variant="link"
                            onClick={() => setActiveTab("return")}
                        >
                            Ver detalhes da solicitação
                        </Button>
                        {canReport && (
                            <Button
                                variant="link"
                                onClick={() => setReportReturnOpen(true)}
                            >
                                Reportar à Dudit
                            </Button>
                        )}
                    </div>
                }
            />
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full bg-white dark:bg-dark-surface transition-colors duration-300 w-full"
        >
            <div className="w-full">
                {/* Header */}
                <div className="mb-8 hidden lg:flex flex-row items-center gap-4 w-full justify-start">
                    <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                        <XIcon className="w-5 h-5" />
                    </Button>
                    <div className="text-left flex-1 min-w-0">
                        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-3 flex-wrap">
                            <span>Pedido #{orderNumber}</span>
                            {isErpOrder && <Badge variant="gray" icon={null}>Via loja</Badge>}
                            {order.nfe_number && (
                                <Badge variant="green" className="text-xs">
                                    NF-e #{order.nfe_number}
                                </Badge>
                            )}
                        </h1>
                        <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">{dateStrFull}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 text-sm font-bold ${statusConfig.color} shrink-0`}>
                        <statusConfig.icon size={16} />
                        <span>{statusConfig.statusText}</span>
                    </div>
                </div>

                <div className="max-w-3xl lg:max-w-[1400px] mx-auto w-full pb-32">
                    <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full">
                        <TabsList className="mb-8">
                            <TabsTrigger value="details">Detalhes do Pedido</TabsTrigger>
                            {isDelivery && (
                                <TabsTrigger value="delivery">Entrega</TabsTrigger>
                            )}
                            {activeReturnRequest && (
                                <TabsTrigger value="return">
                                    {(activeReturnRequest.approved_resolution || activeReturnRequest.desired_resolution) === "exchange"
                                        ? "Troca"
                                        : "Devolução"}
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="history">Histórico do Pedido</TabsTrigger>
                            {attachments.length > 0 && (
                                <TabsTrigger value="attachments">Anexos ({attachments.length})</TabsTrigger>
                            )}
                        </TabsList>

                        <TabsContent value="details" className="mt-0 focus-visible:ring-0">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                {/* Left Column (Sections 1, 2, 3, 4, 5) */}
                                <div className="lg:col-span-8 space-y-8">
                                    {/* Mobile/Tablet Order Summary Card */}
                                    <div className="block lg:hidden space-y-8">
                                        {order.order_source === "Assinatura" && (
                                            <InfoCard
                                                title="Pedido da assinatura"
                                                message={
                                                    order.payment_method === "Assinatura (Créditos)"
                                                        ? "Este pedido foi criado usando créditos da sua assinatura - sem cobrança adicional."
                                                        : "Este pedido foi gerado automaticamente pela sua assinatura recorrente."
                                                }
                                                color="blue"
                                                bottomElement={
                                                    order.recurring_subscription_id ? (
                                                        <Button
                                                            variant="link"
                                                            onClick={() =>
                                                                window.open(`/assinaturas?tab=assinaturas&view=${order.recurring_subscription_id}`)
                                                            }
                                                        >
                                                            Ver assinatura
                                                        </Button>
                                                    ) : undefined
                                                }
                                            />
                                        )}
                                        <FormSection title={
                                            <div className="flex items-center gap-2">
                                                <span>Pedido #{orderNumber}</span>
                                                {isErpOrder && <Badge variant="gray" icon={null}>Via loja</Badge>}
                                                {order.situation === "cancelled" && (
                                                    <Badge variant="red">Cancelado</Badge>
                                                )}
                                            </div>
                                        }>
                                            <DetailRow
                                                label="Status do Pedido"
                                                value={
                                                    <span className={statusConfig.color}>
                                                        {statusConfig.label}
                                                    </span>
                                                }
                                            />
                                            <DetailRow
                                                label="Data do Pedido"
                                                value={`${dateStrFull}`}
                                            />
                                            {order.nfe_number && (
                                                <DetailRow
                                                    label="Nota Fiscal (NF-e)"
                                                    value={
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                Nº {order.nfe_number}{order.nfe_series ? ` (Série ${order.nfe_series})` : ""}
                                                            </span>
                                                            {attachments.some((a: any) => a.file_name?.includes("DANFE") || a.file_name?.includes("NF")) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const danfeAtt = attachments.find((a: any) => a.file_name?.includes("DANFE") || a.file_name?.includes("NF"))
                                                                        if (danfeAtt) handleDownloadAttachment(danfeAtt.file_key, danfeAtt.file_name)
                                                                    }}
                                                                    className="text-xs text-brand-green font-semibold underline hover:text-emerald-700 cursor-pointer"
                                                                >
                                                                    Baixar DANFE (PDF)
                                                                </button>
                                                            )}
                                                        </div>
                                                    }
                                                />
                                            )}
                                        </FormSection>
                                    </div>

                                    {/* Section 1: Itens do Pedido */}
                                    <FormSection title="Itens do Pedido">
                                        <div className="space-y-4">
                                            {order.order_items?.map((item: any) => {
                                                const itemKind = getItemKindLabel(item);
                                                const fulfillmentLine = findFulfillmentLine(order, item);
                                                const fulfillmentMode = item.fulfillment_mode || fulfillmentLine?.fulfillmentMode;
                                                const itemImage = getPrimaryProductDisplayImage({
                                                    images: item.products?.images || null,
                                                    video_thumbnail: item.products?.video_thumbnail || null,
                                                    fallback_variant_image: item.product_variants?.variant_options?.image || null,
                                                });
                                                const isService = !!item.service_id || item.line_type === "service_booking";
                                                const isPlan = !!item.recurring_plan_id || item.line_type === "subscription";
                                                const bookingDate = fulfillmentLine?.bookingMetadata?.date || null;
                                                const bookingTime = fulfillmentLine?.bookingMetadata?.time || null;
                                                const content = (
                                                    <>
                                                        <div className="w-14 h-14 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center shrink-0">
                                                            <img src={itemImage} alt={item.products?.name || item.product_name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-bold text-brand-dark dark:text-dark-heading text-sm group-hover:text-brand-green transition-colors truncate">
                                                                {item.is_gift && <span className="text-brand-green font-bold">[BRINDE] </span>}{item.products?.name || item.product_name}
                                                            </h3>
                                                            {isService ? (
                                                                <>
                                                                    {bookingDate && bookingTime ? (
                                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                            {formatDate(bookingDate)} às {bookingTime}
                                                                            {fulfillmentMode ? ` | Local: ${getFulfillmentModeLabel(fulfillmentMode)}` : ""}
                                                                        </div>
                                                                    ) : fulfillmentMode ? (
                                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                            {getFulfillmentModeLabel(fulfillmentMode)}
                                                                        </div>
                                                                    ) : null}

                                                                </>
                                                            ) : (
                                                                <>
                                                                    {item.product_variants?.variant_name && (
                                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">{item.product_variants.variant_name}</div>
                                                                    )}
                                                                    {(() => {
                                                                        const selectedAddons = item.booking_metadata?.selectedAddons || fulfillmentLine?.selectedAddons
                                                                        if (!Array.isArray(selectedAddons) || selectedAddons.length === 0) return null

                                                                        const groupsMap: Record<string, any[]> = {}
                                                                        selectedAddons.forEach((a: any) => {
                                                                            const gTitle = a.groupTitle || (selectedAddons.length === 1 ? "Complemento" : "Complementos")
                                                                            if (!groupsMap[gTitle]) groupsMap[gTitle] = []
                                                                            groupsMap[gTitle].push(a)
                                                                        })

                                                                        return Object.entries(groupsMap).map(([title, groupList], gIdx) => (
                                                                            <div key={gIdx} className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                                {title}: <span className="font-medium text-brand-dark dark:text-dark-heading">{groupList.map((a: any) => `${a.optionName || a.name || a.title || "Adicional"}${(Number(a.price) || 0) > 0 ? ` (+${formatCurrency(Number(a.price))})` : ""}`).join(", ")}</span>
                                                                            </div>
                                                                        ))
                                                                    })()}
                                                                </>
                                                            )}
                                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">
                                                                {(() => {
                                                                    const displayPrice = getItemDiscountedPrice(item)
                                                                    const basePrice = Number(item.product_price || 0)
                                                                    const hasDiscount = !item.is_gift && hasItemDiscount && Math.abs(basePrice - displayPrice) > 0.005
                                                                    if (item.is_gift) {
                                                                        return (
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                            </div>
                                                                        )
                                                                    }
                                                                    if (hasDiscount) {
                                                                        return (
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatProductUnitPrice(basePrice, item.products?.unit)}</span>
                                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatProductUnitPrice(displayPrice, item.products?.unit)}</span>
                                                                            </div>
                                                                        )
                                                                    }
                                                                    return formatProductUnitPrice(basePrice, item.products?.unit)
                                                                })()}
                                                            </div>
                                                        </div>
                                                        <div className="text-sm text-brand-inactive-text dark:text-dark-body shrink-0 pr-1">
                                                            {!isService ? formatProductQuantity(item.quantity, item.products?.unit) : ""}
                                                        </div>
                                                    </>
                                                );

                                                let itemUrl = "";
                                                if (isService) {
                                                    itemUrl = getServiceUrl({ ...item.services, id: item.service_id, short_id: item.services?.short_id }, store || order.partners);
                                                } else if (isPlan) {
                                                    itemUrl = getPlanUrl({ ...item.recurring_plans, id: item.recurring_plan_id, short_id: item.recurring_plans?.short_id }, store || order.partners);
                                                } else if (item.product_id) {
                                                    itemUrl = getProductUrl({ ...item.products, id: item.product_id, short_id: item.products?.short_id }, store || order.partners);
                                                }


                                                if (!itemUrl) {
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            className="group flex flex-row items-center gap-4 py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                                                        >
                                                            {content}
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <Link
                                                        href={itemUrl}
                                                        prefetch={true}
                                                        key={item.id}
                                                        className="group flex flex-row items-center gap-4 cursor-pointer py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                                                    >
                                                        {content}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </FormSection>

                                    {/* Section 2: Endereço de entrega / retirada */}
                                    {hasProducts && (
                                        <FormSection title={isDelivery ? "Endereço de Entrega" : "Retirada no estabelecimento"} hasSeparator>
                                            {isDelivery ? (
                                                <div
                                                    onClick={() => setIsShippingModalOpen(true)}
                                                    className="flex items-stretch gap-3 cursor-pointer"
                                                >
                                                    <img
                                                        src="https://img.dudit.com.br/static/Map.png"
                                                        alt="Endereço de entrega"
                                                        className="w-10 h-10 object-cover rounded-full shrink-0"
                                                    />
                                                    <div className="flex flex-col justify-center">
                                                        <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                                                            {addressTypeLabel || "Endereço de Entrega"}
                                                        </p>
                                                        <p className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body">{order.delivery_address || 'Endereço não informado'}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div
                                                    onClick={() => setIsShippingModalOpen(true)}
                                                    className="flex items-stretch gap-3 cursor-pointer"
                                                >
                                                    <img
                                                        src="https://img.dudit.com.br/static/Map.png"
                                                        alt="Retirada no estabelecimento"
                                                        className="w-10 h-10 object-cover rounded-full shrink-0"
                                                    />
                                                    <div className="flex flex-col justify-center">
                                                        <p className="text-md font-bold text-brand-dark dark:text-dark-heading">Retirada no estabelecimento</p>
                                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">{formatPartnerAddress(store?.addresses)}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </FormSection>
                                    )}

                                    {(order.order_items || []).some((item: any) => item.service_id || item.recurring_plan_id || item.line_type === "service_booking" || item.line_type === "subscription") && (
                                        <FormSection title="Locais de atendimento" hasSeparator>
                                            <div className="space-y-6">
                                                {(order.order_items || [])
                                                    .filter((item: any) => item.service_id || item.recurring_plan_id || item.line_type === "service_booking" || item.line_type === "subscription")
                                                    .map((item: any) => {
                                                        const fulfillmentLine = findFulfillmentLine(order, item);
                                                        const mode = item.fulfillment_mode || fulfillmentLine?.fulfillmentMode;
                                                        const isCustomerAddress = mode === "customer_location" || mode === "delivery";
                                                        const storeAddr = store?.addresses?.[0] || store;
                                                        const address = isCustomerAddress
                                                            ? (order.delivery_address || "Endereço não informado")
                                                            : storeAddr?.street
                                                                ? `${storeAddr.street || ""}, ${storeAddr.number || "S/N"}${storeAddr.neighborhood ? ` - ${storeAddr.neighborhood}` : ""}, ${storeAddr.city || ""} - ${storeAddr.state || ""}`.replace(/\s+/g, ' ').trim()
                                                                : formatPartnerAddress(store?.addresses);

                                                        const isServiceCancelled = order.situation === "cancelled";
                                                        const isSub = !!item.recurring_plan_id || item.line_type === "subscription";
                                                        const bookingDate = fulfillmentLine?.bookingMetadata?.date || null;
                                                        const bookingTime = fulfillmentLine?.bookingMetadata?.time || null;
                                                        const addressTitle = isCustomerAddress
                                                            ? "Seu endereço"
                                                            : "Endereço do estabelecimento";
                                                        return (
                                                            <div key={`service-fulfillment-${item.id}`} className="flex items-stretch gap-3">
                                                                <img
                                                                    src="https://img.dudit.com.br/static/Map.png"
                                                                    alt={addressTitle}
                                                                    className="w-10 h-10 object-cover rounded-full shrink-0"
                                                                />
                                                                <div className="flex flex-col justify-center min-w-0">
                                                                    <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate">
                                                                        {addressTitle}
                                                                    </p>
                                                                    <p className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body">
                                                                        {bookingDate && bookingTime ? `${formatDate(bookingDate)} às ${bookingTime} | ` : ""}
                                                                        {address}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </FormSection>
                                    )}

                                    {/* Section 3: Pagamento */}
                                    <FormSection title="Pagamento" hasSeparator>
                                        <div className="space-y-3">
                                            {shouldShowSinal(depositSummary) && (
                                                <ListItem
                                                    icon={PaymentIconEl}
                                                    title={
                                                        <span className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                                                            {`Sinal - ${formatCurrency(depositSummary!.initialChargeAmount || 0)}`}
                                                        </span>
                                                    }
                                                    description={
                                                        <span className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body font-normal">
                                                            {depositSummary!.sinalPaid ? "pago" : "pendente"}
                                                        </span>
                                                    }
                                                    className="border-none px-0 py-2 !bg-transparent shadow-none hover:border-none cursor-default"
                                                    right={
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(depositSummary!.initialChargeAmount || 0)}
                                                        </span>
                                                    }
                                                />
                                            )}
                                            {shouldShowSinal(depositSummary) &&
                                                depositSummary!.sinalPaid && (
                                                    <ListItem
                                                        icon={PaymentIconEl}
                                                        title={
                                                            <span className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                                                                {`Saldo - ${formatCurrency(depositSummary!.remainingBalance)}`}
                                                            </span>
                                                        }
                                                        description={
                                                            <span className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body font-normal">
                                                                {depositSummary!.remainingBalance <= 0.009 ? "pago" : "pendente"}
                                                            </span>
                                                        }
                                                        className="border-none px-0 py-2 !bg-transparent shadow-none hover:border-none cursor-default"
                                                        right={
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                {formatCurrency(depositSummary!.remainingBalance)}
                                                            </span>
                                                        }
                                                    />
                                                )}
                                            {!isDepositOrder && (
                                                <ListItem
                                                    icon={PaymentIconEl}
                                                    title={
                                                        <span className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                                                            {paymentMethodName}
                                                        </span>
                                                    }
                                                    description={
                                                        <span className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body font-normal">
                                                            {isExchangeCreditPayment
                                                                ? "Crédito de troca aplicado"
                                                                : isStoreCreditPaymentOrder
                                                                    ? "Saldo em loja utilizado"
                                                                    : order.payment_provider === "Mercado Pago"
                                                                        ? "Mercado Pago"
                                                                        : "Pagamento direto"}
                                                        </span>
                                                    }
                                                    className="border-none px-0 py-2 !bg-transparent shadow-none hover:border-none cursor-default"
                                                    right={
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                            {formatCurrency(isExchangeOrder && exchangeShortfall > 0 ? exchangeShortfall : totalAmount)}
                                                        </span>
                                                    }
                                                />
                                            )}

                                            {isPendingExchangeShortfall && (
                                                hasMercadoPagoOnline ? (
                                                    <InfoCard
                                                        title="Diferença da Troca Pendente"
                                                        message={`O valor da diferença para os novos itens é de ${formatCurrency(exchangeShortfall)}. Pague via Pix para aprovar e liberar a entrega/retirada.`}
                                                        color="orange"
                                                        className="mt-4"
                                                        bottomElement={
                                                            <Button
                                                                variant="link"
                                                                onClick={handlePixClick}
                                                                disabled={loadingPayment}
                                                            >
                                                                {loadingPayment ? <Spinner size={14} className="mr-1" /> : null}
                                                                Pagar via Pix
                                                            </Button>
                                                        }
                                                    />
                                                ) : (
                                                    <InfoCard
                                                        title="Diferença da Troca"
                                                        message={`O valor da diferença é de ${formatCurrency(exchangeShortfall)}. Esta loja não utiliza pagamentos online na Dudit. O pagamento deve ser realizado diretamente no balcão da loja no momento da retirada ou combinado via WhatsApp.`}
                                                        color="blue"
                                                        className="mt-4"
                                                        bottomElement={
                                                            <Button
                                                                variant="link"
                                                                onClick={handleWhatsAppExchangeDifference}
                                                                leftIcon={<WhatsappIcon />}
                                                            >
                                                                Combinar no WhatsApp
                                                            </Button>
                                                        }
                                                    />
                                                )
                                            )}
                                        </div>
                                    </FormSection>

                                    {/* Section 4: Entregador */}
                                    {isDelivery && order.delivery_driver && (
                                        <FormSection title="Entregador">
                                            {order.delivery_driver.isPlatformDriver ? (
                                                <ListItem
                                                    title={
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                {order.delivery_driver.name || "Entregador"}
                                                            </span>
                                                            <Tooltip text="Entregador da Rede Dudit">
                                                                <img src="https://img.dudit.com.br/static/Icon.png" alt="Dudit" className="w-3.5 h-3.5 object-contain shrink-0 cursor-help" />
                                                            </Tooltip>
                                                        </div>
                                                    }
                                                    description={
                                                        <div className="flex items-center gap-1.5 flex-wrap text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                            {Number(order.delivery_driver.totalDeliveries || 0) > 0 && (
                                                                <span>{order.delivery_driver.totalDeliveries} entregas realizadas</span>
                                                            )}
                                                            {order.delivery_driver.vehicleType && (
                                                                <span>
                                                                    {Number(order.delivery_driver.totalDeliveries || 0) > 0 ? "• " : ""}
                                                                    {order.delivery_driver.vehicleType}
                                                                </span>
                                                            )}
                                                        </div>
                                                    }
                                                    left={
                                                        <UserProfileImage
                                                            fullName={order.delivery_driver.name || "Entregador"}
                                                            imageUrl={order.delivery_driver.avatarUrl}
                                                            className="w-10 h-10"
                                                        />
                                                    }
                                                    right={
                                                        order.delivery_driver.phone &&
                                                            ["sent", "out_for_delivery", "assigned", "accepted"].includes(
                                                                order.delivery_driver.driverStatus || order.delivery_status
                                                            ) ? (
                                                            <a href={`https://wa.me/55${String(order.delivery_driver.phone).replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                                                <Button
                                                                    variant="outline"
                                                                    leftIcon={<WhatsappIcon size={14} className="text-brand-green" />}
                                                                >
                                                                </Button>
                                                            </a>
                                                        ) : null
                                                    }
                                                    className="px-4 py-3"
                                                />
                                            ) : (
                                                <ListItem
                                                    icon={<MotorbikeIcon />}
                                                    title="Entregador da loja"
                                                    description="Entregador próprio do estabelecimento"
                                                    className="px-4 py-3"
                                                />
                                            )}
                                        </FormSection>
                                    )}

                                    {/* Section 5: Vendedor */}
                                    <FormSection title="Vendedor">
                                        {storeDeleted ? (
                                            <div className="flex items-center gap-4 block">
                                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                                                    <img src={storeImage} alt={sellerName} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                        <span>{sellerName}</span>
                                                        <Tooltip text="Este negócio não está mais na Dudit">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-brand-red shrink-0 inline-block align-middle cursor-help" />
                                                        </Tooltip>
                                                    </div>
                                                    <div className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body mt-0.5 max-w-sm">Este negócio não está mais na Dudit</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <Link href={getStoreUrl({ ...store, id: store?.store_id || store?.id || order.store_id || order.partner_id, short_id: store?.short_id, name: store?.name || sellerName })} prefetch={true} className="flex items-center gap-4 block cursor-pointer">

                                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                                                    <img src={storeImage} alt={sellerName} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">{sellerName}</div>
                                                    <div className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body mt-0.5 max-w-sm">Acessar perfil do vendedor</div>
                                                </div>
                                                <ChevronRightIcon size={18} className="text-brand-inactive-text dark:text-dark-body" />
                                            </Link>
                                        )}
                                    </FormSection>

                                    {/* Mobile/Tablet Section 5: Resumo dos Valores */}
                                    <div className="block lg:hidden">
                                        <FormSection title="Resumo dos Valores">
                                            <div>
                                                {renderPriceSummary()}
                                            </div>
                                            {/* Mobile/Tablet Actions / Buttons */}
                                            <div className="block lg:hidden space-y-4 pt-4">
                                                {renderPaymentExpirationCard()}

                                                {isPendingExchangeShortfall && (
                                                    <div>
                                                        {hasMercadoPagoOnline ? (
                                                            <Button
                                                                className="w-full h-12 font-bold bg-brand-primary text-white"
                                                                onClick={handlePixClick}
                                                                disabled={loadingPayment}
                                                            >
                                                                {loadingPayment ? (
                                                                    <><Spinner size={16} className="text-white mr-2" /> Gerando Pix...</>
                                                                ) : (
                                                                    `Pagar Diferença via Pix (${formatCurrency(exchangeShortfall)})`
                                                                )}
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                className="w-full h-12 font-bold bg-[#25D366] hover:bg-[#1EBE5D] text-white flex items-center justify-center gap-2"
                                                                onClick={handleWhatsAppExchangeDifference}
                                                            >
                                                                <WhatsappIcon size={18} className="fill-white" />
                                                                Combinar Diferença no WhatsApp
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}

                                                {canCancelOrder && (
                                                    <Button
                                                        variant="outlinered"
                                                        className="w-full h-12 font-bold"
                                                        onClick={() => setIsCancelModalOpen(true)}
                                                        disabled={isCanceling}
                                                    >
                                                        {isCanceling ? (
                                                            <><Spinner size={16} className="text-brand-red mr-2" /> Cancelando...</>
                                                        ) : (
                                                            "Cancelar pedido"
                                                        )}
                                                    </Button>
                                                )}

                                                {!canCancelOrder && !showReturnRequestButton && order.situation !== "cancelled" && !hasActiveReturn && (
                                                    <InfoCard
                                                        message="Este pedido já está sendo processado. Assim que sair para entrega, você poderá solicitar devolução, troca ou reembolso."
                                                        color="gray"
                                                    />
                                                )}

                                                {renderFulfillmentButtons()}

                                                {showReturnRequestButton && (
                                                    <>
                                                        {order.delivery_status === "delivered" && (
                                                            <p className="mb-3 text-sm text-brand-inactive-text dark:text-dark-body text-center">
                                                                Este pedido foi concluído. Para continuar, solicite uma devolução, troca ou reembolso.
                                                            </p>
                                                        )}
                                                        {order.delivery_status !== "delivered" && (
                                                            <p className="mb-3 text-sm text-brand-inactive-text dark:text-dark-body text-center">
                                                                Para este pedido, você pode solicitar reembolso ou vale-compra.
                                                            </p>
                                                        )}
                                                        <Button
                                                            variant="outline"
                                                            className="w-full h-12 font-bold"
                                                            onClick={() => { setReturnModalTab("items"); setIsReturnModalOpen(true); }}
                                                        >
                                                            {returnButtonLabel}
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </FormSection>
                                        {activeReturnRequest && (
                                            <div className="mt-6">
                                                {renderReturnRequestCard()}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column (resumo dos valores + actions) - Desktop only */}
                                <div className="hidden lg:block lg:col-span-4 pl-12 border-l border-brand-border dark:border-dark-border space-y-6">
                                    <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                                        <div className="text-md bg-brand-gray dark:bg-dark-border/50 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                                            Resumo dos Valores
                                        </div>
                                        <div className="p-6">
                                            {renderPriceSummary()}
                                        </div>
                                    </div>

                                    {renderReturnRequestCard()}

                                    {/* Desktop Actions / Buttons */}
                                    <div className="space-y-4 pt-4">
                                        {renderPaymentExpirationCard()}

                                        {isPendingExchangeShortfall && (
                                            <div>
                                                {hasMercadoPagoOnline ? (
                                                    <Button
                                                        className="w-full h-12 font-bold bg-brand-primary text-white"
                                                        onClick={handlePixClick}
                                                        disabled={loadingPayment}
                                                    >
                                                        {loadingPayment ? (
                                                            <><Spinner size={16} className="text-white mr-2" /> Gerando Pix...</>
                                                        ) : (
                                                            `Pagar Diferença via Pix (${formatCurrency(exchangeShortfall)})`
                                                        )}
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        className="w-full h-12 font-bold bg-[#25D366] hover:bg-[#1EBE5D] text-white flex items-center justify-center gap-2"
                                                        onClick={handleWhatsAppExchangeDifference}
                                                    >
                                                        <WhatsappIcon size={18} className="fill-white" />
                                                        Combinar Diferença no WhatsApp
                                                    </Button>
                                                )}
                                            </div>
                                        )}

                                        {canCancelOrder && (
                                            <Button
                                                variant="outlinered"
                                                className="w-full h-12 font-bold"
                                                onClick={() => setIsCancelModalOpen(true)}
                                                disabled={isCanceling}
                                            >
                                                {isCanceling ? (
                                                    <><Spinner size={16} className="text-brand-red mr-2" /> Cancelando...</>
                                                ) : (
                                                    "Cancelar pedido"
                                                )}
                                            </Button>
                                        )}

                                        {!canCancelOrder && !showReturnRequestButton && order.situation !== "cancelled" && !hasActiveReturn && (
                                            <InfoCard
                                                message="Este pedido já está sendo processado. Assim que sair para entrega, você poderá solicitar devolução, troca ou reembolso."
                                                color="gray"
                                            />
                                        )}

                                        {renderFulfillmentButtons()}

                                        {showReturnRequestButton && (
                                            <>
                                                {order.delivery_status === "delivered" && (
                                                    <p className="mb-3 text-sm text-brand-inactive-text dark:text-dark-body text-center">
                                                        Este pedido foi concluído. Para continuar, solicite uma devolução, troca ou reembolso.
                                                    </p>
                                                )}
                                                {order.delivery_status !== "delivered" && (
                                                    <p className="mb-3 text-sm text-brand-inactive-text dark:text-dark-body text-center">
                                                        Para este pedido, você pode solicitar reembolso ou vale-compra.
                                                    </p>
                                                )}
                                                <Button
                                                    variant="outline"
                                                    className="w-full h-12 font-bold"
                                                    onClick={() => { setReturnModalTab("items"); setIsReturnModalOpen(true); }}
                                                >
                                                    {returnButtonLabel}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {activeReturnRequest && (
                            <TabsContent value="return" className="mt-0 focus-visible:ring-0">
                                <BuyerReturnRequestTab
                                    order={order}
                                    returnRequest={activeReturnRequest}
                                    onReportToDudit={() => setReportReturnOpen(true)}
                                />
                            </TabsContent>
                        )}

                        <TabsContent value="history" className="mt-0 focus-visible:ring-0">
                            <div className="space-y-8">
                                {loadingBuyerHistory && combinedHistoryEntries.length === 0 ? (
                                    <div className="flex justify-center py-8">
                                        <ThreeDotsLoader />
                                    </div>
                                ) : (
                                    <HistoryTimeline
                                        entries={combinedHistoryEntries}
                                        title="Status do Acompanhamento"
                                        emptyMessage="Não foram encontrados eventos para este pedido."
                                    />
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="attachments" className="mt-0 focus-visible:ring-0">
                            <FormSection title="Anexos" description="Documentos em PDF, Word, Excel, CSV, etc.">
                                {loadingAttachments ? (
                                    <div className="flex justify-center py-8">
                                        <ThreeDotsLoader />
                                    </div>
                                ) : attachments.length === 0 ? (
                                    <IconPlaceholder
                                        icon={FileIcon}
                                        title="Nenhum anexo encontrado"
                                        subtitle="Não foram encontrados anexos para este pedido."
                                    />
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {attachments.map((att) => (
                                            <ListItem
                                                key={att.id}
                                                icon={FileIcon}
                                                title={att.file_name || "Documento"}
                                                description={formatFileSize(att.file_size)}
                                                onClick={() => handleDownloadAttachment(att.file_key, att.file_name)}
                                                className="p-3.5"
                                            />
                                        ))}
                                    </div>
                                )}
                            </FormSection>
                        </TabsContent>

                        {isDelivery && (
                            <TabsContent value="delivery" className="mt-0 focus-visible:ring-0">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                    <div className="lg:col-span-8 space-y-6">
                                        {/* Status da Entrega (Timeline) */}
                                        <DeliveryStatusTimeline
                                            deliveryStatus={order.delivery_status || ""}
                                            isPickup={order.delivery_type === "pickup"}
                                            isPaid={["paid", "partially_paid"].includes(order.situation)}
                                            orderCreatedAt={order.created_at}
                                            orderUpdatedAt={order.updated_at}
                                            carrier={carrierInfo}
                                        />

                                        {/* Entregador */}
                                        {order.delivery_type === "delivery" && (
                                            (() => {
                                                const marketplaceDriverInfo: DeliveryDriverInfo = order.delivery_driver
                                                    ? order.delivery_driver.isPlatformDriver
                                                        ? {
                                                            type: "platform",
                                                            name: order.delivery_driver.name,
                                                            avatarUrl: order.delivery_driver.avatarUrl,
                                                            isPlatformDriver: true,
                                                            totalDeliveries: order.delivery_driver.totalDeliveries,
                                                            vehicleType: order.delivery_driver.vehicleType,
                                                            driverStatus: order.delivery_driver.status,
                                                            phone: order.delivery_driver.phone,
                                                            platformDriverData: {
                                                                id: order.delivery_driver.id || order.delivery_driver.userId || order.delivery_driver.driverId,
                                                                fullName: order.delivery_driver.name,
                                                                phone: order.delivery_driver.phone,
                                                                avatarUrl: order.delivery_driver.avatarUrl,
                                                                vehicleType: order.delivery_driver.vehicleType,
                                                                totalDeliveries: order.delivery_driver.totalDeliveries,
                                                                status: order.delivery_driver.status,
                                                                isPlatformDriver: true,
                                                                isPendingAcceptance: order.delivery_driver.isPendingAcceptance,
                                                                acceptedAt: order.delivery_driver.accepted_at,
                                                                pickedUpAt: order.delivery_driver.picked_up_at,
                                                            },
                                                        }
                                                        : {
                                                            type: "store",
                                                            name: order.delivery_driver.name,
                                                            avatarUrl: null,
                                                            isPlatformDriver: false,
                                                        }
                                                    : { type: "none", name: "Entrega própria", isPlatformDriver: false }

                                                return (
                                                    <DeliveryDriverSection
                                                        driverInfo={marketplaceDriverInfo}
                                                        deliveryStatus={order.delivery_status || ""}
                                                        formatCurrency={formatCurrency}
                                                        carrier={carrierInfo}
                                                    />
                                                )
                                            })()
                                        )}
                                    </div>
                                    <div className="lg:col-span-4 pl-0 lg:pl-12 border-0 lg:border-l border-brand-border dark:border-dark-border space-y-6">

                                        <DeliverySummarySection
                                            order={order}
                                            driverInfo={(() => {
                                                if (!order.delivery_driver) {
                                                    return { type: "none" as const, name: "Entrega própria", isPlatformDriver: false }
                                                }
                                                if (order.delivery_driver.isPlatformDriver) {
                                                    return {
                                                        type: "platform" as const,
                                                        name: order.delivery_driver.name,
                                                        avatarUrl: order.delivery_driver.avatarUrl,
                                                        isPlatformDriver: true,
                                                        totalDeliveries: order.delivery_driver.totalDeliveries,
                                                        vehicleType: order.delivery_driver.vehicleType,
                                                        driverStatus: order.delivery_driver.status,
                                                        phone: order.delivery_driver.phone,
                                                    }
                                                }
                                                return {
                                                    type: "store" as const,
                                                    name: order.delivery_driver.name,
                                                    avatarUrl: null,
                                                    isPlatformDriver: false,
                                                }
                                            })()}
                                            formatCurrency={formatCurrency}
                                            formatPartnerAddress={formatPartnerAddress}
                                            carrier={carrierInfo}
                                            variant="card"
                                        />
                                    </div>
                                </div>
                            </TabsContent>
                        )}
                    </Tabs>
                </div>

                {(pixData || boletoData) && (
                    <PaymentWrapper
                        open={showPixModal}
                        onClose={() => {
                            setShowPixModal(false);
                            setPixData(null);
                            setBoletoData(null);
                        }}
                        pixData={pixData}
                        boletoData={boletoData}
                        orderId={order.id}
                        amount={chargedAmount || (isExchangeOrder && exchangeShortfall > 0 ? exchangeShortfall : Number(totalAmount))}
                        orderDetails={pixOrderDetails}
                        orderNumber={order.order_number}
                        sellerName={store?.name}
                        returnPath={`/pedidos?tab=details&order_number=${order.order_number || orderNumber}`}
                    />
                )}

                {order.situation !== "paid" ? (
                    <AlertModal
                        isOpen={isCancelModalOpen}
                        onClose={() => setIsCancelModalOpen(false)}
                        onConfirm={handleCancelOrder}
                        title="Cancelar pedido"
                        description="Tem certeza de que deseja cancelar este pedido? Essa ação não pode ser desfeita."
                        confirmText={isCanceling ? "Cancelando..." : "Sim, cancelar pedido"}
                        cancelText="Manter pedido"
                        variant="danger"
                        isLoading={isCanceling}
                    />
                ) : (
                    <DefaultModal
                        isOpen={isCancelModalOpen}
                        onClose={() => setIsCancelModalOpen(false)}
                        title="Cancelar pedido"
                        maxWidth="lg"
                        footer={
                            <div className="flex justify-end gap-3 w-full">
                                <Button variant="outline" onClick={() => setIsCancelModalOpen(false)} disabled={isCanceling}>Voltar</Button>
                                <Button variant="outlinered" onClick={handleCancelOrder} disabled={isCanceling}>
                                    {isCanceling ? "Cancelando..." : "Solicitar cancelamento"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-5">
                            <FormDropdown
                                label="Motivo do cancelamento"
                                value={cancelReason}
                                setValue={setCancelReason}
                                options={[
                                    { value: "purchased_by_mistake", label: "Comprei por engano" },
                                    { value: "better_price", label: "Encontrei preco melhor" },
                                    { value: "delivery_delay", label: "Atraso na entrega" },
                                    { value: "changed_mind", label: "Mudei de ideia" },
                                    { value: "payment_issue", label: "Problema no pagamento" },
                                    { value: "other", label: "Outro" },
                                ]}
                            />
                            <Input
                                label="Detalhes"
                                value={cancelDetails}
                                onChange={(e) => setCancelDetails(e.target.value)}
                                maxLength={500}
                                multiline
                                rows={4}
                                showCharacterCount
                            />
                        </div>
                    </DefaultModal>
                )}

                <DefaultModal
                    isOpen={isReturnModalOpen}
                    onClose={() => setIsReturnModalOpen(false)}
                    title="Solicitar troca ou devolução"
                    maxWidth="2xl"
                    footer={
                        <div className="flex justify-end gap-3 w-full">
                            <Button variant="outline" onClick={() => setIsReturnModalOpen(false)} disabled={isSubmittingReturn}>Cancelar</Button>
                            {!sellerReturnCapabilities.hasReturnsModule ? (
                                <Button
                                    onClick={submitReturnRequest}
                                    leftIcon={
                                        <WhatsappIcon size={16} />
                                    }
                                >
                                    Continuar no WhatsApp
                                </Button>
                            ) : (
                                <Button onClick={submitReturnRequest} disabled={isSubmittingReturn}>
                                    {isSubmittingReturn ? "Enviando..." : "Enviar solicitação"}
                                </Button>
                            )}
                        </div>
                    }
                >
                    {sellerReturnCapabilities.hasReturnsModule ? (
                        <Tabs defaultValue="items" value={returnModalTab} onValueChange={setReturnModalTab}>
                            <TabsList className="border-b border-brand-border dark:border-dark-border">
                                <TabsTrigger value="items">Motivo e Itens</TabsTrigger>
                                <TabsTrigger value="evidence">Evidências</TabsTrigger>
                            </TabsList>
                            <TabsContent value="items" className="space-y-6 pt-4">
                                {/* Produtos */}
                                {order.order_items?.filter((item: any) => !item.service_id && item.line_type !== "service_booking").length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Produtos</h4>
                                        {order.order_items
                                            ?.filter((item: any) => !item.service_id && item.line_type !== "service_booking")
                                            .map((item: any) => {
                                                const itemImage = getPrimaryProductDisplayImage({
                                                    images: item.products?.images || null,
                                                    video_thumbnail: item.products?.video_thumbnail || null,
                                                    fallback_variant_image: item.product_variants?.variant_options?.image || null,
                                                });
                                                    const isItemChecked = Number(returnItems[item.id] || 0) > 0;
                                                    return (
                                                    <div key={item.id} className="space-y-3 rounded-xl border border-brand-border/60 dark:border-dark-border/60 p-3">
                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                            <Checkbox
                                                                checked={isItemChecked}
                                                                disabled={remainingQuantities[item.id] <= 0}
                                                                onChange={(checked) => {
                                                                    setReturnItems(prev => ({ ...prev, [item.id]: checked ? 1 : 0 }));
                                                                    if (checked) {
                                                                        setReturnConditions(prev => ({ ...prev, [item.id]: prev[item.id] || "opened" }));
                                                                        setReturnReasons(prev => ({ ...prev, [item.id]: prev[item.id] || returnReason || "changed_mind" }));
                                                                    }
                                                                }}
                                                            />
                                                            <img
                                                                src={itemImage}
                                                                alt={item.products?.name || item.product_name}
                                                                loading="lazy"
                                                                decoding="async"
                                                                className="h-12 w-12 rounded-lg border border-brand-border object-contain shrink-0"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                    {item.products?.name || item.product_name}
                                                                    {remainingQuantities[item.id] <= 0 && (
                                                                        <span className="ml-1.5 text-xs text-red-500 font-bold">(Já devolvido)</span>
                                                                    )}
                                                                </p>
                                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Comprado: {formatProductQuantity(item.quantity, item.products?.unit, true)}</p>
                                                            </div>
                                                        </div>
                                                        {isItemChecked && (
                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-8">
                                                                <FormDropdown
                                                                    label="Motivo"
                                                                    value={returnReasons[item.id] || returnReason || "changed_mind"}
                                                                    setValue={(val) => setReturnReasons(prev => ({ ...prev, [item.id]: val }))}
                                                                    options={RETURN_REASON_OPTIONS}
                                                                />
                                                                <FormDropdown
                                                                    label="Condição"
                                                                    value={returnConditions[item.id] || "opened"}
                                                                    setValue={(val) => setReturnConditions(prev => ({ ...prev, [item.id]: val as any }))}
                                                                    options={[
                                                                        { value: "opened", label: "Aberto" },
                                                                        { value: "sealed", label: "Lacrado" },
                                                                        { value: "damaged", label: "Danificado" },
                                                                    ]}
                                                                />
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 truncate">Qtd</span>
                                                                    <QuantitySelector
                                                                        value={returnItems[item.id] || 1}
                                                                        onChange={(val) => setReturnItems(prev => ({ ...prev, [item.id]: val }))}
                                                                        min={1}
                                                                        max={remainingQuantities[item.id] || 1}
                                                                        disabled={remainingQuantities[item.id] <= 0}
                                                                        size="sm"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                    </div>
                                )}

                                {/* Servicos */}
                                {order.order_items?.filter((item: any) => item.service_id || item.line_type === "service_booking").length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Serviços</h4>
                                        {order.order_items
                                            ?.filter((item: any) => item.service_id || item.line_type === "service_booking")
                                            .map((item: any) => {
                                                const isCancelled = order.situation === "cancelled";
                                                const serviceImage = item.services?.images?.[0] || item.services?.video_thumbnail || null;
                                                return (
                                                    <div key={item.id} className="space-y-3 rounded-xl border border-brand-border dark:border-dark-border p-3">
                                                        <div className="flex items-center gap-3">
                                                            <Checkbox
                                                                checked={!!returnServiceItems[item.id]}
                                                                onChange={(checked) => {
                                                                    setReturnServiceItems(prev => ({ ...prev, [item.id]: checked }));
                                                                    if (checked) {
                                                                        setReturnReasons(prev => ({ ...prev, [item.id]: prev[item.id] || returnReason || "changed_mind" }));
                                                                    }
                                                                }}
                                                                disabled={isCancelled || returnResolution === "exchange"}
                                                            />
                                                            {serviceImage ? (
                                                                <img
                                                                    src={getR2ImageUrl(serviceImage)}
                                                                    alt={item.services?.name || item.product_name}
                                                                    className="h-12 w-12 rounded-lg border border-brand-border object-contain shrink-0"
                                                                />
                                                            ) : (
                                                                <div className="h-12 w-12 rounded-lg border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                                                                    <svg className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{item.services?.name || item.product_name}</p>
                                                                    {isCancelled && (
                                                                        <Badge variant="red">Cancelado</Badge>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Serviço</p>
                                                            </div>
                                                        </div>
                                                        {!!returnServiceItems[item.id] && (
                                                            <div className="pl-8">
                                                                <FormDropdown
                                                                    label="Motivo"
                                                                    value={returnReasons[item.id] || returnReason || "changed_mind"}
                                                                    setValue={(val) => setReturnReasons(prev => ({ ...prev, [item.id]: val }))}
                                                                    options={RETURN_REASON_OPTIONS}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                    </div>
                                )}

                                {returnResolution === "exchange" && hasAnyService && (
                                    <InfoCard title="Atenção" message="Serviços não permitem troca. Selecione Reembolso ou Vale-compra." color="orange" />
                                )}

                                <FormDropdown
                                    label="Resolução"
                                    value={returnResolution}
                                    setValue={(val) => setReturnResolution(val as any)}
                                    options={resolutionOptions}
                                />

                                {returnResolution === "exchange" && (
                                    <MarketplaceExchangeProductPicker
                                        orderId={order.id}
                                        orderProductIds={Array.from(
                                            new Set(
                                                (order.order_items || [])
                                                    .map((i: any) => i.product_id)
                                                    .filter(Boolean)
                                            )
                                        )}
                                        creditAmount={selectedReturnCreditAmount}
                                        selectedItems={selectedExchangeItems}
                                        onChange={setSelectedExchangeItems}
                                    />
                                )}

                                <FormTextarea
                                    label="Mensagem opcional"
                                    value={returnMessage}
                                    onChange={(e) => setReturnMessage(e.target.value)}
                                    maxLength={500}
                                    rows={3}
                                    showCharacterCount
                                    placeholder="Descreva detalhes adicionais sobre o motivo da troca/devolução (opcional)"
                                />
                            </TabsContent>
                            <TabsContent value="evidence" className="space-y-3 pt-4">
                                <h4 className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 truncate">Evidências</h4>
                                <div className="max-w-full overflow-x-auto">
                                    <ProductImagesSection
                                        images={returnEvidence}
                                        onImageUpload={handleEvidenceUpload}
                                        onRemoveImage={handleRemoveEvidence}
                                        onSetPrimaryImage={() => { }}
                                        isEditing={true}
                                    />
                                </div>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">{returnEvidence.length}/5 arquivos</p>
                            </TabsContent>
                        </Tabs>
                    ) : (
                        <div className="space-y-6">
                            {/* Produtos */}
                            {order.order_items?.filter((item: any) => !item.service_id && item.line_type !== "service_booking").length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Produtos</h4>
                                    {order.order_items
                                        ?.filter((item: any) => !item.service_id && item.line_type !== "service_booking")
                                        .map((item: any) => {
                                            const itemImage = getPrimaryProductDisplayImage({
                                                images: item.products?.images || null,
                                                video_thumbnail: item.products?.video_thumbnail || null,
                                                fallback_variant_image: item.product_variants?.variant_options?.image || null,
                                            });
                                            const isItemChecked = Number(returnItems[item.id] || 0) > 0;
                                            return (
                                                <div key={item.id} className="space-y-3 rounded-xl border border-brand-border/60 dark:border-dark-border/60 p-3">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <Checkbox
                                                            checked={isItemChecked}
                                                            disabled={remainingQuantities[item.id] <= 0}
                                                            onChange={(checked) => {
                                                                setReturnItems(prev => ({ ...prev, [item.id]: checked ? 1 : 0 }));
                                                                if (checked) {
                                                                    setReturnConditions(prev => ({ ...prev, [item.id]: prev[item.id] || "opened" }));
                                                                    setReturnReasons(prev => ({ ...prev, [item.id]: prev[item.id] || returnReason || "changed_mind" }));
                                                                }
                                                            }}
                                                        />
                                                        <img
                                                            src={itemImage}
                                                            alt={item.products?.name || item.product_name}
                                                            loading="lazy"
                                                            decoding="async"
                                                            className="h-12 w-12 rounded-lg border border-brand-border object-contain shrink-0"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                {item.products?.name || item.product_name}
                                                                {remainingQuantities[item.id] <= 0 && (
                                                                    <span className="ml-1.5 text-xs text-red-500 font-bold">(Já devolvido)</span>
                                                                )}
                                                            </p>
                                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">Comprado: {formatProductQuantity(item.quantity, item.products?.unit, true)}</p>
                                                        </div>
                                                    </div>
                                                    {isItemChecked && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-8">
                                                            <FormDropdown
                                                                label="Motivo"
                                                                value={returnReasons[item.id] || returnReason || "changed_mind"}
                                                                setValue={(val) => setReturnReasons(prev => ({ ...prev, [item.id]: val }))}
                                                                options={RETURN_REASON_OPTIONS}
                                                            />
                                                            <FormDropdown
                                                                label="Condição"
                                                                value={returnConditions[item.id] || "opened"}
                                                                setValue={(val) => setReturnConditions(prev => ({ ...prev, [item.id]: val as any }))}
                                                                options={[
                                                                    { value: "opened", label: "Aberto" },
                                                                    { value: "sealed", label: "Lacrado" },
                                                                    { value: "damaged", label: "Danificado" },
                                                                ]}
                                                            />
                                                            <div className="flex flex-col gap-1">
                                                                <span className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 truncate">Qtd</span>
                                                                <QuantitySelector
                                                                    value={returnItems[item.id] || 1}
                                                                    onChange={(val) => setReturnItems(prev => ({ ...prev, [item.id]: val }))}
                                                                    min={1}
                                                                    max={remainingQuantities[item.id] || 1}
                                                                    disabled={remainingQuantities[item.id] <= 0}
                                                                    size="sm"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                </div>
                            )}

                            {/* Servicos */}
                            {order.order_items?.filter((item: any) => item.service_id || item.line_type === "service_booking").length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Serviços</h4>
                                    {order.order_items
                                        ?.filter((item: any) => item.service_id || item.line_type === "service_booking")
                                        .map((item: any) => {
                                            const isCancelled = order.situation === "cancelled";
                                            const serviceImage = item.services?.images?.[0] || item.services?.video_thumbnail || null;
                                            return (
                                                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-brand-border dark:border-dark-border p-3">
                                                    <Checkbox
                                                        checked={!!returnServiceItems[item.id]}
                                                        onChange={(checked) => setReturnServiceItems(prev => ({ ...prev, [item.id]: checked }))}
                                                        disabled={isCancelled || returnResolution === "exchange"}
                                                    />
                                                    {serviceImage ? (
                                                        <img
                                                            src={getR2ImageUrl(serviceImage)}
                                                            alt={item.services?.name || item.product_name}
                                                            className="h-12 w-12 rounded-lg border border-brand-border object-contain shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="h-12 w-12 rounded-lg border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/50 flex items-center justify-center shrink-0">
                                                            <svg className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{item.services?.name || item.product_name}</p>
                                                            {isCancelled && (
                                                                <Badge variant="red">Cancelado</Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Serviço</p>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                </div>
                            )}

                            {returnResolution === "exchange" && hasAnyService && (
                                <InfoCard title="Atenção" message="Serviços não permitem troca. Selecione Reembolso ou Vale-compra." color="orange" />
                            )}

                            <FormDropdown
                                label="Resolução"
                                value={returnResolution}
                                setValue={(val) => setReturnResolution(val as any)}
                                options={resolutionOptions}
                            />

                            <FormTextarea
                                label="Mensagem opcional"
                                value={returnMessage}
                                onChange={(e) => setReturnMessage(e.target.value)}
                                maxLength={500}
                                rows={3}
                                showCharacterCount
                                placeholder="Descreva detalhes adicionais sobre o motivo da troca/devolução (opcional)"
                            />

                            <InfoCard
                                color="blue"
                                title="Fotos e evidências"
                                message="Esta loja realiza o atendimento de trocas e devoluções diretamente pelo WhatsApp. Se você possuir fotos ou vídeos do item, poderá enviá-los diretamente na conversa com o vendedor logo após abrir o aplicativo."
                            />
                        </div>
                    )}
                </DefaultModal>

                <DefaultModal
                    isOpen={isConfirmReceiptModalOpen}
                    onClose={() => setIsConfirmReceiptModalOpen(false)}
                    title={deliveryOtp?.requiresOtp && order.delivery_status !== "delivered" ? "Código de Confirmação de Entrega" : "Confirmar Recebimento"}
                    maxWidth="md"
                    footer={
                        deliveryOtp?.requiresOtp && order.delivery_status !== "delivered" ? (
                            <div className="flex justify-end w-full">
                                <Button variant="default" onClick={() => setIsConfirmReceiptModalOpen(false)}>
                                    Entendi
                                </Button>
                            </div>
                        ) : (
                            <div className="flex justify-end gap-3 w-full">
                                <Button variant="outline" onClick={() => setIsConfirmReceiptModalOpen(false)} disabled={isConfirming}>
                                    Voltar
                                </Button>
                                <Button
                                    variant="default"
                                    onClick={async () => {
                                        await handleConfirmFulfillment();
                                        setIsConfirmReceiptModalOpen(false);
                                    }}
                                    disabled={isConfirming}
                                >
                                    {isConfirming ? <Spinner size={16} className="text-white mr-2" /> : "Confirmar Recebimento"}
                                </Button>
                            </div>
                        )
                    }
                >
                    {deliveryOtp?.requiresOtp && order.delivery_status !== "delivered" ? (
                        <div className="flex flex-col gap-4 p-4 text-center">
                            <IconPlaceholder
                                icon={ShieldIcon}
                                title="Entrega protegida por código"
                                subtitle="Para sua segurança, a entrega deste pedido precisa ser confirmada diretamente pelo entregador utilizando o código de confirmação."
                            />

                            {deliveryOtp.code && (
                                <div className="flex justify-center items-center gap-1.5">
                                    {deliveryOtp.code.split("").map((digit: string, i: number) => (
                                        <span key={i} className="w-10 h-10 sm:w-12 sm:h-12 text-center text-xl sm:text-2xl font-black rounded-xl border border-brand-border dark:border-dark-border focus:border-brand-green outline-hidden transition-all text-brand-dark dark:text-dark-heading">
                                            {digit}
                                        </span>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Forneça este código ao entregador apenas quando ele estiver no local e você tiver conferido seus itens.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 p-4">
                            <p className="text-sm text-brand-dark dark:text-dark-body">
                                Confirma que você já recebeu todos os produtos deste pedido em perfeitas condições?
                            </p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Ao confirmar, o status do pedido será atualizado para <strong>Entregue</strong>.
                            </p>
                        </div>
                    )}
                </DefaultModal>

                {activeReturnRequest && (
                    <ReportReturnModal
                        open={reportReturnOpen}
                        onClose={() => setReportReturnOpen(false)}
                        returnRequestId={activeReturnRequest.id}
                        onReported={() => router.refresh()}
                    />
                )}
            </div>
        </motion.div >
    );
};
