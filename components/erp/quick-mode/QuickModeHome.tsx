'use client';

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
    PlusIcon,
    ShoppingCartIcon,
    Package,
    WrenchIcon,
    ChevronRightIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    StoreIcon
} from "@/lib/icons"
import { Button, Badge, SkeletonLoader, ThreeDotsLoader } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import QuickModeItemCard from "./QuickModeItemCard"
import { upgradeToERPAction } from "@/app/actions/erp/quick-mode"
import { deleteProductAction, duplicateProductAction } from "@/app/actions/erp/products"
import { deleteServiceAction, duplicateServiceAction } from "@/app/actions/erp/servicos"
import AlertModal from "@/components/reusable/AlertModal"
import { ERPPageHeader } from "@/components/erp/page-header-state"

interface QuickModeHomeProps {
    data: {
        stats: {
            activeItems: number
            receivedOrders: number
        }
        items: any[]
        recentOrders: any[]
        storeName: string
        businessInfo: any
    }
    partnerId: string
    isQuick?: boolean
}

export default function QuickModeHome({ data, partnerId, isQuick = true }: QuickModeHomeProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isUpgrading, setIsUpgrading] = useState(false)
    const [showUpgradeModal, setShowUpgradeModal] = useState(false)
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [showDeleteModal, setShowDeleteModal] = useState<any>(null)

    const handleUpgrade = async () => {
        setIsUpgrading(true)
        const res = await upgradeToERPAction(partnerId)
        if (res.success) {
            toast({ title: "Modo ERP ativado!", description: "Agora você tem acesso a todas as ferramentas de gestão." })
            router.push("/erp/dashboard")
            router.refresh()
        } else {
            toast({ title: "Erro ao atualizar", description: res.error, variant: "destructive" })
            setIsUpgrading(false)
            setShowUpgradeModal(false)
        }
    }

    const handleDelete = async () => {
        if (!showDeleteModal) return
        const { id, itemType } = showDeleteModal
        setIsDeleting(id)

        const res = itemType === 'product'
            ? await deleteProductAction(id)
            : await deleteServiceAction(id)

        if (res.success) {
            toast({ title: "Item excluído com sucesso" })
            router.refresh()
        } else {
            toast({ title: "Erro ao excluir", description: (res as any).error, variant: "destructive" })
        }
        setIsDeleting(null)
        setShowDeleteModal(null)
    }

    const handleDuplicate = async (item: any) => {
        toast({ title: "Duplicando item..." })
        const res = item.itemType === 'product'
            ? await duplicateProductAction(item.id)
            : await duplicateServiceAction(item.id)

        if (res.success) {
            toast({ title: "Item duplicado com sucesso" })
            router.refresh()
        } else {
            toast({ title: "Erro ao duplicar", description: (res as any).error, variant: "destructive" })
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'paid': return <Badge variant="green">Pago</Badge>
            case 'pending': return <Badge variant="orange">Pendente</Badge>
            case 'cancelled': return <Badge variant="red">Cancelado</Badge>
            default: return <Badge variant="gray">{status}</Badge>
        }
    }

    return (
        <>
            <ERPPageHeader title={data.storeName || "Início"} />
            <div className="flex flex-col gap-8 pb-20">
                {/* Header com Saudação */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-tight">
                            Olá, {data.storeName}! 👋
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mt-1">
                            Veja como está seu negócio hoje no Marketplace.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/erp/settings')}
                            className="flex items-center text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors cursor-pointer"
                        >
                            Configurações
                        </button>
                    </div>
                </header>

                {/* Ações Principais */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div
                        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 cursor-pointer flex items-center gap-6 group transition-all hover:bg-brand-green-light/20 dark:hover:bg-dark-border/20"
                        onClick={() => router.push('/erp/products?create=true')}
                    >
                        <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0 transition-colors">
                            <PlusIcon size={20} />
                        </div>
                        <div>
                            <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                                Anunciar Produto
                            </h3>
                            <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                                Crie um novo anúncio no marketplace
                            </p>
                        </div>
                        <ChevronRightIcon className="ml-auto text-brand-inactive-text/50 dark:text-dark-body/50 group-hover:text-brand-green transition-colors w-5 h-5" />
                    </div>

                    <div
                        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 cursor-pointer flex items-center gap-6 group transition-all hover:bg-brand-green-light/20 dark:hover:bg-dark-border/20"
                        onClick={() => router.push('/erp/servicos?create=true')}
                    >
                        <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0 transition-colors">
                            <WrenchIcon size={20} />
                        </div>
                        <div>
                            <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                                Anunciar Serviço
                            </h3>
                            <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                                Ofereça um novo serviço aos clientes
                            </p>
                        </div>
                        <ChevronRightIcon className="ml-auto text-brand-inactive-text/50 dark:text-dark-body/50 group-hover:text-brand-green transition-colors w-5 h-5" />
                    </div>
                </section>

                {/* Stats Row */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                    <Package size={18} className="text-brand-dark dark:text-dark-heading" />
                                </div>
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">Itens Ativos</span>
                            </div>
                        </div>

                        <div className="flex items-baseline space-x-2 mt-2">
                            <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                {data.stats.activeItems}
                            </h2>
                            <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                Publicados no marketplace
                            </span>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                    <ShoppingCartIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                </div>
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">Pedidos Recebidos</span>
                            </div>
                        </div>

                        <div className="flex items-baseline space-x-2 mt-2">
                            <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                {data.stats.receivedOrders}
                            </h2>
                            <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                Total de vendas realizadas
                            </span>
                        </div>
                    </div>
                </section>

                {/* Lista de Anúncios e Pedidos */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Meus Anúncios */}
                    <div className="xl:col-span-2 flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                Anúncios Recentes
                            </h2>
                            <Button
                                variant="ghost"
                                onClick={() => router.push('/erp/products')}
                                className="text-brand-green font-bold text-sm hover:bg-brand-green-light dark:hover:bg-dark-border/40 flex items-center gap-1"
                            >
                                Ver todos <ChevronRightIcon size={16} />
                            </Button>
                        </div>

                        {data.items.length === 0 ? (
                            <div className="bg-brand-gray/50 dark:bg-dark-surface/30 border-2 border-dashed border-brand-border dark:border-dark-border rounded-[24px] p-12 flex flex-col items-center text-center gap-4">
                                <img src="https://img.dudit.com.br/static/mascots/Estoque.png" className="w-32 h-32 object-contain grayscale opacity-50" alt="" />
                                <div>
                                    <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Nenhum anúncio ainda</h4>
                                    <p className="text-brand-inactive-text dark:text-dark-body font-medium mt-1">Crie seu primeiro anúncio para começar a vender.</p>
                                </div>
                                <Button onClick={() => router.push('/erp/products?add=true')} className="mt-2">
                                    Criar Primeiro Anúncio
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {data.items.map((item) => (
                                    <QuickModeItemCard
                                        key={item.id}
                                        item={item}
                                        onEdit={() => router.push(item.itemType === 'product' ? `/erp/products?edit=${item.id}` : `/erp/servicos?edit=${item.id}`)}
                                        onDelete={() => setShowDeleteModal(item)}
                                        onDuplicate={() => handleDuplicate(item)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Pedidos Recentes */}
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                Pedidos Recentes
                            </h2>
                            <Button
                                variant="ghost"
                                onClick={() => router.push('/erp/orders')}
                                className="text-brand-green font-bold text-sm hover:bg-brand-green-light dark:hover:bg-dark-border/40 flex items-center gap-1"
                            >
                                Ver todos <ChevronRightIcon size={16} />
                            </Button>
                        </div>

                        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] overflow-hidden flex flex-col h-full">
                            {data.recentOrders.length === 0 ? (
                                <div className="p-8 flex flex-col items-center text-center gap-4 my-auto">
                                    <div className="w-16 h-16 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center text-brand-inactive-text">
                                        <ShoppingCartIcon size={32} />
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body font-medium">Aguardando seu primeiro pedido...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col divide-y divide-brand-border dark:divide-dark-border">
                                    {data.recentOrders.map((order) => (
                                        <div
                                            key={order.id}
                                            className="px-5 py-4 flex items-center justify-between hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 transition-colors cursor-pointer group"
                                            onClick={() => router.push(`/erp/orders?id=${order.id}`)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                    <ShoppingCartIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                                        Pedido #{order.order_number}
                                                    </div>
                                                    <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[140px] sm:max-w-none">
                                                        {order.customer_name || "Consumidor Final"}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-1">
                                                        {formatCurrency(order.total_amount)}
                                                    </span>
                                                    {getStatusBadge(order.situation)}
                                                </div>
                                                <ChevronRightIcon size={16} className="text-brand-inactive-text/50 dark:text-dark-body/50 group-hover:text-brand-dark dark:group-hover:text-dark-heading transition-colors" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {data.recentOrders.length > 0 && (
                                <div className="mt-auto p-4 bg-brand-gray/20 dark:bg-dark-border/20 border-t border-brand-border dark:border-dark-border text-center">
                                    <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-widest">
                                        Total de {data.stats.receivedOrders} pedidos
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {isQuick && (
                <section className="bg-brand-dark dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-8 md:p-12 relative overflow-hidden text-white mt-8">
                    <div className="relative z-10 max-w-2xl">
                        <Badge variant="green" className="mb-4 bg-brand-green border-none text-white px-4 py-1.5 text-sm">RECURSO PREMIUM</Badge>
                        <h2 className="text-4xl font-black mb-4 leading-tight">
                            Seu negócio cresceu? <br />
                            Ative o <span className="text-brand-green">Dudit ERP Completo</span>.
                        </h2>
                        <p className="text-slate-300 text-lg font-medium mb-8">
                            Tenha acesso a ferramentas avançadas como controle de estoque automático,
                            financeiro completo, relatórios detalhados, gestão de fornecedores e muito mais.
                        </p>
                        <Button
                            size="lg"
                            className="bg-brand-green hover:bg-brand-green/90 text-white border-none h-12 px-8 text-base font-bold transition-all rounded-full"
                            onClick={() => setShowUpgradeModal(true)}
                            disabled={isUpgrading}
                        >
                            {isUpgrading ? <ThreeDotsLoader color="white" /> : "Fazer Upgrade Agora"}
                        </Button>
                    </div>

                    {/* Decoração */}
                    <div className="absolute right-[-100px] bottom-[-100px] w-[500px] h-[500px] bg-brand-green/10 rounded-full blur-[100px]" />
                    <div className="absolute right-10 top-1/2 -translate-y-1/2 hidden lg:block opacity-20">
                        <StoreIcon size={240} className="text-brand-green" />
                    </div>
                </section>
                )}
            </div>

            {/* Modais */}
            {isQuick && (
            <AlertModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                onConfirm={handleUpgrade}
                title="Migrar para o ERP Completo?"
                description="Esta ação ativará todos os módulos avançados do Dudit ERP. Você terá uma gestão completa do seu negócio, mas a interface terá mais opções e ferramentas. Deseja continuar?"
                confirmText="Sim, quero o ERP completo"
                cancelText="Agora não"
                variant="success"
            />
            )}

            <AlertModal
                isOpen={!!showDeleteModal}
                onClose={() => setShowDeleteModal(null)}
                onConfirm={handleDelete}
                title="Excluir item?"
                description={`Tem certeza que deseja excluir "${showDeleteModal?.name}"? Esta ação removerá o item do marketplace permanentemente.`}
                confirmText={isDeleting ? "Excluindo..." : "Sim, excluir"}
                cancelText="Cancelar"
                variant="danger"
            />
        </>
    )
}
