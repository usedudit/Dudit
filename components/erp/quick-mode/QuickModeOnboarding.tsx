'use client';

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
    PlusIcon,
    WrenchIcon,
    ChevronRightIcon,
    CheckCircleIcon,
    StoreIcon,
    QRCodeIcon,
    SettingsIcon,
    ShareIcon,
    RocketIcon,
    InfoIcon,
    AlertTriangleIcon,
    BriefcaseIcon
} from "@/lib/icons"
import { Button, Badge, ThreeDotsLoader } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { upgradeToERPAction } from "@/app/actions/erp/quick-mode"
import { useToast } from "@/hooks/use-toast"

interface OnboardingItem {
    completed: boolean
    title: string
    description: string
    tab?: string
    path?: string
}

interface QuickModeOnboardingProps {
    data: {
        storeName: string
        isShowcaseActive: boolean
        checklist: {
            profile: OnboardingItem
            address: OnboardingItem
            hours: OnboardingItem
            payments: OnboardingItem
            items: OnboardingItem
            showcase: OnboardingItem
        }
    }
    partnerId: string
}

export default function QuickModeOnboarding({ data, partnerId }: QuickModeOnboardingProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isUpgrading, setIsUpgrading] = useState(false)
    const [showUpgradeModal, setShowUpgradeModal] = useState(false)

    const checklistArray = Object.values(data.checklist)
    const completedCount = checklistArray.filter(item => item.completed).length
    const totalCount = checklistArray.length
    const percentComplete = Math.round((completedCount / totalCount) * 100)

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

    const getStepAction = (item: OnboardingItem) => {
        if (item.path) {
            router.push(item.path)
        } else if (item.tab) {
            router.push(`/erp/settings?tab=${item.tab}`)
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
                            Complete o onboarding para começar a vender na Dudit.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/erp/inicio/painel')}
                            className="flex items-center text-[13px] font-bold text-brand-green border border-brand-green/20 dark:border-brand-green/30 bg-brand-green/5 hover:bg-brand-green-light rounded-full px-5 py-2.5 transition-colors cursor-pointer"
                        >
                            Ver Painel de Vendas
                            <ChevronRightIcon size={16} className="ml-1" />
                        </button>
                    </div>
                </header>

                {/* Grid principal do Onboarding */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    
                    {/* Coluna da Esquerda: Checklist de Onboarding */}
                    <div className="xl:col-span-2 flex flex-col gap-6">
                        
                        {/* Progresso Geral */}
                        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 shadow-sm">
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
                                        {percentComplete}%
                                    </span>
                                    <span className="text-xs font-bold text-brand-inactive-text block uppercase">
                                        {completedCount} de {totalCount} concluídos
                                    </span>
                                </div>
                            </div>

                            {/* Barra de Progresso */}
                            <div className="w-full h-3 bg-brand-gray dark:bg-dark-border rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-brand-green rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentComplete}%` }}
                                    transition={{ duration: 0.5, ease: "easeOut" }}
                                />
                            </div>
                        </div>

                        {/* Lista do Checklist */}
                        <div className="flex flex-col gap-4">
                            {checklistArray.map((item, idx) => (
                                <div 
                                    key={idx}
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
                    </div>

                    {/* Coluna da Direita: Divulgação e Dicas */}
                    <div className="flex flex-col gap-6">
                        
                        {/* Card do QR Code do Vendedor */}
                        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[280px]">
                            <div>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0">
                                        <QRCodeIcon size={18} />
                                    </div>
                                    <h3 className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                                        Divulgue sua Loja
                                    </h3>
                                </div>
                                <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                    Use seu QR Code exclusivo para divulgar sua vitrine no estabelecimento físico ou em materiais impressos.
                                </p>
                            </div>

                            {/* Área do QR Code Placeholder */}
                            <div className="my-5 border border-dashed border-brand-border dark:border-dark-border rounded-xl p-6 flex flex-col items-center justify-center text-center bg-brand-gray/30 dark:bg-dark-background/20 h-28">
                                <QRCodeIcon size={24} className="text-brand-inactive-text/50 mb-1 animate-pulse" />
                                <span className="text-[11px] font-bold text-brand-inactive-text/80 uppercase tracking-widest">
                                    Espaço do QR Code
                                </span>
                                <span className="text-[9px] text-brand-inactive-text mt-0.5">
                                    Habilitado após ativação
                                </span>
                            </div>

                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full gap-2 text-xs font-bold border-brand-border/60"
                                onClick={() => toast({ title: "Compartilhamento", description: "O link da sua loja estará disponível quando a vitrine estiver ativa!" })}
                            >
                                <ShareIcon size={14} />
                                Compartilhar Link da Vitrine
                            </Button>
                        </div>

                        {/* Dicas e Atalhos */}
                        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-6 shadow-sm flex flex-col gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-green shrink-0">
                                        <InfoIcon size={18} />
                                    </div>
                                    <h3 className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                                        Dicas Dudit
                                    </h3>
                                </div>
                                <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                    Ao configurar seu endereço e horários de funcionamento comerciais corretos, os clientes ganham confiança nos seus horários de atendimento.
                                </p>
                            </div>

                            <div className="h-px w-full bg-brand-border dark:bg-dark-border" />

                            {/* Atalhos Rápidos */}
                            <div>
                                <h4 className="text-[14px] font-bold text-brand-dark dark:text-dark-heading mb-3 uppercase tracking-wider text-xs">
                                    Atalhos Úteis
                                </h4>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => router.push('/erp/products?create=true')}
                                        className="w-full text-left py-2 px-3 hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 rounded-lg text-[13px] font-bold text-brand-dark dark:text-dark-heading flex items-center justify-between transition-colors"
                                    >
                                        <span className="flex items-center gap-2">
                                            <PlusIcon size={14} className="text-brand-green" />
                                            Anunciar produto
                                        </span>
                                        <ChevronRightIcon size={14} className="text-brand-inactive-text/50" />
                                    </button>
                                    <button 
                                        onClick={() => router.push('/erp/settings')}
                                        className="w-full text-left py-2 px-3 hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 rounded-lg text-[13px] font-bold text-brand-dark dark:text-dark-heading flex items-center justify-between transition-colors"
                                    >
                                        <span className="flex items-center gap-2">
                                            <SettingsIcon size={14} className="text-brand-green" />
                                            Configurações do negócio
                                        </span>
                                        <ChevronRightIcon size={14} className="text-brand-inactive-text/50" />
                                    </button>
                                    <button 
                                        onClick={() => router.push('/erp/settings?tab=vitrine')}
                                        className="w-full text-left py-2 px-3 hover:bg-brand-gray/50 dark:hover:bg-dark-border/20 rounded-lg text-[13px] font-bold text-brand-dark dark:text-dark-heading flex items-center justify-between transition-colors"
                                    >
                                        <span className="flex items-center gap-2">
                                            <StoreIcon size={14} className="text-brand-green" />
                                            Acessar minha vitrine
                                        </span>
                                        <ChevronRightIcon size={14} className="text-brand-inactive-text/50" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Upgrade Block */}
                <section className="bg-brand-dark dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[24px] p-8 md:p-12 relative overflow-hidden text-white mt-8 shadow-md">
                    <div className="relative z-10 max-w-2xl">
                        <Badge variant="green" className="mb-4 bg-brand-green border-none text-white px-4 py-1.5 text-sm">RECURSO PREMIUM</Badge>
                        <h2 className="text-4xl font-black mb-4 leading-tight text-white">
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
            </div>

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
        </>
    )
}
