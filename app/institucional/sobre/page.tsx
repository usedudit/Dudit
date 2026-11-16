"use client";

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    Search,
    Store,
    CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/reusable/Button';
import { GridLines, SectionHeader, Navbar, Footer, CTA, FaqSection } from '@/components/InstitucionalShared';
import { INSTITUTIONAL_FAQ } from '@/lib/constants/institutional-faq';

const SobreHero = ({ onNavigate }: { onNavigate: (page: string) => void }) => (
    <section className="relative bg-white dark:bg-dark-surface pt-32 pb-20 overflow-hidden flex flex-col justify-center">
        <GridLines />
        <div className="flex-1 flex flex-col max-w-[1400px] w-full mx-auto px-4 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <h1 className="text-5xl font-bold text-brand-dark dark:text-dark-heading mb-6">
                        Um jeito mais simples de vender, gerenciar e ser encontrado em todo o Brasil.
                    </h1>
                    <p className="text-brand-inactive-text text-lg md:text-xl mb-8 max-w-lg leading-relaxed">
                        A Dudit conecta pessoas e negócios para descobrir, comprar, agendar, vender no balcão físico, na sua cidade e enviar para todo o país com 0% de comissão.
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
                    className="relative h-[400px] lg:h-[500px] flex items-center justify-center"
                >
                    <div className="relative z-10 w-full max-w-[460px]">
                        <img
                            src="https://img.dudit.com.br/static/mascots/OndeVoceEsta.png"
                            alt="Sobre Nós"
                            className="w-full h-auto object-contain"
                        />
                    </div>
                    <div className="absolute inset-0 bg-brand-gray/50 dark:bg-dark-border/30 rounded-[4rem] transform rotate-6 scale-90 -z-10"></div>
                    <div className="absolute inset-0 bg-brand-green/5 rounded-[4rem] transform -rotate-3 scale-95 -z-10"></div>
                </motion.div>
            </div>
        </div>
    </section>
);

const PorQueExiste = () => {
    return (
        <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <SectionHeader
                    subtitle="POR QUE A DUDIT EXISTE?"
                    title="Hoje muita coisa acontece espalhada"
                />

                <div className="grid md:grid-cols-2 gap-12 items-center">
                    <div>
                        <p className="text-brand-dark dark:text-dark-heading text-lg md:text-xl font-medium leading-relaxed mb-6">
                            Vender produtos, oferecer serviços ou divulgar uma empresa nem sempre é simples.
                        </p>
                        <p className="text-brand-inactive-text text-base leading-relaxed mb-6">
                            Muitas vezes as pessoas procuram no Instagram, no WhatsApp, em grupos ou dependem de marketplaces tradicionais com taxas abusivas de 12% a 20%. Por outro lado, quem vende fica refém de softwares caros ou limitados a clientes que passam na porta.
                        </p>
                        <p className="text-brand-inactive-text text-base leading-relaxed">
                            <strong className="text-brand-dark dark:text-dark-heading">A Dudit nasceu para unir comércio de proximidade e alcance nacional com 0% de comissão:</strong> permitindo que clientes da sua cidade retirem no balcão ou recebam via motoboy, e que você envie pedidos para qualquer estado do Brasil com cálculo de frete automático por transportadoras e Correios.
                        </p>
                    </div>

                    <div className="bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border p-8 rounded-2xl relative">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 bg-white dark:bg-dark-surface p-3.5 rounded-xl border border-gray-100 dark:border-dark-border shadow-xs">
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">1</div>
                                <div className="text-xs text-brand-dark dark:text-dark-heading font-semibold">Quem compra: acha produtos locais ou com entrega para todo o Brasil</div>
                            </div>
                            <div className="flex items-center gap-3 bg-white dark:bg-dark-surface p-3.5 rounded-xl border border-gray-100 dark:border-dark-border shadow-xs">
                                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-700 dark:text-green-300 font-bold text-xs">2</div>
                                <div className="text-xs text-brand-dark dark:text-dark-heading font-semibold">Quem vende: ganha vitrine com 0% de comissão, entrega local e frete nacional</div>
                            </div>
                            <div className="flex items-center gap-3 bg-white dark:bg-dark-surface p-3.5 rounded-xl border border-gray-100 dark:border-dark-border shadow-xs">
                                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-xs">3</div>
                                <div className="text-xs text-brand-dark dark:text-dark-heading font-semibold">Quem organiza: PDV balcão, estoque com grade, OS e agendamentos</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

const BentoPillars = () => {
    const cards = [
        {
            title: "Para quem procura",
            subtitle: "DESCOBERTA",
            description: "Encontrar produtos locais ou com frete nacional para todo o Brasil, agendar serviços e comprar com contato direto.",
            type: "buy"
        },
        {
            title: "Para quem vende",
            subtitle: "VISIBILIDADE E ALCANCE",
            description: "Vender presencialmente no PDV, online na sua cidade ou despachar para todo o país com 0% de comissão por venda.",
            type: "sell"
        },
        {
            title: "Para quem organiza",
            subtitle: "GESTÃO COMPLETA",
            description: "Frente de caixa (PDV), controle de estoque com variações, ordens de serviço e agendamentos sem complexidade.",
            type: "organize"
        }
    ];

    return (
        <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <SectionHeader
                    subtitle="UMA PLATAFORMA PARA TODOS"
                    title="Feita para pessoas e negócios"
                />
                <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
                    Três pilares fundamentais pensados para aproximar e facilitar o dia a dia.
                </p>

                <div className="grid md:grid-cols-3 gap-8">
                    {cards.map((card, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            viewport={{ once: true }}
                            className="group flex flex-col justify-between"
                        >
                            <div className="bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border h-64 rounded-xl overflow-hidden relative p-6 flex items-center justify-center">
                                {card.type === 'buy' && (
                                    <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50 dark:border-dark-border">
                                            <Search className="w-4 h-4 text-brand-green" />
                                            <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">O que você precisa hoje</span>
                                        </div>
                                        <div className="space-y-2 text-[10px]">
                                            <div className="bg-gray-50 dark:bg-dark-border/30 p-2 rounded flex justify-between font-medium">
                                                <span>Lojas e Mercados</span>
                                                <span className="text-brand-green font-bold">Perto de mim</span>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-dark-border/30 p-2 rounded flex justify-between font-medium">
                                                <span>Envio Nacional</span>
                                                <span className="text-blue-600 dark:text-blue-400 font-bold">Todo o Brasil</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {card.type === 'sell' && (
                                    <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50 dark:border-dark-border">
                                            <Store className="w-4 h-4 text-brand-dark dark:text-dark-heading" />
                                            <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Vitrine Aberta</span>
                                        </div>
                                        <div className="text-center py-2">
                                            <div className="text-xs font-bold text-brand-dark dark:text-dark-heading">dudit.com.br/sualoja</div>
                                            <div className="text-[10px] text-brand-green font-semibold mt-1">0% de comissão sobre vendas</div>
                                        </div>
                                    </div>
                                )}
                                {card.type === 'organize' && (
                                    <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-lg border border-gray-100 dark:border-dark-border text-xs">
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-50 dark:border-dark-border">
                                            <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                            <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Gestão do seu jeito</span>
                                        </div>
                                        <div className="space-y-1.5 text-[10px] text-brand-inactive-text">
                                            <div className="flex justify-between"><span>Estoque</span><span className="text-brand-dark dark:text-dark-heading font-bold">Organizado</span></div>
                                            <div className="flex justify-between"><span>Agenda</span><span className="text-brand-dark dark:text-dark-heading font-bold">Disponível</span></div>
                                            <div className="flex justify-between"><span>Financeiro</span><span className="text-brand-green font-bold">Sob controle</span></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="pt-6">
                                <span className="text-xs font-bold text-brand-green block mb-1">{card.subtitle}</span>
                                <h4 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-2">{card.title}</h4>
                                <p className="text-brand-inactive-text text-sm leading-relaxed">{card.description}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

const SemComplicacao = () => {
    return (
        <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <div className="flex flex-col lg:flex-row min-h-[500px] rounded-3xl overflow-hidden shadow-xl">
                    <div className="flex-1 bg-brand-dark p-12 lg:p-16 flex flex-col justify-center relative z-10">
                        <span className="text-brand-green text-xs uppercase tracking-widest font-bold mb-4 block">SEM COMPLICAÇÃO</span>
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
                            A Dudit não precisa substituir tudo que você já usa.
                        </h2>
                        <p className="text-brand-inactive-text text-base md:text-lg mb-8 max-w-md leading-relaxed">
                            Continue usando suas ferramentas favoritas. O Instagram para postar fotos, o WhatsApp para conversar. A Dudit é mais uma forma de ser encontrado, vender para qualquer lugar do Brasil e organizar o que precisar.
                        </p>
                    </div>

                    <div className="flex-1 bg-brand-green relative overflow-hidden flex items-center justify-center p-12">
                        <div className="relative z-10 w-full max-w-[340px] space-y-4">
                            <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center gap-3 shadow-md">
                                <div className="w-10 h-10 rounded-full bg-pink-50 dark:bg-pink-950/40 flex items-center justify-center text-pink-600 dark:text-pink-400 font-bold">📸</div>
                                <div>
                                    <div className="text-xs font-bold text-brand-dark dark:text-dark-heading">Instagram</div>
                                    <div className="text-[10px] text-brand-inactive-text">Coloque seu link Dudit na bio</div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center gap-3 shadow-md">
                                <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-950/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold">💬</div>
                                <div>
                                    <div className="text-xs font-bold text-brand-dark dark:text-dark-heading">WhatsApp</div>
                                    <div className="text-[10px] text-brand-inactive-text">Receba pedidos organizados na hora</div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center gap-3 shadow-md">
                                <div className="w-10 h-10 rounded-full bg-brand-green/20 flex items-center justify-center text-brand-dark dark:text-dark-heading font-bold">🏪</div>
                                <div>
                                    <div className="text-xs font-bold text-brand-dark dark:text-dark-heading">Dudit</div>
                                    <div className="text-[10px] text-brand-inactive-text">Vendas no balcão, na cidade e em todo o Brasil</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default function SobrePage() {
    const router = useRouter();

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio');
        else if (page === 'start-selling') router.push('/auth/login?mode=partner');
        else if (page === 'explore') router.push('/explorar');
        else if (page === 'segments') router.push('/institucional/segmentos');
        else if (page === 'pricing') router.push('/institucional/planos');
        else if (page === 'terms') router.push('/institucional/termos');
        else if (page === 'privacidade') router.push('/institucional/privacidade');
        else if (page === 'about') router.push('/institucional/sobre');
        else router.push('/');
    };

    return (
        <div className="min-h-screen bg-white dark:bg-dark-surface">
            <Navbar onNavigate={onNavigate} />
            <main>
                <SobreHero onNavigate={onNavigate} />
                <PorQueExiste />
                <BentoPillars />
                <SemComplicacao />
                <FaqSection
                    title="Dúvidas Frequentes sobre a Dudit"
                    description="Tire suas dúvidas sobre alcance local e nacional, taxas, entrega e ferramentas de gestão da Dudit."
                    items={INSTITUTIONAL_FAQ}
                />
                <CTA onNavigate={onNavigate} />
            </main>
            <Footer onNavigate={onNavigate} />
        </div>
    );
}
