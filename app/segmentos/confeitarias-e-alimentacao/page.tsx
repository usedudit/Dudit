"use client"

import React from "react"
import { MessageCircle, Percent, CalendarDays } from "lucide-react"
import SegmentLanding from "@/components/segmentos/SegmentLanding"
import {
    ShoppingBagIcon,
    TagIcon,
    MoneyIcon,
} from "@/lib/icons"

const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dudit para Confeitarias e Alimentação",
    operatingSystem: "Web, Android, iOS",
    applicationCategory: "BusinessApplication",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
    },
    description: "Cardápio digital na bio do Instagram, pedidos organizados no WhatsApp com 0% de comissão, complementos e controle de entregas para confeitarias e alimentação.",
}

const faqs = [
    {
        question: "Preciso ter CNPJ para usar a Dudit?",
        answer: "Não. Você pode começar como MEI ou mesmo sem empresa, montar seu cardápio e receber pedidos. A conta comercial e os dados ficam com você.",
    },
    {
        question: "O cliente paga pelo sistema ou só no WhatsApp?",
        answer: "Você escolhe. Pode receber pelo Pix ou dinheiro na entrega, ou habilitar pagamento online com Mercado Pago no plano Crescer.",
    },
    {
        question: "Serve para marmita, salgado e comida por quilo?",
        answer: "Serve. Além de bolos e doces, você cadastra marmitas, salgados e outros itens, com variações de tamanho e adicionais.",
    },
]

const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: {
            "@type": "Answer",
            text: f.answer,
        },
    })),
}

const schema = {
    "@context": "https://schema.org",
    "@graph": [softwareSchema, faqLd],
}

export default function ConfeitariasEAlimentacaoSegmentPage() {
    return (
        <SegmentLanding
            schema={schema}
            badge={{ text: "Especial para Confeitarias, Doces e Marmitas", icon: <ShoppingBagIcon /> }}
            title={
                <>
                    Receba pedidos prontos no WhatsApp{" "}
                    <span className="text-brand-green">com 0% de comissão.</span>
                </>
            }
            description="Pare de pagar taxas de até 27% para aplicativos de delivery. Crie seu cardápio digital limpo, receba pedidos com adicionais e endereço somados direto no seu celular."
            heroMockup={
                <div className="bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border rounded-xl p-6 sm:p-8 shadow-xl relative w-full max-w-[380px]">
                    <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border shadow-sm space-y-4">
                        <div className="flex items-center gap-2 pb-3 border-b border-gray-100 dark:border-dark-border">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                                <MessageCircle className="w-4 h-4" />
                            </div>
                            <strong className="text-xs text-brand-dark dark:text-dark-heading font-bold">Novo Pedido Recebido</strong>
                        </div>

                        <div className="p-3 bg-gray-50 dark:bg-dark-border/30 rounded-xl space-y-2 text-xs">
                            <div className="font-bold text-brand-dark dark:text-dark-heading">🎂 Bolo de Aniversário 2kg</div>
                            <div className="text-gray-500 dark:text-dark-body pl-3 space-y-0.5">
                                <div>• Massa: Baunilha</div>
                                <div>• Recheio: Ninho com Morango</div>
                                <div>• Topo de Bolo Personalizado (+ R$ 25,00)</div>
                            </div>
                            <div className="pt-2 border-t border-gray-200 dark:border-dark-border flex justify-between font-bold text-brand-dark dark:text-dark-heading">
                                <span>Total do Pedido:</span>
                                <span className="text-brand-green font-bold">R$ 145,00</span>
                            </div>
                        </div>

                        <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-[11px] p-2.5 rounded-lg font-medium text-center">
                            ✓ Comissão da Dudit: <strong>R$ 0,00 (o valor do pedido é seu)</strong>
                        </div>
                    </div>
                </div>
            }
            features={{
                subtitle: "RECURSOS NATIVOS",
                title: "Mais encomendas, sem mensagens perdidas",
                lead: "Seu cardápio trabalha pela internet enquanto você produz. O pedido chega completo, com variações, adicionais e endereço.",
                items: [
                    {
                        label: "CARDÁPIO DIGITAL",
                        title: "Cardápio digital na bio",
                        description:
                            "Seus clientes navegam pelas fotos, escolhem tamanho, recheio e adicionais, e o pedido chega pronto no WhatsApp.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray dark:border-dark-border">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Cardápio</span>
                                    <ShoppingBagIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="flex gap-3 mb-3">
                                    <div className="w-12 h-12 bg-brand-gray dark:bg-dark-border/40 rounded-lg"></div>
                                    <div className="flex-1">
                                        <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Bolo de Pote</div>
                                        <div className="text-[12px] font-bold text-brand-green">R$ 15,00</div>
                                    </div>
                                </div>
                                <div className="flex gap-2 mb-3">
                                    {['200g', '400g'].map((s) => (
                                        <div key={s} className="px-2 py-1 border border-brand-border rounded text-[8px] font-bold text-brand-dark dark:text-dark-heading">{s}</div>
                                    ))}
                                </div>
                                <div className="bg-brand-green text-white text-[9px] font-bold py-1.5 rounded text-center">
                                    Adicionar ao pedido
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "SEM COMISSÃO",
                        title: "Zero porcentagem por venda",
                        description:
                        "Apps de entrega ficam com até um terço do seu faturamento. Na Dudit você paga um valor fixo e fica com o resto.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray dark:border-dark-border">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Comparativo</span>
                                    <MoneyIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="space-y-1.5 mb-3">
                                    <div className="flex justify-between items-center bg-brand-gray dark:bg-dark-border/40 p-2 rounded">
                                        <span className="text-[10px] text-brand-dark dark:text-dark-heading">App de delivery</span>
                                        <span className="text-[10px] font-bold text-brand-red">-27%</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-brand-gray dark:bg-dark-border/40 p-2 rounded">
                                        <span className="text-[10px] text-brand-dark dark:text-dark-heading">Marketplace</span>
                                        <span className="text-[10px] font-bold text-brand-red">-18%</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-brand-green/10 p-2 rounded">
                                        <span className="text-[10px] font-bold text-brand-green">Dudit</span>
                                        <span className="text-[10px] font-bold text-brand-green">0%</span>
                                    </div>
                                </div>
                                <div className="text-[9px] text-brand-inactive-text text-center">
                                    Todo o valor do pedido é seu
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "PDV E CAIXA",
                        title: "Venda no balcão e na encomenda",
                        description:
                            "Registre vendas presenciais e pedidos no mesmo caixa, com baixa de estoque e fechamento do dia em um só lugar.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray dark:border-dark-border">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Caixa de hoje</span>
                                    <MoneyIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="space-y-1.5 mb-3">
                                    <div className="bg-brand-gray dark:bg-dark-border/40 p-2 rounded flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Bolo de Pote</span>
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">R$ 15,00</span>
                                    </div>
                                    <div className="bg-brand-gray dark:bg-dark-border/40 p-2 rounded flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Marmita Fitness</span>
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">R$ 22,00</span>
                                    </div>
                                    <div className="bg-brand-gray dark:bg-dark-border/40 p-2 rounded flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Salgado (6 un.)</span>
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">R$ 18,00</span>
                                    </div>
                                </div>
                                <div className="bg-brand-green/10 text-brand-green text-[9px] font-bold py-1 rounded text-center">
                                    Fechamento do dia pronto
                                </div>
                            </div>
                        ),
                    },
                ],
            }}
            benefits={{
                subtitle: "PARA QUEM PRODUZ",
                title: "Pedido chega completo, produção roda",
                items: [
                    {
                        icon: <TagIcon className="text-white" />,
                        title: "Variações e adicionais",
                        description:
                            "Massa, recheio, tamanho, topo, embalagem. O cliente monta o pedido e você recebe tudo preenchido.",
                    },
                    {
                        icon: <Percent className="w-5 h-5 text-white" />,
                        title: "Lucro maior por pedido",
                        description:
                            "Sem comissão, cada encomenda rende mais. O valor economizado cabe no seu preço ou volta para você.",
                    },
                    {
                        icon: <CalendarDays className="w-5 h-5 text-white" />,
                        title: "Nada esquecido",
                        description:
                            "Cada encomenda fica com a data, o status e o cliente. Você sabe o que produzir e quando entregar.",
                    },
                ],
            }}
            faq={{
                title: "Dúvidas sobre a Dudit para confeitarias",
                description: "Tudo o que você precisa saber para montar seu cardápio e receber pedidos sem taxa de app.",
                items: faqs,
            }}
        />
    )
}
