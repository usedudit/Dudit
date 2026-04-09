"use client"

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FileIcon,
    ChevronRightIcon,
    TruckIcon,
    QRCodeIcon,
    XIcon,
    CreditCardIcon,
    InfoIcon,
    NormalProductsIcon
} from '@/lib/icons'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/reusable'
import { getR2ImageUrl } from '@/lib/utils/get-r2-image-url'
import Link from 'next/link'
import { getProductUrl, getPartnerUrl } from '@/lib/utils/url-generator'
import { formatFullDate, formatShortDate, formatCurrency } from '@/lib/utils'

// Refactored to use centralized formatters

// ---------------------------------------------------------------------------------
// MODAL DE DETALHES DE ENVIO
const ShippingDetailsModal = ({ isOpen, onClose, order }: { isOpen: boolean; onClose: () => void; order: any }) => {
    if (!isOpen) return null;

    const deliveryAddress = order.delivery_address || 'Endereço não informado'
    const isDelivery = order.delivery_type === 'delivery'
    const isPaid = order.situation === 'paid'

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-2xl shadow-xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border dark:border-dark-border">
                    <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">Detalhe do envio</h3>
                    <button onClick={onClose} className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading">
                        <XIcon size={24} />
                    </button>
                </div>

                <div className="p-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    {/* Status Header */}
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-6">
                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                {isPaid
                                    ? (isDelivery ? "Pedido em processo de entrega" : "Disponível para retirada")
                                    : "Aguardando aprovação de pagamento"}
                            </h2>
                        </div>

                        {/* Timeline (Simplificada baseada em situação de pagamento e order status) */}
                        <div className="relative pl-2 space-y-8">
                            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-zinc-700"></div>

                            {/* Step 1: Pedido Feito */}
                            <div className="relative flex gap-4">
                                <div className="w-6 h-6 rounded-full bg-brand-dark border-4 border-white z-10 flex-shrink-0"></div>
                                <div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">Pedido Realizado</div>
                                    <div className="text-xs text-brand-inactive-text mt-1">{formatFullDate(order.created_at)}</div>
                                </div>
                            </div>

                            {/* Step 2: Pagamento */}
                            <div className="relative flex gap-4">
                                <div className={`w-6 h-6 rounded-full border-4 border-white z-10 flex-shrink-0 ${isPaid ? 'bg-brand-dark' : 'bg-gray-200 dark:bg-zinc-700'}`}></div>
                                <div>
                                    <div className={`text-sm ${isPaid ? 'font-bold text-brand-dark' : 'text-brand-inactive-text'}`}>
                                        {isPaid ? "Pagamento Aprovado" : "Aguardando Pagamento"}
                                    </div>
                                </div>
                            </div>

                            {/* Step 3: Entrega/Retirada */}
                            <div className="relative flex gap-4">
                                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-zinc-700 border-4 border-white z-10 flex-shrink-0"></div>
                                <div>
                                    <div className="text-sm text-brand-inactive-text">
                                        {isDelivery ? "Entregue" : "Retirado na Loja"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-brand-border dark:border-dark-border pt-6">
                        <h4 className="font-bold text-brand-dark dark:text-dark-heading mb-4">Dados da entrega</h4>
                        <div className="text-sm text-brand-inactive-text space-y-1">
                            {isDelivery ? (
                                <p className="font-medium text-brand-dark dark:text-dark-heading leading-relaxed">{order.delivery_address}</p>
                            ) : (
                                <>
                                    <p className="font-medium text-brand-dark dark:text-dark-heading leading-relaxed">Retirar em Lojas da Dudit / Parceiro</p>
                                    <p className="text-brand-inactive-text">{order.partners?.addresses?.[0]?.street || "Endereço da loja parceira"}</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

// ---------------------------------------------------------------------------------
// COMPONENTE DE INFO CARD REUTILIZÁVEL
const InfoCard = ({ icon: Icon, title, description, onClick, rightIcon: RightIcon = ChevronRightIcon }: { icon: any, title: string, description: string, onClick?: () => void, rightIcon?: any }) => (
    <div
        onClick={onClick}
        className={`group flex items-center gap-4 p-4 rounded-[12px] border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface transition-all ${onClick ? 'cursor-pointer hover:border-brand-dark/30 hover:bg-brand-gray/30' : ''}`}
    >
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
            <Icon size={20} className="text-brand-dark dark:text-dark-heading" />
        </div>
        <div className="flex-1">
            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-0.5">{title}</h3>
            <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-tight">{description}</p>
        </div>
        {onClick && (
            <RightIcon size={18} className="text-brand-inactive-text group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors" />
        )}
    </div>
);


// ---------------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
export const OrderDetailsClient = ({ order }: { order: any }) => {
    const router = useRouter()
    const [isShippingModalOpen, setIsShippingModalOpen] = useState(false)
    const [showSummaryDetails, setShowSummaryDetails] = useState(false)

    // Computed Variaveis
    const orderDateShort = formatShortDate(order.created_at)
    const isPaid = order.situation === 'paid'
    const isDelivery = order.delivery_type === 'delivery'
    const storeAvatar = order.partners?.store_image_url ? getR2ImageUrl(order.partners.store_image_url) : "https://img.dudit.com.br/static/Placeholder.png"
    const totalAmount = Number(order.total_amount)
    const shippingAmount = 0 // Ajustar com seu sistema de frete (se houver campo frete)
    const productsSubtotal = totalAmount - shippingAmount

    // Map Method
    let paymentMethodLabel = "Não informado"
    if (order.payment_method) {
        const methodMap: Record<string, string> = {
            bank_transfer: "Pix", cartao: "Cartão de Crédito", credit_card: "Cartão de Crédito",
            debit_card: "Cartão de Débito", ticket: "Boleto", dinheiro: "Dinheiro na Entrega", pix: "Pix"
        }
        paymentMethodLabel = methodMap[order.payment_method] || order.payment_method
    }

    // Removido Status Detail Extra

    return (
        <div className="container mx-auto px-4 lg:px-6 max-w-[1300px] w-full pt-6 md:pt-10 pb-20">

            {/* Breadcrumb / Header */}
            <div className="flex items-center gap-2 text-sm text-brand-inactive-text mb-6">
                <span className="cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading font-medium" onClick={() => router.push('/my-orders')}>Compras</span>
                <ChevronRightIcon size={14} />
                <span className="font-bold text-brand-dark dark:text-dark-heading">Detalhes da compra</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* LEFT COLUMN */}
                <div className="lg:col-span-8 space-y-6">

                    {/* STATUS DO PEDIDO */}
                    <div className="bg-white dark:bg-dark-surface rounded-[16px] border border-brand-border dark:border-dark-border overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border bg-brand-gray/50 font-bold text-brand-dark text-[15px]">
                            Status do Pedido
                        </div>
                        <div className="p-6">

                            {/* Resumo de Status Principal */}
                            <div className="mb-6">
                                <div className={`${isPaid ? 'text-brand-green' : 'text-brand-orange'} font-bold text-sm mb-1 uppercase tracking-wide`}>
                                    {isPaid ? 'PAGO' : 'PENDENTE'}
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                    <h2 className="text-xl md:text-2xl font-bold text-brand-dark tracking-tight">
                                        {isPaid
                                            ? `Pagamento aprovado em ${formatShortDate(order.mp_date_approved || order.updated_at)}`
                                            : `Aguardando o pagamento`}
                                    </h2>
                                </div>

                                <p className="text-brand-inactive-text text-[15px] leading-relaxed max-w-2xl">
                                    {isPaid
                                        ? (isDelivery
                                            ? `Seu pedido está em trânsito para o endereço: `
                                            : `Seu pedido está sendo preparado para retirada pela loja parceira.`)
                                        : `Realize o pagamento para prosseguir com o seu pedido.`}

                                    {isPaid && isDelivery && <span className="font-medium text-brand-dark block mt-1">{order.delivery_address}</span>}
                                </p>
                            </div>

                            <div className="border-t border-brand-border my-6"></div>

                            {/* Lista de Produtos Deste Pedido */}
                            <div className="space-y-6">
                                {order.order_items?.map((item: any, idx: number) => {
                                    const imgUrl = item.products?.images?.[0] ? getR2ImageUrl(item.products.images[0]) : "https://img.dudit.com.br/static/Placeholder.png"
                                    return (
                                        <div key={item.id} className="flex flex-col sm:flex-row items-start gap-4">
                                            <div className="w-20 h-20 bg-white border border-brand-border rounded-[10px] flex items-center justify-center p-2 flex-shrink-0">
                                                <img src={imgUrl} alt={item.products?.name} className="w-full h-full object-contain" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-brand-dark text-[15px] line-clamp-2 leading-tight mb-1">
                                                    {item.products?.name || item.product_name}
                                                </h3>
                                                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-brand-inactive-text">
                                                    <span className="font-medium bg-brand-gray px-2 py-0.5 rounded-full">{item.quantity} un.</span>
                                                    <span className="text-brand-border hidden sm:block">|</span>
                                                    <span className="font-bold text-brand-dark">{formatCurrency(item.product_price)} / un</span>
                                                    <span className="text-brand-border">|</span>
                                                    <Link href={getProductUrl({ ...item.products, id: item.product_id }, order.partners)} prefetch={false} className="text-brand-green font-medium cursor-pointer hover:underline">
                                                        Acessar página do produto
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Ações Inferiores (Recomprar) */}
                            <div className="mt-8 pt-6 border-t border-brand-border flex">
                                <Button
                                    asChild
                                    variant="default"
                                    className="bg-brand-green/10 hover:bg-brand-green/20 text-brand-green font-bold rounded-[10px] shadow-none border-none py-2 px-6 h-auto"
                                >
                                    <Link href="/" prefetch={false}>Comprar novamente no Marketplace</Link>
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* MENSAGENS E CONTATO DA LOJA */}
                    <div className="bg-white dark:bg-dark-surface rounded-[16px] border border-brand-border overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-brand-border bg-brand-gray/50 font-bold text-brand-dark text-[15px]">
                            Vendido por
                        </div>
                        <div className="p-6 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-brand-gray flex items-center justify-center overflow-hidden border border-brand-border">
                                    <img src={storeAvatar} alt="Seller" className="w-full h-full object-cover" />
                                </div>
                                <div>
                                    <div className="text-[15px] font-bold text-brand-dark">{order.partners?.store_name}</div>
                                    <Link href={getPartnerUrl({ ...order.partners, id: order.partner_id })} prefetch={false} className="text-[13px] font-medium text-brand-green cursor-pointer hover:underline mt-0.5 block">
                                        Ver perfil da loja
                                    </Link>
                                </div>
                            </div>

                            {/* Botão Mensagem Fake / Placeholder (no futuro integra chat Supabase) */}
                            <Button variant="outline" className="hidden sm:flex rounded-[10px] gap-2 border-brand-border text-brand-dark hover:bg-brand-gray">
                                <InfoIcon size={16} /> Entrar em contato
                            </Button>
                        </div>
                    </div>

                    {/* INFORMAÇÕES FISCAIS / COMPRA */}
                    <div className="bg-white dark:bg-dark-surface rounded-[16px] border border-brand-border overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-brand-border bg-brand-gray/50 font-bold text-brand-dark text-[15px]">
                            Documentos da compra
                        </div>
                        <div className="p-6 flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-brand-gray flex items-center justify-center text-brand-inactive-text flex-shrink-0">
                                <FileIcon size={22} />
                            </div>
                            <div>
                                <div className="text-[14px] font-medium text-brand-dark leading-tight">Nota Fiscal Digital / Recibo</div>
                                <div className="text-[13px] text-brand-inactive-text mt-1">Gerado em {formatFullDate(order.created_at)}</div>
                                <div className="flex gap-4 mt-3">
                                    <span className="text-[13px] font-bold text-brand-green cursor-pointer hover:underline">Baixar Recibo PDF</span>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN - SUMMARY RESUMO */}
                <div className="lg:col-span-4">
                    <div className="bg-white dark:bg-dark-surface rounded-[16px] border border-brand-border overflow-hidden sticky top-[100px] shadow-sm">
                        <div className="px-6 py-4 border-b border-brand-border bg-brand-gray/50 font-bold text-brand-dark text-[15px]">
                            Detalhe da compra
                        </div>

                        <div className="p-6">
                            <div className="text-[13px] font-medium text-brand-inactive-text mb-6 pb-4 border-b border-brand-border">
                                {orderDateShort}  <br /> <span className="text-[11px] uppercase tracking-wider mt-1 block">CÓDIGO: {order.mp_payment_id || order.order_number || order.id.slice(0, 10)}</span>
                            </div>

                            <div className="space-y-3 pb-6 border-b border-brand-border mb-6">
                                <div className="flex justify-between text-[14px] text-brand-inactive-text">
                                    <span>Produtos ({order.order_items?.length || 0})</span>
                                    <span className="text-brand-dark font-medium">{formatCurrency(productsSubtotal)}</span>
                                </div>
                                {!isDelivery ? (
                                    <div className="flex justify-between text-[14px] text-brand-inactive-text">
                                        <span>Retirada em Loja</span>
                                        <span className="text-brand-green font-bold">Grátis</span>
                                    </div>
                                ) : (
                                    shippingAmount > 0 ? (
                                        <div className="flex justify-between text-[14px] text-brand-inactive-text">
                                            <span>Frete</span>
                                            <span className="text-brand-dark font-medium">{formatCurrency(shippingAmount)}</span>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between text-[14px] text-brand-inactive-text">
                                            <span>Entrega Delivery</span>
                                            <span className="text-brand-green font-bold">Acertar com vendedor</span>
                                        </div>
                                    )
                                )}
                            </div>

                            <div className="flex justify-between items-end mb-1">
                                <span className="text-[15px] font-bold text-brand-dark">Pagamento Total</span>
                                <span className="font-bold text-xl md:text-2xl text-brand-dark">{formatCurrency(totalAmount)}</span>
                            </div>

                            <div className="border-t border-brand-border my-6"></div>

                            {/* Payment Card Section */}
                            <div className="mb-4">
                                <h4 className="font-bold text-[14px] text-brand-dark mb-3 uppercase tracking-wide">Pagamento</h4>
                                <InfoCard
                                    icon={paymentMethodLabel === 'Pix' ? QRCodeIcon : CreditCardIcon}
                                    title={`Pagamento via ${paymentMethodLabel}`}
                                    description={isPaid ? 'Aprovado' : 'Pendente'}
                                />
                            </div>

                            {/* Shipping Card Section */}
                            <div>
                                <h4 className="font-bold text-[14px] text-brand-dark mb-3 uppercase tracking-wide">Frete / Entrega</h4>
                                <InfoCard
                                    icon={isDelivery ? TruckIcon : NormalProductsIcon}
                                    title={isDelivery ? "Entrega via Delivery" : "Retirada em Loja Parceira"}
                                    description={isPaid ? "Preparando pedido / Em andamento" : "Aguardando pagamento"}
                                    onClick={() => setIsShippingModalOpen(true)}
                                />
                            </div>

                            <div className="border-t border-brand-border mt-6 pt-5">
                                <button
                                    onClick={() => setIsShippingModalOpen(true)}
                                    className="text-[14px] text-brand-green font-bold hover:underline w-full text-center"
                                >
                                    Ver mais detalhes da entrega
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* MODAL de Envio/Entrega */}
            <AnimatePresence>
                {isShippingModalOpen && (
                    <ShippingDetailsModal order={order} isOpen={isShippingModalOpen} onClose={() => setIsShippingModalOpen(false)} />
                )}
            </AnimatePresence>
        </div>
    )
}
