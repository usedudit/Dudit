"use client"

import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronRightIcon, CreditCardIcon, XIcon, CheckCircleIcon, ClockIcon, AlertCircleIcon, MoneyIcon, WhatsappIcon, TruckIcon, MotorbikeIcon } from '@/lib/icons';
import { motion } from 'framer-motion';
import { Button, Spinner, FormSection, ListItem, Tabs, TabsList, TabsTrigger, TabsContent, Input, FormDropdown, Checkbox, Badge, DefaultModal, QuantitySelector, ThreeDotsLoader, IconPlaceholder, Tooltip, InfoCard, AlertModal } from '@/components/reusable';
import ProductImagesSection from '@/components/erp/product/ProductImagesSection';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import Link from 'next/link';
import { PaymentWrapper } from '@/components/PaymentWrapper';
import { createMarketplaceCancellationRequestAction, createMarketplaceReturnRequestAction } from '@/app/actions/erp/returns';
import { cancelBuyerOrderAction, confirmOrderFulfillmentAction } from '@/app/actions/marketplace/orders';
import { getPartnerReturnPolicyPublicAction } from '@/app/actions/marketplace/store-policies';
import { getOrderAttachmentsAction, getOrderAttachmentUrlAction } from '@/app/actions/erp/orders';
import { FileIcon } from '@/lib/icons';
import { formatFileSize } from '@/components/erp/orders/OrderAttachmentsTab';
import { HistoryTimeline } from '@/components/erp/shared/HistoryTimeline';
import { getProductUrl, getStoreUrl, getServiceUrl, getPlanUrl } from '@/lib/utils/url-generator';
import { useR2Upload } from '@/hooks/use-r2-upload';
import { canRequestOrderCancellation, canRequestPostFulfillmentResolution } from '@/lib/returns/calculations';
import { getPrimaryProductDisplayImage } from '@/lib/utils/product-display-images';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatDate, formatFullDate, formatTime, formatQuantityWithUnit, formatUnitPriceWithUnit, isStoreDeleted } from '@/lib/utils';
import { ReportReturnModal } from '@/components/marketplace/ReportReturnModal';
import { canReportReturnToDudit } from '@/lib/returns/policy';
import { getReturnStatusLabel } from '@/lib/returns/types';
import { hasReceivedMpPayment, getOrderDepositSummary, shouldShowSinal } from '@/lib/payments/order-financial-state';

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

const getStatusConfig = (status: string) => {
    switch (status) {
        case 'paid': return { label: 'Pago', color: 'text-brand-green', icon: CheckCircleIcon, statusText: 'Aprovado' };
        case 'pending': return { label: 'Pendente', color: 'text-brand-orange', icon: ClockIcon, statusText: 'Aguardando pagamento' };
        case 'cancelled': return { label: 'Cancelado', color: 'text-brand-red', icon: XIcon, statusText: 'Cancelado' };
        default: return { label: status, color: 'text-gray-500 dark:text-dark-body', icon: AlertCircleIcon, statusText: status };
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
                title: `${typeLabel} aprovado(a)!`,
                description: `O vendedor aceitou sua solicitação. Resolução: ${request.approved_resolution === "refund" ? "Reembolso" : request.approved_resolution === "store_credit" ? "Vale-compra" : "Troca"}.`,
                color: "green",
            };
        case "REJECTED":
            return {
                title: `${typeLabel} recusado(a)`,
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
                title: `${typeLabel} concluído(a)`,
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
            finalLabel = isPickup ? "Retirada não realizada" : "Não entregue";
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
    const [returnResolution, setReturnResolution] = useState<"exchange" | "refund" | "store_credit">("refund");
    const [returnMessage, setReturnMessage] = useState("");
    const [returnItems, setReturnItems] = useState<Record<string, number>>({});
    const [returnConditions, setReturnConditions] = useState<Record<string, "sealed" | "opened" | "damaged">>({});
    const [returnServiceItems, setReturnServiceItems] = useState<Record<string, boolean>>({});
    const [returnEvidence, setReturnEvidence] = useState<(string | File)[]>([]);
    const [isBottomSummaryOpen, setIsBottomSummaryOpen] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
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

    const [activeTab, setActiveTab] = useState<"details" | "history" | "attachments" | "delivery">("details");
    const [attachments, setAttachments] = useState<any[]>([]);
    const [loadingAttachments, setLoadingAttachments] = useState(false);
    const [storePolicy, setStorePolicy] = useState<any>(null);

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

    const activeSteps = getClientTimelineSteps(order).filter(s => s.active);
    const historyEntries = activeSteps.map((step, idx) => {
        const dateToUse = step.iso || order.created_at;
        let changeLines: string[] = [];
        if (step.subLabel) {
            changeLines = Array.isArray(step.subLabel) ? step.subLabel : [step.subLabel];
        } else {
            if (step.label === "Pedido Realizado") changeLines = ["Seu pedido foi registrado em nosso sistema."];
            else if (step.label === "Aguardando pagamento") changeLines = ["Aguardando a confirmação do pagamento pelo intermediador."];
            else if (step.label === "Pago") changeLines = ["Pagamento confirmado com sucesso."];
            else if (step.label === "Em andamento" || step.label === "Em progresso") changeLines = ["O vendedor está processando seu pedido."];
            else if (step.label === "Enviado") changeLines = ["Seu pedido saiu para entrega."];
            else if (step.label === "Pronto para retirada") changeLines = ["Produtos do pedido estão prontos para serem retirados no local."];
            else if (step.label === "Finalizado") changeLines = ["Seu pedido está em fase de conclusão."];
            else if (step.label === "Pedido entregue") changeLines = ["O pedido foi entregue ao destinatário."];
            else if (step.label === "Pedido retirado") changeLines = ["O pedido foi retirado na loja."];
            else if (step.label === "Concluído") changeLines = ["O serviço foi concluído."];
            else if (step.label === "Cancelado") changeLines = ["O pedido foi cancelado."];
            else if (step.label === "Não entregue" || step.label === "Entrega não realizada" || step.label === "Retirada não realizada") changeLines = ["Não foi possível realizar a entrega do pedido."];
            else changeLines = ["Etapa concluída."];
        }

        return {
            id: `step-${idx}-${step.label}`,
            actor_name: step.label,
            change_lines: changeLines,
            created_at: dateToUse,
            entry_type: step.label.toLowerCase()
        };
    });

    const remainingQuantities = useMemo(() => {
        const remaining: Record<string, number> = {}
        const orderItems = order?.order_items || []
        const returnedQtyMap: Record<string, number> = {}
        const requests = order?.return_requests || []

        requests.forEach((rr: any) => {
            if (rr.deleted_at) return
            const status = String(rr.status || "").toUpperCase()
            if (status === "REJECTED" || status === "EXPIRED" || status === "CANCELLED") return
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

    const activeReturnRequest = order.return_requests?.find((r: any) => !r.deleted_at && ["PENDING_REVIEW", "UNDER_ANALYSIS", "APPROVED", "WAITING_CUSTOMER", "WAITING_ITEM_RETURN", "PROCESSING", "ESCALATED"].includes(r.status));
    const hasActiveReturn = !!activeReturnRequest;
    const returnStatusCfg = activeReturnRequest ? getReturnRequestStatusConfig(activeReturnRequest) : null;

    const returnEvents = activeReturnRequest?.auditLogs || [];
    const mappedReturnHistoryEntries = returnEvents.map((evt: any) => {
        let title = "Solicitação de devolução";
        let lines = [evt.message || "Evento de devolução registrado."];

        if (evt.event_type === "created" || evt.message === "Solicitação criada" || evt.message === "Solicitação de cancelamento criada") {
            title = "Solicitação de devolução";
            lines = [evt.message === "Solicitação de cancelamento criada" ? "Solicitação de cancelamento criada" : "Solicitação de devolução criada pelo cliente"];
        } else if (evt.event_type === "status_changed" || evt.event_type === "status_updated" || evt.event_type === "updated") {
            title = "Atualização da solicitação de devolução";
            lines = [`Solicitação atualizada: ${getReturnStatusLabel(evt.from_status || "PENDING_REVIEW")} para ${getReturnStatusLabel(evt.to_status)}`];
        } else if (evt.event_type === "message_added") {
            title = "Mensagem na Devolução";
            lines = [evt.message];
        }

        return {
            id: `return-evt-${evt.id}`,
            actor_name: title,
            change_lines: lines,
            created_at: evt.created_at || new Date().toISOString(),
            entry_type: "devolução"
        };
    });

    const combinedHistoryEntries = [...historyEntries, ...mappedReturnHistoryEntries].sort((a, b) => {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

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

    if (!order) return null;

    const orderNumber = order.order_number || order.id.slice(0, 8).toUpperCase();
    const dateStrFull = formatFullDate(order.created_at);
    const dateStrTime = formatTime(order.created_at);
    const statusConfig = getStatusConfig(order.situation);
    const store = Array.isArray(order.stores) ? order.stores[0] : order.stores
    const storeImage = store?.logo_url
        ? getR2ImageUrl(store.logo_url)
        : "https://img.dudit.com.br/static/Placeholder.png";

    const isDelivery = order.delivery_type === "delivery";
    const sellerName = store?.name || order.partners?.name || order.partners?.store_name || "Loja Parceira";
    const totalAmount = Number(order.total_amount);

    const hasAnyService = orderItems.some((item: any) => item.service_id || item.line_type === "service_booking");
    const hasProducts = orderItems.some((item: any) => !item.service_id && !item.recurring_plan_id && item.line_type !== "service_booking" && item.line_type !== "subscription");
    const hasMixedItems = hasAnyService && hasProducts;
    const storeDeleted = isStoreDeleted(order);
    const isCancelled = order.situation === "cancelled";
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
                    onClick={handleConfirmFulfillment}
                    disabled={isConfirming}
                >
                    {isConfirming ? <Spinner size={16} className="text-brand-green mr-2" /> : "Confirmar Recebimento"}
                </Button>
            );
        }
        return null;
    };

    const getPaymentTypeLabel = () => {
        let baseLabel = "Pix";
        const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
        const methodEntries = breakdown.filter((e: any) => e?.method);
        const paidMethodEntries = methodEntries.filter((e: any) => Number(e?.amountReceived ?? e?.amount ?? 0) > 0.009);
        const paidLabels = Array.from(new Set(paidMethodEntries.map((e: any) => String(e?.method || "").toLowerCase().trim()).filter(Boolean)));
        const hasMultiplePaidMethods = paidLabels.length > 1;

        if (hasMultiplePaidMethods) {
            baseLabel = "Múltiplos meios";
        } else if (paidMethodEntries.length === 1 || methodEntries.length === 1) {
            const m = (paidMethodEntries[0] || methodEntries[0]).method.toLowerCase();
            if (m === "pix" || m === "bank_transfer") baseLabel = "Pix";
            else if (m.includes("crédito") || m.includes("credito") || m.includes("credit")) baseLabel = "Cartão de Crédito";
            else if (m.includes("débito") || m.includes("debito") || m.includes("debit")) baseLabel = "Cartão de Débito";
            else if (m.includes("dinheiro") || m.includes("cash") || m.includes("money")) baseLabel = "Dinheiro";
            else if (m.includes("boleto") || m.includes("bolbradesco") || m === "ticket") baseLabel = "Boleto";
            else baseLabel = (paidMethodEntries[0] || methodEntries[0]).method;
        } else {
            const pm = String(order.payment_method || "").toLowerCase();
            if (pm === "pix" || pm === "bank_transfer") baseLabel = "Pix";
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

    const paymentMethodName = isExchangeOrder
        ? (exchangeShortfall > 0 ? "Troca (com diferença)" : "Troca (Quitada)")
        : getPaymentTypeLabel();
    const isMercadoPago = hasReceivedMpPayment(order) || (isExchangeOrder && hasMercadoPagoOnline) || (Boolean(order?.checkout_fulfillment?.depositCheckout?.payDepositOnly) && hasMercadoPagoOnline);
    const isPixPayment = isExchangeOrder || paymentMethodName.toLowerCase().includes("pix");
    const isBoletoPayment = paymentMethodName.toLowerCase().includes("boleto") || paymentMethodName.toLowerCase().includes("bolbradesco");
    const isPaymentExpired = Boolean(order.payment_expires_at && new Date(order.payment_expires_at) < new Date());
    const canRetryPayment = order.situation === "pending" && isMercadoPago && (isPixPayment || isBoletoPayment) && !isPaymentExpired;
    const PaymentIconEl = (() => {
        const icons: React.ReactNode[] = [];
        const isStoreCredit = order.payment_method === "store_credit" || order.payment_method === "vale-compra" || order.payment_method === "vale_compra";
        if (isStoreCredit) {
            icons.push(
                <img key="vc" src="https://img.dudit.com.br/static/icons/payments/Voucher.png" alt="Vale-compra" className="w-5 h-5 object-contain shrink-0" />
            );
        } else if (isMercadoPago) {
            icons.push(
                <img key="mp" src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain shrink-0" />
            );
        }

        // Extract submethod name
        const nameLower = paymentMethodName.toLowerCase();
        if (nameLower.includes("pix") || isExchangeOrder) {
            icons.push(<img key="pix" src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-5 h-5 object-contain shrink-0" />);
        } else if (nameLower.includes("crédito") || nameLower.includes("credito") || nameLower.includes("credit") || nameLower.includes("débito") || nameLower.includes("debito") || nameLower.includes("debit")) {
            icons.push(<img key="card" src="https://img.dudit.com.br/static/icons/payments/CreditCard.png" alt="Cartão" className="w-5 h-5 object-contain shrink-0" />);
        } else if (nameLower.includes("dinheiro") || nameLower.includes("cash") || nameLower.includes("money")) {
            icons.push(<MoneyIcon key="money" size={20} className="text-brand-dark dark:text-dark-heading shrink-0" />);
        } else if (nameLower.includes("boleto")) {
            icons.push(<img key="boleto" src="https://img.dudit.com.br/static/icons/payments/Boleto.png" alt="Boleto" className="w-5 h-5 object-contain shrink-0" />);
        } else if (!isMercadoPago) {
            icons.push(<CreditCardIcon key="default" size={20} className="text-brand-dark dark:text-dark-heading shrink-0" />);
        }
        return <div className="flex items-center gap-1.5">{icons}</div>;
    })();

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
    const isDepositOrder = Boolean(order?.checkout_fulfillment?.depositCheckout?.payDepositOnly);
    const depositSummary = isDepositOrder ? getOrderDepositSummary(order) : null;

    // Effective payment fees: prefer breakdown explicit fields over stale column
    const breakdownEntries = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown.filter((e: any) => e?.method && !e?.checkoutPricing) : [];
    const hasDetailedBreakdownFees = breakdownEntries.some((e: any) => e.interestAmount !== undefined || e.feeAmount !== undefined || e.fixedFeeAmount !== undefined);
    const paymentMethodInterestVal = hasDetailedBreakdownFees ? breakdownEntries.reduce((sum: number, e: any) => sum + Number(e.interestAmount || 0), 0) : Math.max(0, Number(pricingSnapshot?.paymentMethodInterest || 0));
    const paymentMethodFeeVal = hasDetailedBreakdownFees ? breakdownEntries.reduce((sum: number, e: any) => sum + Number(e.feeAmount || 0), 0) : Math.max(0, Number(pricingSnapshot?.paymentMethodFee || 0));
    const paymentMethodFixedFeeVal = hasDetailedBreakdownFees ? breakdownEntries.reduce((sum: number, e: any) => sum + Number(e.fixedFeeAmount || 0), 0) : Math.max(0, Number(pricingSnapshot?.paymentMethodFixedFee || 0));

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
                    <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">{formatCurrency(totalVal)}</span>
                </div>
            </div>
        );
    };

    const handleWhatsAppExchangeDifference = () => {
        const rawPhone = sellerReturnCapabilities.phone || store?.phone || order.partners?.phone || "";
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
                    reason: returnReason,
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
                    reason: returnReason,
                    condition: "opened" as const
                };
            });

        const allItems = [...productItems, ...serviceItems];

        if (allItems.length === 0) {
            toast({ title: "Selecione ao menos um item", variant: "destructive" });
            return;
        }

        // WhatsApp fallback flow when seller doesn't have the returns module or is on free plan
        if (!sellerReturnCapabilities.hasReturnsModule) {
            const rawPhone = sellerReturnCapabilities.phone || store?.phone || order.partners?.phone || "";
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
                `*📌 Motivo:* ${reasonLabels[returnReason] || returnReason}`,
                "",
                `*📦 Itens para ${resolutionLabel.toLowerCase()}:*`,
            ];

            productItems.forEach((p) => {
                const cond = conditionLabels[p.condition] || p.condition;
                lines.push(`• ${p.name} (x${p.quantity}) - Condição: ${cond}`);
            });

            serviceItems.forEach((s) => {
                lines.push(`• ${s.name} (Serviço)`);
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
                reason: returnReason,
                reasonCategory: RETURN_REASON_CATEGORY_MAP[returnReason] || "other",
                message: returnMessage,
                items: allItems.map((item) => ({
                    order_item_id: item.order_item_id,
                    quantity: item.quantity,
                    reason: item.reason,
                    condition: item.condition || "opened",
                })),
                evidence: uploadedEvidence,
                idempotencyKey: `marketplace:${order.id}:${Date.now()}`,
            });
            if (!result.success) throw new Error(result.error);
            toast({ title: "Solicitação enviada", description: "A loja recebeu seu pedido de troca ou devolução." });
            setIsReturnModalOpen(false);
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

        return (
            <InfoCard
                title={returnStatusCfg.title}
                color={returnStatusCfg.color}
                message={
                    <span className="space-y-1 block">
                        <span>{returnStatusCfg.description}</span>
                        {activeReturnRequest.seller_notes && (
                            <span className="block mt-1 font-medium">
                                Observações do vendedor: {activeReturnRequest.seller_notes}
                            </span>
                        )}
                        {activeReturnRequest.reported_to_dudit_at && (
                            <span className="block mt-1 text-xs opacity-80">
                                Reporte enviado à Dudit em {formatDate(activeReturnRequest.reported_to_dudit_at)}.
                            </span>
                        )}
                    </span>
                }
                rightElement={
                    canReport ? (
                        <Button
                            variant="link"
                            size="sm"
                            className="p-0 h-auto whitespace-nowrap"
                            onClick={() => setReportReturnOpen(true)}
                        >
                            Reportar à Dudit
                        </Button>
                    ) : undefined
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
                            {isDelivery && order.delivery_driver && (
                                <TabsTrigger value="delivery">Entrega</TabsTrigger>
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
                                    <div className="block lg:hidden">
                                        <FormSection title={
                                            <div className="flex items-center gap-2">
                                                <span>Pedido #{orderNumber}</span>
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
                                        <FormSection title={isDelivery ? "Endereço de Entrega" : "Retirada no estabelecimento"}>
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
                                        <FormSection title="Locais de atendimento">
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
                                    <FormSection title="Pagamento">
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
                                                            {depositSummary!.depositStatus === "partially_paid" ? "pago" : "pendente"}
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
                                                            {order.payment_provider === "Mercado Pago" ? "Mercado Pago" : "Pagamento direto"}
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

                                            {isPendingExchangeShortfall ? (
                                                hasMercadoPagoOnline ? (
                                                    <InfoCard
                                                        title="Diferença da Troca Pendente"
                                                        message={`O valor da diferença para os novos itens é de ${formatCurrency(exchangeShortfall)}. Pague via Pix para aprovar e liberar a entrega/retirada.`}
                                                        color="orange"
                                                        className="mt-4"
                                                        rightElement={
                                                            <Button
                                                                size="sm"
                                                                onClick={handlePixClick}
                                                                disabled={loadingPayment}
                                                                className="whitespace-nowrap"
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
                                                        rightElement={
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={handleWhatsAppExchangeDifference}
                                                                className="whitespace-nowrap flex items-center gap-1.5"
                                                            >
                                                                <WhatsappIcon size={14} className="text-[#25D366]" />
                                                                Combinar no WhatsApp
                                                            </Button>
                                                        }
                                                    />
                                                )
                                            ) : (
                                                canRetryPayment && order.payment_expires_at && (
                                                    <InfoCard message={`O pagamento expira em ${formatFullDate(order.payment_expires_at)}.`} color='orange' className="mt-4" rightElement={<Button variant='link' className="!p-0" onClick={handlePixClick}>Pagar agora</Button>} />
                                                )
                                            )}
                                        </div>
                                    </FormSection>

                                    {/* Section 4: Entregador */}
                                    {isDelivery && order.delivery_driver && (
                                        <FormSection title="Entregador">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0 text-brand-primary">
                                                        {order.delivery_driver.avatarUrl ? (
                                                            <img
                                                                src={order.delivery_driver.avatarUrl}
                                                                alt={order.delivery_driver.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <TruckIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate">
                                                                {order.delivery_driver.name}
                                                            </span>
                                                            {order.delivery_driver.isPlatformDriver && (
                                                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary">
                                                                    Dudit
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                            {order.delivery_driver.isPlatformDriver ? (
                                                                <span>
                                                                    {order.delivery_driver.totalDeliveries > 0
                                                                        ? `${order.delivery_driver.totalDeliveries} entregas realizadas`
                                                                        : "Entregador Parceiro"}
                                                                    {order.delivery_driver.vehicleType ? ` • ${order.delivery_driver.vehicleType}` : ""}
                                                                </span>
                                                            ) : (
                                                                <span>Entrega própria do estabelecimento</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {order.delivery_driver.phone && ["sent", "out_for_delivery"].includes(order.delivery_status) && (
                                                    <a
                                                        href={`https://wa.me/55${String(order.delivery_driver.phone).replace(/\D/g, '')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="shrink-0 p-2 rounded-xl border border-brand-border dark:border-dark-border hover:bg-brand-surface dark:hover:bg-dark-surface transition-colors flex items-center gap-1.5 text-xs font-semibold text-brand-dark dark:text-dark-heading"
                                                        title="Conversar no WhatsApp"
                                                    >
                                                        <WhatsappIcon size={16} className="text-[#25D366]" />
                                                        <span className="hidden sm:inline">Contato</span>
                                                    </a>
                                                )}
                                            </div>
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
                                            <Link href={getStoreUrl({ ...(store || order.partners), id: store?.store_id || store?.id || order.store_id || order.partner_id, short_id: store?.short_id || order.partners?.short_id, name: store?.name || order.partners?.store_name || sellerName })} prefetch={true} className="flex items-center gap-4 block cursor-pointer">

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
                                                    <InfoCard message="Este pedido já está sendo processado. Assim que sair para entrega, você poderá solicitar devolução, troca ou reembolso." color="gray" />
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
                                                            onClick={() => setIsReturnModalOpen(true)}
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
                                            <InfoCard message="Este pedido já está sendo processado. Assim que sair para entrega, você poderá solicitar devolução, troca ou reembolso." color="gray" />
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
                                                    onClick={() => setIsReturnModalOpen(true)}
                                                >
                                                    {returnButtonLabel}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="history" className="mt-0 focus-visible:ring-0">
                            <div className="space-y-8">
                                <HistoryTimeline
                                    entries={combinedHistoryEntries}
                                    title="Status do Acompanhamento"
                                    emptyMessage="Não foram encontrados eventos para este pedido."
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="attachments" className="mt-0 focus-visible:ring-0">
                            <FormSection title="Anexos do Pedido">
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
                                            <div
                                                key={att.id}
                                                onClick={() => handleDownloadAttachment(att.file_key, att.file_name)}
                                                className="flex items-center gap-3 p-3 bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl cursor-pointer hover:bg-brand-gray/80 dark:hover:bg-dark-border/40 transition-colors"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-white dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border shrink-0">
                                                    <FileIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                                                        {att.file_name || "Documento"}
                                                    </p>
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                        {formatFileSize(att.file_size)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </FormSection>
                        </TabsContent>

                        {isDelivery && order.delivery_driver && (
                            <TabsContent value="delivery" className="mt-0 focus-visible:ring-0">
                                <div className="space-y-6">
                                    {/* Status da Entrega */}
                                    <FormSection title="Status da Entrega">
                                        {(() => {
                                            const ds = getDeliveryStatusLabel(order.delivery_status);
                                            const isPickup = order.delivery_type === "pickup";
                                            return (
                                                <ListItem
                                                    icon={<MotorbikeIcon />}
                                                    title={isPickup ? "Retirada no estabelecimento" : ds.label}
                                                    description={
                                                        isPickup
                                                            ? "Seu pedido está pronto para ser retirado na loja."
                                                            : order.delivery_status === "delivered"
                                                                ? "Seu pedido foi entregue com sucesso."
                                                                : order.delivery_status === "sent" ||
                                                                    order.delivery_status === "out_for_delivery"
                                                                    ? "Seu pedido está a caminho."
                                                                    : order.delivery_status === "preparing"
                                                                        ? "O vendedor está preparando seu pedido para envio."
                                                                        : order.delivery_status === "delivery_failed"
                                                                            ? "Houve uma falha na entrega do seu pedido."
                                                                            : "Aguardando preparação para entrega."
                                                    }
                                                />

                                            );
                                        })()}
                                    </FormSection>

                                    {/* Card do Entregador */}
                                    {order.delivery_driver && (
                                        <FormSection title="Entregador">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0 text-brand-primary">
                                                    {order.delivery_driver.avatarUrl ? (
                                                        <img
                                                            src={order.delivery_driver.avatarUrl}
                                                            alt={order.delivery_driver.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <TruckIcon size={22} className="text-brand-dark dark:text-dark-heading" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-md font-bold text-brand-dark dark:text-dark-heading truncate">
                                                            {order.delivery_driver.name}
                                                        </span>
                                                        {order.delivery_driver.isPlatformDriver ? (
                                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary">
                                                                Dudit
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text dark:text-dark-body">
                                                                Loja
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                        {order.delivery_driver.isPlatformDriver ? (
                                                            <>
                                                                {order.delivery_driver.totalDeliveries > 0 && (
                                                                    <span>{order.delivery_driver.totalDeliveries} entregas realizadas</span>
                                                                )}
                                                                {order.delivery_driver.vehicleType && (
                                                                    <span>{order.delivery_driver.vehicleType}</span>
                                                                )}
                                                                {order.delivery_driver.status && (
                                                                    <span className="text-xs">• {getAssignmentStatusLabel(order.delivery_driver.status)}</span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span>Entrega própria do estabelecimento</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {order.delivery_driver.phone && ["sent", "out_for_delivery", "assigned", "accepted"].includes(order.delivery_driver.status || order.delivery_status) && (
                                                    <a
                                                        href={`https://wa.me/55${String(order.delivery_driver.phone).replace(/\D/g, '')}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="shrink-0 p-2.5 rounded-xl border border-brand-border dark:border-dark-border hover:bg-brand-surface dark:hover:bg-dark-surface transition-colors flex items-center gap-1.5 text-xs font-semibold text-brand-dark dark:text-dark-heading"
                                                        title="Conversar no WhatsApp"
                                                    >
                                                        <WhatsappIcon size={16} className="text-[#25D366]" />
                                                    </a>
                                                )}
                                            </div>
                                        </FormSection>
                                    )}

                                    {/* Timeline da Entrega */}
                                    {(() => {
                                        const deliverySteps = getDeliveryTimelineSteps(order);
                                        if (deliverySteps.length === 0) return null;

                                        const activeSteps = deliverySteps.filter(s => s.active);
                                        const timelineEntries = activeSteps.map((step, idx) => ({
                                            id: `delivery-step-${idx}`,
                                            actor_name: step.label,
                                            change_lines: step.subLabel ? [step.subLabel] : [],
                                            created_at: step.iso || order.created_at,
                                            entry_type: "delivery",
                                        }));

                                        return (
                                            <FormSection title="Acompanhamento da Entrega">
                                                <HistoryTimeline
                                                    entries={timelineEntries}
                                                    emptyMessage="Nenhum evento de entrega registrado."
                                                />
                                            </FormSection>
                                        );
                                    })()}

                                    {/* Resumo da Entrega */}
                                    <FormSection title="Resumo da Entrega">
                                        <div className="space-y-3">
                                            <DetailRow label="Tipo de entrega" value={
                                                order.delivery_type === "pickup" ? "Retirada" : (
                                                    order.delivery_driver?.isPlatformDriver ? "Dudit Rede" : "Entregador da Loja"
                                                )
                                            } />
                                            {order.delivery_address && order.delivery_type === "delivery" && (
                                                <DetailRow label="Endereço" value={
                                                    <span className="text-sm max-w-[250px] truncate inline-block">{order.delivery_address}</span>
                                                } />
                                            )}
                                            {order.delivery_fee > 0 && (
                                                <DetailRow label="Taxa de entrega" value={formatCurrency(order.delivery_fee)} />
                                            )}
                                            {order.delivery_type === "pickup" && store?.addresses && (
                                                <DetailRow label="Local de retirada" value={
                                                    <span className="text-sm max-w-[250px] truncate inline-block">{formatPartnerAddress(store.addresses)}</span>
                                                } />
                                            )}
                                        </div>
                                    </FormSection>
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
                                        return (
                                            <div key={item.id} className="flex flex-col md:flex-row md:items-center gap-3 rounded-xl border border-brand-border dark:border-dark-border p-3">
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <Checkbox
                                                        checked={Number(returnItems[item.id] || 0) > 0}
                                                        disabled={remainingQuantities[item.id] <= 0}
                                                        onChange={(checked) => {
                                                            setReturnItems(prev => ({ ...prev, [item.id]: checked ? 1 : 0 }));
                                                            if (checked) {
                                                                setReturnConditions(prev => ({ ...prev, [item.id]: "opened" }));
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
                                                <div className="flex items-center gap-3 shrink-0 pl-8 md:pl-0">
                                                    <div className="flex flex-col gap-1 w-24">
                                                        <span className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 truncate">Qtd</span>
                                                        <QuantitySelector
                                                            value={returnItems[item.id] || 1}
                                                            onChange={(val) => setReturnItems(prev => ({ ...prev, [item.id]: val }))}
                                                            min={1}
                                                            max={remainingQuantities[item.id] || 1}
                                                            disabled={!returnItems[item.id] || remainingQuantities[item.id] <= 0}
                                                            size="sm"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-1 w-32">
                                                        <FormDropdown
                                                            label="Condição"
                                                            value={returnConditions[item.id] || "opened"}
                                                            setValue={(val) => setReturnConditions(prev => ({ ...prev, [item.id]: val as any }))}
                                                            disabled={!returnItems[item.id]}
                                                            options={[
                                                                { value: "opened", label: "Aberto" },
                                                                { value: "sealed", label: "Lacrado" },
                                                                { value: "damaged", label: "Danificado" },
                                                            ]}
                                                        />
                                                    </div>
                                                </div>
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormDropdown
                                label="Motivo"
                                value={returnReason}
                                setValue={setReturnReason}
                                options={[
                                    { value: "wrong_item", label: "Item errado" },
                                    { value: "defective", label: "Item com defeito" },
                                    { value: "damaged", label: "Item danificado" },
                                    { value: "different_from_description", label: "Diferente da descrição" },
                                    { value: "missing_parts", label: "Faltam partes" },
                                    { value: "arrived_late", label: "Chegou atrasado" },
                                    { value: "changed_mind", label: "Mudou de ideia" },
                                    { value: "other", label: "Outro" },
                                ]}
                            />
                            <FormDropdown
                                label="Resolução"
                                value={returnResolution}
                                setValue={(val) => setReturnResolution(val as any)}
                                options={resolutionOptions}
                            />
                        </div>

                        <Input
                            label="Mensagem opcional"
                            value={returnMessage}
                            onChange={(e) => setReturnMessage(e.target.value)}
                            maxLength={500}
                            multiline
                            rows={4}
                            showCharacterCount
                        />

                        {!sellerReturnCapabilities.hasReturnsModule ? (
                            <InfoCard
                                color="blue"
                                title="Fotos e evidências"
                                message="Esta loja realiza o atendimento de trocas e devoluções diretamente pelo WhatsApp. Se você possuir fotos ou vídeos do item, poderá enviá-los diretamente na conversa com o vendedor logo após abrir o aplicativo."
                            />
                        ) : (
                            <div className="space-y-3">
                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Evidências</h4>
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
                            </div>
                        )}
                    </div>
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
