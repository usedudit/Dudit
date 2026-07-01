'use client';

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
    PlusIcon,
    ShoppingCartIcon,
    Package,
    WrenchIcon,
    ChevronRightIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    StoreIcon,
    QRCodeIcon,
    SettingsIcon,
    ShareIcon,
    RocketIcon,
    InfoIcon,
    BriefcaseIcon
} from "@/lib/icons"
import { Button, Badge, ThreeDotsLoader } from "@/components/reusable"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import QuickModeItemCard from "./QuickModeItemCard"
import { deleteProductAction, duplicateProductAction } from "@/app/actions/erp/products"
import { deleteServiceAction, duplicateServiceAction } from "@/app/actions/erp/servicos"
import AlertModal from "@/components/reusable/AlertModal"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { DashboardLayout } from "@/lib/dashboard-engine/types"

const IconMap: Record<string, React.ComponentType<any>> = {
    PlusIcon,
    ShoppingCartIcon,
    Package,
    WrenchIcon,
    ChevronRightIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    StoreIcon,
    QRCodeIcon,
    SettingsIcon,
    ShareIcon,
    RocketIcon,
    InfoIcon,
    BriefcaseIcon
};

function renderIcon(iconName: string, className?: string) {
    const IconComp = IconMap[iconName] || InfoIcon;
    return <IconComp className={className} />;
}

interface QuickModeHomeProps {
    data: DashboardLayout;
    partnerId: string;
}

export default function QuickModeHome({ data, partnerId }: QuickModeHomeProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isDeleting, setIsDeleting] = useState<string | null>(null)
    const [showDeleteModal, setShowDeleteModal] = useState<any>(null)

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

    const getStepAction = (item: any) => {
        if (item.href) {
            router.push(item.href)
        } else if (item.tabTarget) {
            router.push(`/erp/settings?tab=${item.tabTarget}`)
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
                            {data.greeting.title}
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mt-1">
                            {data.greeting.subtitle}
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

                {/* 1. Alertas Críticos */}
                {data.alerts.length > 0 && (
                    <div className="flex flex-col gap-4">
                        {data.alerts.map((alert) => (
                            <div 
                                key={alert.id} 
                                className={`border rounded-2xl p-5 flex items-start gap-4 shadow-sm transition-all ${
                                    alert.type === "danger" 
                                        ? "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300"
                                        : alert.type === "warning"
                                            ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-300"
                                            : "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/20 dark:border-blue-900/40 dark:text-blue-300"
                                }`}
                            >
                                <div className="shrink-0 mt-0.5 text-brand-dark dark:text-dark-heading">
                                    <AlertTriangleIcon size={20} className={alert.type === "danger" ? "text-brand-red" : alert.type === "warning" ? "text-amber-500" : "text-blue-500"} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-[15px] font-bold">
                                        {alert.title}
                                    </h4>
                                    <p className="text-[13px] font-medium mt-1 opacity-90">
                                        {alert.description}
                                    </p>
                                </div>
                                {alert.actionLabel && alert.actionHref && (
                                    <Button 
                                        variant={alert.type === "danger" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => router.push(alert.actionHref!)}
                                        className={`shrink-0 rounded-full font-bold ${
                                            alert.type === "danger" 
                                                ? "bg-brand-red hover:bg-brand-red/90 border-none text-white" 
                                                : ""
                                        }`}
                                    >
                                        {alert.actionLabel}
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* 2. Checklist de Onboarding (Visível enquanto houver itens incompletos) */}
                {data.checklist && (
                    <section className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 shadow-sm">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                            <div>
                                <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading">
                                    Seu Progresso de Ativação
                                </h3>
                                <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                                    Complete as tarefas abaixo para deixar sua vitrine pronta.
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <span className="text-[28px] font-black text-brand-green tracking-tight">
                                    {data.checklist.percentComplete}%
                                </span>
                                <span className="text-xs font-bold text-brand-inactive-text block uppercase">
                                    {data.checklist.completedCount} de {data.checklist.totalCount} concluídos
                                </span>
                            </div>
                        </div>

                        {/* Barra de Progresso */}
                        <div className="w-full h-3 bg-brand-gray dark:bg-dark-border rounded-full overflow-hidden mb-6">
                            <motion.div 
                                className="h-full bg-brand-green rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${data.checklist.percentComplete}%` }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                        </div>

                        {/* Lista do Checklist */}
                        <div className="flex flex-col gap-4">
                            {data.checklist.items.map((item, idx) => (
                                <div 
                                    key={item.id}
                                    className={`bg-white dark:bg-dark-surface border rounded-[20px] p-5 flex items-start gap-4 transition-all shadow-sm ${item.completed ? 'border-brand-border/60 dark:border-dark-border/40 opacity-80' : 'border-brand-green/30 dark:border-brand-green/20'}`}
                                >
                                    <div className="shrink-0 mt-0.5">
                                        {item.completed ? (
                                            <CheckCircleIcon size={22} className="text-brand-green" />
                                        ) : (
                                            <div className="w-[22px] h-[22px] rounded-full border-2 border-brand-green/30 dark:border-brand-green/20 flex items-center justify-center text-xs font-black text-brand-green">
                                                {idx + 1}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <h4 className={`text-[15px] font-bold ${item.completed ? 'text-brand-dark/70 dark:text-dark-heading/70 line-through' : 'text-brand-dark dark:text-dark-heading'}`}>
                                                {item.title}
                                            </h4>
                                            {item.completed && (
                                                <Badge variant="green" className="self-start sm:self-auto text-[10px] py-0.5 px-2">Concluído</Badge>
                                            )}
                                        </div>
                                        <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-1">
                                            {item.description}
                                        </p>
                                    </div>
                                    <div className="shrink-0 ml-2">
                                        <Button
                                            variant={item.completed ? "outline" : "default"}
                                            size="sm"
                                            onClick={() => getStepAction(item)}
                                            className={item.completed ? "text-brand-inactive-text border-brand-border h-9" : "h-9"}
                                        >
                                            {item.completed ? "Configurar" : "Começar"}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 3. Ações/Atalhos Rápidos */}
                {data.shortcuts.length > 0 && (
                    <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {data.shortcuts.map((shortcut) => (
                            <div
                                key={shortcut.id}
                                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 cursor-pointer flex items-center gap-6 group transition-all hover:bg-brand-green-light/20 dark:hover:bg-dark-border/20"
                                onClick={() => router.push(shortcut.href)}
                            >
                                <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0 transition-colors">
                                    {renderIcon(shortcut.icon, "w-5 h-5")}
                                </div>
                                <div>
                                    <h3 className="text-[17px] font-bold text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                                        {shortcut.label}
                                    </h3>
                                    <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                                        {shortcut.description}
                                    </p>
                                </div>
                                <ChevronRightIcon className="ml-auto text-brand-inactive-text/50 dark:text-dark-body/50 group-hover:text-brand-green transition-colors w-5 h-5" />
                            </div>
                        ))}
                    </section>
                )}

                {/* 4. Métrica/Stats Cards */}
                {data.cards.length > 0 && (
                    <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {data.cards.map((card) => (
                            <div 
                                key={card.id} 
                                className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between cursor-pointer hover:bg-brand-gray/10 transition-colors"
                                onClick={() => card.href && router.push(card.href)}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                            {renderIcon(card.icon, "text-brand-dark dark:text-dark-heading w-[18px] h-[18px]")}
                                        </div>
                                        <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{card.title}</span>
                                    </div>
                                </div>

                                <div className="flex items-baseline space-x-2 mt-2">
                                    <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                        {card.value}
                                    </h2>
                                    <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                        {card.subtitle}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </section>
                )}

                {/* 5. Meus Anúncios e Pedidos */}
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

                        {data.recentItems.length === 0 ? (
                            <div className="bg-brand-gray/50 dark:bg-dark-surface/30 border-2 border-dashed border-brand-border dark:border-dark-border rounded-[24px] p-12 flex flex-col items-center text-center gap-4">
                                <img src="https://img.dudit.com.br/static/mascots/Estoque.png" className="w-32 h-32 object-contain grayscale opacity-50" alt="" />
                                <div>
                                    <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Nenhum anúncio ainda</h4>
                                    <p className="text-brand-inactive-text dark:text-dark-body font-medium mt-1">Crie seu primeiro anúncio para começar a vender.</p>
                                </div>
                                <Button onClick={() => router.push('/erp/products?create=true')} className="mt-2">
                                    Criar Primeiro Anúncio
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {data.recentItems.map((item) => (
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
                                        Total de {data.recentOrders.length} pedidos
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 6. Integrações Ativas */}
                {data.integrations.length > 0 && (
                    <section className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 shadow-sm flex flex-col gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                Integrações Ativas
                            </h3>
                            <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                                Conecte e gerencie seus canais de vendas e formas de pagamento.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                            {data.integrations.map((integration) => (
                                <div key={integration.id} className="border border-brand-border dark:border-dark-border rounded-xl p-4 flex items-center justify-between hover:bg-brand-gray/5 dark:hover:bg-dark-border/10 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0">
                                            {integration.id === "whatsapp" ? <ShareIcon size={18} /> : <StoreIcon size={18} />}
                                        </div>
                                        <div>
                                            <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                                {integration.name}
                                            </h4>
                                            <p className="text-[12px] text-brand-inactive-text dark:text-dark-body mt-0.5 max-w-[200px] sm:max-w-none">
                                                {integration.description}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant={integration.status === "connected" ? "green" : "gray"}>
                                            {integration.status === "connected" ? "Conectado" : "Desconectado"}
                                        </Badge>
                                        <Button size="sm" variant="outline" onClick={() => router.push(integration.actionHref)}>
                                            Configurar
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 7. Recomendações e Dicas de Vendas */}
                {data.recommendations.length > 0 && (
                    <div className="flex flex-col gap-6">
                        {data.recommendations.map((rec) => {
                            if (rec.variant === "upgrade") {
                                return (
                                    <section key={rec.id} className="bg-brand-dark dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-8 md:p-12 relative overflow-hidden text-white shadow-md">
                                        <div className="relative z-10 max-w-2xl">
                                            {rec.badge && (
                                                <Badge variant="green" className="mb-4 bg-brand-green border-none text-white px-4 py-1.5 text-sm">
                                                    {rec.badge}
                                                </Badge>
                                            )}
                                            <h2 className="text-4xl font-black mb-4 leading-tight text-white">
                                                {rec.title}
                                            </h2>
                                            <p className="text-slate-300 text-lg font-medium mb-8">
                                                {rec.description}
                                            </p>
                                            <Button
                                                size="lg"
                                                className="bg-brand-green hover:bg-brand-green/90 text-white border-none h-12 px-8 text-base font-bold transition-all rounded-full"
                                                onClick={() => router.push(rec.actionHref)}
                                            >
                                                {rec.actionLabel}
                                            </Button>
                                        </div>
                                        <div className="absolute right-[-100px] bottom-[-100px] w-[500px] h-[500px] bg-brand-green/10 rounded-full blur-[100px]" />
                                        <div className="absolute right-10 top-1/2 -translate-y-1/2 hidden lg:block opacity-20">
                                            <StoreIcon size={240} className="text-brand-green" />
                                        </div>
                                    </section>
                                )
                            } else {
                                return (
                                    <div key={rec.id} className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0 mt-0.5">
                                                <InfoIcon size={22} />
                                            </div>
                                            <div>
                                                <h3 className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                                                    {rec.title}
                                                </h3>
                                                <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-1 leading-relaxed max-w-2xl">
                                                    {rec.description}
                                                </p>
                                            </div>
                                        </div>
                                        <Button variant="outline" className="shrink-0 rounded-full font-bold" onClick={() => router.push(rec.actionHref)}>
                                            {rec.actionLabel}
                                        </Button>
                                    </div>
                                )
                            }
                        })}
                    </div>
                )}
            </div>

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
