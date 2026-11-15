"use client"

import React from "react"
import { Shield, Clock, TrendingUp } from "lucide-react"
import SegmentLanding from "@/components/segmentos/SegmentLanding"
import {
    WrenchIcon,
    FileTextIcon,
    ServiceIcon,
    MoneyIcon,
} from "@/lib/icons"

const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dudit para Oficinas e Assistência Técnica",
    operatingSystem: "Web, Android, iOS",
    applicationCategory: "BusinessApplication",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
    },
    description: "Sistema completo de ordens de serviço (OS), orçamentos, estoque de peças e controle financeiro para oficinas mecânicas e assistências técnicas.",
}

const faqs = [
    {
        question: "Preciso saber usar computador?",
        answer: "Não. A Dudit foi feita para ser usada no celular, na oficina mesmo. Você cadastra o cliente, monta o orçamento e emite a OS em poucos toques.",
    },
    {
        question: "O cliente precisa instalar alguma coisa para aprovar o orçamento?",
        answer: "Não. Você envia o orçamento pelo WhatsApp e ele recebe um link. Ao abrir, vê os serviços, os valores e as fotos, e aprova na hora. A ordem de serviço é gerada automaticamente.",
    },
    {
        question: "Serve para oficina de motos e serviços de elétrica automotiva?",
        answer: "Sim. A Dudit serve para oficinas mecânicas, auto centers, funilarias, elétrica automotiva, motos e qualquer serviço que exija diagnóstico, orçamento, aprovação e entrega.",
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

export default function OficinasETecnicosSegmentPage() {
    return (
        <SegmentLanding
            schema={schema}
            badge={{ text: "Especial para Oficinas e Auto Centers", icon: <WrenchIcon /> }}
            title={
                <>
                    Ordens de Serviço e Orçamentos{" "}
                    <span className="text-brand-green">sem papelada ou confusão.</span>
                </>
            }
            description="Chega de blocos de papel e discussões com clientes. Emita OS digital no celular, envie orçamentos com aprovação pelo WhatsApp e controle suas peças com precisão."
            heroMockup={
                <div className="bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border rounded-xl p-6 sm:p-8 shadow-xl relative w-full max-w-[380px]">
                    <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border shadow-sm space-y-4">
                        <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-dark-border">
                            <div>
                                <span className="text-[10px] font-bold text-gray-400 dark:text-dark-body uppercase">Ordem de Serviço</span>
                                <h3 className="font-bold text-brand-dark dark:text-dark-heading text-lg">OS #1042</h3>
                            </div>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                                Aprovada
                            </span>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between text-gray-600 dark:text-dark-body">
                                <span>Veículo:</span>
                                <strong className="text-brand-dark dark:text-dark-heading">Honda Civic 2020 - Placa ABC-1234</strong>
                            </div>
                            <div className="flex justify-between text-gray-600 dark:text-dark-body">
                                <span>Cliente:</span>
                                <strong className="text-brand-dark dark:text-dark-heading">Marcos Silva</strong>
                            </div>
                            <div className="flex justify-between text-gray-600 dark:text-dark-body">
                                <span>Serviço:</span>
                                <span>Troca de Pastilhas + Disco</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 dark:border-dark-border flex justify-between items-center">
                            <span className="text-xs text-gray-500 dark:text-dark-body font-medium">Valor Total:</span>
                            <span className="text-2xl font-bold text-brand-green">R$ 580,00</span>
                        </div>
                    </div>
                </div>
            }
            features={{
                subtitle: "RECURSOS NATIVOS",
                title: "Tudo que sua oficina precisa no dia a dia",
                lead: "Do primeiro orçamento até a entrega da peça, cada etapa fica registrada e sem discussão.",
                items: [
                    {
                        label: "ORÇAMENTOS",
                        title: "Orçamentos com aprovação online",
                        description:
                            "Envie propostas pelo WhatsApp com fotos e valores. O cliente aprova pelo link e a OS é gerada automaticamente.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray dark:border-dark-border">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Orçamento</span>
                                    <FileTextIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="space-y-1.5 mb-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-brand-dark dark:text-dark-heading">Troca de pastilhas</span>
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">R$ 180,00</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-brand-dark dark:text-dark-heading">Disco de freio</span>
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">R$ 400,00</span>
                                    </div>
                                </div>
                                <div className="bg-brand-green text-white text-[9px] font-bold py-1.5 rounded text-center">
                                    Aprovado pelo cliente
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "ORDENS DE SERVIÇO",
                        title: "Ordens de serviço com status",
                        description:
                            "Acompanhe cada OS (aguardando peças, em andamento, concluída) e mantenha o histórico completo do veículo.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray dark:border-dark-border">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Ordens de Serviço</span>
                                    <ServiceIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="bg-brand-gray dark:bg-dark-border/40 p-2 rounded flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">OS #1042</span>
                                        <span className="text-[8px] font-bold text-brand-orange bg-brand-orange-light dark:bg-brand-orange/20 px-1.5 py-0.5 rounded">EM ANDAMENTO</span>
                                    </div>
                                    <div className="bg-brand-gray dark:bg-dark-border/40 p-2 rounded flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">OS #1041</span>
                                        <span className="text-[8px] font-bold text-brand-green">CONCLUÍDA</span>
                                    </div>
                                    <div className="bg-brand-gray dark:bg-dark-border/40 p-2 rounded flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-brand-inactive-text">OS #1040</span>
                                        <span className="text-[8px] font-bold text-brand-inactive-text">AGUARD. PEÇAS</span>
                                    </div>
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "EQUIPE",
                        title: "Comissão de mecânicos e técnicos",
                        description:
                            "Calcule a comissão de cada profissional por serviço realizado, com relatório detalhado e integração ao fluxo de caixa.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray dark:border-dark-border">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Comissões do mês</span>
                                    <MoneyIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="space-y-1.5 mb-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-brand-dark dark:text-dark-heading">Carlos</span>
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">R$ 620,00</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-brand-dark dark:text-dark-heading">Rafael</span>
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">R$ 480,00</span>
                                    </div>
                                </div>
                                <div className="bg-brand-green/10 text-brand-green text-[9px] font-bold py-1 rounded text-center">
                                    Integrado ao fluxo de caixa
                                </div>
                            </div>
                        ),
                    },
                ],
            }}
            benefits={{
                subtitle: "PARA QUEM TEM OFICINA",
                title: "Menos papel, mais serviço fechado",
                items: [
                    {
                        icon: <Shield className="w-5 h-5 text-white" />,
                        title: "Peças sob controle",
                        description:
                            "Saiba o que está no estoque e o que está acabando antes de o cliente chegar com o carro na oficina.",
                    },
                    {
                        icon: <Clock className="w-5 h-5 text-white" />,
                        title: "Sem ida e volta",
                        description:
                            "O orçamento chega pelo WhatsApp e volta aprovado. Sem ligação perdida e sem esperar o cliente voltar na oficina.",
                    },
                    {
                        icon: <TrendingUp className="w-5 h-5 text-white" />,
                        title: "Faturamento no controle",
                        description:
                            "Veja o que entrou, o que saiu e quanto sobrou no fim do mês, sem depender de caderno ou planilha.",
                    },
                ],
            }}
            faq={{
                title: "Dúvidas sobre a Dudit para oficinas",
                description: "Tudo o que você precisa saber para começar a emitir ordens de serviço sem papelada.",
                items: faqs,
            }}
        />
    )
}
