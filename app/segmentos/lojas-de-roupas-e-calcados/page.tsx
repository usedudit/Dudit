"use client"

import { Shirt, Tag, Barcode, CheckCircle2 } from "lucide-react"
import SegmentLanding from "@/components/segmentos/SegmentLanding"
import {
    ShoppingBagIcon,
    MoneyIcon,
} from "@/lib/icons"

const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dudit para Lojas de Roupas, Calçados e Moda",
    operatingSystem: "Web, Android, iOS",
    applicationCategory: "BusinessApplication",
    offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
    },
    description: "Sistema para lojas de roupas e calçados: controle de grade (cor e tamanho), emissão de etiquetas com código de barras, PDV rápido e vitrine online com 0% de comissão.",
}

const faqs = [
    {
        question: "Como funciona o controle de grade de tamanhos e cores?",
        answer: "No cadastro de produto, você adiciona um único item (ex: Vestido Canelado) e ativa as variações por Cor (Preto, Branco, Vermelho) e Tamanho (P, M, G, GG). O estoque de cada combinação é controlado de forma independente, evitando furos.",
    },
    {
        question: "Posso imprimir etiquetas com código de barras para colar nas roupas?",
        answer: "Sim! A Dudit gera etiquetas térmicas padrão ou em folhas A4 com o nome da loja, preço, variação (ex: M - Preto) e código de barras legível por qualquer leitor ou câmera de celular.",
    },
    {
        question: "Como funciona a vitrine online para colocar na bio do Instagram?",
        answer: "Sua loja ganha um link público limpo com todas as fotos, tamanhos disponíveis e preços. As clientes escolhem o que querem e o pedido chega pronto no seu WhatsApp com endereço e itens somados.",
    },
    {
        question: "O PDV de balcão funciona no celular ou precisa de computador?",
        answer: "Funciona tanto no celular quanto no tablet ou notebook. Você pode usar a câmera do próprio celular para ler o código de barras da peça na hora de passar a venda.",
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

export default function LojasDeRoupasSegmentPage() {
    return (
        <SegmentLanding
            schema={schema}
            badge={{ text: "Especial para Lojas de Roupas e Calçados", icon: <ShoppingBagIcon /> }}
            title={
                <>
                    Grade de tamanhos, etiquetas e PDV{" "}
                    <span className="text-brand-green">sem complicação de planilha.</span>
                </>
            }
            description="Controle variações de cor e tamanho, imprima etiquetas com código de barras e venda no balcão e no WhatsApp com 0% de comissão e total controle de estoque."
            heroMockup={
                <div className="bg-brand-slate dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border rounded-xl p-6 sm:p-8 shadow-xl relative w-full max-w-[380px]">
                    <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-gray-100 dark:border-dark-border shadow-sm space-y-4">
                        <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-dark-border">
                            <div>
                                <span className="text-[10px] font-bold text-gray-400 dark:text-dark-body uppercase">Grade de Estoque</span>
                                <h3 className="font-bold text-brand-dark dark:text-dark-heading text-base">Camisa Linho Masculina</h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                                42 em estoque
                            </span>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50 dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border">
                                <span>Cor: <strong>Branca</strong> / Tam: <strong>M</strong></span>
                                <span className="text-emerald-700 dark:text-emerald-300 font-bold">14 un.</span>
                            </div>
                            <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50 dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border">
                                <span>Cor: <strong>Branca</strong> / Tam: <strong>G</strong></span>
                                <span className="text-emerald-700 dark:text-emerald-300 font-bold">8 un.</span>
                            </div>
                            <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50 dark:bg-dark-border/30 border border-gray-100 dark:border-dark-border">
                                <span>Cor: <strong>Azul Marinho</strong> / Tam: <strong>M</strong></span>
                                <span className="text-emerald-700 dark:text-emerald-300 font-bold">12 un.</span>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-gray-100 dark:border-dark-border flex justify-between items-center">
                            <span className="text-xs text-gray-400 dark:text-dark-body flex items-center gap-1">
                                <Barcode className="w-3.5 h-3.5 text-gray-500 dark:text-dark-body" />
                                78910482019
                            </span>
                            <span className="text-sm font-extrabold text-brand-dark dark:text-dark-heading">R$ 139,90</span>
                        </div>
                    </div>
                </div>
            }
            features={{
                subtitle: "ORGANIZAÇÃO PARA O VAREJO DE MODA",
                title: "Tudo o que sua loja precisa para vender mais e errar menos",
                lead: "Cadastre produtos por grade, tenha controle por código de barras e receba pedidos organizados.",
                items: [
                    {
                        label: "GRADE DE CORES E TAMANHOS",
                        title: "Acabe com a confusão de cadastrar a mesma peça 10 vezes",
                        description:
                            "Crie grades completas com tamanhos (P, M, G, calçados do 34 ao 44) e cores em segundos. Veja em tempo real quais tamanhos estão acabando.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface rounded-xl p-5 border border-gray-100 dark:border-dark-border shadow-sm space-y-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-brand-dark dark:text-dark-heading">
                                    <Shirt className="w-4 h-4 text-brand-green" />
                                    Variações de Tamanho
                                </div>
                                <div className="flex gap-2 text-xs">
                                    <span className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-border/30 font-bold">P</span>
                                    <span className="px-3 py-1.5 rounded-lg border-2 border-brand-green bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold">M</span>
                                    <span className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-border/30 font-bold">G</span>
                                    <span className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-border/30 font-bold">GG</span>
                                </div>
                            </div>
                        ),
                    },
                    {
                        label: "ETIQUETAS COM CÓDIGO DE BARRAS",
                        title: "Imprima etiquetas para roupas e caixas com 1 clique",
                        description:
                            "Gere etiquetas térmicas prontas para impressão com o nome da loja, preço e código de barras legível por qualquer leitor.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface rounded-xl p-5 border border-gray-100 dark:border-dark-border shadow-sm space-y-2 text-center">
                                <span className="text-[11px] font-bold text-brand-dark dark:text-dark-heading block">Dudit Boutique</span>
                                <div className="bg-gray-100 dark:bg-dark-border/40 p-2 rounded flex justify-center items-center">
                                    <Barcode className="w-28 h-8 text-brand-dark dark:text-dark-heading" />
                                </div>
                                <span className="text-xs font-extrabold text-brand-dark dark:text-dark-heading block">R$ 89,90</span>
                            </div>
                        ),
                    },
                    {
                        label: "CATÁLOGO NA BIO DO INSTAGRAM",
                        title: "Vitrine digital para suas clientes comprarem no WhatsApp",
                        description:
                            "Suas clientes navegam pelas peças organizadas por categoria, escolhem o tamanho e a cor e enviam o pedido montado no WhatsApp da loja.",
                        mockup: (
                            <div className="bg-white dark:bg-dark-surface rounded-xl p-5 border border-gray-100 dark:border-dark-border shadow-sm space-y-2 text-xs">
                                <div className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-dark-border">
                                    <span>Coleção Verão</span>
                                    <span className="text-brand-green font-bold">24 peças</span>
                                </div>
                                <div className="flex justify-between items-center py-1">
                                    <span>Bolsas & Calçados</span>
                                    <span className="text-brand-green font-bold">18 modelos</span>
                                </div>
                            </div>
                        ),
                    },
                ],
            }}
            benefits={{
                subtitle: "VANTAGENS PARA SUA LOJA",
                title: "Mais agilidade no balcão e 0% de taxas escondidas",
                items: [
                    {
                        icon: <Tag className="w-5 h-5 text-brand-green" />,
                        title: "PDV rápido de balcão",
                        description: "Venda no cartão, dinheiro ou Pix com emissão rápida de comprovante no WhatsApp do cliente.",
                    },
                    {
                        icon: <MoneyIcon className="w-5 h-5 text-brand-green" />,
                        title: "0% de comissão por venda",
                        description: "Venda na loja física ou envie para todo o Brasil sem pagar taxa sobre suas peças.",
                    },
                    {
                        icon: <CheckCircle2 className="w-5 h-5 text-brand-green" />,
                        title: "Controle de trocas e devoluções",
                        description: "Registre trocas de peças e tamanhos com retorno automático ao estoque sem bagunçar o caixa.",
                    },
                ],
            }}
            faq={{
                title: "Dúvidas frequentes de lojistas de moda",
                description: "Tudo o que você precisa saber para começar a usar a Dudit na sua loja de roupas.",
                items: faqs,
            }}
        />
    )
}

