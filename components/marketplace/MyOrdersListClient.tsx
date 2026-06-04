"use client"

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ReviewButton } from "@/components/marketplace/review-button";
import { OrderRetryPayment } from "@/components/order-retry-payment";
import { OrderStatusSyncOnLoad, BatchOrderStatusSyncOnLoad } from "@/components/order-status-sync-on-load";
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url";
import { Button, IconPlaceholder, Tooltip, Badge } from "@/components/reusable";
import { CheckCircleIcon, AlertCircleIcon, XIcon, ClockIcon, ReturnIcon } from '@/lib/icons';
import { MyOrderDetailPage } from './MyOrderDetailPage';
import { motion, AnimatePresence } from 'framer-motion';
import { getProductUrl } from "@/lib/utils/url-generator";
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

export function MyOrdersListClient({ orders, reviewedOrderIdsArray, userId }: { orders: any[], reviewedOrderIdsArray: string[], userId: string }) {
    const searchParams = useSearchParams();
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

    const reviewedOrderIds = new Set(reviewedOrderIdsArray || []);

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
        if (target.closest('a') || target.closest('button')) {
            return;
        }
        handleOpenDetails(id, orderNumber);
    };

    const activeOrder = orders?.find((o: any) => o.id === activeOrderId);

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

                        <div className="space-y-6 flex-1">
                            <BatchOrderStatusSyncOnLoad orders={orders} />
                            {orders && orders.length > 0 ? (
                                orders.map((order: any) => {
                                    const statusConfig = getStatusConfig(order.situation);
                                    const StatusIcon = statusConfig.icon;
                                    const storeImage = order.partners?.store_image_url
                                        ? getR2ImageUrl(order.partners.store_image_url)
                                        : "https://img.dudit.com.br/static/Placeholder.png";
                                    const hasReviewAction = (order.situation === 'paid' && !reviewedOrderIds.has(order.id) && order.order_items?.[0]) || reviewedOrderIds.has(order.id);
                                    const returnHistoryCount = Array.isArray(order.return_requests) ? order.return_requests.length : 0;

                                    return (
                                        <div
                                            key={order.id}
                                            onClick={(e) => handleCardClick(e, order.id, order.order_number)}
                                            className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-md hover:border-brand-green dark:hover:border-brand-green"
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
                                                        </h3>
                                                        {/* Order ID & Date Bottom */}
                                                        <div className="text-xs text-brand-inactive-text flex items-center gap-1 mt-0.5 flex-wrap">
                                                            <span>Pedido #{order.order_number || order.id.slice(0, 8)}</span>
                                                            <span>•</span>
                                                            <span>{formatFullDate(order.created_at)}</span>
                                                            {returnHistoryCount > 0 && (
                                                                <>
                                                                    <span>•</span>
                                                                    <Tooltip text="Possui histórico de trocas/devoluções">
                                                                        <Badge variant="gray" icon={<ReturnIcon />} className="scale-90 whitespace-nowrap inline-flex">
                                                                            {returnHistoryCount > 1 ? ` ${returnHistoryCount}` : ""}
                                                                        </Badge>
                                                                    </Tooltip>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right side: Status as plain colored text */}
                                                <div className={`flex items-center gap-1.5 text-xs font-bold ${statusConfig.color}`}>
                                                    <StatusIcon size={14} />
                                                    <span>{statusConfig.label}</span>
                                                </div>
                                            </div>

                                            <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                                            {/* Card Content */}
                                            <div className="p-6">

                                                {/* Items List */}
                                                <div className="space-y-4">
                                                    {order.order_items?.map((item: any) => {
                                                        const itemImage = getPrimaryProductDisplayImage({
                                                            images: item.products?.images || null,
                                                            video_thumbnail: item.products?.video_thumbnail || null,
                                                            fallback_variant_image: item.product_variants?.variant_options?.image || null,
                                                        });

                                                        return (
                                                            <Link href={getProductUrl({ ...item.products, id: item.product_id }, order.partners)} prefetch={true} key={item.id} className="flex gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 p-2 -mx-2 rounded-lg transition-colors">
                                                                <div className="w-16 h-16 bg-white border border-brand-border dark:border-dark-border rounded-[8px] flex items-center justify-center p-1 shrink-0">
                                                                    <img src={itemImage} alt={item.products?.name || item.product_name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]" />
                                                                </div>
                                                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                    <div className="flex justify-between items-start">
                                                                        <div>
                                                                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-0.5 group-hover:text-brand-green transition-colors">
                                                                                {item.products?.name || item.product_name}
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
                                                    <div className="flex flex-row items-center gap-3 flex-wrap justify-end">
                                                        {reviewedOrderIds.has(order.id) && (
                                                            <span className="text-xs sm:text-sm font-medium text-brand-green flex items-center gap-1.5">
                                                                <CheckCircleIcon size={16} /> Pedido avaliado
                                                            </span>
                                                        )}

                                                        {order.situation === 'paid' && !reviewedOrderIds.has(order.id) && order.order_items?.[0] && (
                                                            <ReviewButton
                                                                orderId={order.id}
                                                                partnerId={order.partner_id}
                                                                productId={order.order_items[0].product_id}
                                                                serviceId={null}
                                                                userId={userId}
                                                                itemName={order.order_items[0].products?.name || order.order_items[0].product_name}
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
                                })
                            ) : (
                                <div className="text-center flex flex-col items-center justify-center mb-6">
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
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
