"use client"

import React from "react"
import { Users, Sparkles, CalendarDays } from "lucide-react"
import SegmentLanding from "@/components/segmentos/SegmentLanding"
import {
    CalendarIcon,
    ClockIcon,
    ShoppingBagIcon,
    SparklesIcon,
    MoneyIcon,
} from "@/lib/icons"

const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dudit para Salões e Barbearias",
    operatingSystem: "Web, Android, iOS",
    applicationCategory: "BusinessApplication",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
    },
    description: "Sistema completo de agendamento online 24h, comissões de profissionais, PDV e controle de estoque de produtos para salões e barbearias.",
}

const faqs = [
    {
        question: "O cliente precisa criar conta para agendar?",
        answer: "Não. Ele abre o link da sua agenda, escolhe o profissional, o serviço e o horário disponível, e confirma. O agendamento entra na sua agenda na hora.",
    },
    {
        question: "Consigo bloquear horários e pausas?",
        answer: "Sim. Você marca almoço, dias de folga, férias e horários bloqueados. Eles simplesmente deixam de aparecer como disponíveis para o cliente.",
    },
    {
        question: "Funciona para manicures, esteticistas e depilação?",
        answer: "Funciona. Você cadastra seus serviços, a duração de cada um e os profissionais da equipe. A agenda se ajusta ao tempo real de cada atendimento.",
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

export default function SaloesEBarbeariasSegmentPage() {
    return (
        <SegmentLanding
            schema={schema}
            badge={{ text: "Especial para Barbearias, Salões e Estética", icon: <SparklesIcon /> }}
            title={
                <>
                    Seus clientes agendam 24h{" "}
                    <span className="text-brand-green">sem você parar para atender.</span>
                </>
            }
            description="Coloque o link da sua agenda no Instagram e WhatsApp. Os clientes escolhem o profissional e o horário disponível sozinhos, sem confusão de horários ou ligações."
            heroMockup={
                <div className="bg-brand-slate border border-gray-100 rounded-xl p-6 sm:p-8 shadow-xl relative w-full max-w-[380px]">
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                        <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <CalendarIcon size={16} className="text-brand-green" />
                                <span className="font-bold text-brand-dark text-sm">Agenda de Hoje</span>
                            </div>
                            <span className="text-xs text-gray-400 font-medium">14:00 - 18:00</span>
                        </div>

                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs">
                                <div>
                                    <strong className="text-blue-900 block font-bold">14:00 - Corte + Barba</strong>
                                    <span className="text-blue-600">Cliente: Rodrigo Alves</span>
                                </div>
                                <span className="font-bold text-blue-900">R$ 75,00</span>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs opacity-75">
                                <div>
                                    <strong className="text-gray-800 block font-bold">15:30 - Barboterapia</strong>
                                    <span className="text-gray-500">Cliente: Felipe Santos</span>
                                </div>
                                <span className="font-bold text-gray-800">R$ 50,00</span>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
                            <span className="text-gray-500">Venda de Pomada no Caixa:</span>
                            <strong className="text-brand-green font-bold">+ R$ 45,00</strong>
                        </div>
                    </div>
                </div>
            }
            features={{
                subtitle: "RECURSOS NATIVOS",
                title: "Mais agendamentos, zero dor de cabeça",
                lead: "Sua agenda trabalha por você enquanto você atende. O cliente marca sozinho e você só precisa aparecer no horário.",
                items: [
                    {
                        label: "AGENDA ONLINE",
                        title: "Agenda no Instagram e WhatsApp",
                        description:
                            "Seu link exclusivo deixa os horários livres visíveis 24h. O cliente marca o serviço em segundos, sem ligação.",
                        mockup: (
                            <div className="bg-white p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Agenda Hoje</span>
                                    <ClockIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3 bg-blue-50 p-2 rounded-lg border border-blue-100">
                                        <div className="text-[10px] font-bold text-blue-700">14:00</div>
                                        <div className="flex-1">
                                            <div className="text-[10px] font-bold text-gray-900">Corte Masculino</div>
                                            <div className="text-[8px] text-gray-500">Cliente: Marcos</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 bg-brand-gray p-2 rounded-lg border border-brand-border">
                                        <div className="text-[10px] font-bold text-brand-inactive-text">15:00</div>
                                        <div className="flex-1">
                                            <div className="text-[10px] font-bold text-brand-dark">Barba</div>
                                            <div className="text-[8px] text-brand-green font-bold">Agendado</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "CAIXA & ESTOQUE",
                        title: "Venda de produtos no mesmo atendimento",
                        description:
                            "Venda pomadas, shampoos e cosméticos no caixa, com baixa automática no estoque e tudo no fechamento do dia.",
                        mockup: (
                            <div className="bg-white p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">PDV</span>
                                    <ShoppingBagIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="flex gap-3 mb-3">
                                    <div className="w-10 h-10 bg-brand-gray rounded-lg"></div>
                                    <div className="flex-1">
                                        <div className="text-[10px] font-bold text-brand-dark">Pomada Modeladora</div>
                                        <div className="text-[12px] font-bold text-brand-green">R$ 45,00</div>
                                    </div>
                                </div>
                                <div className="bg-brand-green text-white text-[9px] font-bold py-1.5 rounded text-center">
                                    Venda registrada
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "EQUIPE",
                        title: "Comissão por profissional",
                        description:
                            "Configure comissões diferentes por profissional ou por serviço. O fechamento financeiro do mês sai com 1 clique.",
                        mockup: (
                            <div className="bg-white p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Comissões</span>
                                    <MoneyIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="space-y-1.5 mb-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-brand-dark">João (barbeiro)</span>
                                        <span className="text-[10px] font-bold text-brand-dark">R$ 890,00</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-brand-dark">Ana (manicure)</span>
                                        <span className="text-[10px] font-bold text-brand-dark">R$ 540,00</span>
                                    </div>
                                </div>
                                <div className="bg-brand-green/10 text-brand-green text-[9px] font-bold py-1 rounded text-center">
                                    Fechamento pronto
                                </div>
                            </div>
                        ),
                    },
                ],
            }}
            benefits={{
                subtitle: "PARA QUEM ATENDE",
                title: "Agenda cheia, cabeça leve",
                items: [
                    {
                        icon: <CalendarDays className="w-5 h-5 text-white" />,
                        title: "Menos faltas",
                        description:
                            "Lembrete automático de agendamento no WhatsApp faz o cliente lembrar do horário e desmarcar com antecedência.",
                    },
                    {
                        icon: <Sparkles className="w-5 h-5 text-white" />,
                        title: "Cliente fiel",
                        description:
                            "Cada visita fica no histórico. Você sabe o que o cliente fez, o que costuma comprar e quando voltará.",
                    },
                    {
                        icon: <Users className="w-5 h-5 text-white" />,
                        title: "Equipe organizada",
                        description:
                            "Cada profissional vê apenas a própria agenda, com as próprias comissões e o próprio desempenho no mês.",
                    },
                ],
            }}
            faq={{
                title: "Dúvidas sobre a agenda da Dudit",
                description: "Tudo o que você precisa saber para colocar sua barbearia ou salão para agendar sozinho.",
                items: faqs,
            }}
        />
    )
}
