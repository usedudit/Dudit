"use client";

import { useRouter } from 'next/navigation';
import { Button } from '@/components/reusable/Button';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
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
    Star,
    Package,
    Tag,
    Clock,
    DollarSign,
    Sparkles
} from 'lucide-react';
import { GridLines, SectionHeader, Navbar, Footer, CTA } from '../../../components/InstitucionalShared';

const Hero = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    return (
        <section className="relative bg-white pt-32 pb-20 overflow-hidden flex flex-col justify-center">
            <GridLines />
            <div className="flex-1 flex flex-col container mx-auto px-4 lg:px-6 max-w-[1300px] w-full">
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <span className="text-brand-green text-sm font-bold tracking-[0.2em] uppercase mb-4 block">Dudit</span>
                        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold text-brand-dark leading-[0.95] mb-6">
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
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
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
                                    <div className="bg-white p-4 w-full max-w-[220px] rounded-lg border border-gray-100 text-xs shadow-sm">
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
                                    <div className="bg-white p-4 w-full max-w-[220px] rounded-lg border border-gray-100 text-xs shadow-sm">
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
                                    <div className="bg-white p-4 w-full max-w-[220px] rounded-lg border border-gray-100 text-xs shadow-sm">
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
                                    <div className="bg-white p-4 w-full max-w-[220px] rounded-lg border border-gray-100 text-xs shadow-sm">
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
        { icon: Search, title: "Encontre produtos", desc: "Comprar novos ou usados perto de você" },
        { icon: Wrench, title: "Descubra serviços", desc: "Profissionais e técnicos da sua região" },
        { icon: ShoppingBag, title: "Comida & Doces", desc: "Confeitarias, marmitas e lanches locais" },
        { icon: Calendar, title: "Agende fácil", desc: "Horários sem burocracia e sem espera" },
        { icon: MessageCircle, title: "Converse direto", desc: "Tire dúvidas no WhatsApp de quem vende" },
    ];

    return (
        <section className="relative py-24 bg-white overflow-hidden border-t border-gray-100">
            <GridLines />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <SectionHeader
                    subtitle="PARA QUEM PROCURA"
                    title="O que você procura?"
                />
                <p className="text-brand-inactive-text max-w-3xl mb-12 text-lg -mt-8 leading-relaxed">
                    Comprar algo novo ou usado, encontrar um serviço, descobrir negócios próximos ou resolver uma necessidade do dia a dia. <strong className="text-brand-dark font-semibold">Quando precisar de alguma coisa, dê uma olhada na Dudit.</strong>
                </p>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
                    {items.map((item, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.08 }}
                            className="bg-white border border-gray-100 rounded-xl p-5 text-center hover:border-brand-green/30 hover:shadow-sm transition-all group"
                        >
                            <div className="w-10 h-10 bg-brand-green/10 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-brand-green/20 transition-colors">
                                <item.icon className="w-5 h-5 text-brand-dark" />
                            </div>
                            <h4 className="text-sm font-bold text-brand-dark mb-0.5">{item.title}</h4>
                            <p className="text-xs text-brand-inactive-text">{item.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const ParaQuemVende = () => {
    const items = [
        { icon: Store, title: "Mais uma vitrine", desc: "Chegue até mais pessoas da sua cidade" },
        { icon: MessageCircle, title: "Contato direto", desc: "Clientes chamam no WhatsApp ou compram na vitrine" },
        { icon: TrendingUp, title: "Sem comissão", desc: "100% do lucro da venda fica com você" },
        { icon: Layout, title: "Link na bio", desc: "Catálogo limpo para compartilhar nas redes" },
    ];

    return (
        <section className="relative py-24 bg-white overflow-hidden border-t border-gray-100">
            <GridLines />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <SectionHeader
                    subtitle="MAIS UMA PORTA ABERTA"
                    title="Seu negócio também pode ser encontrado na Dudit"
                />
                <p className="text-brand-inactive-text max-w-3xl mb-12 text-lg -mt-8 leading-relaxed">
                    Você já usa Instagram e WhatsApp? Continue usando. A Dudit é mais uma vitrine para seus produtos e serviços chegarem até mais pessoas. <strong className="text-brand-dark font-semibold">A Dudit é mais uma porta para clientes encontrarem você.</strong>
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                    {items.map((item, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className="bg-white border border-gray-100 rounded-xl p-6 text-center hover:border-brand-green/30 hover:shadow-sm transition-all group"
                        >
                            <div className="w-12 h-12 bg-brand-green/10 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-brand-green/20 transition-colors">
                                <item.icon className="w-6 h-6 text-brand-dark" />
                            </div>
                            <h4 className="text-base font-bold text-brand-dark mb-1">{item.title}</h4>
                            <p className="text-sm text-brand-inactive-text">{item.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const SolutionsOrganize = () => {
    return (
        <section id="solutions" className="relative py-24 bg-white overflow-hidden border-t border-gray-100">
            <GridLines />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <SectionHeader
                    subtitle="COMPLEMENTAR E LEVE"
                    title="Se quiser organizar seu negócio, a Dudit também ajuda"
                />

                <p className="text-brand-inactive-text max-w-3xl mb-20 text-lg">
                    Comece pela vitrine. Organize do seu jeito. Sem sistemas pesados: controle estoque, clientes, financeiro e ordens de serviço apenas se fizer sentido para você.
                </p>

                {/* Feature 1: Vitrine Online */}
                <div className="grid md:grid-cols-2 gap-16 mb-32 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-white p-8 border border-gray-100 rounded-2xl relative"
                    >
                        <div className="space-y-6">
                            <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100 w-fit">
                                <div className="px-6 py-1.5 bg-white text-brand-dark text-sm font-semibold rounded-md shadow-sm">Produto</div>
                                <div className="px-6 py-1.5 text-brand-inactive-text text-sm font-medium">Serviço</div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-brand-dark mb-1.5">Nome do item ou serviço</label>
                                <input disabled type="text" value="Bolo de Pote ou Corte de Cabelo" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-brand-dark bg-gray-50" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-brand-dark mb-1.5">Preço na Vitrine</label>
                                <div className="border border-gray-200 rounded-md overflow-hidden bg-gray-50">
                                    <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
                                        <span className="text-sm text-brand-dark">R$ 25,00</span>
                                    </div>
                                </div>
                            </div>
                            <button className="w-full bg-[#009660] hover:bg-[#007b4f] text-white font-semibold py-2.5 rounded-lg transition-colors">
                                Publicar na Minha Vitrine
                            </button>
                        </div>

                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            whileInView={{ scale: 1, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="absolute -right-8 -bottom-12 bg-white rounded-xl border border-gray-200 w-56 hidden lg:flex flex-col overflow-hidden"
                        >
                            <div className="bg-gray-50 border-b border-gray-100 p-3 flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-brand-red"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                                <div className="w-3 h-3 rounded-full bg-brand-green"></div>
                                <div className="mx-auto w-24 h-2 bg-gray-200 rounded-full"></div>
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-3 relative bg-white pb-8">
                                <div className="bg-gray-100 aspect-square rounded-xl"></div>
                                <div className="bg-gray-100 aspect-square rounded-xl"></div>
                                <div className="bg-gray-100 aspect-square rounded-xl"></div>
                                <div className="bg-gray-100 aspect-square rounded-xl"></div>

                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#003828] text-white text-xs font-bold px-4 py-2.5 rounded-full whitespace-nowrap">
                                    vitrine.dudit.com/sualoja
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                    >
                        <span className="text-brand-inactive-text uppercase tracking-wider text-sm font-semibold mb-2 block">VITRINE DIGITAL</span>
                        <h3 className="text-4xl font-bold text-brand-dark mb-6">Sua vitrine online pronta em minutos</h3>
                        <p className="text-brand-inactive-text mb-8 leading-relaxed">
                            Cadastre seus produtos ou serviços e receba um link exclusivo para compartilhar no Instagram ou WhatsApp. Venda para o seu bairro e seja descoberto por mais clientes.
                        </p>
                        <Button>
                            Começar grátis <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </motion.div>
                </div>

                {/* Feature 2: Feita para o dia a dia */}
                <div className="grid md:grid-cols-2 gap-16 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="order-2 md:order-1"
                    >
                        <span className="text-brand-inactive-text uppercase tracking-wider text-sm font-semibold mb-2 block">SIMPLES E PRÁTICO</span>
                        <h3 className="text-4xl font-bold text-brand-dark mb-6">Feito para quem vende, atende ou produz</h3>
                        <p className="text-brand-inactive-text mb-8 leading-relaxed">
                            Seja você um artesão, prestador de serviços ou comerciante, a Dudit foi feita para ajudar a divulgar e organizar o dia a dia sem complicação técnica.
                        </p>
                        <Button>
                            Divulgar meu negócio <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="order-1 md:order-2 bg-gray-50/50 p-8 md:p-12 rounded-2xl relative h-96 flex items-center justify-center border border-gray-100"
                    >
                        <div className="relative w-full max-w-sm h-64">
                            <motion.div
                                className="absolute top-0 left-0 w-72 h-auto bg-white rounded-xl z-10 p-5 border border-gray-200 flex flex-col gap-4"
                                whileHover={{ y: -5 }}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <Layout className="w-4 h-4 text-brand-dark" />
                                    <span className="text-sm font-bold text-brand-dark">Resumo do Dia</span>
                                </div>

                                <div className="flex items-center gap-3 bg-green-50 p-2.5 rounded-lg border border-green-100">
                                    <div className="bg-green-500 p-1.5 rounded-full text-white">
                                        <MessageCircle size={14} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-brand-dark">Venda pelo WhatsApp</div>
                                        <div className="text-[10px] text-brand-inactive-text">Bolo de Pote • Cliente: Ana</div>
                                    </div>
                                    <div className="text-xs font-bold text-green-700">R$ 25</div>
                                </div>

                                <div className="flex items-center gap-3 bg-blue-50 p-2.5 rounded-lg border border-blue-100">
                                    <div className="bg-blue-500 p-1.5 rounded-full text-white">
                                        <Calendar size={14} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-brand-dark">Serviço Agendado</div>
                                        <div className="text-[10px] text-brand-inactive-text">Manutenção • Hoje, 14h</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                                    <div className="bg-gray-700 p-1.5 rounded-full text-white">
                                        <Store size={14} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-brand-dark">Venda no Balcão</div>
                                        <div className="text-[10px] text-brand-inactive-text">Camiseta Básica</div>
                                    </div>
                                    <div className="text-xs font-bold text-brand-dark">R$ 50</div>
                                </div>
                            </motion.div>

                            <motion.div
                                className="absolute -bottom-6 -right-6 bg-brand-green rounded-xl z-30 p-4 text-brand-dark flex items-center gap-3 border-2 border-white"
                                initial={{ y: 20, opacity: 0 }}
                                whileInView={{ y: 0, opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.3 }}
                            >
                                <div className="bg-white p-2 rounded-full">
                                    <CheckCircle2 size={20} className="text-brand-green" />
                                </div>
                                <div>
                                    <div className="text-sm font-bold">Tudo Organizado</div>
                                    <div className="text-[10px] font-medium opacity-80">Em um só lugar</div>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

const BentoManagementFeatures = () => {
    const cards = [
        {
            title: "Pedidos e Vendas",
            description: "Receba pedidos e envie orçamentos de forma organizada. Sem comissões escondidas.",
            type: "sales",
            colSpan: "col-span-1"
        },
        {
            title: "Estoque e Agenda",
            description: "Controle o que entra, o que sai e quem agendou, sem surpresas no fim do dia.",
            type: "stock",
            colSpan: "col-span-1"
        },
        {
            title: "Lucro Integral",
            description: "Acompanhe seu financeiro com clareza. Na Dudit, 100% do valor da venda fica com você.",
            type: "finance",
            colSpan: "col-span-1"
        }
    ];

    return (
        <section className="py-24 bg-white relative border-t border-gray-100">
            <GridLines />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <SectionHeader
                    subtitle="CONTROLE TRANSPARENTE"
                    title="Tudo o que você precisa, sem complicação"
                />
                <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
                    O essencial para o seu negócio rodar com tranquilidade, sem precisar de cursos para entender o sistema.
                </p>

                <div className="grid md:grid-cols-3 gap-8">
                    {cards.map((card, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            viewport={{ once: true }}
                            className={`${card.colSpan} group`}
                        >
                            <div className="bg-brand-slate border border-gray-100 h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center">
                                {card.type === 'sales' && (
                                    <div className="bg-white p-4 w-full max-w-[240px] rounded-lg border border-gray-100 text-xs">
                                        <div className="flex justify-between mb-4 border-b pb-2">
                                            <span className="text-brand-inactive-text">Novo pedido</span>
                                            <div className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold">PIX</div>
                                        </div>
                                        <div className="text-xl font-bold text-brand-dark mb-1">R$ 150,00</div>
                                        <div className="text-brand-inactive-text text-[10px] mb-4">Item da sua Vitrine</div>
                                        <button className="w-full bg-brand-dark text-white py-2 rounded text-[10px] font-medium">
                                            Ver na Vitrine
                                        </button>
                                    </div>
                                )}
                                {card.type === 'stock' && (
                                    <div className="relative w-full h-full flex justify-center items-center p-4">
                                        <div className="w-full max-w-[240px] bg-white rounded-lg border border-gray-100 p-3 flex flex-col gap-3">
                                            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                                                <div className="text-[10px] font-bold text-brand-inactive-text uppercase">Estoque & Agenda</div>
                                                <Calendar size={12} className="text-brand-inactive-text" />
                                            </div>

                                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 bg-brand-green/20 rounded flex items-center justify-center">
                                                        <Box size={10} className="text-brand-dark" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-bold text-brand-dark">Produto A</div>
                                                        <div className="text-[8px] text-brand-inactive-text">12 unidades</div>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">Em alta</div>
                                            </div>

                                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center">
                                                        <Calendar size={10} className="text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-bold text-brand-dark">Atendimento</div>
                                                        <div className="text-[8px] text-brand-inactive-text">Cliente: Marcos</div>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">14:00</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {card.type === 'finance' && (
                                    <div className="bg-white w-full max-w-[240px] rounded-lg p-4 border border-gray-100">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Seu Lucro</span>
                                            <PieChart size={14} className="text-brand-inactive-text" />
                                        </div>
                                        <div className="flex gap-2 items-end mb-2">
                                            <div className="w-3 bg-brand-green h-8 rounded-sm"></div>
                                            <div className="w-3 bg-brand-green h-12 rounded-sm"></div>
                                            <div className="w-3 bg-gray-200 h-6 rounded-sm"></div>
                                            <div className="w-3 bg-brand-green h-16 rounded-sm"></div>
                                            <div className="w-3 bg-brand-green h-10 rounded-sm"></div>
                                        </div>
                                        <div className="text-right text-xs font-bold text-brand-dark">+ 100% SEU</div>
                                    </div>
                                )}
                            </div>
                            <div className="pt-6">
                                <h4 className="text-xl font-bold text-brand-dark mb-2">{card.title}</h4>
                                <p className="text-brand-inactive-text text-sm leading-relaxed">{card.description}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const GlobalScale = () => {
    return (
        <section className="py-24 bg-white relative border-t border-gray-100">
            <GridLines />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
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

const UseCases = () => {
    const cases = [
        {
            text: "Uma loja de roupas que vendia pelo WhatsApp organizou o estoque e ganhou uma vitrine online para alcançar novos clientes.",
            type: "Loja de Roupas",
            icon: ShoppingBag
        },
        {
            text: "Uma oficina mecânica substituiu orçamentos de papel por ordens de serviço digitais com pagamento direto sem burocracia.",
            type: "Oficina Mecânica",
            icon: Wrench
        },
        {
            text: "Uma confeitaria local parou de perder pedidos no chat e agora recebe encomendas direto pela sua vitrine.",
            type: "Confeitaria Local",
            icon: Store
        }
    ];

    return (
        <section className="py-24 bg-white relative border-t border-gray-100">
            <GridLines />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <SectionHeader subtitle="FEITO PARA O SEU DIA A DIA" title="Como a Dudit transforma o dia a dia" />

                <div className="grid md:grid-cols-3 gap-8">
                    {cases.map((item, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: idx * 0.1 }}
                            className="bg-white border border-gray-100 p-8 rounded-2xl hover:border-brand-green/50 transition-colors"
                        >
                            <div className="w-12 h-12 bg-brand-green/20 rounded-full flex items-center justify-center mb-6">
                                <item.icon className="w-6 h-6 text-brand-dark" />
                            </div>
                            <p className="text-brand-dark text-lg font-medium mb-8 leading-relaxed">"{item.text}"</p>
                            <div className="text-sm font-bold text-brand-dark uppercase tracking-wider">{item.type}</div>
                        </motion.div>
                    ))}
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
                <SolutionsOrganize />
                <BentoManagementFeatures />
                <GlobalScale />
                <UseCases />
                <CTA onNavigate={onNavigate} />
            </main>
            <Footer onNavigate={onNavigate} />
        </div>
    );
}
