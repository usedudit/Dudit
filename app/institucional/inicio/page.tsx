"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/reusable/Button';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowRight,
    PieChart,
    TrendingUp,
    Box,
    Layout,
    User,
    ShoppingBag,
    Store,
    CheckCircle2,
    MessageCircle,
    Calendar,
    Wrench,
    Search,
    ChevronDown,
    Star,
    Shield,
    Zap,
    Link2,
} from 'lucide-react';
import { GridLines, SectionHeader, Navbar, Footer, CTA } from '../../../components/InstitucionalShared';

const Hero = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    return (
        <section className="relative bg-white dark:bg-dark-surface pt-32 pb-20 overflow-hidden flex flex-col justify-center">
            <GridLines />
            <div className="flex-1 flex flex-col max-w-[1400px] w-full mx-auto px-4">
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <h1 className="text-4xl md:text-5xl font-bold text-brand-dark dark:text-dark-heading mb-6 leading-tight">
                            Venda no balcão, na sua cidade e em todo o Brasil — com <span className="text-brand-green">0% de comissão.</span>
                        </h1>
                        <p className="text-brand-inactive-text text-lg md:text-xl mb-8 max-w-lg leading-relaxed">
                            Sua vitrine online, PDV, controle de estoque, agenda, ordens de serviço e integrações com Tiny ERP e Bling em um só lugar. Comece grátis com planos a partir de R$ 0/mês.
                        </p>
                        <div className="flex flex-wrap gap-4 mb-5">
                            <Button onClick={() => onNavigate('start-selling')}>Começar grátis</Button>
                            <Button variant="outline" onClick={() => onNavigate('pricing')}>Ver planos</Button>
                        </div>
                        <button
                            type="button"
                            onClick={() => onNavigate('explore')}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-inactive-text hover:text-brand-green transition-colors cursor-pointer"
                        >
                            Procurando produtos ou serviços para comprar? <span className="underline">Explorar Dudit</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="relative"
                    >
                        <div className="bg-white dark:bg-dark-surface rounded-xl overflow-hidden border border-gray-100 dark:border-dark-border shadow-xl">
                            <div className="bg-gray-50 dark:bg-dark-border/30 p-3 border-b border-gray-100 dark:border-dark-border flex items-center gap-2">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-brand-red"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-brand-green"></div>
                                </div>
                                <div className="bg-white dark:bg-dark-surface px-3 py-1 rounded text-[10px] text-brand-inactive-text flex-1 text-center font-mono border border-gray-100 dark:border-dark-border">dudit.com.br/sualoja</div>
                            </div>
                            <div className="p-6 space-y-3">
                                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/40 rounded-lg border border-green-100 dark:border-green-900/50">
                                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center">
                                        <Store className="w-4 h-4 text-green-600 dark:text-green-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">Vitrine online</div>
                                        <div className="text-xs text-brand-inactive-text">Link na bio, WhatsApp, entrega local e envio nacional</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-950/40 rounded-lg border border-purple-100 dark:border-purple-900/50">
                                    <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center">
                                        <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">Gestão integrada</div>
                                        <div className="text-xs text-brand-inactive-text">PDV, estoque, agenda, OS, Tiny ERP e Bling</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-100 dark:border-blue-900/50">
                                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                                        <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">Mais visibilidade</div>
                                        <div className="text-xs text-brand-inactive-text">Sua loja descoberta por clientes na Dudit</div>
                                    </div>
                                </div>
                                <div className="pt-3 border-t border-gray-100 dark:border-dark-border flex items-center justify-between">
                                    <div className="text-center flex-1">
                                        <div className="text-xl font-bold text-brand-green">0%</div>
                                        <div className="text-[10px] text-brand-inactive-text">comissão da Dudit</div>
                                    </div>
                                    <div className="h-8 w-px bg-gray-100 dark:bg-dark-border/40"></div>
                                    <div className="text-center flex-1">
                                        <div className="text-xl font-bold text-brand-dark dark:text-dark-heading">R$ 0</div>
                                        <div className="text-[10px] text-brand-inactive-text">para começar</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <motion.div
                            className="absolute -right-4 md:-right-8 -bottom-6 w-48 bg-white dark:bg-dark-surface rounded-2xl p-4 border border-gray-100 dark:border-dark-border shadow-lg hidden md:block"
                            animate={{ y: [0, -10, 0] }}
                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 bg-brand-green/20 rounded-full flex items-center justify-center">
                                    <TrendingUp className="w-4 h-4 text-brand-dark dark:text-dark-heading" />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-brand-dark dark:text-dark-heading">Exemplo de venda</div>
                                    <div className="text-[9px] text-brand-inactive-text">Pedido R$ 150,00</div>
                                </div>
                            </div>
                            <div className="bg-brand-green/10 rounded-lg p-2 text-xs">
                                <div className="flex justify-between font-bold text-brand-dark dark:text-dark-heading">
                                    <span>Comissão Dudit</span>
                                    <span className="text-brand-green">R$ 0,00</span>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

const BentoFeaturesComoAjuda = () => {
    const cards = [
        {
            title: "Vitrine online e WhatsApp",
            subtitle: "VENDAS LOCAIS E NACIONAIS",
            description: "Compartilhe seu link na bio, receba pedidos no WhatsApp ou no checkout e envie para todo o Brasil com 0% de comissão da Dudit.",
            type: "store"
        },
        {
            title: "PDV, estoque e ERPs",
            subtitle: "GESTÃO INTEGRADA",
            description: "Frente de caixa no balcão, controle de estoque com variações e integração nativa com Tiny ERP e Bling.",
            type: "erp"
        },
        {
            title: "Agenda e ordens de serviço",
            subtitle: "PARA SERVIÇOS",
            description: "Agendamento online 24h, orçamentos rápidos e ordens de serviço digitais com fotos e histórico.",
            type: "schedule"
        },
        {
            title: "Descoberta e anúncios",
            subtitle: "VITRINE ABERTA",
            description: "Sua loja aparece para quem busca na Dudit — e se quiser anunciar algo avulso ou desapegar, também pode começar grátis.",
            type: "buy"
        }
    ];

    return (
        <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <SectionHeader
                    subtitle="JEITOS DE USAR A DUDIT"
                    title="Tudo que o seu negócio precisa para vender e organizar"
                />
                <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
                    Comece pela vitrine online, pelo PDV ou pela agenda — e ative os outros recursos conforme for crescendo.
                </p>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {cards.map((card, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            viewport={{ once: true }}
                            className="group flex flex-col justify-between"
                        >
                            <div aria-hidden="true" className="bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center">
                                {card.type === 'store' && (
                                    <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[220px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50 dark:border-dark-border">
                                            <Store className="w-4 h-4 text-brand-dark dark:text-dark-heading" />
                                            <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Sua Vitrine Online</span>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-dark-border/30 p-2 rounded text-[9px] font-mono text-brand-inactive-text mb-2 text-center">
                                            dudit.com.br/sualoja
                                        </div>
                                        <div className="bg-brand-green/10 text-brand-green text-[9px] font-bold py-1 rounded text-center">
                                            Entrega local e frete nacional
                                        </div>
                                    </div>
                                )}

                                {card.type === 'erp' && (
                                    <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[220px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                        <div className="flex justify-between mb-3 border-b border-gray-50 dark:border-dark-border pb-2">
                                            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Gestão & ERP</span>
                                            <div className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded text-[8px] font-bold">Sincronizado</div>
                                        </div>
                                        <div className="space-y-1.5 text-[10px]">
                                            <div className="flex justify-between bg-gray-50 dark:bg-dark-border/30 p-1.5 rounded">
                                                <span className="font-medium text-brand-dark dark:text-dark-heading">PDV & Estoque</span>
                                                <span className="text-brand-green font-bold">Ativo</span>
                                            </div>
                                            <div className="flex justify-between bg-gray-50 dark:bg-dark-border/30 p-1.5 rounded">
                                                <span className="font-medium text-brand-dark dark:text-dark-heading">Tiny ERP / Bling</span>
                                                <span className="text-blue-600 dark:text-blue-400 font-bold">Integrado</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {card.type === 'schedule' && (
                                    <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[220px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                        <div className="flex justify-between items-center mb-3 border-b border-gray-50 dark:border-dark-border pb-2">
                                            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Agenda Hoje</span>
                                            <Calendar size={12} className="text-brand-inactive-text" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-950/40 p-1.5 rounded text-[10px]">
                                                <span className="font-bold text-blue-800 dark:text-blue-300">14:00 - Corte</span>
                                                <span className="text-blue-600 dark:text-blue-400 font-semibold text-[8px]">Confirmado</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-gray-50 dark:bg-dark-border/30 p-1.5 rounded text-[10px]">
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">16:30 - Revisão</span>
                                                <span className="text-brand-green font-semibold text-[8px]">OS aberta</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {card.type === 'buy' && (
                                    <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[220px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50 dark:border-dark-border">
                                            <Search className="w-3.5 h-3.5 text-brand-green" />
                                            <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Buscar na Dudit</span>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="bg-gray-50 dark:bg-dark-border/30 p-2 rounded flex items-center justify-between">
                                                <span className="text-[10px] text-brand-dark dark:text-dark-heading font-medium">Bolo Caseiro</span>
                                                <span className="text-[8px] text-brand-green font-bold">600m</span>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-dark-border/30 p-2 rounded flex items-center justify-between">
                                                <span className="text-[10px] text-brand-dark dark:text-dark-heading font-medium">Oficina Mecânica</span>
                                                <span className="text-[8px] text-blue-600 dark:text-blue-400 font-bold">1.2 km</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="pt-5">
                                <span className="text-xs font-bold text-brand-green block mb-1">{card.subtitle}</span>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-1">{card.title}</h3>
                                <p className="text-brand-inactive-text text-sm leading-relaxed">{card.description}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const ComoFunciona = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    const steps = [
        {
            num: "01",
            title: "Crie sua vitrine grátis",
            desc: "Faça seu cadastro em minutos, sem precisar de cartão de crédito nem fidelidade.",
        },
        {
            num: "02",
            title: "Cadastre produtos ou serviços",
            desc: "Adicione fotos, preços, variações ou horários de atendimento — ou sincronize com Tiny ERP e Bling.",
        },
        {
            num: "03",
            title: "Venda e organize tudo",
            desc: "Compartilhe seu link no Instagram e WhatsApp, atenda no balcão (PDV) e entregue na sua cidade ou em todo o Brasil.",
        },
    ];

    return (
        <section className="py-20 bg-brand-slate/60 dark:bg-dark-border/20 relative border-t border-gray-100 dark:border-dark-border">
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <span className="text-sm font-medium tracking-wider uppercase mb-3 block text-brand-inactive-text">
                            COMO A DUDIT FUNCIONA
                        </span>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-brand-dark dark:text-dark-heading">
                            Comece a vender em 3 passos simples
                        </h2>
                    </div>
                    <Button variant="outline" onClick={() => onNavigate('pricing')}>
                        Ver planos a partir de R$ 0
                    </Button>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {steps.map((step) => (
                        <div
                            key={step.num}
                            className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-gray-100 dark:border-dark-border"
                        >
                            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand-green/15 text-brand-green font-bold text-xs mb-4">
                                {step.num}
                            </span>
                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-2">{step.title}</h3>
                            <p className="text-sm text-brand-inactive-text leading-relaxed">{step.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const ParaQuemCompra = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    const items = [
        {
            icon: Search,
            title: "Encontre o que precisa",
            desc: "Descubra lojas, produtos e serviços perto de você ou com entrega para todo o Brasil.",
        },
        {
            icon: ShoppingBag,
            title: "Produtos & Serviços",
            desc: "De roupas e eletrônicos a confeitarias, salões e oficinas. Tudo organizado em um só lugar.",
        },
        {
            icon: MessageCircle,
            title: "Contato direto",
            desc: "Compre direto na vitrine, agende pelo sistema ou fale no WhatsApp de quem vende, sem intermediários.",
        },
    ];

    return (
        <section className="relative py-20 bg-white dark:bg-dark-surface overflow-hidden border-t border-gray-100 dark:border-dark-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                    <div>
                        <span className="text-sm font-medium tracking-wider uppercase mb-3 block text-brand-inactive-text">
                            PARA QUEM COMPRA
                        </span>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-brand-dark dark:text-dark-heading">
                            Procurando algo hoje?
                        </h2>
                    </div>
                    <Button variant="outline" onClick={() => onNavigate('explore')}>
                        Explorar lojas e produtos
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 mt-6">
                    {items.map((item, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className={`py-8 px-8 ${idx < items.length - 1 ? 'md:border-r md:border-dashed md:border-gray-200' : ''} ${idx < items.length - 1 ? 'border-b md:border-b-0 border-dashed border-gray-200 dark:border-dark-border' : ''}`}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-brand-dark rounded-xl flex items-center justify-center">
                                    <item.icon className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{item.title}</h3>
                            </div>
                            <p className="text-brand-inactive-text text-sm leading-relaxed">
                                {item.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const ParaQuemVende = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const items = [
        {
            num: "01",
            title: "Mais uma vitrine",
            desc: "Chegue até mais pessoas da sua cidade e de todo o Brasil. Sua loja aparece para quem está procurando exatamente o que você vende.",
        },
        {
            num: "02",
            title: "Contato direto",
            desc: "Clientes chamam no WhatsApp ou compram direto na sua vitrine. Sem intermediários, sem complicação.",
        },
        {
            num: "03",
            title: "0% de comissão da Dudit",
            desc: "A Dudit não cobra porcentagem sobre as suas vendas — você usa o plano gratuito ou paga apenas uma mensalidade fixa. Em pagamentos online, aplicam-se somente as taxas do meio de pagamento.",
        },
        {
            num: "04",
            title: "Link na bio",
            desc: "Tenha um catálogo limpo e profissional para compartilhar nas suas redes sociais. Seu link único para usar no Instagram.",
        },
    ];

    return (
        <section className="relative py-24 bg-white dark:bg-dark-surface overflow-hidden border-t border-gray-100 dark:border-dark-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    {/* Lado esquerdo: Imagem */}
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="relative"
                    >
                        <div className="bg-[#eaf7f0] dark:bg-dark-border/40 rounded-3xl p-6 md:p-10">
                            <div className="overflow-hidden">
                                <img
                                    src="https://img.dudit.com.br/static/mascots/MaisUmaVitrine.png"
                                    alt="Seu negócio também pode ser encontrado na Dudit"
                                    className="w-full h-auto object-cover aspect-[4/5]"
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent) {
                                            parent.innerHTML = '<div class="w-full bg-[#eaf7f0] dark:bg-dark-border/40 flex items-center justify-center"></div>';
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* Lado direito: Título + Accordion */}
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                    >
                        <span className="text-sm font-medium tracking-wider uppercase mb-4 block text-brand-inactive-text">
                            MAIS UMA PORTA ABERTA
                        </span>
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-brand-dark dark:text-dark-heading mb-6">
                            Seu negócio também pode ser encontrado na Dudit
                        </h2>
                        <p className="text-brand-inactive-text text-lg leading-relaxed mb-10">
                            Você já usa Instagram e WhatsApp? Continue usando. A Dudit é mais uma vitrine para seus produtos e serviços chegarem até mais pessoas.
                        </p>

                        <div className="space-y-0">
                            {items.map((item, idx) => {
                                const isOpen = openIndex === idx;
                                return (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: 10 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: idx * 0.08 }}
                                        className={`border-t border-gray-200 dark:border-dark-border ${idx === items.length - 1 ? 'border-b' : ''}`}
                                    >
                                        <button
                                            type="button"
                                            aria-expanded={isOpen}
                                            aria-controls={`home-vende-panel-${idx}`}
                                            onClick={() => setOpenIndex(isOpen ? null : idx)}
                                            className="w-full flex items-center gap-4 py-5 text-left group cursor-pointer"
                                        >
                                            <span className="text-sm font-medium text-brand-inactive-text w-8 shrink-0">
                                                {item.num}.
                                            </span>
                                            <span className={`text-lg font-bold flex-1 transition-colors ${isOpen ? 'text-brand-dark dark:text-dark-heading' : 'text-brand-dark dark:text-dark-heading group-hover:text-brand-green'}`}>
                                                {item.title}
                                            </span>
                                            <ChevronDown
                                                className={`w-5 h-5 text-brand-inactive-text transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                                            />
                                        </button>
                                        <div
                                            id={`home-vende-panel-${idx}`}
                                            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                                        >
                                            <div className="overflow-hidden">
                                                <p className="text-brand-inactive-text text-sm leading-relaxed pb-5 pl-12 pr-8">
                                                    {item.desc}
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

const GlobalScale = () => {
    return (
        <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <div className="flex flex-col lg:flex-row min-h-[600px] rounded-3xl overflow-hidden shadow-xl">
                    <div className="flex-1 bg-brand-dark p-12 lg:p-16 flex flex-col justify-center relative z-10">
                        <div className="absolute inset-0 pointer-events-none z-0 flex justify-center w-full h-full opacity-20">
                            <div className="w-px h-full bg-white/10 mx-auto hidden md:block" />
                            <div className="w-px h-full bg-white/10 mx-auto hidden md:block" />
                            <div className="w-px h-full bg-white/10 mx-auto hidden md:block" />
                        </div>

                        <div className="relative z-10 text-white">
                            <span className="text-brand-green text-xs uppercase tracking-widest font-bold mb-4 block">SUA VENDA, SUA MARGEM.</span>
                            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">Você vende. <br />Você recebe. <br />Sem comissão da Dudit.</h2>
                            <p className="text-gray-300 text-lg mb-8 max-w-md leading-relaxed">
                                A Dudit não cobra porcentagem sobre os seus pedidos. Você começa grátis ou escolhe um plano fixo mensal conforme o seu negócio cresce.
                            </p>

                            <div className="flex gap-12 pt-6">
                                <div>
                                    <div className="text-3xl font-bold text-brand-green mb-1">0%</div>
                                    <div className="text-gray-300 text-xs">de comissão da Dudit</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-bold text-brand-green mb-1">R$ 0</div>
                                    <div className="text-gray-300 text-xs">para começar no plano grátis</div>
                                </div>
                            </div>
                            <p className="text-gray-400 text-[11px] mt-6 max-w-md">
                                *Em pagamentos online integrados, aplicam-se apenas as taxas do meio de pagamento escolhido.
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 bg-brand-green relative overflow-hidden flex items-center justify-center p-12">
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-white/20 rounded-full opacity-30"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] border border-white/20 rounded-full opacity-30"></div>
                        </div>

                        <div aria-hidden="true" className="relative z-10 w-full h-full min-h-[400px]">
                            <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-white/80 bg-black/15 px-2.5 py-1 rounded-full mb-4">
                                Exemplos ilustrativos
                            </span>
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.1, duration: 0.5 }}
                                viewport={{ once: true }}
                                className="absolute top-[14%] left-0 lg:left-[5%] bg-white dark:bg-dark-surface rounded-2xl p-4 pr-8 flex items-center gap-4 max-w-[280px]"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-dark-border/30 flex items-center justify-center shrink-0">
                                    <Store size={20} className="text-brand-inactive-text" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-brand-inactive-text"><span className="font-bold text-brand-dark dark:text-dark-heading">Oficina Exemplo</span> vendeu</p>
                                    <p className="text-sm text-brand-dark dark:text-dark-heading font-bold mt-0.5">Troca de Óleo</p>
                                </div>
                                <div className="text-brand-green font-bold text-sm">R$ 180,00</div>
                            </motion.div>

                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.3, duration: 0.5 }}
                                viewport={{ once: true }}
                                className="absolute top-[44%] right-0 lg:right-[5%] bg-white dark:bg-dark-surface rounded-2xl p-4 pr-8 flex items-center gap-4 max-w-[320px]"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-dark-border/30 flex items-center justify-center shrink-0">
                                    <User size={20} className="text-brand-inactive-text" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-brand-inactive-text"><span className="font-bold text-brand-dark dark:text-dark-heading">Confeitaria Exemplo</span> vendeu</p>
                                    <p className="text-sm text-brand-dark dark:text-dark-heading font-bold mt-0.5">Bolo de Festa</p>
                                </div>
                                <div className="text-brand-green font-bold text-sm">R$ 120,00</div>
                            </motion.div>

                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5, duration: 0.5 }}
                                viewport={{ once: true }}
                                className="absolute bottom-[8%] left-0 lg:left-[10%] bg-white dark:bg-dark-surface rounded-2xl p-4 pr-8 flex items-center gap-4 max-w-[280px]"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-dark-border/30 flex items-center justify-center shrink-0">
                                    <ShoppingBag size={20} className="text-brand-inactive-text" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-brand-inactive-text"><span className="font-bold text-brand-dark dark:text-dark-heading">Loja de Roupas</span> vendeu</p>
                                    <p className="text-sm text-brand-dark dark:text-dark-heading font-bold mt-0.5">Camiseta Branca</p>
                                </div>
                                <div className="text-brand-green font-bold text-sm">R$ 59,90</div>
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default function HomePage() {
    const router = useRouter();

    const onNavigate = (page: string) => {
        if (page === 'home') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        else if (page === 'start-selling') router.push('/auth/login?mode=partner');
        else if (page === 'explore') router.push('/explorar');
        else if (page === 'segments') router.push('/institucional/segmentos');
        else if (page === 'pricing') router.push('/institucional/planos');
        else if (page === 'terms') router.push('/institucional/termos');
        else if (page === 'privacidade') router.push('/institucional/privacidade');
        else if (page === 'about') router.push('/institucional/sobre');
        else {
            router.push('/');
        }
    };

    return (
        <div className="min-h-screen bg-white dark:bg-dark-surface">
            <Navbar onNavigate={onNavigate} />
            <main>
                <Hero onNavigate={onNavigate} />
                <BentoFeaturesComoAjuda />
                <ComoFunciona onNavigate={onNavigate} />
                <ParaQuemVende />
                <GlobalScale />
                <ParaQuemCompra onNavigate={onNavigate} />
                <CTA onNavigate={onNavigate} />
            </main>
            <Footer onNavigate={onNavigate} />
        </div>
    );
}
