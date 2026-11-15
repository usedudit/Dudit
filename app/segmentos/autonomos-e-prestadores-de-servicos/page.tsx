"use client"

import React from "react"
import { FileCheck2, CalendarDays, Globe2, Send } from "lucide-react"
import SegmentLanding from "@/components/segmentos/SegmentLanding"
import {
    BriefcaseIcon,
    FileTextIcon,
    CalendarIcon,
    UserIcon,
} from "@/lib/icons"

const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dudit para Autônomos e Prestadores de Serviços",
    operatingSystem: "Web, Android, iOS",
    applicationCategory: "BusinessApplication",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
    },
    description: "Sistema para autônomos e prestadores de serviços: vitrine online, orçamentos em PDF com aprovação, agenda de atendimentos, histórico de clientes e financeiro em um só lugar.",
}

const faqs = [
    {
        question: "Preciso ter CNPJ para usar a Dudit?",
        answer: "Não. Você pode começar como MEI ou pessoa física, conforme as regras da sua atividade. Para vender, basta criar uma conta gratuita na Dudit e montar sua vitrine.",
    },
    {
        question: "O cliente precisa de conta para comprar ou contratar?",
        answer: "Sim. Para comprar, contratar um serviço ou agendar pela Dudit, o cliente precisa de uma conta gratuita. O cadastro é rápido e ele acompanha pedidos, orçamentos e agendamentos por lá.",
    },
    {
        question: "Consigo enviar orçamento pelo WhatsApp?",
        answer: "Sim. Você monta o orçamento com os itens, valores e condições, gera o PDF e compartilha o link pelo WhatsApp. O cliente abre, confere e aprova sem instalar nada.",
    },
    {
        question: "Como recebo pelo serviço prestado?",
        answer: "Você pode combinar o pagamento direto com o cliente (Pix, dinheiro ou cartão) ou usar o checkout online com Mercado Pago, disponível no plano Crescer.",
    },
    {
        question: "Preciso pagar para começar?",
        answer: "Não. Você pode começar no plano gratuito, montar sua vitrine e usar os recursos básicos sem pagar mensalidade.",
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

export default function AutonomosEPrestadoresSegmentPage() {
    return (
        <SegmentLanding
            schema={schema}
            badge={{ text: "Especial para Autônomos e Prestadores de Serviços", icon: <BriefcaseIcon /> }}
            title={
                <>
                    Seus serviços organizados{" "}
                    <span className="text-brand-green">e seus clientes em todo o Brasil.</span>
                </>
            }
            description="Crie sua vitrine de serviços, envie orçamentos em PDF, organize a agenda e acompanhe seus clientes. Na Dudit, o valor do serviço é seu."
            heroMockup={
                <div className="bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border rounded-xl p-6 sm:p-8 shadow-xl relative w-full max-w-[380px]">
                    <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border shadow-sm space-y-4">
                        <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-dark-border">
                            <div>
                                <span className="text-[10px] font-bold text-gray-400 dark:text-dark-body uppercase">Orçamento</span>
                                <h3 className="font-bold text-brand-dark dark:text-dark-heading text-lg">Pintura Residencial</h3>
                            </div>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                                Aprovado
                            </span>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between text-gray-600 dark:text-dark-body">
                                <span>Cliente:</span>
                                <strong className="text-brand-dark dark:text-dark-heading">Mariana Costa</strong>
                            </div>
                            <div className="flex justify-between text-gray-600 dark:text-dark-body">
                                <span>Serviço:</span>
                                <span className="text-brand-dark dark:text-dark-heading font-medium">2 quartos + sala</span>
                            </div>
                            <div className="flex justify-between text-gray-600 dark:text-dark-body">
                                <span>Prazo:</span>
                                <span className="text-brand-dark dark:text-dark-heading font-medium">4 dias úteis</span>
                            </div>
                            <div className="flex justify-between text-gray-600 dark:text-dark-body">
                                <span>Pagamento:</span>
                                <span className="text-brand-dark dark:text-dark-heading font-medium">50% na aprovação</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 dark:border-dark-border flex justify-between items-center">
                            <div>
                                <span className="text-[10px] text-gray-400 dark:text-dark-body block">Valor do serviço</span>
                                <strong className="text-base text-brand-dark dark:text-dark-heading font-extrabold">R$ 1.850,00</strong>
                            </div>
                            <span className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2 py-1 rounded font-medium flex items-center gap-1">
                                <Send className="w-3 h-3" /> Enviado
                            </span>
                        </div>
                    </div>
                </div>
            }
            features={{
                subtitle: "RECURSOS PARA QUEM VIVE DE SERVIÇO",
                title: "Da proposta ao atendimento, tudo em um só lugar",
                lead: "Sua vitrine apresenta o serviço, o orçamento fecha o combinado e a agenda organiza o resto.",
                items: [
                    {
                        label: "VITRINE DE SERVIÇOS",
                        title: "Seu trabalho apresentado do jeito certo",
                        description:
                            "Cadastre seus serviços, fotos, preços e formas de atendimento. Compartilhe um link único na bio do Instagram e no WhatsApp para clientes da sua cidade e de todo o Brasil.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex items-center gap-3 mb-3 pb-2 border-b border-brand-gray dark:border-dark-border">
                                    <div className="w-9 h-9 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green">
                                        <UserIcon size={16} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Seu Perfil Profissional</div>
                                        <div className="text-[8px] text-brand-inactive-text">dudit.com.br/seuperfil</div>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="bg-brand-gray dark:bg-dark-border/40 p-2 rounded flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Pintura residencial</span>
                                        <span className="text-[9px] font-bold text-brand-green">A partir de R$ 800</span>
                                    </div>
                                    <div className="bg-brand-gray dark:bg-dark-border/40 p-2 rounded flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Pequenos reparos</span>
                                        <span className="text-[9px] font-bold text-brand-green">Sob orçamento</span>
                                    </div>
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "ORÇAMENTOS",
                        title: "Proposta profissional em PDF",
                        description:
                            "Monte o orçamento com itens, fotos e condições, gere o PDF e envie pelo WhatsApp. O cliente aprova pelo link e você acompanha cada status.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-brand-dark text-white text-[8px] px-2 py-1 rounded-bl-lg">PDF</div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 bg-brand-green/10 rounded flex items-center justify-center text-brand-green">
                                        <FileTextIcon size={12} />
                                    </div>
                                    <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Proposta Comercial</span>
                                </div>
                                <div className="space-y-1 mb-3">
                                    <div className="h-1.5 w-full bg-brand-gray dark:bg-dark-border/40 rounded-full"></div>
                                    <div className="h-1.5 w-3/4 bg-brand-gray dark:bg-dark-border/40 rounded-full"></div>
                                    <div className="h-1.5 w-1/2 bg-brand-gray dark:bg-dark-border/40 rounded-full"></div>
                                </div>
                                <div className="bg-brand-green text-white text-[9px] font-bold py-1.5 rounded text-center">
                                    Enviar por WhatsApp
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "AGENDA E CLIENTES",
                        title: "Horários e histórico organizados",
                        description:
                            "Os agendamentos entram direto na sua agenda, com o serviço, o cliente e o horário. O histórico fica salvo para você acompanhar cada atendimento.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface p-4 w-full max-w-[240px] rounded-xl border border-brand-border text-xs">
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-brand-gray dark:border-dark-border">
                                    <span className="text-[10px] font-bold text-brand-inactive-text uppercase">Agenda de hoje</span>
                                    <CalendarIcon size={12} className="text-brand-inactive-text" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/40 p-2 rounded-lg border border-blue-100 dark:border-blue-900/50">
                                        <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300">09:00</div>
                                        <div className="flex-1">
                                            <div className="text-[10px] font-bold text-gray-900 dark:text-dark-heading">Pintura - Sala</div>
                                            <div className="text-[8px] text-gray-500 dark:text-dark-body">Cliente: Mariana</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 bg-brand-gray dark:bg-dark-border/40 p-2 rounded-lg border border-brand-border">
                                        <div className="text-[10px] font-bold text-brand-inactive-text">14:00</div>
                                        <div className="flex-1">
                                            <div className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">Reparo hidráulico</div>
                                            <div className="text-[8px] text-brand-green font-bold">Confirmado</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ),
                    },
                ],
            }}
            benefits={{
                subtitle: "POR QUE PRESTADORES ESCOLHEM A DUDIT",
                title: "Menos proposta perdida, mais serviço fechado",
                items: [
                    {
                        icon: <FileCheck2 className="w-5 h-5 text-white" />,
                        title: "Orçamento acompanhado",
                        description:
                            "Veja se o cliente abriu, aprovou ou recusou a proposta. Nada fica perdido na conversa do WhatsApp.",
                    },
                    {
                        icon: <CalendarDays className="w-5 h-5 text-white" />,
                        title: "Cliente que volta",
                        description:
                            "O histórico de atendimentos fica salvo e as Sugestões & Oportunidades mostram clientes que não voltam há um tempo.",
                    },
                    {
                        icon: <Globe2 className="w-5 h-5 text-white" />,
                        title: "Alcance local e nacional",
                        description:
                            "Atenda na sua cidade ou ofereça serviços para clientes de todo o Brasil pela sua vitrine online.",
                    },
                ],
            }}
            faq={{
                title: "Dúvidas de autônomos e prestadores de serviços",
                description: "Tudo o que você precisa saber para organizar seus serviços e fechar mais propostas pela Dudit.",
                items: faqs,
            }}
        />
    )
}
