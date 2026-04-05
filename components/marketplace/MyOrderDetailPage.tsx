"use client"

import { useState } from 'react';
import {
    MapPin,
    ChevronRightIcon,
    CreditCardIcon,
    TruckIcon,
    X,
    CheckCircle2,
    ClockIcon,
    AlertCircleIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Spinner, AlertModal } from '@/components/reusable';
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url';
import Link from 'next/link';
import { PaymentWrapper } from '@/components/PaymentWrapper';
import { cancelBuyerOrderAction } from '@/app/actions/orders';
import { getProductUrl, getPartnerUrl } from '@/lib/utils/url-generator';

import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';

interface MyOrderDetailPageProps {
    order: any;
    onBack: () => void;
}

function formatDateToBrazil(dateString: string): string {
    const date = new Date(dateString);
    const brazilDate = new Date(date.getTime() - 3 * 60 * 60 * 1000);
    const day = String(brazilDate.getDate()).padStart(2, "0");
    const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const month = monthNames[brazilDate.getMonth()];
    const year = brazilDate.getFullYear();
    const hours = String(brazilDate.getHours()).padStart(2, "0");
    const minutes = String(brazilDate.getMinutes()).padStart(2, "0");
    return { full: `${day} de ${month} de ${year} às ${hours}:${minutes}`, date: `${day} de ${month} de ${year}`, time: `${hours}:${minutes}` } as any;
}

function getFormattedDate(dateString: string) {
    const date = new Date(dateString);
    const brazilDate = new Date(date.getTime() - 3 * 60 * 60 * 1000);
    const day = String(brazilDate.getDate()).padStart(2, "0");
    const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const month = monthNames[brazilDate.getMonth()];
    const year = brazilDate.getFullYear();
    const hours = String(brazilDate.getHours()).padStart(2, "0");
    const minutes = String(brazilDate.getMinutes()).padStart(2, "0");
    return {
        full: `${day} de ${month} de ${year} às ${hours}:${minutes}`,
        date: `${day} de ${month} de ${year}`,
        time: `${hours}:${minutes}`,
    };
}

const getStatusConfig = (status: string) => {
    switch (status) {
        case 'paid': return { label: 'Pago', color: 'text-brand-green', icon: CheckCircle2, statusText: 'Aprovado' };
        case 'pending': return { label: 'Pendente', color: 'text-brand-orange', icon: ClockIcon, statusText: 'Aguardando pagamento' };
        case 'cancelled': return { label: 'Cancelado', color: 'text-brand-red', icon: X, statusText: 'Cancelado' };
        default: return { label: status, color: 'text-gray-500', icon: AlertCircleIcon, statusText: status };
    }
};

const ShippingDetailsModal = ({ isOpen, onClose, order }: { isOpen: boolean; onClose: () => void; order: any }) => {
    if (!isOpen) return null;
    const { full: dateStr } = getFormattedDate(order.created_at);
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
                        <X size={24} />
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
                                <div className="w-6 h-6 rounded-full bg-brand-dark dark:bg-white border-4 border-white dark:border-dark-surface z-10 flex-shrink-0"></div>
                                <div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">Pedido Realizado</div>
                                    <div className="text-xs text-brand-inactive-text mt-1">{dateStr}</div>
                                </div>
                            </div>
                            <div className="relative flex gap-4">
                                <div className={`w-6 h-6 rounded-full ${order.situation === "paid" ? "bg-brand-dark dark:bg-white" : "bg-gray-200 dark:bg-zinc-700"} border-4 border-white dark:border-dark-surface z-10 flex-shrink-0`}></div>
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
        <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-dark-border/90 transition-colors">
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

    if (!order) return null;

    const orderNumber = order.order_number || order.id.slice(0, 8).toUpperCase();
    const { full: dateStrFull, date: dateStrDate, time: dateStrTime } = getFormattedDate(order.created_at);
    const statusConfig = getStatusConfig(order.situation);
    const storeImage = order.partners?.store_image_url
        ? getR2ImageUrl(order.partners.store_image_url)
        : "https://img.dudit.com.br/static/Placeholder.png";

    const isDelivery = order.delivery_type === "delivery";
    const sellerName = order.partners?.store_name || "Loja Parceira";
    const totalAmount = Number(order.total_amount).toFixed(2);

    const isPix = order.payment_method?.toLowerCase() === "pix" || order.payment_method?.toLowerCase() === "bank_transfer";
    const paymentMethodName = isPix ? "Pix" : (order.payment_method || order.payment_provider || "Pix");
    const PaymentIcon = isPix ? () => <img src="https://img.dudit.com.br/static/icons/Pix.png" alt="Pix" className="w-[18px] h-[18px] object-contain" /> : CreditCardIcon;

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
            const res = await cancelBuyerOrderAction(order.id);
            if (res?.error) throw new Error(res.error);

            toast({
                title: "Pedido cancelado",
                description: "Seu pedido foi cancelado com sucesso."
            });

            onBack(); // fecha o modal de detalhes do pedido
        } catch (err: any) {
            toast({
                title: "Erro ao cancelar",
                description: err.message || "Ocorreu um erro ao cancelar o pedido.",
                variant: "destructive"
            });
        } finally {
            setIsCanceling(false);
            setIsCancelModalOpen(false);
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
                <div className="mb-8 flex flex-col md:flex-row md:items-center gap-4 w-full justify-start">
                    <div className="hidden md:flex">
                        <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                            <X className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
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
                                        Status do Pedido
                                        <span className="text-xs font-medium text-brand-inactive-text tracking-wider uppercase">#{orderNumber}</span>
                                    </div>
                                </div>
                                <span className={`text-sm font-bold ${statusConfig.color}`}>{statusConfig.label}</span>
                            </div>
                            <div className="p-6">
                                <div className={`${statusConfig.color} font-bold text-sm mb-1`}>{statusConfig.statusText}</div>
                                <div className="flex items-center gap-2 mb-4 flex-wrap">
                                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                        Realizado dia {dateStrDate} às {dateStrTime}
                                    </h2>
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
                                                    <div className="flex items-center gap-2">
                                                        <span>R$ {totalAmount}</span>
                                                        <span className="font-normal text-brand-inactive-text">• {paymentMethodName}</span>
                                                    </div>
                                            }
                                            description={statusConfig.statusText}
                                            onClick={handlePixClick}
                                        />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm text-brand-dark mb-3">Envio</h4>
                                        <InfoCard
                                            icon={isDelivery ? TruckIcon : MapPin}
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
                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border flex-shrink-0">
                                    <img src={storeImage} alt={sellerName} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{sellerName}</div>
                                    <div className="text-xs text-brand-inactive-text mt-0.5 max-w-sm">Acessar perfil do vendedor</div>
                                </div>
                                <ChevronRightIcon size={18} className="text-brand-inactive-text" />
                            </Link>
                        </div>

                        {order.situation === 'pending' && (
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
                                        "Cancelar compra"
                                    )}
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
                                        const itemImage = item.products?.images?.[0]
                                            ? getR2ImageUrl(item.products.images[0])
                                            : item.product_variants?.variant_options?.image
                                                ? getR2ImageUrl(item.product_variants.variant_options.image)
                                                : "https://img.dudit.com.br/static/Placeholder.png";
                                        const itemTotal = Number(item.subtotal || item.product_price * item.quantity).toFixed(2);

                                        return (
                                            <Link href={getProductUrl({ ...item.products, id: item.product_id }, order.partners)} prefetch={true} key={item.id} className="group flex flex-row items-center gap-4 cursor-pointer p-2 -mx-2 rounded-lg">
                                                <div className="w-14 h-14 bg-white border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center flex-shrink-0">
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
                                                            <span className="font-medium text-brand-dark dark:text-dark-heading">R$ {itemTotal}</span>
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
                                        <span className="text-brand-dark dark:text-dark-heading">R$ {totalAmount}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-brand-inactive-text">
                                        <span>Entrega</span>
                                        <span className="text-brand-dark dark:text-dark-heading">{isDelivery ? "A calcular/Grátis" : "Retirada Grátis"}</span>
                                    </div>
                                </div>

                                <div className="flex justify-between items-end">
                                    <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">Total</span>
                                    <span className="font-bold text-xl text-brand-dark dark:text-dark-heading">R$ {totalAmount}</span>
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

            <AlertModal
                isOpen={isCancelModalOpen}
                onClose={() => setIsCancelModalOpen(false)}
                onConfirm={handleCancelOrder}
                title="Cancelar pedido?"
                description="Tem certeza que deseja cancelar esta compra? Esta ação não pode ser desfeita."
                confirmText={isCanceling ? "Cancelando..." : "Sim, cancelar"}
                cancelText="Não, voltar"
                variant="danger"
            />
        </motion.div>
    );
};
