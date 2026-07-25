"use client"

import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronRightIcon, CreditCardIcon, XIcon, CheckCircleIcon, ClockIcon, AlertCircleIcon, MoneyIcon } from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Spinner, FormSection, ListItem, Tabs, TabsList, TabsTrigger, TabsContent, Input, FormDropdown, Checkbox, Badge, DefaultModal, QuantitySelector, ThreeDotsLoader, IconPlaceholder, Tooltip, InfoCard } from '@/components/reusable';
import ProductImagesSection from '@/components/erp/product/ProductImagesSection';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import Link from 'next/link';
import { PaymentWrapper } from '@/components/PaymentWrapper';
import { createMarketplaceCancellationRequestAction, createMarketplaceReturnRequestAction } from '@/app/actions/erp/returns';
import { cancelBuyerOrderAction, confirmOrderFulfillmentAction } from '@/app/actions/marketplace/orders';
import { getAddressesAction } from '@/app/actions/shared/addresses';
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
import { canReportReturnToDudit, getEligibilityLabel, getSlaStatusLabel } from '@/lib/returns/policy';
import { getReturnStatusLabel } from '@/lib/returns/types';

interface MyOrderDetailPageProps {
    order: any;
    onBack: () => void;
}

const getStatusConfig = (status: string) => {
    switch (status) {
        case 'paid': return { label: 'Pago', color: 'text-brand-green', icon: CheckCircleIcon, statusText: 'Aprovado' };
        case 'pending': return { label: 'Pendente', color: 'text-brand-orange', icon: ClockIcon, statusText: 'Aguardando pagamento' };
        case 'cancelled': return { label: 'Cancelado', color: 'text-brand-red', icon: XIcon, statusText: 'Cancelado' };
        default: return { label: status, color: 'text-gray-500', icon: AlertCircleIcon, statusText: status };
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

const getReturnRequestStatusConfig = (request: any) => {
    const status = request.status;
    const isCancellation = request.request_type === "cancellation";
    const typeLabel = isCancellation ? "Cancelamento" : request.request_type === "return" ? "Devolução" : "Troca/Devolução";

    switch (status) {
        case "PENDING_REVIEW":
            return {
                title: `${typeLabel} em análise`,
                description: `Sua solicitação de ${typeLabel.toLowerCase()} foi enviada e está pendente de revisão pelo vendedor.`,
                color: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50 text-amber-800 dark:text-amber-300",
                icon: ClockIcon
            };
        case "UNDER_ANALYSIS":
            return {
                title: `${typeLabel} sob análise`,
                description: `O vendedor está analisando as informações e evidências enviadas.`,
                color: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50 text-amber-800 dark:text-amber-300",
                icon: ClockIcon
            };
        case "APPROVED":
            return {
                title: `${typeLabel} aprovado(a)!`,
                description: `O vendedor aceitou sua solicitação. Resolução: ${request.approved_resolution === "refund" ? "Reembolso" : request.approved_resolution === "store_credit" ? "Vale-compra" : "Troca"}.`,
                color: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300",
                icon: CheckCircleIcon
            };
        case "REJECTED":
            return {
                title: `${typeLabel} recusado(a)`,
                description: `A solicitação foi recusada pelo vendedor. Observação: ${request.seller_notes || "Sem observações informadas."}`,
                color: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/50 text-red-800 dark:text-red-300",
                icon: XIcon
            };
        case "WAITING_CUSTOMER":
            return {
                title: `Aguardando você`,
                description: `O vendedor precisa de mais informações ou ações de sua parte. Verifique as observações.`,
                color: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/50 text-blue-800 dark:text-blue-300",
                icon: AlertCircleIcon
            };
        case "WAITING_ITEM_RETURN":
            return {
                title: `Aguardando devolução do produto`,
                description: `Por favor, envie o produto de volta conforme as orientações do vendedor.`,
                color: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/50 text-blue-800 dark:text-blue-300",
                icon: ClockIcon
            };
        case "PROCESSING":
            return {
                title: `Processando devolução`,
                description: `O vendedor recebeu o produto e está processando o reembolso/troca.`,
                color: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/50 text-blue-800 dark:text-blue-300",
                icon: ClockIcon
            };
        case "RESOLVED":
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
                color: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300",
                icon: CheckCircleIcon
            };
        case "EXPIRED":
            return {
                title: `Solicitação expirada`,
                description: `O prazo para esta solicitação expirou.`,
                color: "bg-gray-50 border-gray-200 dark:bg-gray-950/20 dark:border-gray-900/50 text-gray-800 dark:text-gray-300",
                icon: XIcon
            };
        case "ESCALATED":
            return {
                title: `Em disputa/Moderação`,
                description: `A solicitação foi escalada para a mediação da Dudit.`,
                color: "bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-900/50 text-purple-800 dark:text-purple-300",
                icon: AlertCircleIcon
            };
        default:
            return {
                title: `Status: ${status}`,
                description: `Sua solicitação está em status: ${status}`,
                color: "bg-gray-50 border-gray-200 dark:bg-gray-950/20 dark:border-gray-900/50 text-gray-800 dark:text-gray-300",
                icon: ClockIcon
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
        if (item.service_id && line.serviceId === item.service_id) return true;
        if (item.recurring_plan_id && line.recurringPlanId === item.recurring_plan_id) return true;
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
    const dateStrFull = formatFullDate(order.created_at);
    const dateStrTime = formatTime(order.created_at);
    const updateDateStr = order.updated_at ? formatFullDate(order.updated_at) : null;
    const updateTimeStr = order.updated_at ? formatTime(order.updated_at) : null;

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

    const steps: { label: string; active: boolean; date?: string; time?: string; subLabel?: string | string[] }[] = [];

    if (isCancelled) {
        const cancelReason = getCancellationReason(order.notes);
        steps.push({ label: "Pedido Realizado", active: true, date: dateStrFull, time: dateStrTime });
        steps.push({
            label: isPaid ? "Pago" : "Aguardando pagamento",
            active: true,
            date: dateStrFull,
            time: dateStrTime
        });
        steps.push({
            label: "Cancelado",
            active: true,
            date: updateDateStr || dateStrFull,
            time: updateTimeStr || dateStrTime,
            subLabel: cancelReason ? [cancelReason] : ["O pedido foi cancelado."]
        });
        return steps;
    }

    // 1. First Step
    steps.push({ label: "Pedido Realizado", active: true, date: dateStrFull, time: dateStrTime });

    // 2. Second Step: Payment
    steps.push({
        label: isPaid ? "Pago" : "Aguardando pagamento",
        active: true,
        date: isPaid ? (updateDateStr || dateStrFull) : undefined,
        time: isPaid ? (updateTimeStr || dateStrTime) : undefined
    });

    if (hasOnlyServices) {
        // Service-only order:
        // 3. Em andamento
        steps.push({
            label: "Em andamento",
            active: isPaid && isPreparing,
            date: isPaid && isPreparing ? (updateDateStr || dateStrFull) : undefined,
            time: isPaid && isPreparing ? (updateTimeStr || dateStrTime) : undefined
        });
        // 4. Concluído
        steps.push({
            label: "Concluído",
            active: isPaid && isDelivered && order.delivery_status === "delivered",
            date: isPaid && isDelivered && order.delivery_status === "delivered" ? (updateDateStr || dateStrFull) : undefined,
            time: isPaid && isDelivered && order.delivery_status === "delivered" ? (updateTimeStr || dateStrTime) : undefined
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
            date: isPaid && isPreparing ? (updateDateStr || dateStrFull) : undefined,
            time: isPaid && isPreparing ? (updateTimeStr || dateStrTime) : undefined,
            subLabel: [serviceText, productText]
        });

        // 4. Finalizado
        steps.push({
            label: "Finalizado",
            active: isPaid && isSent,
            date: isPaid && isSent ? (updateDateStr || dateStrFull) : undefined,
            time: isPaid && isSent ? (updateTimeStr || dateStrTime) : undefined
        });

        // 5. Concluído
        steps.push({
            label: "Concluído",
            active: isPaid && isDelivered && (order.delivery_status === "delivered" || order.delivery_status === "pickup_available"),
            date: isPaid && isDelivered && (order.delivery_status === "delivered" || order.delivery_status === "pickup_available") ? (updateDateStr || dateStrFull) : undefined,
            time: isPaid && isDelivered && (order.delivery_status === "delivered" || order.delivery_status === "pickup_available") ? (updateTimeStr || dateStrTime) : undefined
        });
    } else {
        // Standard product-only order:
        // 3. Em andamento
        steps.push({
            label: "Em andamento",
            active: isPaid && isPreparing,
            date: isPaid && isPreparing ? (updateDateStr || dateStrFull) : undefined,
            time: isPaid && isPreparing ? (updateTimeStr || dateStrTime) : undefined
        });

        // 4. Pronto para retirada / Enviado
        steps.push({
            label: isPickup ? "Pronto para retirada" : "Enviado",
            active: isPaid && isSent,
            date: isPaid && isSent ? (updateDateStr || dateStrFull) : undefined,
            time: isPaid && isSent ? (updateTimeStr || dateStrTime) : undefined
        });

        // 5. Pedido retirado / Pedido entregue
        let finalLabel = isPickup ? "Pedido retirado" : "Pedido entregue";
        if (order.delivery_status === "delivery_failed") {
            finalLabel = isPickup ? "Retirada não realizada" : "Não entregue";
        }
        steps.push({
            label: finalLabel,
            active: isPaid && isDelivered && (order.delivery_status === "delivered" || order.delivery_status === "pickup_available" || order.delivery_status === "delivery_failed"),
            date: isPaid && isDelivered ? (updateDateStr || dateStrFull) : undefined,
            time: isPaid && isDelivered ? (updateTimeStr || dateStrTime) : undefined
        });
    }

    return steps;
};

const ShippingDetailsModal = ({ isOpen, onClose, order }: { isOpen: boolean; onClose: () => void; order: any }) => {
    if (!isOpen) return null;
    const deliveryTypeStr = order.delivery_type === "delivery" ? "Delivery" : "Retirada no local";
    const steps = getClientTimelineSteps(order);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-2xl shadow-xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border dark:border-dark-border">
                    <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Detalhe do envio</h3>
                    <button onClick={onClose} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading">
                        <XIcon size={24} />
                    </button>
                </div>
                <div className="p-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-6">
                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{deliveryTypeStr}</h2>
                        </div>
                        <div className="relative pl-2 space-y-8">
                            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-zinc-700"></div>
                            {steps.map((step, idx) => (
                                <div key={idx} className="relative flex gap-4">
                                    <div className={`w-6 h-6 rounded-full ${step.active ? "bg-brand-dark dark:bg-white" : "bg-gray-200 dark:bg-zinc-700"} border-4 border-white dark:border-dark-surface z-10 shrink-0`}></div>
                                    <div>
                                        <div className={`text-sm ${step.active ? "font-bold text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text"}`}>
                                            {step.label}
                                        </div>
                                        {step.active && step.date && (
                                            <div className="text-xs text-brand-inactive-text mt-1">{step.date} às {step.time}</div>
                                        )}
                                        {step.subLabel && (
                                            <div className="text-xs text-brand-inactive-text mt-1 font-normal ml-1">
                                                {Array.isArray(step.subLabel) ? (
                                                    <ul className="list-disc pl-4 space-y-0.5">
                                                        {step.subLabel.map((sl, slIdx) => (
                                                            <li key={slIdx}>{sl}</li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p>{step.subLabel}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="border-t border-brand-border dark:border-dark-border pt-6">
                        <h4 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Dados da entrega</h4>
                        <div className="text-sm text-brand-inactive-text space-y-1">
                            {order.delivery_type === "delivery" ? (
                                <>
                                    <p className="font-medium text-brand-dark dark:text-dark-heading whitespace-pre-line">{order.delivery_address || 'Endereço não informado'}</p>
                                    <p className="mt-2">Recebedor: {order.customer_name || 'Usuário Dudit'}</p>
                                </>
                            ) : (
                                <p className="font-medium text-brand-dark dark:text-dark-heading">Retirada diretamente com a loja parceira ({order.partners?.name || order.partners?.store_name}).</p>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export const MyOrderDetailPage = ({ order, onBack }: MyOrderDetailPageProps) => {
    const router = useRouter();
    const { toast } = useToast();
    const [isShippingModalOpen, setIsShippingModalOpen] = useState(false);
    const [loadingPayment, setLoadingPayment] = useState(false);
    const [showPixModal, setShowPixModal] = useState(false);
    const [pixData, setPixData] = useState<any>(null);
    const [pixOrderDetails, setPixOrderDetails] = useState<any>(null);
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

    const [userAddresses, setUserAddresses] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<"details" | "history" | "attachments">("details");
    const [attachments, setAttachments] = useState<any[]>([]);
    const [loadingAttachments, setLoadingAttachments] = useState(false);

    useEffect(() => {
        if (!order?.buyer_id) return;
        getAddressesAction(order.buyer_id, "user")
            .then(res => {
                if (res && res.addresses) {
                    setUserAddresses(res.addresses);
                }
            })
            .catch(err => console.error("Error fetching user addresses:", err));
    }, [order?.buyer_id]);

    useEffect(() => {
        if (!order?.id) return;
        setLoadingAttachments(true);
        getOrderAttachmentsAction(order.id)
            .then(res => {
                if (res.success && res.data) {
                    setAttachments(res.data);
                }
            })
            .catch(err => console.error("Erro ao carregar anexos:", err))
            .finally(() => setLoadingAttachments(false));
    }, [order?.id]);

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
        const dateToUse = (idx === 0) ? order.created_at : (order.updated_at || order.created_at);
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
            remaining[item.id] = Math.max(0, (item.quantity || 0) - returned)
        })

        return remaining
    }, [order])

    const hasReturnableItems = useMemo(() => {
        return Object.values(remainingQuantities).some((qty: number) => qty > 0)
    }, [remainingQuantities])

    const activeReturnRequest = order.return_requests?.find((r: any) => !r.deleted_at && ["PENDING_REVIEW", "UNDER_ANALYSIS", "APPROVED", "WAITING_CUSTOMER", "WAITING_ITEM_RETURN", "PROCESSING", "ESCALATED"].includes(r.status));
    const hasActiveReturn = !!activeReturnRequest;
    const returnStatusCfg = activeReturnRequest ? getReturnRequestStatusConfig(activeReturnRequest) : null;

    const returnEvents = activeReturnRequest?.return_events || [];
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

    if (!order) return null;

    const orderNumber = order.order_number || order.id.slice(0, 8).toUpperCase();
    const dateStrFull = formatFullDate(order.created_at);
    const dateStrTime = formatTime(order.created_at);
    const statusConfig = getStatusConfig(order.situation);
    const store = order.stores || order.partners
    const storeImage = store?.store_image_url || store?.logo_url
        ? getR2ImageUrl(store?.store_image_url || store?.logo_url)
        : "https://img.dudit.com.br/static/Placeholder.png";

    const isDelivery = order.delivery_type === "delivery";
    const sellerName = store?.store_name || store?.name || order.partners?.store_name || "Loja Parceira";
    const totalAmount = Number(order.total_amount);

    const orderItems = order.order_items || [];
    const hasOnlyServices = orderItems.length > 0 && orderItems.every((item: any) => item.service_id || item.line_type === "service_booking");
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
        ? "Solicitar troca ou devolução"
        : "Solicitar reembolso ou vale-compra";
    const returnHistoryCount = Array.isArray(order.return_requests) ? order.return_requests.length : 0;

    const showConfirmReceiptButton = !isCancelled && hasProducts && ["sent", "shipped", "out_for_delivery"].includes(order.delivery_status || "");
    const showConfirmExecutionButton = !isCancelled && hasAnyService && order.delivery_status !== "delivered";

    const showExchangeOption = !hasOnlyServices && order.delivery_status === "delivered";
    const resolutionOptions = [
        ...(showExchangeOption ? [{ value: "exchange", label: "Troca" }] : []),
        { value: "refund", label: "Reembolso" },
        { value: "store_credit", label: "Vale-compra" },
    ];

    const renderFulfillmentButtons = () => {
        if (showConfirmReceiptButton && showConfirmExecutionButton) {
            return (
                <Button
                    variant="outline"
                    className="w-full h-12 font-bold border-brand-green text-brand-green hover:bg-brand-green/10"
                    onClick={handleConfirmFulfillment}
                    disabled={isConfirming}
                >
                    {isConfirming ? <Spinner size={16} className="text-brand-green mr-2" /> : "Confirmar Recebimento e Execução"}
                </Button>
            );
        }
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
        if (showConfirmExecutionButton) {
            return (
                <Button
                    variant="outline"
                    className="w-full h-12 font-bold border-brand-green text-brand-green hover:bg-brand-green/10"
                    onClick={handleConfirmFulfillment}
                    disabled={isConfirming}
                >
                    {isConfirming ? <Spinner size={16} className="text-brand-green mr-2" /> : "Confirmar Execução"}
                </Button>
            );
        }
        return null;
    };

    const getPaymentTypeLabel = () => {
        let baseLabel = "Pix";
        const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [];
        const breakdownMethod = breakdown.find((e: any) => e?.method)?.method;
        if (breakdownMethod) {
            const m = breakdownMethod.toLowerCase();
            if (m === "pix" || m === "bank_transfer") baseLabel = "Pix";
            else if (m.includes("crédito") || m.includes("credito") || m.includes("credit")) baseLabel = "Cartão de Crédito";
            else if (m.includes("débito") || m.includes("debito") || m.includes("debit")) baseLabel = "Cartão de Débito";
            else if (m.includes("dinheiro") || m.includes("cash") || m.includes("money")) baseLabel = "Dinheiro";
            else if (m.includes("boleto")) baseLabel = "Boleto";
            else baseLabel = breakdownMethod;
        } else {
            const pm = String(order.payment_method || "").toLowerCase();
            if (pm === "pix" || pm === "bank_transfer") baseLabel = "Pix";
            else if (pm.includes("crédito") || pm.includes("credito") || pm.includes("credit")) baseLabel = "Cartão de Crédito";
            else if (pm.includes("débito") || pm.includes("debito") || pm.includes("debit")) baseLabel = "Cartão de Débito";
            else if (pm.includes("dinheiro") || pm.includes("cash") || pm.includes("money")) baseLabel = "Dinheiro";
            else if (pm.includes("boleto")) baseLabel = "Boleto";
            else baseLabel = order.payment_method || order.payment_provider || "Pix";
        }
        const mpLeg = breakdown.find((e: any) => String(e?.provider || "").toLowerCase().includes("mercado pago") || String(e?.method || "").toLowerCase().includes("mercado pago"));
        const mpInstallments = mpLeg?.installmentNumber || order.installments || 1;
        if (mpInstallments > 1) {
            baseLabel = `${baseLabel} - ${mpInstallments}x`;
        }
        if (order.payment_provider === "Mercado Pago") {
            return `Mercado Pago (${baseLabel})`;
        }
        return baseLabel;
    };

    const paymentMethodName = getPaymentTypeLabel();
    const isMercadoPago = order.payment_provider === "Mercado Pago";
    const PaymentIconEl = (() => {
        const icons: React.ReactNode[] = [];
        if (isMercadoPago) {
            icons.push(
                <img key="mp" src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain shrink-0" />
            );
        }

        // Extract submethod name
        const nameLower = paymentMethodName.toLowerCase();
        if (nameLower.includes("pix")) {
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
    const matchedAddress = userAddresses.find(a => {
        const cleanDelivery = String(order.delivery_address || "").toLowerCase().replace(/\s/g, "");
        const cleanStreet = String(a.street || "").toLowerCase().replace(/\s/g, "");
        const cleanNumber = String(a.number || "").toLowerCase().replace(/\s/g, "");
        return cleanDelivery.includes(cleanStreet) && cleanDelivery.includes(cleanNumber);
    });

    const addressTypeLabel = matchedAddress
        ? (matchedAddress.address_type === "casa" ? "Casa" : matchedAddress.address_type === "trabalho" ? "Trabalho" : "Outro")
        : null;

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
    const paymentMethodInterestVal = Math.max(0, Number(pricingSnapshot?.paymentMethodInterest || 0));
    const paymentMethodFeeVal = Math.max(0, Number(pricingSnapshot?.paymentMethodFee ?? (pricingSnapshot ? 0 : order.payment_method_extra_amount) ?? 0));
    const paymentMethodFixedFeeVal = Math.max(0, Number(pricingSnapshot?.paymentMethodFixedFee || 0));
    const shippingVal = Math.max(0, Number(pricingSnapshot?.deliveryFee ?? order.delivery_fee ?? order.shipping_total ?? 0));
    const subtotalVal = Number(pricingSnapshot?.subtotal ?? order.subtotal_original ?? itemsSubtotal);
    const totalVal = Number(order.total_amount || 0);
    const cashEntry = Array.isArray(order.payment_breakdown)
        ? order.payment_breakdown.find((entry: any) => {
            const m = String(entry?.method || "").toLowerCase().trim();
            return m === "cash" || m === "dinheiro";
        })
        : null
    const wantsChange = cashEntry?.wantsChange ?? order.wants_change ?? order.wantsChange ?? false;
    const payWithAmount = Number(cashEntry?.payWithAmount ?? order.pay_with_amount ?? order.payWithAmount ?? 0);
    const changeAmount = Math.max(0, payWithAmount > 0 && wantsChange ? payWithAmount - totalVal : 0);

    const hasItemDiscount = itemsSubtotal > 0 && subtotalVal > 0 && Math.abs(itemsSubtotal - subtotalVal) > 0.005
    const itemDiscountRatio = hasItemDiscount ? subtotalVal / itemsSubtotal : 1

    const getItemDiscountedPrice = (item: any) => {
        const basePrice = Number(item.product_price || 0)
        if (item.is_gift || item.is_promotional) return basePrice
        if (!hasItemDiscount) return basePrice
        const discounted = basePrice * itemDiscountRatio
        return Math.round(discounted * 100) / 100
    }

    const renderPriceSummary = () => {
        return (
            <div className="space-y-3">
                <div className="flex justify-between text-sm text-brand-inactive-text">
                    <span>Subtotal</span>
                    <span className="text-brand-dark dark:text-dark-heading font-medium">{formatCurrency(subtotalVal)}</span>
                </div>
                {shippingVal > 0 ? (
                    <div className="flex justify-between text-sm text-brand-inactive-text">
                        <span>Entrega</span>
                        <span className="text-brand-dark dark:text-dark-heading font-medium">{formatCurrency(shippingVal)}</span>
                    </div>
                ) : (
                    <div className="flex justify-between text-sm text-brand-inactive-text">
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
                    <div className="flex justify-between text-sm text-brand-inactive-text">
                        <span>Juros do pagamento</span>
                        <span className="text-brand-dark dark:text-dark-heading font-medium">+{formatCurrency(paymentMethodInterestVal)}</span>
                    </div>
                )}
                {paymentMethodFeeVal > 0 && (
                    <div className="flex justify-between text-sm text-brand-inactive-text">
                        <span>Taxa do pagamento</span>
                        <span className="text-brand-dark dark:text-dark-heading font-medium">+{formatCurrency(paymentMethodFeeVal)}</span>
                    </div>
                )}
                {paymentMethodFixedFeeVal > 0 && (
                    <div className="flex justify-between text-sm text-brand-inactive-text">
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

    const handlePixClick = async () => {
        if (order.situation !== "pending" || paymentMethodName !== "Pix") return;
        try {
            setLoadingPayment(true);
            const response = await fetch("/api/orders/retry-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: order.id }),
            });
            if (!response.ok) throw new Error("Failed");
            const data = await response.json();
            if (data.pixData?.qrCodeBase64) {
                setPixData(data.pixData);
                setPixOrderDetails(data.orderDetails);
                setShowPixModal(true);
            }
        } catch (err) {
            console.error(err);
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
            .map(([orderItemId, quantity]) => ({
                order_item_id: orderItemId,
                quantity: Number(quantity),
                reason: returnReason,
                condition: returnConditions[orderItemId] || "opened"
            }));

        const serviceItems = Object.entries(returnServiceItems)
            .filter(([, checked]) => checked)
            .map(([orderItemId]) => ({ order_item_id: orderItemId, quantity: 1, reason: returnReason }));

        const allItems = [...productItems, ...serviceItems];

        if (allItems.length === 0) {
            toast({ title: "Selecione ao menos um item", variant: "destructive" });
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
                message: returnMessage,
                items: allItems,
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
                                <img src={itemImage} alt={item.products?.name || item.product_name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-brand-dark dark:text-dark-heading text-sm truncate group-hover:text-brand-green transition-colors">
                                    {item.is_gift && <span className="text-brand-green font-bold">[BRINDE] </span>}{item.products?.name || item.product_name}
                                </h3>
                                {isService ? (
                                    <>
                                        {bookingDate && bookingTime ? (
                                            <div className="text-xs text-brand-inactive-text mt-0.5">
                                                {formatDate(bookingDate)} às {bookingTime}
                                                {fulfillmentMode ? ` | Local: ${getFulfillmentModeLabel(fulfillmentMode)}` : ""}
                                            </div>
                                        ) : fulfillmentMode ? (
                                            <div className="text-xs text-brand-inactive-text mt-0.5">
                                                {getFulfillmentModeLabel(fulfillmentMode)}
                                            </div>
                                        ) : null}

                                    </>
                                ) : (
                                    <>
                                        {item.product_variants?.variant_name && (
                                            <div className="text-xs text-brand-inactive-text mt-0.5">{item.product_variants.variant_name}</div>
                                        )}
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
                                                    <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                </div>
                                            )
                                        }
                                        if (hasDiscount) {
                                            return (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs text-brand-inactive-text line-through font-normal">{formatProductUnitPrice(basePrice, item.products?.unit)}</span>
                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatProductUnitPrice(displayPrice, item.products?.unit)}</span>
                                                </div>
                                            )
                                        }
                                        return formatProductUnitPrice(basePrice, item.products?.unit)
                                    })()}
                                </div>
                            </div>
                            <div className="text-sm text-brand-inactive-text shrink-0 pr-1">
                                {!isService ? formatProductQuantity(item.quantity, item.products?.unit) : ""}
                            </div>
                        </>
                    );

                    let itemUrl = "";
                    if (isService) {
                        itemUrl = getServiceUrl({ ...item.services, id: item.service_id }, order.partners);
                    } else if (isPlan) {
                        itemUrl = getPlanUrl({ ...item.recurring_plans, id: item.recurring_plan_id }, order.partners);
                    } else if (item.product_id) {
                        itemUrl = getProductUrl({ ...item.products, id: item.product_id }, order.partners);
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
                <div className="flex justify-between text-sm text-brand-inactive-text">
                    <span>Itens ({order.order_items?.length || 0})</span>
                    <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(itemsSubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-brand-inactive-text">
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
        return (
            <div className={`p-6 rounded-2xl border ${returnStatusCfg.color} flex items-start gap-4 shadow-none`}>
                <div className="w-10 h-10 rounded-full bg-current/10 flex items-center justify-center shrink-0 font-bold">
                    <returnStatusCfg.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <h4 className="font-bold text-base lg:text-lg leading-snug">{returnStatusCfg.title}</h4>
                    <p className="text-sm mt-1.5 opacity-90 leading-relaxed">{returnStatusCfg.description}</p>
                    {activeReturnRequest.seller_notes && (
                        <div className="mt-4 pt-3 border-t border-current/20 text-sm">
                            <span className="font-bold">Observações do vendedor:</span> {activeReturnRequest.seller_notes}
                        </div>
                    )}
                    <div className="mt-4 pt-3 border-t border-current/20 text-sm space-y-1">
                        {activeReturnRequest.eligibility_status && (
                            <div><span className="font-bold">Elegibilidade:</span> {getEligibilityLabel(activeReturnRequest.eligibility_status)}</div>
                        )}
                        {activeReturnRequest.sla_status && (
                            <div><span className="font-bold">SLA:</span> {getSlaStatusLabel(activeReturnRequest.sla_status)}
                                {activeReturnRequest.sla_due_at && ` - prazo ${formatDate(activeReturnRequest.sla_due_at)}`}
                            </div>
                        )}
                        {(activeReturnRequest.policy_snapshot || order.return_policy_snapshot) && (
                            <div className="text-xs opacity-80 mt-2">
                                Política aplicada: prazo comercial de{' '}
                                {(activeReturnRequest.policy_snapshot || order.return_policy_snapshot)?.commercial?.commercial_deadline_days ?? 30} dias
                                (snapshot da venda)
                            </div>
                        )}
                    </div>
                    {canReportReturnToDudit({
                        status: activeReturnRequest.status,
                        slaStatus: activeReturnRequest.sla_status,
                        reportedToDuditAt: activeReturnRequest.reported_to_dudit_at,
                    }) && (
                            <Button
                                variant="outline"
                                className="mt-4 w-full sm:w-auto"
                                onClick={() => setReportReturnOpen(true)}
                            >
                                Reportar à Dudit
                            </Button>
                        )}
                    {activeReturnRequest.reported_to_dudit_at && (
                        <p className="text-xs mt-2 opacity-80">Reporte enviado em {formatDate(activeReturnRequest.reported_to_dudit_at)}</p>
                    )}
                </div>
            </div>
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
                            {order.situation === "cancelled" && (
                                <Badge variant="red">Cancelado</Badge>
                            )}
                        </h1>
                        <p className="text-md text-brand-inactive-text mt-1">{dateStrFull}</p>
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
                                                                        <div className="text-xs text-brand-inactive-text mt-0.5">
                                                                            {formatDate(bookingDate)} às {bookingTime}
                                                                            {fulfillmentMode ? ` | Local: ${getFulfillmentModeLabel(fulfillmentMode)}` : ""}
                                                                        </div>
                                                                    ) : fulfillmentMode ? (
                                                                        <div className="text-xs text-brand-inactive-text mt-0.5">
                                                                            {getFulfillmentModeLabel(fulfillmentMode)}
                                                                        </div>
                                                                    ) : null}

                                                                </>
                                                            ) : (
                                                                <>
                                                                    {item.product_variants?.variant_name && (
                                                                        <div className="text-xs text-brand-inactive-text mt-0.5">{item.product_variants.variant_name}</div>
                                                                    )}
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
                                                                                <span className="text-xs text-brand-inactive-text line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                            </div>
                                                                        )
                                                                    }
                                                                    if (hasDiscount) {
                                                                        return (
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="text-xs text-brand-inactive-text line-through font-normal">{formatProductUnitPrice(basePrice, item.products?.unit)}</span>
                                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatProductUnitPrice(displayPrice, item.products?.unit)}</span>
                                                                            </div>
                                                                        )
                                                                    }
                                                                    return formatProductUnitPrice(basePrice, item.products?.unit)
                                                                })()}
                                                            </div>
                                                        </div>
                                                        <div className="text-sm text-brand-inactive-text shrink-0 pr-1">
                                                            {!isService ? formatProductQuantity(item.quantity, item.products?.unit) : ""}
                                                        </div>
                                                    </>
                                                );

                                                let itemUrl = "";
                                                if (isService) {
                                                    itemUrl = getServiceUrl({ ...item.services, id: item.service_id }, order.partners);
                                                } else if (isPlan) {
                                                    itemUrl = getPlanUrl({ ...item.recurring_plans, id: item.recurring_plan_id }, order.partners);
                                                } else if (item.product_id) {
                                                    itemUrl = getProductUrl({ ...item.products, id: item.product_id }, order.partners);
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
                                                        className="w-10 h-10 object-cover rounded-xl shrink-0"
                                                    />
                                                    <div className="flex flex-col justify-center">
                                                        <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                                                            {addressTypeLabel || "Endereço de Entrega"}
                                                        </p>
                                                        <p className="text-xs lg:text-sm text-brand-inactive-text">{order.delivery_address || 'Endereço não informado'}</p>
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
                                                        className="w-10 h-10 object-cover rounded-xl shrink-0"
                                                    />
                                                    <div className="flex flex-col justify-center">
                                                        <p className="text-md font-bold text-brand-dark dark:text-dark-heading">Retirada no estabelecimento</p>
                                                        <p className="text-sm text-brand-inactive-text">{formatPartnerAddress(order.partners?.addresses)}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </FormSection>
                                    )}

                                    {(order.order_items || []).some((item: any) => item.service_id || item.recurring_plan_id || item.line_type === "service_booking" || item.line_type === "subscription") && (
                                        <FormSection title="Locais de atendimento">
                                            <div className="space-y-4">
                                                {(order.order_items || [])
                                                    .filter((item: any) => item.service_id || item.recurring_plan_id || item.line_type === "service_booking" || item.line_type === "subscription")
                                                    .map((item: any) => {
                                                        const fulfillmentLine = findFulfillmentLine(order, item);
                                                        const mode = item.fulfillment_mode || fulfillmentLine?.fulfillmentMode;
                                                        const isCustomerAddress = mode === "customer_location" || mode === "delivery";
                                                        const storeAddr = order.stores?.addresses?.[0] || (order.stores as any);
                                                        const address = isCustomerAddress
                                                            ? (order.delivery_address || "Endereço não informado")
                                                            : storeAddr?.street
                                                                ? `${storeAddr.street || ""}, ${storeAddr.number || "S/N"}${storeAddr.neighborhood ? ` - ${storeAddr.neighborhood}` : ""}, ${storeAddr.city || ""} - ${storeAddr.state || ""}`.replace(/\s+/g, ' ').trim()
                                                                : formatPartnerAddress(order.partners?.addresses);

                                                        const isServiceCancelled = order.situation === "cancelled";
                                                        const isSub = !!item.recurring_plan_id || item.line_type === "subscription";
                                                        const bookingDate = fulfillmentLine?.bookingMetadata?.date || null;
                                                        const bookingTime = fulfillmentLine?.bookingMetadata?.time || null;
                                                        const addressTitle = isCustomerAddress && addressTypeLabel
                                                            ? addressTypeLabel
                                                            : "Endereço do estabelecimento";
                                                        return (
                                                            <div key={`service-fulfillment-${item.id}`} className="flex items-stretch gap-3">
                                                                <img
                                                                    src="https://img.dudit.com.br/static/Map.png"
                                                                    alt={addressTitle}
                                                                    className="w-10 h-10 object-cover rounded-xl shrink-0"
                                                                />
                                                                <div className="flex flex-col justify-center min-w-0">
                                                                    <p className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate">
                                                                        {addressTitle}
                                                                    </p>
                                                                    <p className="text-xs lg:text-sm text-brand-inactive-text">
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
                                        <div>
                                            <ListItem
                                                icon={PaymentIconEl}
                                                title={
                                                    loadingPayment ? <Spinner size={14} className="text-brand-dark" /> :
                                                        <span className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                                                            {paymentMethodName}
                                                        </span>
                                                }
                                                description={
                                                    <span className="text-xs lg:text-sm text-brand-inactive-text font-normal">
                                                        {order.payment_provider === "Mercado Pago" ? "Mercado Pago" : "Pagamento direto"}
                                                    </span>
                                                }
                                                className="border-none px-0 py-2 !bg-transparent shadow-none hover:border-none cursor-default"
                                                onClick={handlePixClick}
                                                right={
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalAmount)}</span>
                                                }
                                            />
                                            {order.situation === "pending" && order.payment_expires_at && (
                                                <InfoCard message={`O pagamento expira em ${formatFullDate(order.payment_expires_at)}.`} color='orange' rightElement={<Button variant='link' onClick={handlePixClick}>Pagar agora</Button>} />
                                            )}
                                        </div>
                                    </FormSection>

                                    {/* Section 4: Vendedor */}
                                    <FormSection title="Vendedor">
                                        {storeDeleted ? (
                                            <div className="flex items-center gap-4 block">
                                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                                                    <img src={storeImage} alt={sellerName} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                        <span>{sellerName}</span>
                                                        <Tooltip text="Este negócio não está mais no Dudit">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 inline-block align-middle cursor-help" />
                                                        </Tooltip>
                                                    </div>
                                                    <div className="text-xs lg:text-sm text-brand-inactive-text mt-0.5 max-w-sm">Este negócio não está mais no Dudit</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <Link href={getStoreUrl({ ...store, id: store?.store_id || store?.id || order.partner_id })} prefetch={true} className="flex items-center gap-4 block cursor-pointer">
                                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                                                    <img src={storeImage} alt={sellerName} className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">{sellerName}</div>
                                                    <div className="text-xs lg:text-sm text-brand-inactive-text mt-0.5 max-w-sm">Acessar perfil do vendedor</div>
                                                </div>
                                                <ChevronRightIcon size={18} className="text-brand-inactive-text" />
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
                                                {renderFulfillmentButtons()}

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
                                                    <div className="rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/60 dark:bg-dark-border/30 p-4 text-sm text-brand-inactive-text dark:text-dark-body text-center">
                                                        Este pedido já está sendo processado. Assim que sair para entrega, você poderá solicitar devolução, troca ou reembolso.
                                                    </div>
                                                )}

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
                                        <div className="text-md bg-brand-gray/50 dark:bg-emerald-900/10 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                                            Resumo dos Valores
                                        </div>
                                        <div className="p-6">
                                            {renderPriceSummary()}
                                        </div>
                                    </div>

                                    {renderReturnRequestCard()}

                                    {/* Desktop Actions / Buttons */}
                                    <div className="space-y-4 pt-4">
                                        {renderFulfillmentButtons()}

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
                                            <div className="rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/60 dark:bg-dark-border/30 p-4 text-sm text-brand-inactive-text dark:text-dark-body text-center">
                                                Este pedido já está sendo processado. Assim que sair para entrega, você poderá solicitar devolução, troca ou reembolso.
                                            </div>
                                        )}

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
                    </Tabs>
                </div>

                <AnimatePresence>
                    {isShippingModalOpen && (
                        <ShippingDetailsModal isOpen={isShippingModalOpen} onClose={() => setIsShippingModalOpen(false)} order={order} />
                    )}
                </AnimatePresence>

                {pixData && (
                    <PaymentWrapper
                        open={showPixModal}
                        onClose={() => setShowPixModal(false)}
                        pixData={pixData}
                        orderId={order.id}
                        amount={Number(totalAmount)}
                        orderDetails={pixOrderDetails}
                    />
                )}

                <DefaultModal
                    isOpen={isCancelModalOpen}
                    onClose={() => setIsCancelModalOpen(false)}
                    title="Cancelar pedido"
                    maxWidth="lg"
                    footer={
                        <div className="flex justify-end gap-3 w-full">
                            <Button variant="outline" onClick={() => setIsCancelModalOpen(false)} disabled={isCanceling}>Voltar</Button>
                            <Button variant="outlinered" onClick={handleCancelOrder} disabled={isCanceling}>
                                {isCanceling ? "Cancelando..." : order.situation !== "paid" ? "Confirmar cancelamento" : "Solicitar cancelamento"}
                            </Button>
                        </div>
                    }
                >
                    {order.situation !== "paid" ? (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Tem certeza de que deseja cancelar este pedido? O cancelamento será feito imediatamente e os itens retornarão ao estoque.
                        </p>
                    ) : (
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
                    )}
                </DefaultModal>

                <DefaultModal
                    isOpen={isReturnModalOpen}
                    onClose={() => setIsReturnModalOpen(false)}
                    title="Solicitar troca ou devolução"
                    maxWidth="2xl"
                    footer={
                        <div className="flex justify-end gap-3 w-full">
                            <Button variant="outline" onClick={() => setIsReturnModalOpen(false)} disabled={isSubmittingReturn}>Cancelar</Button>
                            <Button onClick={submitReturnRequest} disabled={isSubmittingReturn}>
                                {isSubmittingReturn ? "Enviando..." : "Enviar solicitação"}
                            </Button>
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
                                                    <img src={itemImage} alt={item.products?.name || item.product_name} className="h-12 w-12 rounded-lg border border-brand-border object-contain shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {item.products?.name || item.product_name}
                                                            {remainingQuantities[item.id] <= 0 && (
                                                                <span className="ml-1.5 text-xs text-red-500 font-bold">(Já devolvido)</span>
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-brand-inactive-text">Comprado: {formatProductQuantity(item.quantity, item.products?.unit, true)}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0 pl-8 md:pl-0">
                                                    <div className="flex flex-col gap-1 w-24">
                                                        <span className="text-[10px] text-brand-inactive-text font-bold uppercase">Qtd</span>
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
                                                        <span className="text-[10px] text-brand-inactive-text font-bold uppercase">Condição</span>
                                                        <FormDropdown
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
                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Servicos</h4>
                                {order.order_items
                                    ?.filter((item: any) => item.service_id || item.line_type === "service_booking")
                                    .map((item: any) => {
                                        const isCancelled = order.situation === "cancelled";
                                        return (
                                            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-brand-border dark:border-dark-border p-3">
                                                <Checkbox
                                                    checked={!!returnServiceItems[item.id]}
                                                    onChange={(checked) => setReturnServiceItems(prev => ({ ...prev, [item.id]: checked }))}
                                                    disabled={isCancelled || returnResolution === "exchange"}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{item.services?.name || item.product_name}</p>
                                                        {isCancelled && (
                                                            <Badge variant="red">Cancelado</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-brand-inactive-text">Servico</p>
                                                </div>
                                            </div>
                                        )
                                    })}
                            </div>
                        )}

                        {returnResolution === "exchange" && hasAnyService && (
                            <div className="rounded-xl border border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2 items-center">
                                <AlertCircleIcon size={18} className="text-amber-600 dark:text-amber-500 shrink-0" />
                                <span className="text-xs text-amber-800 dark:text-amber-400 font-medium">
                                    Serviços não permitem troca. Selecione Reembolso ou Vale-compra.
                                </span>
                            </div>
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

                        <div className="space-y-3">
                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Evidencias</h4>
                            <div className="max-w-full overflow-x-auto">
                                <ProductImagesSection
                                    images={returnEvidence}
                                    onImageUpload={handleEvidenceUpload}
                                    onRemoveImage={handleRemoveEvidence}
                                    onSetPrimaryImage={() => { }}
                                    isEditing={true}
                                />
                            </div>
                            <p className="text-xs text-brand-inactive-text font-medium">{returnEvidence.length}/5 arquivos</p>
                        </div>
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
        </motion.div>
    );
};
