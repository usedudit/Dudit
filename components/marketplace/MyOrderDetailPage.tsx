"use client"

import { useState, useCallback } from 'react';
import {
    MapPinIcon,
    ChevronRightIcon,
    CreditCardIcon,
    TruckIcon,
    XIcon,
    CheckCircleIcon,
    ClockIcon,
    AlertCircleIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Spinner } from '@/components/reusable';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import Link from 'next/link';
import { PaymentWrapper } from '@/components/PaymentWrapper';
import { createMarketplaceCancellationRequestAction, createMarketplaceReturnRequestAction } from '@/app/actions/erp/returns';
import { getProductUrl, getPartnerUrl } from '@/lib/utils/url-generator';
import { useR2Upload } from '@/hooks/use-r2-upload';
import { canRequestOrderCancellation, canRequestPostFulfillmentResolution } from '@/lib/returns/calculations';
import { getPrimaryProductDisplayImage } from '@/lib/utils/product-display-images';

import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency, formatFullDate, formatTime } from '@/lib/utils';

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

const ShippingDetailsModal = ({ isOpen, onClose, order }: { isOpen: boolean; onClose: () => void; order: any }) => {
    if (!isOpen) return null;
    const dateStr = formatFullDate(order.created_at);
    const deliveryTypeStr = order.delivery_type === "delivery" ? "Delivery" : "Retirada no local";

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
                            {order.delivery_type === "delivery" && <span className="italic font-black text-brand-green flex items-center text-xs"><TruckIcon size={14} className="fill-current mr-0.5" /> DUDIT</span>}
                        </div>
                        <div className="relative pl-2 space-y-8">
                            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-zinc-700"></div>
                            <div className="relative flex gap-4">
                                <div className="w-6 h-6 rounded-full bg-brand-dark dark:bg-white border-4 border-white dark:border-dark-surface z-10 shrink-0"></div>
                                <div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">Pedido Realizado</div>
                                    <div className="text-xs text-brand-inactive-text mt-1">{dateStr}</div>
                                </div>
                            </div>
                            <div className="relative flex gap-4">
                                <div className={`w-6 h-6 rounded-full ${order.situation === "paid" ? "bg-brand-dark dark:bg-white" : "bg-gray-200 dark:bg-zinc-700"} border-4 border-white dark:border-dark-surface z-10 shrink-0`}></div>
                                <div>
                                    <div className={`text-sm ${order.situation === "paid" ? "font-bold text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text"}`}>
                                        {order.situation === "pending" ? "Aguardando Pagamento" : "Pagamento Aprovado"}
                                    </div>
                                </div>
                            </div>
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
                                <p className="font-medium text-brand-dark dark:text-dark-heading">Retirada diretamente com a loja parceira ({order.partners?.store_name}).</p>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const InfoCard = ({ icon: Icon, title, description, onClick, rightIcon: RightIcon = ChevronRightIcon }: any) => (
    <div
        onClick={onClick}
        className="group flex items-center gap-4 p-4 rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-brand-dark/30 dark:hover:border-dark-heading/30 transition-all cursor-pointer"
    >
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 flex items-center justify-center shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-dark-border/90 transition-colors">
            <Icon size={20} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <div className="flex-1 w-full min-w-0 pr-2">
            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-0.5 truncate">{title}</h3>
            <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-tight truncate">{description}</p>
        </div>
        <RightIcon size={18} className="text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors" />
    </div>
);

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
    const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
    const [returnReason, setReturnReason] = useState("changed_mind");
    const [returnResolution, setReturnResolution] = useState<"exchange" | "refund" | "store_credit">("refund");
    const [returnMessage, setReturnMessage] = useState("");
    const [returnItems, setReturnItems] = useState<Record<string, number>>({});
    const [returnEvidence, setReturnEvidence] = useState<any[]>([]);
    const evidenceUploader = useR2Upload({
        endpoint: "/api/r2/returns-evidence",
        allowedTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    });

    const handleBack = useCallback(() => onBack(), [onBack]);

    if (!order) return null;

    const orderNumber = order.order_number || order.id.slice(0, 8).toUpperCase();
    const dateStrFull = formatFullDate(order.created_at);
    const dateStrTime = formatTime(order.created_at);
    const statusConfig = getStatusConfig(order.situation);
    const storeImage = order.partners?.store_image_url
        ? getR2ImageUrl(order.partners.store_image_url)
        : "https://img.dudit.com.br/static/Placeholder.png";

    const isDelivery = order.delivery_type === "delivery";
    const sellerName = order.partners?.store_name || "Loja Parceira";
    const totalAmount = Number(order.total_amount);
    const canCancelOrder = canRequestOrderCancellation(order);
    const canRequestResolution = canRequestPostFulfillmentResolution(order);

    const isPix = order.payment_method?.toLowerCase() === "pix" || order.payment_method?.toLowerCase() === "bank_transfer";
    const paymentMethodName = isPix ? "Pix" : (order.payment_method || order.payment_provider || "Pix");
    const PaymentIcon = isPix ? () => <img src="https://img.dudit.com.br/static/icons/payments/Pix.png" alt="Pix" className="w-[18px] h-[18px] object-contain" /> : CreditCardIcon;

    const handlePixClick = async () => {
        if (order.situation !== "pending" || !isPix) return;
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
            const res = await createMarketplaceCancellationRequestAction({
                orderId: order.id,
                reason: cancelReason,
                details: cancelDetails,
                idempotencyKey: `cancel:${order.id}:${Date.now()}`,
            });
            if (!res.success) throw new Error(res.error);

            toast({
                title: "Solicitacao enviada",
                description: "O vendedor recebeu seu pedido de cancelamento."
            });

            setIsCancelModalOpen(false);
        } catch (err: any) {
            toast({
                title: "Erro ao solicitar cancelamento",
                description: err.message || "Ocorreu um erro ao solicitar o cancelamento.",
                variant: "destructive"
            });
        } finally {
            setIsCanceling(false);
        }
    };

    const handleEvidenceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;
        const remaining = Math.max(0, 5 - returnEvidence.length);
        for (const file of Array.from(files).slice(0, remaining)) {
            const uploaded = await evidenceUploader.uploadFile(file);
            setReturnEvidence(prev => [...prev, {
                file_url: uploaded.publicUrl,
                file_key: uploaded.key,
                file_name: file.name,
                file_type: uploaded.contentType || file.type,
                file_size: file.size,
            }]);
        }
        event.target.value = "";
    };

    const submitReturnRequest = async () => {
        const items = Object.entries(returnItems)
            .filter(([, quantity]) => Number(quantity) > 0)
            .map(([orderItemId, quantity]) => ({ order_item_id: orderItemId, quantity: Number(quantity), reason: returnReason }));

        if (items.length === 0) {
            toast({ title: "Selecione ao menos um produto", variant: "destructive" });
            return;
        }

        try {
            setIsSubmittingReturn(true);
            const result = await createMarketplaceReturnRequestAction({
                orderId: order.id,
                resolution: returnResolution,
                reason: returnReason,
                message: returnMessage,
                items,
                evidence: returnEvidence,
                idempotencyKey: `marketplace:${order.id}:${Date.now()}`,
            });
            if (!result.success) throw new Error(result.error);
            toast({ title: "Solicitacao enviada", description: "A loja recebeu seu pedido de troca ou devolucao." });
            setIsReturnModalOpen(false);
        } catch (err: any) {
            toast({ title: "Erro ao enviar", description: err.message || "Tente novamente.", variant: "destructive" });
        } finally {
            setIsSubmittingReturn(false);
        }
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
                <div className="mb-8 hidden lg:flex flex-col md:flex-row md:items-center gap-4 w-full justify-start">
                    <div className="hidden md:flex">
                        <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                            <XIcon className="w-5 h-5" />
                        </Button>
                    </div>
                    <div className="text-left w-full">
                        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">Detalhes da Compra</h1>
                        <p className="text-md text-brand-inactive-text mt-1">Acompanhe o status e informações do seu pedido.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* LEFT COLUMN */}
                    <div className="lg:col-span-8 space-y-4">

                        {/* Status Card */}
                        <div className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden">
                            <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-emerald-900/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <div className="font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                        Detalhes do Pedido #{orderNumber}
                                    </div>
                                </div>
                                {/* <span className={`text-sm font-bold ${statusConfig.color}`}>{statusConfig.label}</span> */}
                            </div>
                            <div className="p-6">
                                {/* <div className={`${statusConfig.color} font-bold text-sm mb-1`}>{statusConfig.statusText}</div> */}
                                <div className="flex items-center gap-2 mb-4 flex-wrap">
                                    Realizado em {dateStrFull}
                                    {isDelivery && <span className="italic font-black text-brand-green flex items-center"><TruckIcon size={18} className="fill-current mr-0.5" /> DUDIT</span>}
                                </div>
                                <p className="text-brand-dark dark:text-dark-body text-sm">
                                    {isDelivery ? (
                                        <>Será entregue via delivery no endereço cadastrado.</>
                                    ) : (
                                        <>Você optou por retirar o pedido no local da loja <b>{sellerName}</b>.</>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Purchase Info Card */}
                        <div className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden">
                            <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-emerald-900/10 font-bold text-brand-dark dark:text-dark-heading">
                                Informações da compra
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="font-bold text-sm text-brand-dark mb-3">Pagamento</h4>
                                        <InfoCard
                                            icon={PaymentIcon}
                                            title={
                                                loadingPayment ? <Spinner size={14} className="text-brand-dark" /> :
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span>{formatCurrency(totalAmount)}</span>
                                                        <span className="font-normal text-brand-inactive-text flex items-center gap-1.5">
                                                            • 
                                                            {order.payment_provider === "Mercado Pago" && (
                                                                <span className="w-6 h-6 rounded-full bg-brand-gray dark:bg-dark-border/50 flex items-center justify-center overflow-hidden shrink-0 border border-brand-border dark:border-dark-border inline-flex">
                                                                    <img
                                                                        src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                                                                        alt="Mercado Pago"
                                                                        className="w-3.5 h-3.5 object-contain"
                                                                    />
                                                                </span>
                                                            )}
                                                            {paymentMethodName}
                                                        </span>
                                                    </div>
                                            }
                                            // description={statusConfig.statusText}
                                            onClick={handlePixClick}
                                        />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm text-brand-dark mb-3">Envio</h4>
                                        <InfoCard
                                            icon={isDelivery ? TruckIcon : MapPinIcon}
                                            title={isDelivery ? "Delivery" : "Retirada no local"}
                                            description={isDelivery ? "Ver endereço de entrega" : "Ver endereço da loja"}
                                            onClick={() => setIsShippingModalOpen(true)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Seller Card */}
                        <div className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden">
                            <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-emerald-900/10 font-bold text-brand-dark dark:text-dark-heading">
                                Vendedor
                            </div>
                            <Link href={getPartnerUrl({ ...order.partners, id: order.partner_id })} prefetch={true} className="p-6 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors block cursor-pointer">
                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                                    <img src={storeImage} alt={sellerName} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{sellerName}</div>
                                    <div className="text-xs text-brand-inactive-text mt-0.5 max-w-sm">Acessar perfil do vendedor</div>
                                </div>
                                <ChevronRightIcon size={18} className="text-brand-inactive-text" />
                            </Link>
                        </div>

                        {canCancelOrder && (
                            <>
                                <div className="border-t border-brand-border dark:border-dark-border my-6"></div>
                                <Button
                                    variant="outlinered"
                                    className="w-full sm:w-auto h-12 font-bold"
                                    onClick={() => setIsCancelModalOpen(true)}
                                    disabled={isCanceling}
                                >
                                    {isCanceling ? (
                                        <><Spinner size={16} className="text-brand-red mr-2" /> Cancelando...</>
                                    ) : (
                                        "Cancelar pedido"
                                    )}
                                </Button>
                            </>
                        )}

                        {!canCancelOrder && !canRequestResolution && order.situation !== "cancelled" && (
                            <div className="mt-6 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/60 dark:bg-dark-border/30 p-4 text-sm text-brand-inactive-text dark:text-dark-body">
                                Este pedido ja esta sendo processado. Assim que sair para entrega, voce podera solicitar devolucao, troca ou reembolso.
                            </div>
                        )}

                        {canRequestResolution && (
                            <>
                                <div className="border-t border-brand-border dark:border-dark-border my-6"></div>
                                <p className="mb-3 text-sm text-brand-inactive-text dark:text-dark-body">
                                    Este pedido ja esta sendo entregue. Para continuar, solicite uma devolucao, troca ou reembolso.
                                </p>
                                <Button
                                    variant="outline"
                                    className="w-full sm:w-auto h-12 font-bold"
                                    onClick={() => setIsReturnModalOpen(true)}
                                >
                                    Solicitar troca ou devolucao
                                </Button>
                            </>
                        )}
                    </div>

                    {/* RIGHT COLUMN - SUMMARY */}
                    <div className="lg:col-span-4">
                        <div className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden sticky top-[90px]">
                            <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-emerald-900/10 font-bold text-brand-dark dark:text-dark-heading">
                                Resumo da compra
                            </div>
                            <div className="p-6">
                                <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                    {order.order_items?.map((item: any) => {
                                        const itemImage = getPrimaryProductDisplayImage({
                                            images: item.products?.images || null,
                                            video_thumbnail: item.products?.video_thumbnail || null,
                                            fallback_variant_image: item.product_variants?.variant_options?.image || null,
                                        });
                                        const itemTotal = Number(item.subtotal || item.product_price * item.quantity);

                                        return (
                                            <Link href={getProductUrl({ ...item.products, id: item.product_id }, order.partners)} prefetch={true} key={item.id} className="group flex flex-row items-center gap-4 cursor-pointer p-2 -mx-2 rounded-lg">
                                                <div className="w-14 h-14 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center shrink-0">
                                                    <img src={itemImage} alt={item.products?.name || item.product_name} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]" />
                                                </div>
                                                <div className="flex-1 w-full min-w-0">
                                                    <h3 className="font-bold text-brand-dark dark:text-dark-heading text-sm truncate group-hover:text-brand-green transition-colors">{item.products?.name || item.product_name}</h3>
                                                    {item.product_variants?.variant_name && (
                                                        <div className="text-xs text-brand-inactive-text mt-0.5">{item.product_variants.variant_name}</div>
                                                    )}
                                                    <div className="flex justify-between items-center mt-1 w-full">
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <span className="text-brand-inactive-text">{item.quantity} un.</span>
                                                            <span className="text-brand-border dark:text-dark-border">|</span>
                                                            <span className="font-medium text-brand-dark dark:text-dark-heading">{formatCurrency(itemTotal)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>

                                <div className="border-t border-brand-border dark:border-dark-border my-6"></div>

                                <div className="space-y-3 pb-6 border-b border-brand-border dark:border-dark-border mb-6">
                                    <div className="flex justify-between text-sm text-brand-inactive-text">
                                        <span>Itens ({order.order_items?.length || 0})</span>
                                        <span className="text-brand-dark dark:text-dark-heading">{formatCurrency(totalAmount)}</span>
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
                            </div>
                        </div>
                    </div>

                </div>
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

            <AnimatePresence>
                {isCancelModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-2xl overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border dark:border-dark-border">
                                <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Cancelar pedido</h3>
                                <button onClick={() => setIsCancelModalOpen(false)} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading">
                                    <XIcon size={24} />
                                </button>
                            </div>
                            <div className="p-6 space-y-5">
                                <label className="flex flex-col gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                    Motivo do cancelamento
                                    <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="h-11 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 font-medium">
                                        <option value="purchased_by_mistake">Comprei por engano</option>
                                        <option value="better_price">Encontrei preco melhor</option>
                                        <option value="delivery_delay">Atraso na entrega</option>
                                        <option value="changed_mind">Mudei de ideia</option>
                                        <option value="payment_issue">Problema no pagamento</option>
                                        <option value="other">Outro</option>
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                    Detalhes
                                    <textarea value={cancelDetails} onChange={(e) => setCancelDetails(e.target.value)} maxLength={1000} rows={4} className="rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-3 font-medium resize-none" />
                                </label>
                            </div>
                            <div className="flex justify-end gap-3 border-t border-brand-border dark:border-dark-border p-4">
                                <Button variant="outline" onClick={() => setIsCancelModalOpen(false)} disabled={isCanceling}>Voltar</Button>
                                <Button variant="outlinered" onClick={handleCancelOrder} disabled={isCanceling}>
                                    {isCanceling ? "Enviando..." : "Solicitar cancelamento"}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isReturnModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white dark:bg-dark-surface w-full max-w-2xl rounded-2xl overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border dark:border-dark-border">
                                <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Solicitar troca ou devolucao</h3>
                                <button onClick={() => setIsReturnModalOpen(false)} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading">
                                    <XIcon size={24} />
                                </button>
                            </div>
                            <div className="p-6 max-h-[75vh] overflow-y-auto custom-scrollbar space-y-6">
                                <div className="space-y-3">
                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Produtos</h4>
                                    {order.order_items?.map((item: any) => {
                                        const itemImage = getPrimaryProductDisplayImage({
                                            images: item.products?.images || null,
                                            video_thumbnail: item.products?.video_thumbnail || null,
                                            fallback_variant_image: item.product_variants?.variant_options?.image || null,
                                        });
                                        return (
                                        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-brand-border dark:border-dark-border p-3">
                                            <input
                                                type="checkbox"
                                                checked={Number(returnItems[item.id] || 0) > 0}
                                                onChange={(event) => setReturnItems(prev => ({ ...prev, [item.id]: event.target.checked ? 1 : 0 }))}
                                            />
                                            <img src={itemImage} alt={item.products?.name || item.product_name} className="h-12 w-12 rounded-lg border border-brand-border object-contain" />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">{item.products?.name || item.product_name}</p>
                                                <p className="text-xs text-brand-inactive-text">Comprado: {item.quantity} un.</p>
                                            </div>
                                            <input
                                                type="number"
                                                min={Number(returnItems[item.id] || 0) > 0 ? 1 : 0}
                                                max={item.quantity}
                                                value={returnItems[item.id] || 0}
                                                onChange={(event) => setReturnItems(prev => ({
                                                    ...prev,
                                                    [item.id]: Math.max(0, Math.min(Number(item.quantity || 1), Number(event.target.value || 0))),
                                                }))}
                                                className="w-20 h-10 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-2 text-sm"
                                            />
                                        </div>
                                    )})}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="flex flex-col gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                        Motivo
                                        <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="h-11 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 font-medium">
                                            <option value="wrong_item">Recebi item errado</option>
                                            <option value="defective">Item com defeito</option>
                                            <option value="damaged">Item danificado</option>
                                            <option value="different_from_description">Diferente da descricao</option>
                                            <option value="missing_parts">Faltam partes</option>
                                            <option value="arrived_late">Chegou atrasado</option>
                                            <option value="changed_mind">Mudei de ideia</option>
                                            <option value="other">Outro</option>
                                        </select>
                                    </label>
                                    <label className="flex flex-col gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                        Resolucao
                                        <select value={returnResolution} onChange={(e) => setReturnResolution(e.target.value as any)} className="h-11 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 font-medium">
                                            <option value="exchange">Troca</option>
                                            <option value="refund">Reembolso</option>
                                            <option value="store_credit">Vale-compra</option>
                                        </select>
                                    </label>
                                </div>

                                <label className="flex flex-col gap-2 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                    Mensagem opcional
                                    <textarea value={returnMessage} onChange={(e) => setReturnMessage(e.target.value)} maxLength={1000} rows={4} className="rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-3 font-medium resize-none" />
                                </label>

                                <div className="space-y-3">
                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">Evidencias</h4>
                                    <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brand-border dark:border-dark-border p-4 text-center text-sm font-semibold text-brand-inactive-text">
                                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="hidden" onChange={handleEvidenceUpload} />
                                        {evidenceUploader.isLoading ? "Enviando..." : "Adicionar fotos ou PDF"}
                                        <span className="mt-1 text-xs font-medium">{returnEvidence.length}/5 arquivos</span>
                                    </label>
                                    {returnEvidence.length > 0 && (
                                        <div className="grid grid-cols-2 gap-2 text-xs text-brand-inactive-text">
                                            {returnEvidence.map((file, index) => (
                                                <div key={`${file.file_url}-${index}`} className="truncate rounded-lg border border-brand-border p-2">{file.file_name || file.file_url}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 border-t border-brand-border dark:border-dark-border p-4">
                                <Button variant="outline" onClick={() => setIsReturnModalOpen(false)} disabled={isSubmittingReturn}>Cancelar</Button>
                                <Button onClick={submitReturnRequest} disabled={isSubmittingReturn}>
                                    {isSubmittingReturn ? "Enviando..." : "Enviar solicitacao"}
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
