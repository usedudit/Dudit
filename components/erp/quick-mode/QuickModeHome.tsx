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
}

export default function QuickModeHome({ data, partnerId }: QuickModeHomeProps) {
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
        <div className="flex flex-col gap-8 pb-20">
            {/* Header com Saudação */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                        Olá, {data.storeName}! 👋
                    </h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-lg font-medium mt-1">
                        Veja como está seu negócio hoje no Marketplace.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => router.push('/erp/settings')}>
                        Configurações
                    </Button>
                </div>
            </header>

            {/* Ações Principais */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div
                    whileHover={{ y: -4 }}
                    className="bg-brand-green/10 border-2 border-brand-green/20 rounded-3xl p-6 cursor-pointer flex items-center gap-6 group transition-all"
                    onClick={() => router.push('/erp/products?create=true')}
                >
                    <div className="w-16 h-16 rounded-2xl bg-brand-green flex items-center justify-center text-white shadow-lg shadow-brand-green/20">
                        <PlusIcon size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                            Anunciar Produto
                        </h3>
                        <p className="text-brand-inactive-text dark:text-dark-body font-medium">
                            Crie um novo anúncio no marketplace
                        </p>
                    </div>
                    <ChevronRightIcon className="ml-auto text-brand-green opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0" />
                </motion.div>

                <motion.div
                    whileHover={{ y: -4 }}
                    className="bg-brand-primary/10 border-2 border-brand-primary/20 rounded-3xl p-6 cursor-pointer flex items-center gap-6 group transition-all"
                    onClick={() => router.push('/erp/servicos?create=true')}
                >
                    <div className="w-16 h-16 rounded-2xl bg-brand-primary flex items-center justify-center text-white shadow-lg shadow-brand-primary/20">
                        <WrenchIcon size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading group-hover:text-brand-primary transition-colors">
                            Anunciar Serviço
                        </h3>
                        <p className="text-brand-inactive-text dark:text-dark-body font-medium">
                            Ofereça um novo serviço aos clientes
                        </p>
                    </div>
                    <ChevronRightIcon className="ml-auto text-brand-primary opacity-0 group-hover:opacity-100 transition-all -translate-x-4 group-hover:translate-x-0" />
                </motion.div>
            </section>

            {/* Stats Row */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 flex flex-col gap-1 shadow-sm">
                    <div className="flex items-center gap-2 text-brand-inactive-text dark:text-dark-body mb-2">
                        <Package size={18} />
                        <span className="font-bold text-sm uppercase tracking-wider">Itens Ativos</span>
                    </div>
                    <span className="text-4xl font-black text-brand-dark dark:text-dark-heading">
                        {data.stats.activeItems}
                    </span>
                    <p className="text-xs text-brand-green font-bold mt-1 flex items-center gap-1">
                        <CheckCircleIcon size={12} /> Publicados no marketplace
                    </p>
                </div>

                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6 flex flex-col gap-1 shadow-sm">
                    <div className="flex items-center gap-2 text-brand-inactive-text dark:text-dark-body mb-2">
                        <ShoppingCartIcon size={18} />
                        <span className="font-bold text-sm uppercase tracking-wider">Pedidos Recebidos</span>
                    </div>
                    <span className="text-4xl font-black text-brand-dark dark:text-dark-heading">
                        {data.stats.receivedOrders}
                    </span>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mt-1">
                        Total de vendas realizadas
                    </p>
                </div>


            </section>

            {/* Lista de Anúncios e Pedidos */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Meus Anúncios */}
                <div className="xl:col-span-2 flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            Anúncios Recentes
                        </h2>
                        <Button variant="ghost" onClick={() => router.push('/erp/products')} className="text-brand-green font-bold">
                            Ver todos <ChevronRightIcon size={16} />
                        </Button>
                    </div>

                    {data.items.length === 0 ? (
                        <div className="bg-brand-gray/50 dark:bg-dark-surface/30 border-2 border-dashed border-brand-border dark:border-dark-border rounded-3xl p-12 flex flex-col items-center text-center gap-4">
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
                        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                            Pedidos Recentes
                        </h2>
                        <Button variant="ghost" onClick={() => router.push('/erp/orders')} className="text-brand-primary font-bold">
                            Ver todos <ChevronRightIcon size={16} />
                        </Button>
                    </div>

                    <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-3xl overflow-hidden shadow-sm flex flex-col h-full">
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
                                        className="p-4 hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 transition-colors cursor-pointer group"
                                        onClick={() => router.push(`/erp/orders?id=${order.id}`)}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-black text-brand-dark dark:text-dark-heading">
                                                #{order.order_number}
                                            </span>
                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(order.total_amount)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-brand-inactive-text dark:text-dark-body truncate max-w-[150px]">
                                                {order.customer_name || "Consumidor Final"}
                                            </span>
                                            {getStatusBadge(order.situation)}
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

            {/* Upgrade Block */}
            <section className="bg-gradient-to-br from-brand-dark to-slate-900 dark:from-dark-surface dark:to-dark-border rounded-[40px] p-8 md:p-12 relative overflow-hidden text-white mt-8">
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
                        className="bg-brand-green hover:bg-brand-green/90 text-white border-none h-14 px-8 text-lg font-bold shadow-xl shadow-brand-green/20"
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

            {/* Modais */}
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
        </div>
    )
}
