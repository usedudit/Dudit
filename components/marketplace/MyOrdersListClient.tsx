"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import Link from 'next/link';
import { ReviewButton } from "@/components/marketplace/review-button";
import { OrderRetryPayment } from "@/components/order-retry-payment";
import { BatchOrderStatusSyncOnLoad } from "@/components/order-status-sync-on-load";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { Button, IconPlaceholder, Tooltip, Badge, Tabs, TabsList, TabsTrigger } from "@/components/reusable";
import Pagination from "@/components/reusable/Pagination";
import { CheckCircleIcon, AlertCircleIcon, XIcon, ClockIcon, ReturnIcon, TruckIcon, MoneyIcon } from '@/lib/icons';
import { MyOrderDetailPage } from './MyOrderDetailPage';
import { motion, AnimatePresence } from 'framer-motion';
import { getProductUrl, getServiceUrl, getPlanUrl } from "@/lib/utils/url-generator";
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images";
import { formatCurrency, formatFullDate, formatQuantityWithUnit, formatUnitPriceWithUnit, isStoreDeleted } from "@/lib/utils";
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand";

const ORDERS_PER_PAGE = 10

const getStatusConfig = (status: string) => {
    switch (status) {
        case 'paid': return { label: 'Pago', color: 'text-brand-green', bg: 'bg-green-100', icon: CheckCircleIcon, border: 'border-green-200', dotBg: 'bg-green-500' };
        case 'pending': return { label: 'Pendente', color: 'text-brand-orange', bg: 'bg-orange-100', icon: ClockIcon, border: 'border-orange-200', dotBg: 'bg-brand-orange' };
        case 'payment_failed': return { label: 'Pagamento Recusado', color: 'text-red-700', bg: 'bg-red-100', icon: XIcon, border: 'border-red-200', dotBg: 'bg-red-500' };
        case 'partially_paid': return { label: 'Parcialmente Pago', color: 'text-brand-green', bg: 'bg-green-100', icon: CheckCircleIcon, border: 'border-green-200', dotBg: 'bg-green-500' };
        case 'in_process': return { label: 'Em Processamento', color: 'text-brand-orange', bg: 'bg-orange-100', icon: ClockIcon, border: 'border-orange-200', dotBg: 'bg-brand-orange' };
        case 'shipped': return { label: 'Enviado', color: 'text-brand-blue', bg: 'bg-blue-100', icon: TruckIcon, border: 'border-blue-200', dotBg: 'bg-blue-500' };
        case 'delivered': return { label: 'Entregue', color: 'text-brand-green', bg: 'bg-green-100', icon: CheckCircleIcon, border: 'border-green-200', dotBg: 'bg-green-500' };
        case 'cancelled': return { label: 'Cancelado', color: 'text-red-700', bg: 'bg-red-100', icon: XIcon, border: 'border-red-200', dotBg: 'bg-red-500' };
        case 'refunded': return { label: 'Reembolsado', color: 'text-purple-700', bg: 'bg-purple-100', icon: MoneyIcon, border: 'border-purple-200', dotBg: 'bg-purple-500' };
        case 'charged_back': return { label: 'Estornado', color: 'text-purple-700', bg: 'bg-purple-100', icon: MoneyIcon, border: 'border-purple-200', dotBg: 'bg-purple-500' };
        case 'returned': return { label: 'Devolvido', color: 'text-purple-700', bg: 'bg-purple-100', icon: ReturnIcon, border: 'border-purple-200', dotBg: 'bg-purple-500' };
        case 'awaiting_pickup_payment': return { label: 'Pagamento na Retirada', color: 'text-brand-orange', bg: 'bg-orange-100', icon: ClockIcon, border: 'border-orange-200', dotBg: 'bg-brand-orange' };
        case 'awaiting_payment': return { label: 'Aguardando Pagamento', color: 'text-brand-orange', bg: 'bg-orange-100', icon: ClockIcon, border: 'border-orange-200', dotBg: 'bg-brand-orange' };
        default: return { label: status || 'Desconhecido', color: 'text-gray-700 dark:text-dark-body', bg: 'bg-gray-100 dark:bg-dark-border/50', icon: AlertCircleIcon, border: 'border-gray-200 dark:border-dark-border', dotBg: 'bg-gray-500' };
    }
};

// Status de transportadora (order_shipments.status) exibidos na badge do card.
// Cores seguem a mesma paleta das badges de status tradicionais.
const CARRIER_SHIPMENT_BADGES: Record<string, { label: string; color: string; bg: string; border: string; dotBg: string }> = {
    pending: { label: "Aguardando postagem", color: "text-brand-orange", bg: "bg-orange-100", border: "border-orange-200", dotBg: "bg-brand-orange" },
    released: { label: "Aguardando postagem", color: "text-brand-orange", bg: "bg-orange-100", border: "border-orange-200", dotBg: "bg-brand-orange" },
    posted: { label: "Postado", color: "text-brand-blue", bg: "bg-blue-100", border: "border-blue-200", dotBg: "bg-blue-500" },
    in_transit: { label: "Em trânsito", color: "text-brand-blue", bg: "bg-blue-100", border: "border-blue-200", dotBg: "bg-blue-500" },
    delivered: { label: "Entregue", color: "text-brand-green", bg: "bg-green-100", border: "border-green-200", dotBg: "bg-green-500" },
    cancelled: { label: "Envio cancelado", color: "text-red-700", bg: "bg-red-100", border: "border-red-200", dotBg: "bg-red-500" },
    failed: { label: "Falha no envio", color: "text-red-700", bg: "bg-red-100", border: "border-red-200", dotBg: "bg-red-500" },
};

// Situações em que o status da transportadora pode assumir o texto/cor da badge.
// Pagamento pendente ou terminal continua mandando na badge.
const CARRIER_BADGE_SITUATIONS = ["paid", "shipped", "delivered", "in_process", "partially_paid", "completed"];

const getOutboundCarrierShipment = (order: any) => {
    const shipments = Array.isArray(order?.order_shipments) ? order.order_shipments : [];
    const outbound = shipments.filter((s: any) => s && s.kind !== "return");
    if (outbound.length === 0) return null;
    return outbound.reduce((latest: any, s: any) =>
        !latest || String(s.created_at || "") > String(latest.created_at || "") ? s : latest,
    null);
};

const formatProductQuantity = (qty: number, unit?: string | null) => {
    return formatQuantityWithUnit(qty, unit);
};

const formatProductUnitPrice = (price: number, unit?: string | null) => {
    return formatUnitPriceWithUnit(price, unit);
};

function calculateDiscountedPrice(item: any, order: any) {
    const itemsBaseSubtotal = (order.order_items || []).reduce(
        (sum: number, i: any) => sum + Number(i.subtotal ?? Number(i.product_price || 0) * Number(i.quantity || 0)),
        0
    )
    const couponDiscount = Math.max(0, Number(order.coupon_discount_amount || 0))
    const pmDiscount = Math.max(0, Number(order.payment_method_discount_amount || 0))
    const pmExtra = Math.max(0, Number(order.payment_method_extra_amount || 0))
    const subtotalVal = Number(order.subtotal_value || 0) > 0
        ? Number(order.subtotal_value || 0)
        : Number(order.total_amount || 0) - Number(order.delivery_fee || 0) - Number(order.additional_costs || 0) + Number(order.discount_value || 0) + couponDiscount + pmDiscount - pmExtra
    const isDepositOrder = Boolean(order?.checkout_fulfillment?.depositCheckout?.payDepositOnly)
    const hasItemDiscount = !isDepositOrder && itemsBaseSubtotal > 0 && subtotalVal > 0 && Math.abs(itemsBaseSubtotal - subtotalVal) > 0.005
    const itemDiscountRatio = hasItemDiscount ? subtotalVal / itemsBaseSubtotal : 1
    const basePrice = Number(item.product_price || 0)
    if (item.is_gift || item.is_promotional) return { discountedPrice: basePrice, hasItemDiscount: false, basePrice }
    if (!hasItemDiscount) return { discountedPrice: basePrice, hasItemDiscount: false, basePrice }
    return { discountedPrice: Math.round(basePrice * itemDiscountRatio * 100) / 100, hasItemDiscount: true, basePrice }
}

interface MyOrdersListClientProps {
    orders: any[];
    reviewedItemsArray: any[];
    userId: string;
    initialOrderNumber?: string;
    initialTab?: string;
    userProfile?: any;
    cartCount?: number;
}

export function MyOrdersListClient({
    orders,
    reviewedItemsArray,
    userId,
    initialOrderNumber,
    initialTab,
    userProfile,
    cartCount,
}: MyOrdersListClientProps) {
    const searchParams = useSearchParams();

    // Determine initial order id synchronously for instant SSR / hydration match
    const initialOrderId = useMemo(() => {
        const orderNum = initialOrderNumber || (typeof window !== "undefined" ? (new URL(window.location.href).searchParams.get("order_number") || new URL(window.location.href).searchParams.get("order") || new URL(window.location.href).searchParams.get("view")) : null);
        const tab = initialTab || (typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("tab") : null);

        if ((tab === "details" || !tab) && orderNum) {
            const found = orders?.find((o: any) => o.order_number === orderNum || o.id === orderNum);
            return found ? found.id : null;
        }
        return null;
    }, [initialOrderNumber, initialTab, orders]);

    const [activeOrderId, setActiveOrderId] = useState<string | null>(initialOrderId);
    const activeOrderIdRef = useRef<string | null>(initialOrderId);
    activeOrderIdRef.current = activeOrderId;

    const initialStatusTab = (initialTab && ["todos", "pending", "preparing", "sent", "delivered", "cancelled"].includes(initialTab)) ? initialTab : "todos";
    const [activeTab, setActiveTab] = useState<string>(initialStatusTab);
    const [currentPage, setCurrentPage] = useState(1);

    const reviewedItemsSet = useMemo(() => {
        return new Set((reviewedItemsArray || []).map(r => `${r.order_id}:${r.product_id || r.service_id}`));
    }, [reviewedItemsArray]);

    // ── Instant 0ms popstate synchronization for browser Back / Forward ─────
    useEffect(() => {
        const handlePopState = () => {
            if (typeof window === "undefined") return;
            const url = new URL(window.location.href);
            const tab = url.searchParams.get("tab");
            const orderNum = url.searchParams.get("order_number") || url.searchParams.get("order") || url.searchParams.get("view");

            if ((tab === "details" || !tab) && orderNum) {
                const orderFound = orders?.find((o: any) => o.order_number === orderNum || o.id === orderNum);
                const foundId = orderFound ? orderFound.id : null;
                activeOrderIdRef.current = foundId;
                setActiveOrderId(foundId);
            } else {
                activeOrderIdRef.current = null;
                setActiveOrderId(null);
            }
        };

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [orders]);

    // ── Secondary sync from searchParams (external Next.js router transitions) ──
    useEffect(() => {
        const tab = searchParams.get('tab');
        const orderNum = searchParams.get('order_number') || searchParams.get('order') || searchParams.get('view');
        if ((tab === 'details' || !tab) && orderNum) {
            const orderFound = orders?.find((o: any) => o.order_number === orderNum || o.id === orderNum);
            const targetId = orderFound ? orderFound.id : null;
            if (targetId !== activeOrderIdRef.current) {
                activeOrderIdRef.current = targetId;
                setActiveOrderId(targetId);
            }
        } else {
            if (activeOrderIdRef.current !== null) {
                activeOrderIdRef.current = null;
                setActiveOrderId(null);
            }
        }
    }, [searchParams, orders]);

    // ── Open details: Instant 0ms UI + pushState without RSC roundtrip ──
    const handleOpenDetails = useCallback((id: string, orderNumber: string) => {
        activeOrderIdRef.current = id;
        setActiveOrderId(id);
        const displayNum = orderNumber || id;

        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', 'details');
            url.searchParams.set('order_number', displayNum);

            const nextRelative = `${url.pathname}${url.search}${url.hash}`;
            const currentRelative = `${window.location.pathname}${window.location.search}${window.location.hash}`;

            if (nextRelative !== currentRelative) {
                window.history.pushState(window.history.state, "", nextRelative);
            }
        }
    }, []);

    // ── Close details: remove modal params without leaving the current route ──
    const handleCloseDetails = useCallback(() => {
        if (!activeOrderIdRef.current) return;
        activeOrderIdRef.current = null;
        setActiveOrderId(null);

        if (typeof window === "undefined") return;

        // The modal can be opened after a direct load or while the App Router
        // is still committing an RSC transition. Calling history.back() is not
        // guaranteed to pop the entry created by this component and can take
        // the user out of /pedidos. Clean the URL in-place instead.
        const url = new URL(window.location.href);
        url.searchParams.delete('tab');
        url.searchParams.delete('order_number');
        url.searchParams.delete('order');
        url.searchParams.delete('view');
        const nextRelative = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState(window.history.state, "", nextRelative);
    }, []);

    const handleCardClick = (e: React.MouseEvent, id: string, orderNumber: string) => {
        const target = e.target as HTMLElement;
        if (
            target.closest('a') ||
            target.closest('button') ||
            target.closest('textarea') ||
            target.closest('input') ||
            target.closest('[role="dialog"]') ||
            target.closest('[class*="Dialog"]') ||
            target.closest('[class*="Modal"]')
        ) {
            return;
        }
        handleOpenDetails(id, orderNumber);
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const activeOrder = orders?.find((o: any) => o.id === activeOrderId);

    // Calculate tab counts
    const tabCounts = useMemo(() => {
        if (!orders) return { todos: 0, pending: 0, preparing: 0, sent: 0, delivered: 0, cancelled: 0 };
        const counts = { todos: orders.length, pending: 0, preparing: 0, sent: 0, delivered: 0, cancelled: 0 };
        orders.forEach((order: any) => {
            if (order.situation === "pending" || order.situation === "payment_failed") {
                counts.pending++;
            } else if (order.situation === "paid") {
                if (order.delivery_status === "pending" || order.delivery_status === "preparing") {
                    counts.preparing++;
                } else if (order.delivery_status === "sent") {
                    counts.sent++;
                } else if (order.delivery_status === "delivered" || order.delivery_status === "pickup_available") {
                    counts.delivered++;
                }
                // paid but no delivery_status match → falls into "todos" only
            } else if (["cancelled", "refunded", "charged_back", "returned"].includes(order.situation)) {
                counts.cancelled++;
            }
        });
        return counts;
    }, [orders]);

    // Filter orders
    const filteredOrders = useMemo(() => {
        if (!orders) return [];
        return orders.filter((order: any) => {
            if (activeTab === "todos") return true;
            if (activeTab === "pending") {
                return order.situation === "pending" || order.situation === "payment_failed";
            }
            if (activeTab === "preparing") {
                return order.situation === "paid" && (order.delivery_status === "pending" || order.delivery_status === "preparing");
            }
            if (activeTab === "sent") {
                return order.situation === "paid" && order.delivery_status === "sent";
            }
            if (activeTab === "delivered") {
                return order.situation === "paid" && (order.delivery_status === "delivered" || order.delivery_status === "pickup_available");
            }
            if (activeTab === "cancelled") {
                return ["cancelled", "refunded", "charged_back", "returned"].includes(order.situation);
            }
            return false;
        });
    }, [orders, activeTab]);

    // Client-side pagination
    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
    const paginatedOrders = useMemo(() => {
        const start = (currentPage - 1) * ORDERS_PER_PAGE;
        return filteredOrders.slice(start, start + ORDERS_PER_PAGE);
    }, [filteredOrders, currentPage]);

    const isDetails = !!(activeOrderId && activeOrder);
    const headerTitle = isDetails ? "Detalhes do pedido" : "Meus pedidos";

    return (
        <>
            <MarketplaceHeader simpleTitle={headerTitle} userProfile={userProfile} cartCount={cartCount} />
            <div className="flex-1 flex flex-col container mx-auto px-4 max-w-[1400px] w-full md:pt-10 pb-20 mt-[78px] lg:mt-[108px] relative overflow-hidden">
                <AnimatePresence mode="wait">
                    {activeOrderId && activeOrder ? (
                        <MyOrderDetailPage key="details" order={activeOrder} onBack={handleCloseDetails} />
                    ) : (
                        <motion.div
                            key="list"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col flex-1 w-full"
                        >
                            {/* Header */}
                            <div className="hidden lg:block items-center mb-8">
                                <div>
                                    <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                        Meus Pedidos
                                    </h1>
                                    <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">Acompanhe o status das suas compras</p>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="mb-6">
                                <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setCurrentPage(1); }} className="w-full">
                                    <TabsList className="mb-6">
                                        <TabsTrigger value="todos">
                                            Todos <span className="ml-1.5 text-xs font-normal">({tabCounts.todos})</span>
                                        </TabsTrigger>
                                        <TabsTrigger value="pending">
                                            Aguardando pagamento <span className="ml-1.5 text-xs font-normal">({tabCounts.pending})</span>
                                        </TabsTrigger>
                                        <TabsTrigger value="preparing">
                                            Preparando <span className="ml-1.5 text-xs font-normal">({tabCounts.preparing})</span>
                                        </TabsTrigger>
                                        <TabsTrigger value="sent">
                                            Enviado <span className="ml-1.5 text-xs font-normal">({tabCounts.sent})</span>
                                        </TabsTrigger>
                                         <TabsTrigger value="delivered">
                                            Entregue <span className="ml-1.5 text-xs font-normal">({tabCounts.delivered})</span>
                                        </TabsTrigger>
                                        <TabsTrigger value="cancelled">
                                            Cancelados <span className="ml-1.5 text-xs font-normal">({tabCounts.cancelled})</span>
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>

                            <div className="flex-1">
                                {paginatedOrders && paginatedOrders.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start w-full">
                                        <BatchOrderStatusSyncOnLoad orders={orders} />
                                        {paginatedOrders.map((order: any) => {
                                            const carrierShipment = getOutboundCarrierShipment(order);
                                            const orderIsCarrier = Boolean(carrierShipment) || order?.delivery_breakdown?.source === "superfrete";
                                            const baseStatusConfig = getStatusConfig(order.situation);
                                            const shipmentBadge = orderIsCarrier && carrierShipment && CARRIER_BADGE_SITUATIONS.includes(order.situation)
                                                ? CARRIER_SHIPMENT_BADGES[carrierShipment.status]
                                                : undefined;
                                            const statusConfig = shipmentBadge ? { ...baseStatusConfig, ...shipmentBadge } : baseStatusConfig;
                                            const StatusIcon = statusConfig.icon;
                                            const storeObj = Array.isArray(order.stores) ? order.stores[0] : order.stores;
                                            const sellerName = storeObj?.name || order.partners?.name || order.partners?.store_name || "Loja Parceira";
                                            const storeImage = storeObj?.logo_url
                                                ? getR2ImageUrl(storeObj.logo_url)
                                                : "https://img.dudit.com.br/static/Placeholder.png";

                                            const orderItems = order.order_items || [];
                                            const reviewableItems = orderItems.filter((item: any) => item.product_id || item.service_id);
                                            const unreviewedItems = reviewableItems.filter((item: any) => !reviewedItemsSet.has(`${order.id}:${item.product_id || item.service_id}`));
                                            const isOrderFullyReviewed = reviewableItems.length > 0 && unreviewedItems.length === 0;

                                            const returnHistoryCount = Array.isArray(order.return_requests) ? order.return_requests.length : 0;

                                            return (
                                                <div
                                                    key={order.id}
                                                    onClick={(e) => handleCardClick(e, order.id, order.order_number)}
                                                    className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-md hover:border-brand-green dark:hover:border-brand-green w-full"
                                                >
                                                    {/* Batch sync handled at container level */}

                                                    {/* Card Header */}
                                                    <div className="px-6 py-4 flex flex-row items-center justify-between gap-4">
                                                        <div className="flex items-center gap-4">
                                                            {/* Seller Image */}
                                                            <img
                                                                src={storeImage}
                                                                alt={sellerName}
                                                                className="w-10 h-10 rounded-full object-cover border border-brand-border dark:border-dark-border bg-white"
                                                            />

                                                            <div>
                                                                {/* Store Name Top */}
                                                                <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                                    {sellerName}
                                                                    {isStoreDeleted(order) && (
                                                                        <Tooltip text="Este negócio não está mais na Dudit">
                                                                            <span className="w-2.5 h-2.5 rounded-full bg-brand-red shrink-0 inline-block align-middle cursor-help" />
                                                                        </Tooltip>
                                                                    )}
                                                                    {returnHistoryCount > 0 && (
                                                                        <Tooltip text="Possui histórico de trocas/devoluções">
                                                                            <Badge variant="purple" icon={<ReturnIcon />} className="scale-90 whitespace-nowrap inline-flex">
                                                                                {returnHistoryCount > 1 ? ` ${returnHistoryCount}` : ""}
                                                                            </Badge>
                                                                        </Tooltip>
                                                                    )}
                                                                </h3>
                                                                {/* Order ID & Date Bottom */}
                                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span>Pedido #{order.order_number || order.id.slice(0, 8)}</span>
                                                                        <span className="hidden lg:inline">•</span>
                                                                        <span className="hidden lg:inline">{formatFullDate(order.created_at)}</span>
                                                                    </div>
                                                                    <span className="block lg:hidden mt-0.5">{formatFullDate(order.created_at)}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Right side: Status as plain colored text */}
                                                        <div className={`flex items-center gap-1.5 text-xs font-bold ${statusConfig.color}`}>
                                                            {orderIsCarrier ? (
                                                                <Tooltip text="Entrega por transportadora">
                                                                    <img
                                                                        src={getCarrierBrandIcon(order?.delivery_breakdown?.companyName, carrierShipment?.carrier)}
                                                                        alt="Entrega por transportadora"
                                                                        className="w-3.5 h-3.5 object-contain shrink-0 cursor-help"
                                                                    />
                                                                </Tooltip>
                                                            ) : (
                                                                <StatusIcon size={14} />
                                                            )}
                                                            <span>{statusConfig.label}</span>
                                                        </div>
                                                    </div>

                                                    {/* Card Content */}
                                                    <div className="px-6 pb-6 pt-0">
                                                        <div className="h-px bg-brand-border dark:bg-dark-border w-full mb-6" />

                                                        {/* Items List */}
                                                        <div className="space-y-4">
                                                            {order.order_items?.map((item: any) => {
                                                                const { discountedPrice, hasItemDiscount, basePrice } = calculateDiscountedPrice(item, order);
                                                                const itemImage = getPrimaryProductDisplayImage({
                                                                    images: item.products?.images || item.services?.images || null,
                                                                    video_thumbnail: item.products?.video_thumbnail || null,
                                                                    fallback_variant_image: item.product_variants?.variant_options?.image || null,
                                                                });

                                                                const isService = !!item.service_id || item.line_type === "service_booking";
                                                                const isPlan = !!item.recurring_plan_id || item.line_type === "subscription";

                                                                let itemUrl = "";
                                                                if (isService) {
                                                                    itemUrl = getServiceUrl({ ...item.services, id: item.service_id, short_id: item.services?.short_id }, storeObj || order.partners);
                                                                } else if (isPlan) {
                                                                    itemUrl = getPlanUrl({ ...item.recurring_plans, id: item.recurring_plan_id, short_id: item.recurring_plans?.short_id }, storeObj || order.partners);
                                                                } else if (item.product_id) {
                                                                    itemUrl = getProductUrl({ ...item.products, id: item.product_id, short_id: item.products?.short_id }, storeObj || order.partners);
                                                                }


                                                                const cardContent = (
                                                                    <>
                                                                        <div className="w-12 h-12 bg-white border border-brand-border dark:border-dark-border rounded-[8px] flex items-center justify-center shrink-0">
                                                                            <img
                                                                                src={itemImage}
                                                                                alt={item.products?.name || item.services?.name || item.product_name}
                                                                                loading="lazy"
                                                                                decoding="async"
                                                                                className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]"
                                                                            />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                            <div className="flex justify-between items-start">
                                                                                <div>
                                                                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-0.5 group-hover:text-brand-green transition-colors">
                                                                                        {item.is_gift && <span className="text-brand-green font-bold">[BRINDE] </span>}{item.products?.name || item.services?.name || item.product_name}
                                                                                    </h4>

                                                                                    {item.product_variants?.variant_name && (
                                                                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                                            {item.product_variants.variant_name}
                                                                                        </div>
                                                                                    )}

                                                                                    {(() => {
                                                                                        const matchLine = Array.isArray(order.checkout_fulfillment?.lines)
                                                                                            ? order.checkout_fulfillment.lines.find((l: any) =>
                                                                                                (item.id && l.orderItemId === item.id) ||
                                                                                                (item.product_id && l.productId === item.product_id && (l.variantId || null) === (item.variant_id || null)) ||
                                                                                                (item.service_id && l.serviceId === item.service_id)
                                                                                            )
                                                                                            : null
                                                                                        const selectedAddons = item.booking_metadata?.selectedAddons || matchLine?.selectedAddons
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

                                                                                    <div className="flex items-center gap-2 text-xs mt-1">
                                                                                        <span className="text-brand-inactive-text dark:text-dark-body">{formatProductQuantity(item.quantity, item.products?.unit)}</span>
                                                                                        <span className="text-brand-border dark:text-dark-border">|</span>
                                                                                        <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                                            {(() => {
                                                                                                const basePrice = Number(item.product_price || 0)
                                                                                                if (item.is_gift) {
                                                                                                    return (
                                                                                                        <span className="flex items-center gap-1.5 inline-flex">
                                                                                                            <span className="text-xs text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatCurrency(item.original_price || 0)}</span>
                                                                                                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Grátis</span>
                                                                                                        </span>
                                                                                                    )
                                                                                                }
                                                                                                if (hasItemDiscount && Math.abs(basePrice - discountedPrice) > 0.005) {
                                                                                                    return (
                                                                                                        <span className="flex items-center gap-1.5 inline-flex">
                                                                                                            <span className="text-xs text-brand-inactive-text dark:text-dark-body line-through font-normal">{formatProductUnitPrice(basePrice, item.products?.unit)}</span>
                                                                                                            <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">{formatProductUnitPrice(discountedPrice, item.products?.unit)}</span>
                                                                                                        </span>
                                                                                                    )
                                                                                                }
                                                                                                return formatProductUnitPrice(basePrice, item.products?.unit)
                                                                                            })()}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                );

                                                                if (!itemUrl) {
                                                                    return (
                                                                        <div key={item.id} className="flex gap-4 p-2 -mx-2 rounded-lg transition-colors">
                                                                            {cardContent}
                                                                        </div>
                                                                    );
                                                                }

                                                                return (
                                                                    <Link href={itemUrl} prefetch={true} key={item.id} className="flex gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 p-2 -mx-2 rounded-lg transition-colors group">
                                                                        {cardContent}
                                                                    </Link>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* Actions Footer */}
                                                        <div className="flex flex-row justify-between items-center gap-4 mt-8 pt-6 border-t border-brand-border dark:border-dark-border w-full flex-wrap">
                                                            {/* Left Side: Total Amount */}
                                                            <div className="flex flex-col">
                                                                <span className="text-xs text-brand-inactive-text dark:text-dark-body">Total</span>
                                                                <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                                                    {formatCurrency(order.total_amount)}
                                                                </span>
                                                            </div>

                                                            {/* Right Side: Actions */}
                                                            <div className="flex flex-row items-center flex-wrap justify-end gap-3">
                                                                {isOrderFullyReviewed && (
                                                                    <span className="text-xs sm:text-sm font-medium text-brand-green flex items-center gap-1.5">
                                                                        <CheckCircleIcon size={16} /> Pedido avaliado
                                                                    </span>
                                                                )}

                                                                {order.situation === 'paid' && !isOrderFullyReviewed && reviewableItems.length > 0 && (
                                                                    <ReviewButton
                                                                        orderId={order.id}
                                                                        partnerId={order.partner_id}
                                                                        storeId={order.store_id}
                                                                        items={order.order_items}
                                                                        userId={userId}
                                                                        reviewedItemsSet={reviewedItemsSet}
                                                                    />
                                                                )}

                                                                <Button
                                                                    onClick={() => handleOpenDetails(order.id, order.order_number)}
                                                                    variant="outline"
                                                                    className="w-auto"
                                                                >
                                                                    Ver detalhes
                                                                </Button>

                                                                {(order.situation === 'pending' || order.situation === 'payment_failed') && (
                                                                    <div className="w-auto">
                                                                        <OrderRetryPayment
                                                                            orderId={order.id}
                                                                            amount={order.total_amount}
                                                                            status={order.situation}
                                                                            paymentProvider={order.payment_provider}
                                                                            orderNumber={order.order_number}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center flex flex-col items-center justify-center mb-6 py-12 w-full">
                                        <BatchOrderStatusSyncOnLoad orders={orders} />
                                        {orders && orders.length > 0 ? (
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Nenhum pedido nesta categoria"
                                                title="Nenhum pedido encontrado"
                                                subtitle="Você não tem nenhum pedido com esse status no momento."
                                            />
                                        ) : (
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                                imageAlt="Nenhum pacote a caminho ainda?"
                                                title="Sua lista de pedidos está vazia"
                                                subtitle="Que tal fazer sua primeira compra e ver o Dino entrar em ação?"
                                                itemButton={{
                                                    text: "Explorar agora",
                                                    action: "/"
                                                }}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>

                            {totalPages > 1 && (
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    onPageChange={handlePageChange}
                                />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
}
