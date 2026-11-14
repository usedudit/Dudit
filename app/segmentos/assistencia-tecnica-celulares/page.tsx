"use client"

import React from "react"
import { Smartphone, Camera, ShieldCheck, CheckCircle2 } from "lucide-react"
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
    name: "Dudit para Assistência Técnica de Celulares e TI",
    operatingSystem: "Web, Android, iOS",
    applicationCategory: "BusinessApplication",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
    },
    description: "Sistema para assistência técnica de celulares e informática: ficha de entrada com fotos, ordens de serviço (OS), orçamentos pelo WhatsApp e controle de peças no celular.",
}

const faqs = [
    {
        question: "Como funciona a ficha de entrada com fotos do aparelho?",
        answer: "Ao receber o celular, notebook ou videogame, você registra o modelo, número de série/IMEI, relato do defeito e pode anexar fotos do estado físico (riscos, trincas ou manchas na carcaça). Isso protege sua assistência contra contestações de danos pré-existentes.",
    },
    {
        question: "O cliente consegue aprovar o orçamento direto pelo WhatsApp?",
        answer: "Sim. Assim que você diagnostica o problema e lança o valor das peças e da mão de obra, clica em 'Enviar Orçamento'. O cliente recebe um link limpo com o descritivo e aprova com 1 toque, gerando a Ordem de Serviço na hora.",
    },
    {
        question: "Posso controlar meu estoque de peças de reposição (telas, baterias)?",
        answer: "Com certeza. Cada peça utilizada na OS dá baixa automática no estoque, atualizando seu custo direto e calculando sua margem de lucro real sobre o serviço prestado.",
    },
    {
        question: "Funciona se eu atender a domicílio ou em bancada sem computador?",
        answer: "Sim. A Dudit foi desenhada para funcionar perfeitamente no navegador do smartphone ou como aplicativo instalado (PWA). Você gerencia suas OS de qualquer lugar.",
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

export default function AssistenciaTecnicaSegmentPage() {
    return (
        <SegmentLanding
            schema={schema}
            badge={{ text: "Especial para Assistências Técnicas e Celulares", icon: <WrenchIcon /> }}
            title={
                <>
                    Controle suas Ordens de Serviço{" "}
                    <span className="text-brand-green">e proteja sua assistência.</span>
                </>
            }
            description="Acabe com a desorganização de fichas de papel e o medo de acusações de danos. Registre aparelhos com fotos, envie orçamentos com aprovação no WhatsApp e dê baixa automática em peças."
            heroMockup={
                <div className="bg-brand-slate border border-gray-100 rounded-xl p-6 sm:p-8 shadow-xl relative w-full max-w-[380px]">
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
                        <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                            <div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Ficha Técnica</span>
                                <h3 className="font-bold text-brand-dark text-lg">OS #2088</h3>
                            </div>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Aprovada
                            </span>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between text-gray-600">
                                <span>Aparelho:</span>
                                <strong className="text-brand-dark">iPhone 13 - 128GB Azul</strong>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Defeito:</span>
                                <span className="text-brand-dark font-medium">Display quebrado / Touch inoperante</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Fotos da entrada:</span>
                                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                    <Camera className="w-3 h-3" /> 3 fotos anexadas
                                </span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                                <span>Peça vinculada:</span>
                                <span>Tela OLED Original (Baixa no estoque)</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                            <div>
                                <span className="text-[10px] text-gray-400 block">Total Aprovado</span>
                                <strong className="text-base text-brand-dark font-extrabold">R$ 540,00</strong>
                            </div>
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">
                                Pronto p/ retirada
                            </span>
                        </div>
                    </div>
                </div>
            }
            features={{
                subtitle: "RECURSOS FEITOS PARA A SUA BANCADA",
                title: "Tudo o que sua assistência precisa em um só aplicativo",
                lead: "Controle da entrada até a entrega do aparelho sem precisar de cadernos nem sistemas lentos.",
                items: [
                    {
                        label: "ENTRADA SEGURA COM FOTOS",
                        title: "Evite discussões sobre arranhões ou peças faltando",
                        description:
                            "Tire fotos do aparelho no momento em que o cliente entregar na bancada. Registre marcas de uso, estado da tela e carcaça, e deixe tudo salvo na nuvem com data e hora.",
                        mockup: (
                            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm space-y-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-brand-dark">
                                    <Smartphone className="w-4 h-4 text-brand-green" />
                                    Inspeção Visual de Entrada
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                                        <span className="text-[10px] text-gray-400 block">Traseira</span>
                                        <strong className="text-emerald-700">Sem avarias</strong>
                                    </div>
                                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                                        <span className="text-[10px] text-gray-400 block">Vidro Frontal</span>
                                        <strong className="text-amber-700">Trinca canto superior</strong>
                                    </div>
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "APROVAÇÃO INSTANTÂNEA",
                        title: "Envie o orçamento pelo WhatsApp e receba o sim na hora",
                        description:
                            "Nada de mandar textos desorganizados. A Dudit gera um link profissional com o diagnóstico, fotos das peças trocadas e valores para o cliente aprovar em 1 clique.",
                        mockup: (
                            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm space-y-3">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Mensagem Automática</span>
                                <p className="text-xs text-gray-700 italic border-l-2 border-brand-green pl-2.5">
                                    &ldquo;Olá Carlos! Seu orçamento para o conserto do Galaxy S22 está pronto. Veja os detalhes e aprove aqui: dudit.com.br/quote/1042&rdquo;
                                </p>
                            </div>
                        ),
                    },
                    {
                        label: "ESTOQUE DE PEÇAS",
                        title: "Baixa automática de telas, baterias e conectores",
                        description:
                            "Ao fechar a ordem de serviço, o sistema debita automaticamente as peças usadas no seu estoque e calcula o lucro real daquele conserto.",
                        mockup: (
                            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm space-y-2 text-xs">
                                <div className="flex justify-between items-center py-1 border-b border-gray-100">
                                    <span>Bateria iPhone 11</span>
                                    <span className="text-emerald-600 font-bold">12 em estoque</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span>Conector Tipo-C Moto G</span>
                                    <span className="text-emerald-600 font-bold">25 em estoque</span>
                                </div>
                            </div>
                        ),
                    },
                ],
            }}
            benefits={{
                subtitle: "POR QUE ASSISTÊNCIAS ESCOLHEM A DUDIT",
                title: "Profissionalismo que gera confiança e evita prejuízos",
                items: [
                    {
                        icon: <ShieldCheck className="w-5 h-5 text-brand-green" />,
                        title: "Proteção contra calotes e disputas",
                        description: "Histórico completo de cada conserto com fotos de entrada e saída, assinatura e comprovante de recebimento salvos.",
                    },
                    {
                        icon: <FileTextIcon className="w-5 h-5 text-brand-green" />,
                        title: "Emissão de comprovante em PDF",
                        description: "Gere o comprovante de entrega ou recibo em PDF para enviar ao cliente ou imprimir na impressora térmica.",
                    },
                    {
                        icon: <MoneyIcon className="w-5 h-5 text-brand-green" />,
                        title: "0% de taxa sobre seus consertos",
                        description: "Tudo o que você fatura em serviços de bancada fica com você, sem comissão por ordem de serviço.",
                    },
                ],
            }}
            faq={{
                title: "Dúvidas frequentes de quem gerencia assistência técnica",
                description: "Tudo o que você precisa saber para começar a usar a Dudit no seu dia a dia.",
                items: faqs,
            }}
        />
    )
}

