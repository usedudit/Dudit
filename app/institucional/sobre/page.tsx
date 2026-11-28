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
import { InstagramIcon, WhatsappIcon } from '@/lib/icons';

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
                    <h1 className="text-4xl md:text-5xl font-bold text-brand-dark dark:text-dark-heading mb-6 leading-tight">
                        A plataforma de vendas e gestão para negócios locais e nacionais — com 0% de comissão.
                    </h1>
                    <p className="text-brand-inactive-text text-lg md:text-xl mb-8 max-w-lg leading-relaxed">
                        Venda pelo catálogo online, no balcão (PDV) ou pelo WhatsApp, entregue na sua cidade ou envie para todo o Brasil — e ative estoque, agenda e ordens de serviço só quando precisar.
                    </p>
                    <div className="flex flex-wrap gap-4">
                        <Button onClick={() => onNavigate('start-selling')}>Começar grátis</Button>
                        <Button variant="outline" onClick={() => onNavigate('explore')}>Explorar Dudit</Button>
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
                            alt="Mascote da Dudit representando vendas locais e entregas para todo o Brasil"
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

const PorQueExiste = ({ onNavigate }: { onNavigate: (page: string) => void }) => {
    return (
        <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <SectionHeader
                    subtitle="POR QUE CRIAMOS A DUDIT"
                    title="Vender e organizar um negócio não precisava ser tão caro nem tão espalhado"
                />

                <div className="grid md:grid-cols-2 gap-12 items-center">
                    <div>
                        <p className="text-brand-dark dark:text-dark-heading text-lg md:text-xl font-medium leading-relaxed mb-6">
                            A Dudit nasceu de uma dor muito real de quem empreende no Brasil: vender online sem abrir mão da própria margem.
                        </p>
                        <p className="text-brand-inactive-text text-base leading-relaxed mb-6">
                            Hoje, quem tem loja ou presta serviço acaba preso entre atender pedidos soltos no WhatsApp e Instagram ou depender de marketplaces tradicionais que costumam cobrar entre 12% e 20% por venda. Do outro lado, sistemas de gestão costumam ser caros, engessados ou desconectados da vitrine online.
                        </p>
                        <p className="text-brand-inactive-text text-base leading-relaxed mb-6">
                            <strong className="text-brand-dark dark:text-dark-heading">Criamos a Dudit para unir vendas locais, envio nacional e gestão simples em um só lugar:</strong> seus clientes da cidade podem retirar no balcão ou receber por entrega local, e você também despacha para qualquer estado do Brasil com cálculo automático de frete.
                        </p>
                        <div className="p-4 rounded-xl bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border text-sm text-brand-inactive-text leading-relaxed">
                            <strong className="text-brand-dark dark:text-dark-heading">Como a Dudit ganha dinheiro?</strong> Cobramos <strong className="text-brand-dark dark:text-dark-heading">0% de comissão</strong> sobre suas vendas e nos sustentamos apenas pela assinatura dos planos (com opção gratuita para começar). Em pagamentos online integrados, aplicam-se somente as taxas do meio de pagamento escolhido.{' '}
                            <button
                                type="button"
                                onClick={() => onNavigate('pricing')}
                                className="text-brand-green font-semibold hover:underline cursor-pointer"
                            >
                                Ver planos e preços →
                            </button>
                        </div>
                    </div>

                    <div className="bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border p-8 rounded-2xl relative">
                        <div className="space-y-4">
                            <div className="flex items-start gap-3.5 bg-white dark:bg-dark-surface p-4 rounded-xl border border-gray-100 dark:border-dark-border shadow-xs">
                                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-700 dark:text-green-300 font-bold text-xs shrink-0 mt-0.5">1</div>
                                <div>
                                    <div className="text-sm text-brand-dark dark:text-dark-heading font-bold mb-1">Para quem vende e gerencia</div>
                                    <div className="text-xs text-brand-inactive-text leading-relaxed">Vitrine online com 0% de comissão da Dudit, entrega local e frete nacional — integrada a PDV balcão, estoque com grade, ordens de serviço e agendamentos.</div>
                                </div>
                            </div>
                            <div className="flex items-start gap-3.5 bg-white dark:bg-dark-surface p-4 rounded-xl border border-gray-100 dark:border-dark-border shadow-xs">
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs shrink-0 mt-0.5">2</div>
                                <div>
                                    <div className="text-sm text-brand-dark dark:text-dark-heading font-bold mb-1">Para quem compra</div>
                                    <div className="text-xs text-brand-inactive-text leading-relaxed">Descobre lojas, produtos e serviços por perto ou com entrega para todo o Brasil, compra direto no catálogo ou fala no WhatsApp sem intermediários.</div>
                                </div>
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
            title: "Vitrine local e nacional",
            subtitle: "VENDAS COM 0% DE COMISSÃO",
            description: "Venda presencialmente no balcão, entregue na sua cidade ou despache para todo o Brasil sem pagar comissão por pedido para a Dudit.",
            type: "sell"
        },
        {
            title: "Gestão no mesmo lugar",
            subtitle: "PDV, ESTOQUE E AGENDA",
            description: "Frente de caixa (PDV), controle de estoque com variações, ordens de serviço e agendamentos integrados — ative só o que o seu negócio usa.",
            type: "organize"
        },
        {
            title: "Descoberta para clientes",
            subtitle: "PARA QUEM COMPRA",
            description: "Clientes encontram lojas e prestadores por perto ou com envio nacional, agendam serviços e compram com contato direto.",
            type: "buy"
        }
    ];

    return (
        <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-gray-100 dark:border-dark-border">
            <GridLines />
            <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                <SectionHeader
                    subtitle="COMO A DUDIT FUNCIONA"
                    title="Uma base única para vender, organizar e ser encontrado"
                />
                <p className="text-brand-inactive-text max-w-2xl mb-16 text-lg -mt-8">
                    Comece pelo que você precisa hoje — catálogo online, PDV ou agenda — e ative os outros módulos conforme o seu negócio cresce.
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
                                <div className="w-10 h-10 rounded-full bg-pink-50 dark:bg-pink-950/40 flex items-center justify-center"><InstagramIcon /></div>
                                <div>
                                    <div className="text-xs font-bold text-brand-dark dark:text-dark-heading">Instagram</div>
                                    <div className="text-[10px] text-brand-inactive-text">Coloque seu link Dudit na bio</div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center gap-3 shadow-md">
                                <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-950/40 flex items-center justify-center"><WhatsappIcon /></div>
                                <div>
                                    <div className="text-xs font-bold text-brand-dark dark:text-dark-heading">WhatsApp</div>
                                    <div className="text-[10px] text-brand-inactive-text">Receba pedidos organizados na hora</div>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 flex items-center gap-3 shadow-md">
                                <div className="w-10 h-10 rounded-full bg-brand-green/20 flex items-center justify-center"><img src="https://img.dudit.com.br/static/Icon.png" alt="Ícone da Dudit" className="w-6 h-6 object-contain" /></div>
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
                <PorQueExiste onNavigate={onNavigate} />
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
