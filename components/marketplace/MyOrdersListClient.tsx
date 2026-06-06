"use client"

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ReviewButton } from "@/components/marketplace/review-button";
import { OrderRetryPayment } from "@/components/order-retry-payment";
import { OrderStatusSyncOnLoad, BatchOrderStatusSyncOnLoad } from "@/components/order-status-sync-on-load";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { Button, IconPlaceholder, Tooltip, Badge, Tabs, TabsList, TabsTrigger } from "@/components/reusable";
import { CheckCircleIcon, AlertCircleIcon, XIcon, ClockIcon, ReturnIcon } from '@/lib/icons';
import { MyOrderDetailPage } from './MyOrderDetailPage';
import { motion, AnimatePresence } from 'framer-motion';
import { getProductUrl, getServiceUrl, getPlanUrl } from "@/lib/utils/url-generator";
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images";
import { formatCurrency, formatFullDate } from "@/lib/utils";


const getStatusConfig = (status: string) => {
    switch (status) {
        case 'paid': return { label: 'Pago', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircleIcon, border: 'border-green-200', dotBg: 'bg-green-500' };
        case 'pending': return { label: 'Pendente', color: 'text-brand-orange', bg: 'bg-orange-100', icon: ClockIcon, border: 'border-orange-200', dotBg: 'bg-brand-orange' };
        case 'cancelled': return { label: 'Cancelado', color: 'text-red-700', bg: 'bg-red-100', icon: XIcon, border: 'border-red-200', dotBg: 'bg-red-500' };
        default: return { label: status, color: 'text-gray-700', bg: 'bg-gray-100', icon: AlertCircleIcon, border: 'border-gray-200', dotBg: 'bg-gray-500' };
    }
};

export function MyOrdersListClient({ orders, reviewedItemsArray, userId }: { orders: any[], reviewedItemsArray: any[], userId: string }) {
    const searchParams = useSearchParams();
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string>("todos");

    const reviewedItemsSet = useMemo(() => {
        return new Set((reviewedItemsArray || []).map(r => `${r.order_id}:${r.product_id || r.service_id}`));
    }, [reviewedItemsArray]);

    useEffect(() => {
        const tab = searchParams.get('tab');
        const orderNum = searchParams.get('order_number');
        if (tab === 'details' && orderNum) {
            const orderFound = orders?.find((o: any) => o.order_number === orderNum || o.id === orderNum);
            if (orderFound) {
                setActiveOrderId(orderFound.id);
            }
        } else {
            setActiveOrderId(null);
        }
    }, [searchParams, orders]);

    const updateDetailsUrl = (orderNumber?: string | null) => {
        const params = new URLSearchParams(searchParams.toString());

        if (orderNumber) {
            params.set('tab', 'details');
            params.set('order_number', orderNumber);
        } else {
            params.delete('tab');
            params.delete('order_number');
        }

        const query = params.toString();
        const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;

        window.history.pushState(null, '', nextUrl);
    };

    const handleOpenDetails = (id: string, orderNumber: string) => {
        setActiveOrderId(id);
        const displayNum = orderNumber || id;
        updateDetailsUrl(displayNum);
    };

    const handleCloseDetails = () => {
        setActiveOrderId(null);
        updateDetailsUrl(null);
    };

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

    const activeOrder = orders?.find((o: any) => o.id === activeOrderId);

    // Calculate tab counts
    const tabCounts = useMemo(() => {
        if (!orders) return { todos: 0, pending: 0, preparing: 0, sent: 0, delivered: 0 };
        const counts = { todos: orders.length, pending: 0, preparing: 0, sent: 0, delivered: 0 };
        orders.forEach((order: any) => {
            if (order.situation === "pending") {
                counts.pending++;
            } else if (order.situation === "paid") {
                if (order.delivery_status === "pending" || order.delivery_status === "preparing") {
                    counts.preparing++;
                } else if (order.delivery_status === "sent") {
                    counts.sent++;
                } else if (order.delivery_status === "delivered" || order.delivery_status === "pickup_available") {
                    counts.delivered++;
                }
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
                return order.situation === "pending";
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
            return true;
        });
    }, [orders, activeTab]);

    return (
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
                                <p className="text-md text-brand-inactive-text mt-1">Acompanhe o status das suas compras</p>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="mb-6">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                <TabsList className="mb-6">
                                    <TabsTrigger value="todos">
                                        Todos <span className={`ml-1.5 text-xs font-normal ${activeTab === "todos" ? "text-white/70" : "text-brand-inactive-text"}`}>({tabCounts.todos})</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="pending">
                                        Aguardando pagamento <span className={`ml-1.5 text-xs font-normal ${activeTab === "pending" ? "text-white/70" : "text-brand-inactive-text"}`}>({tabCounts.pending})</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="preparing">
                                        Preparando <span className={`ml-1.5 text-xs font-normal ${activeTab === "preparing" ? "text-white/70" : "text-brand-inactive-text"}`}>({tabCounts.preparing})</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="sent">
                                        Enviado <span className={`ml-1.5 text-xs font-normal ${activeTab === "sent" ? "text-white/70" : "text-brand-inactive-text"}`}>({tabCounts.sent})</span>
                                    </TabsTrigger>
                                    <TabsTrigger value="delivered">
                                        Entregue <span className={`ml-1.5 text-xs font-normal ${activeTab === "delivered" ? "text-white/70" : "text-brand-inactive-text"}`}>({tabCounts.delivered})</span>
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>

                        <div className="flex-1">
                            {filteredOrders && filteredOrders.length > 0 ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start w-full">
                                    <BatchOrderStatusSyncOnLoad orders={orders} />
                                    {filteredOrders.map((order: any) => {
                                        const statusConfig = getStatusConfig(order.situation);
                                        const StatusIcon = statusConfig.icon;
                                        const storeImage = order.partners?.store_image_url
                                            ? getR2ImageUrl(order.partners.store_image_url)
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
                                                            alt={order.partners?.store_name || "Loja"}
                                                            className="w-10 h-10 rounded-full object-cover border border-brand-border dark:border-dark-border bg-white"
                                                        />

                                                        <div>
                                                            {/* Store Name Top */}
                                                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                                                {order.partners?.store_name || "Loja Parceira"}
                                                                {returnHistoryCount > 0 && (
                                                                    <Tooltip text="Possui histórico de trocas/devoluções">
                                                                        <Badge variant="gray" icon={<ReturnIcon />} className="scale-90 whitespace-nowrap inline-flex">
                                                                            {returnHistoryCount > 1 ? ` ${returnHistoryCount}` : ""}
                                                                        </Badge>
                                                                    </Tooltip>
                                                                )}
                                                            </h3>
                                                            {/* Order ID & Date Bottom */}
                                                            <div className="text-xs text-brand-inactive-text mt-0.5">
                                                                <div className="flex items-center gap-1">
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
                                                        <StatusIcon size={14} />
                                                        <span>{statusConfig.label}</span>
                                                    </div>
                                                </div>

                                                {/* Card Content */}
                                                <div className="px-6 pb-6 pt-0">
                                                    <div className="h-px bg-brand-border dark:bg-dark-border w-full mb-6" />

                                                    {/* Items List */}
                                                    <div className="space-y-4">
                                                        {order.order_items?.map((item: any) => {
                                                            const itemImage = getPrimaryProductDisplayImage({
                                                                images: item.products?.images || item.services?.images || null,
                                                                video_thumbnail: item.products?.video_thumbnail || null,
                                                                fallback_variant_image: item.product_variants?.variant_options?.image || null,
                                                            });

                                                            const isService = !!item.service_id || item.line_type === "service_booking";
                                                            const isPlan = !!item.recurring_plan_id || item.line_type === "subscription";

                                                            let itemUrl = "";
                                                            if (isService) {
                                                                itemUrl = getServiceUrl({ ...item.services, id: item.service_id }, order.partners);
                                                            } else if (isPlan) {
                                                                itemUrl = getPlanUrl({ ...item.recurring_plans, id: item.recurring_plan_id }, order.partners);
                                                            } else if (item.product_id) {
                                                                itemUrl = getProductUrl({ ...item.products, id: item.product_id }, order.partners);
                                                            }

                                                            const cardContent = (
                                                                <>
                                                                    <div className="w-16 h-16 bg-white border border-brand-border dark:border-dark-border rounded-[8px] flex items-center justify-center p-1 shrink-0">
                                                                        <img src={itemImage} alt={item.products?.name || item.services?.name || item.product_name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                        <div className="flex justify-between items-start">
                                                                            <div>
                                                                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-0.5 group-hover:text-brand-green transition-colors">
                                                                                    {item.products?.name || item.services?.name || item.product_name}
                                                                                </h4>

                                                                                {item.product_variants?.variant_name && (
                                                                                    <div className="text-xs text-brand-inactive-text mt-0.5">
                                                                                        {item.product_variants.variant_name}
                                                                                    </div>
                                                                                )}

                                                                                <div className="flex items-center gap-2 text-xs mt-1">
                                                                                    <span className="text-brand-inactive-text">{item.quantity} un.</span>
                                                                                    <span className="text-brand-border dark:text-dark-border">|</span>
                                                                                    <span className="font-medium text-brand-dark dark:text-dark-heading">{formatCurrency(item.product_price)}</span>
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
                                                            <span className="text-xs text-brand-inactive-text">Total</span>
                                                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                                                {formatCurrency(order.total_amount)}
                                                            </span>
                                                        </div>

                                                        {/* Right Side: Actions */}
                                                        <div className="flex flex-row items-center flex-wrap justify-end">
                                                            {isOrderFullyReviewed && (
                                                                <span className="text-xs sm:text-sm font-medium text-brand-green flex items-center gap-1.5">
                                                                    <CheckCircleIcon size={16} /> Pedido avaliado
                                                                </span>
                                                            )}

                                                            {order.situation === 'paid' && !isOrderFullyReviewed && reviewableItems.length > 0 && (
                                                                <ReviewButton
                                                                    orderId={order.id}
                                                                    partnerId={order.partner_id}
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

                                                            {order.situation === 'pending' && (
                                                                <div className="w-auto">
                                                                    <OrderRetryPayment
                                                                        orderId={order.id}
                                                                        amount={order.total_amount}
                                                                        status={order.situation}
                                                                        paymentProvider={order.payment_provider}
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
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
