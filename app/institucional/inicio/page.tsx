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
        <section className="relative bg-white pt-32 pb-20 overflow-hidden flex flex-col justify-center">
            <GridLines />
            <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-0 max-w-[1400px] w-full">
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <h1 className="text-5xl font-bold text-brand-dark mb-6">
                            O que você precisa hoje pode estar na <span className="text-brand-green">Dudit.</span>
                        </h1>
                        <p className="text-brand-inactive-text text-lg md:text-xl mb-8 max-w-lg leading-relaxed">
                            Descubra produtos, serviços e negócios perto de você. Compre, anuncie ou agende de um jeito simples.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Button onClick={() => onNavigate('explore')}>Explorar Dudit</Button>
                            <Button variant="outline" onClick={() => onNavigate('start-selling')}>Começar grátis</Button>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="relative"
                    >
                        <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-xl">
                            <div className="bg-gray-50 p-3 border-b border-gray-100 flex items-center gap-2">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-brand-red"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-brand-green"></div>
                                </div>
                                <div className="bg-white px-3 py-1 rounded text-[10px] text-brand-inactive-text flex-1 text-center font-mono border border-gray-100">dudit.com.br</div>
                            </div>
                            <div className="p-6 space-y-3">
                                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <ShoppingBag className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-brand-dark">Descubra</div>
                                        <div className="text-xs text-brand-inactive-text">Produtos, serviços e negócios perto de você</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                        <Store className="w-4 h-4 text-green-600" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-brand-dark">Anuncie</div>
                                        <div className="text-xs text-brand-inactive-text">Seja descoberto por mais pessoas</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-100">
                                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                        <CheckCircle2 className="w-4 h-4 text-purple-600" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-brand-dark">Organize</div>
                                        <div className="text-xs text-brand-inactive-text">Gestão simples para o seu dia a dia</div>
                                    </div>
                                </div>
                                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                                    <div className="text-center">
                                        <div className="text-xl font-bold text-brand-green">0%</div>
                                        <div className="text-[10px] text-brand-inactive-text">comissão</div>
                                    </div>
                                    <div className="h-8 w-px bg-gray-100"></div>
                                    <div className="text-center">
                                        <div className="text-xl font-bold text-brand-dark">100%</div>
                                        <div className="text-[10px] text-brand-inactive-text">do lucro é seu</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <motion.div
                            className="absolute -right-4 md:-right-8 -bottom-6 w-44 bg-white rounded-2xl p-4 border border-gray-100 shadow-lg hidden md:block"
                            animate={{ y: [0, -10, 0] }}
                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 bg-brand-green/20 rounded-full flex items-center justify-center">
                                    <TrendingUp className="w-4 h-4 text-brand-dark" />
                                </div>
                                <div className="text-xs font-bold text-brand-dark">Nova venda</div>
                            </div>
                            <div className="bg-brand-green/10 rounded-lg p-2 text-xs">
                                <div className="flex justify-between font-bold text-brand-dark">
                                    <span>Você recebe</span>
                                    <span className="text-brand-green">R$ 150,00</span>
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
            title: "Precisa de alguma coisa?",
            subtitle: "PARA QUEM PROCURA",
            description: "Encontrar lojas, produtos, serviços e oportunidades perto de você.",
            type: "buy"
        },
        {
            title: "Tem algo para vender?",
            subtitle: "DESAPEGOS E PRODUTOS",
            description: "Anuncie produtos, serviços ou qualquer coisa de forma simples.",
            type: "sell"
        },
        {
            title: "Tem um negócio?",
            subtitle: "PARA EMPREENDEDORES",
            description: "Mostre o que você vende e facilite para clientes encontrarem você.",
            type: "store"
        },
        {
            title: "Precisa marcar um horário?",
            subtitle: "AGENDAMENTOS",
            description: "Encontre profissionais e agende serviços na hora, sem espera.",
            type: "schedule"
        }
    ];

    return (
        <section className="py-24 bg-white relative border-t border-gray-100">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                <SectionHeader
                    subtitle="RESOLVER O QUE VOCÊ PRECISA HOJE"
                    title="O que dá pra fazer na Dudit"
                />
                <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
                    A Dudit conecta o que as pessoas procuram com o que os negócios e profissionais oferecem.
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
                            <div className="bg-brand-slate border border-gray-100 h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center">
                                {card.type === 'buy' && (
                                    <div className="bg-white p-4 w-full max-w-[220px] rounded-lg border border-gray-100 text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50">
                                            <Search className="w-3.5 h-3.5 text-brand-green" />
                                            <span className="text-[10px] font-bold text-brand-dark">Buscar na sua cidade</span>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="bg-gray-50 p-2 rounded flex items-center justify-between">
                                                <span className="text-[10px] text-brand-dark font-medium">Bolo Caseiro</span>
                                                <span className="text-[8px] text-brand-green font-bold">600m</span>
                                            </div>
                                            <div className="bg-gray-50 p-2 rounded flex items-center justify-between">
                                                <span className="text-[10px] text-brand-dark font-medium">Oficina Mecânica</span>
                                                <span className="text-[8px] text-blue-600 font-bold">1.2 km</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {card.type === 'sell' && (
                                    <div className="bg-white p-4 w-full max-w-[220px] rounded-lg border border-gray-100 text-xs">
                                        <div className="flex justify-between mb-3 border-b border-gray-50 pb-2">
                                            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Novo anúncio</span>
                                            <div className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[8px] font-bold">Ativo</div>
                                        </div>
                                        <div className="text-sm font-bold text-brand-dark mb-0.5">Violão Seminovo</div>
                                        <div className="text-brand-green font-extrabold text-xs mb-3">R$ 280,00</div>
                                        <div className="w-full bg-brand-green text-white py-1.5 rounded text-[9px] font-bold text-center flex items-center justify-center gap-1">
                                            <MessageCircle size={10} /> Chamar no WhatsApp
                                        </div>
                                    </div>
                                )}

                                {card.type === 'store' && (
                                    <div className="bg-white p-4 w-full max-w-[220px] rounded-lg border border-gray-100 text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50">
                                            <Store className="w-4 h-4 text-brand-dark" />
                                            <span className="text-[10px] font-bold text-brand-dark">Sua Vitrine Online</span>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded text-[9px] font-mono text-brand-inactive-text mb-2 text-center">
                                            dudit.com.br/sualoja
                                        </div>
                                        <div className="bg-brand-green/10 text-brand-green text-[9px] font-bold py-1 rounded text-center">
                                            Aberta para clientes locais
                                        </div>
                                    </div>
                                )}

                                {card.type === 'schedule' && (
                                    <div className="bg-white p-4 w-full max-w-[220px] rounded-lg border border-gray-100 text-xs">
                                        <div className="flex justify-between items-center mb-3 border-b border-gray-50 pb-2">
                                            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Agenda Hoje</span>
                                            <Calendar size={12} className="text-brand-inactive-text" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center bg-blue-50 p-1.5 rounded text-[10px]">
                                                <span className="font-bold text-blue-800">14:00 - Corte</span>
                                                <span className="text-blue-600 font-semibold text-[8px]">Disponível</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-gray-50 p-1.5 rounded text-[10px]">
                                                <span className="font-bold text-brand-dark">16:30 - Manutenção</span>
                                                <span className="text-brand-green font-semibold text-[8px]">Agendar</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="pt-5">
                                <span className="text-[10px] font-bold text-brand-green uppercase tracking-wider block mb-1">{card.subtitle}</span>
                                <h4 className="text-lg font-bold text-brand-dark mb-1">{card.title}</h4>
                                <p className="text-brand-inactive-text text-xs leading-relaxed">{card.description}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const ParaQuemCompra = () => {
    const items = [
        {
            icon: Search,
            title: "Encontre o que precisa",
            desc: "Comprar novos ou usados, encontrar serviços, descobrir negócios próximos ou resolver uma necessidade do dia a dia. Quando precisar de alguma coisa, dê uma olhada na Dudit.",
        },
        {
            icon: ShoppingBag,
            title: "Produtos & Serviços",
            desc: "De eletrônicos a roupas, de marmitas a encanadores. Tudo organizado para você encontrar rápido o que precisa, perto de você.",
        },
        {
            icon: MessageCircle,
            title: "Contato direto",
            desc: "Tire dúvidas no WhatsApp de quem vende, compare opções e feche o negócio sem burocracia. Direto com o vendedor.",
        },
    ];

    return (
        <section className="relative py-24 bg-white overflow-hidden border-t border-gray-100">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                <SectionHeader
                    subtitle="PARA QUEM PROCURA"
                    title="O que você procura?"
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 mt-8">
                    {items.map((item, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className={`py-8 px-8 ${idx < items.length - 1 ? 'md:border-r md:border-dashed md:border-gray-200' : ''} ${idx < items.length - 1 ? 'border-b md:border-b-0 border-dashed border-gray-200' : ''}`}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-brand-dark rounded-xl flex items-center justify-center">
                                    <item.icon className="w-5 h-5 text-white" />
                                </div>
                                <h4 className="text-lg font-bold text-brand-dark">{item.title}</h4>
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
            desc: "Chegue até mais pessoas da sua cidade. Sua loja aparece para quem está procurando exatamente o que você vende.",
        },
        {
            num: "02",
            title: "Contato direto",
            desc: "Clientes chamam no WhatsApp ou compram direto na sua vitrine. Sem intermediários, sem complicação.",
        },
        {
            num: "03",
            title: "Sem comissão",
            desc: "100% do lucro da venda fica com você. A Dudit cobra apenas uma taxa fixa mensal, sem surpresas.",
        },
        {
            num: "04",
            title: "Link na bio",
            desc: "Tenha um catálogo limpo e profissional para compartilhar nas suas redes sociais. Seu link único para usar no Instagram.",
        },
    ];

    return (
        <section className="relative py-24 bg-white overflow-hidden border-t border-gray-100">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    {/* Lado esquerdo: Imagem */}
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="relative"
                    >
                        <div className="bg-[#eaf7f0] rounded-3xl p-6 md:p-10">
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
                                            parent.innerHTML = '<div class="w-full bg-[#eaf7f0] flex items-center justify-center"></div>';
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
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-brand-dark mb-6">
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
                                        className={`border-t border-gray-200 ${idx === items.length - 1 ? 'border-b' : ''}`}
                                    >
                                        <button
                                            onClick={() => setOpenIndex(isOpen ? null : idx)}
                                            className="w-full flex items-center gap-4 py-5 text-left group cursor-pointer"
                                        >
                                            <span className="text-sm font-medium text-brand-inactive-text w-8 shrink-0">
                                                {item.num}.
                                            </span>
                                            <span className={`text-lg font-bold flex-1 transition-colors ${isOpen ? 'text-brand-dark' : 'text-brand-dark group-hover:text-brand-green'}`}>
                                                {item.title}
                                            </span>
                                            <ChevronDown
                                                className={`w-5 h-5 text-brand-inactive-text transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                                            />
                                        </button>
                                        <AnimatePresence initial={false}>
                                            {isOpen && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                                    className="overflow-hidden"
                                                >
                                                    <p className="text-brand-inactive-text text-sm leading-relaxed pb-5 pl-12 pr-8">
                                                        {item.desc}
                                                    </p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
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
        <section className="py-24 bg-white relative border-t border-gray-100">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 lg:px-0 relative z-10">
                <div className="flex flex-col lg:flex-row min-h-[600px] rounded-3xl overflow-hidden shadow-xl">
                    <div className="flex-1 bg-brand-dark p-12 lg:p-16 flex flex-col justify-center relative z-10">
                        <div className="absolute inset-0 pointer-events-none z-0 flex justify-center w-full h-full opacity-20">
                            <div className="w-px h-full bg-white/10 mx-auto hidden md:block" />
                            <div className="w-px h-full bg-white/10 mx-auto hidden md:block" />
                            <div className="w-px h-full bg-white/10 mx-auto hidden md:block" />
                        </div>

                        <div className="relative z-10 text-white">
                            <span className="text-brand-green text-xs uppercase tracking-widest font-bold mb-4 block">SUA VENDA, SEU LUCRO.</span>
                            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">Você vende. <br />Você recebe. <br />O lucro é 100% seu.</h2>
                            <p className="text-brand-inactive-text text-lg mb-12 max-w-md leading-relaxed">
                                A Dudit é mais uma vitrine para o seu negócio ser encontrado. Sem taxas escondidas e sem porcentagem sobre as suas vendas.
                            </p>

                            <div className="flex gap-12 pt-8">
                                <div>
                                    <div className="text-3xl font-bold text-brand-green mb-1">0%</div>
                                    <div className="text-brand-inactive-text text-xs">de comissão por venda</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-bold text-brand-green mb-1">100%</div>
                                    <div className="text-brand-inactive-text text-xs">de autonomia para você</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 bg-brand-green relative overflow-hidden flex items-center justify-center p-12">
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-white/20 rounded-full opacity-30"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] border border-white/20 rounded-full opacity-30"></div>
                        </div>

                        <div className="relative z-10 w-full h-full min-h-[400px]">
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.1, duration: 0.5 }}
                                viewport={{ once: true }}
                                className="absolute top-[10%] left-0 lg:left-[5%] bg-white rounded-2xl p-4 pr-8 flex items-center gap-4 max-w-[280px]"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                                    <Store size={20} className="text-brand-inactive-text" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-brand-inactive-text"><span className="font-bold text-brand-dark">Oficina do Seu Manoel</span> vendeu</p>
                                    <p className="text-sm text-brand-dark font-bold mt-0.5">Troca de Óleo</p>
                                </div>
                                <div className="text-brand-green font-bold text-sm">R$ 180,00</div>
                            </motion.div>

                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.3, duration: 0.5 }}
                                viewport={{ once: true }}
                                className="absolute top-[40%] right-0 lg:right-[5%] bg-white rounded-2xl p-4 pr-8 flex items-center gap-4 max-w-[320px]"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                                    <User size={20} className="text-brand-inactive-text" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-brand-inactive-text"><span className="font-bold text-brand-dark">Ana Bolos</span> agendou</p>
                                    <p className="text-sm text-brand-dark font-bold mt-0.5">Bolo de Festa</p>
                                </div>
                                <div className="text-brand-green font-bold text-sm">R$ 120,00</div>
                            </motion.div>

                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5, duration: 0.5 }}
                                viewport={{ once: true }}
                                className="absolute bottom-[10%] left-0 lg:left-[10%] bg-white rounded-2xl p-4 pr-8 flex items-center gap-4 max-w-[280px]"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                                    <ShoppingBag size={20} className="text-brand-inactive-text" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-brand-inactive-text"><span className="font-bold text-brand-dark">Loja de Roupas</span> vendeu</p>
                                    <p className="text-sm text-brand-dark font-bold mt-0.5">Camiseta Branca</p>
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
        else if (page === 'explore') router.push('/');
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
        <div className="min-h-screen bg-white">
            <Navbar onNavigate={onNavigate} />
            <main>
                <Hero onNavigate={onNavigate} />
                <BentoFeaturesComoAjuda />
                <ParaQuemCompra />
                <ParaQuemVende />
                <GlobalScale />
                <CTA onNavigate={onNavigate} />
            </main>
            <Footer onNavigate={onNavigate} />
        </div>
    );
}
