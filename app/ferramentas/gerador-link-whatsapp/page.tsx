"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Navbar, Footer, GridLines, CTA, ToolPageHero, FaqSection } from "@/components/InstitucionalShared"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/reusable/Button"
import { Input } from "@/components/reusable/Input"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import { Copy, Check, ExternalLink, ArrowRight } from "lucide-react"

export default function GeradorLinkWhatsAppPage() {
    const router = useRouter()
    const [telefone, setTelefone] = useState<string>("11999998888")
    const [mensagem, setMensagem] = useState<string>("Olá! Vi seus produtos e gostaria de fazer um pedido.")
    const [copiado, setCopiado] = useState(false)

    const onNavigate = (page: string) => {
        if (page === 'home') router.push('/institucional/inicio')
        else if (page === 'start-selling') router.push('/auth/login?mode=partner')
        else if (page === 'explore') router.push('/')
        else if (page === 'segments') router.push('/institucional/segmentos')
        else if (page === 'pricing') router.push('/institucional/planos')
        else if (page === 'about') router.push('/institucional/sobre')
        else router.push('/')
    }

    const digitos = telefone.replace(/\D/g, "")
    const numeroFormatado = digitos.startsWith("55") ? digitos : `55${digitos}`
    const mensagemCodificada = encodeURIComponent(mensagem.trim())
    const linkGerado = digitos.length >= 10
        ? `https://wa.me/${numeroFormatado}?text=${mensagemCodificada}`
        : "https://wa.me/55..."

    const handleCopiar = () => {
        if (typeof window !== "undefined" && digitos.length >= 10) {
            navigator.clipboard.writeText(linkGerado)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2500)
        }
    }

    const faqs = [
        {
            question: "Como colocar o link do WhatsApp na bio do Instagram?",
            answer: "1. Copie o link gerado acima; 2. Abra o aplicativo do Instagram e vá no seu perfil; 3. Toque em 'Editar Perfil'; 4. Selecione a opção 'Links' e toque em 'Adicionar link externo'; 5. Cole o link do WhatsApp no campo URL e defina um título como 'Chamar no WhatsApp'."
        },
        {
            question: "Qual a vantagem de ter um catálogo online integrado ao WhatsApp?",
            answer: "Com um link simples do WhatsApp, o cliente precisa perguntar o que você tem, preços, tamanhos e fotos um por um. Com a Vitrine Dudit, você coloca o link do seu catálogo na bio: o cliente escolhe os produtos, monta a sacola e o pedido já chega pronto no seu WhatsApp com valor somado e endereço de entrega."
        },
        {
            question: "O gerador de link funciona para WhatsApp Business e WhatsApp comum?",
            answer: "Sim! O formato wa.me é o padrão oficial mundial da Meta e funciona perfeitamente para contas pessoais e contas comerciais (WhatsApp Business) em Android, iPhone e WhatsApp Web no computador."
        }
    ]

    const faqLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map(f => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: f.answer,
            }
        }))
    }

    const breadcrumbLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://dudit.com.br" },
            { "@type": "ListItem", position: 2, name: "Ferramentas", item: "https://dudit.com.br/ferramentas" },
            { "@type": "ListItem", position: 3, name: "Gerador de Link de WhatsApp", item: "https://dudit.com.br/ferramentas/gerador-link-whatsapp" },
        ]
    }

    return (
        <div className="min-h-screen bg-white dark:bg-dark-surface">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(faqLd) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(breadcrumbLd) }}
            />

            <Navbar onNavigate={onNavigate} />

            <main>
                <ToolPageHero
                    badge="Gerador de Link"
                    title="Gerador de Link de WhatsApp"
                    description="Crie seu link personalizado com mensagem pronta para usar na bio do Instagram, nas redes sociais ou em anúncios."
                />

                <section className="py-24 bg-white dark:bg-dark-surface relative border-t border-brand-border">
                    <GridLines />
                    <div className="max-w-[1400px] w-full mx-auto px-4 relative z-10">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                                viewport={{ once: true }}
                                className="lg:col-span-7"
                            >
                                <Card className="bg-white dark:bg-dark-surface border-brand-border rounded-3xl shadow-none py-0">
                                    <CardContent className="px-6 py-6 space-y-5">
                                        <div>
                                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Configure seu link</h2>
                                            <p className="text-sm text-brand-inactive-text mt-1">
                                                Informe o número e a mensagem que o cliente vai enviar ao clicar.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Input
                                                label="Número do WhatsApp (com DDD)"
                                                name="telefone"
                                                value={telefone}
                                                onChange={(e) => setTelefone(e.target.value)}
                                                placeholder="Ex: 11999998888"
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Insira DDD + 9 dígitos. O código +55 do Brasil é adicionado automaticamente.
                                            </p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Input
                                                label="Mensagem inicial que o cliente enviará"
                                                name="mensagem"
                                                multiline
                                                rows={4}
                                                value={mensagem}
                                                onChange={(e) => setMensagem(e.target.value)}
                                                placeholder="Digite o texto que o cliente enviará quando clicar..."
                                            />
                                            <p className="text-xs text-brand-inactive-text">
                                                Ex: “Quero agendar um horário” ou “Quero ver o catálogo da loja”.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                viewport={{ once: true }}
                                className="lg:col-span-5"
                            >
                                <Card className="bg-brand-dark border-brand-dark rounded-3xl shadow-none py-0 text-white">
                                    <CardContent className="px-6 py-6">
                                        <p className="text-sm font-medium text-brand-green">
                                            Seu link pronto
                                        </p>

                                        <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-4">
                                            <p className="text-xs text-gray-400 dark:text-dark-body break-all font-mono mb-3">
                                                {linkGerado}
                                            </p>

                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={handleCopiar}
                                                    disabled={digitos.length < 10}
                                                    className="flex-1 h-11"
                                                >
                                                    {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                    <span>{copiado ? "Link copiado" : "Copiar link"}</span>
                                                </Button>

                                                {digitos.length >= 10 && (
                                                    <Button
                                                        asChild
                                                        variant="outline"
                                                        className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/40"
                                                    >
                                                        <a href={linkGerado} target="_blank" rel="noopener noreferrer">
                                                            <ExternalLink className="w-4 h-4" />
                                                            <span>Testar</span>
                                                        </a>
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-4">
                                            <p className="text-sm font-semibold text-white mb-1">
                                                Suba de nível com a Vitrine Dudit
                                            </p>
                                            <p className="text-xs text-gray-400 dark:text-dark-body leading-relaxed">
                                                Em vez de responder 50 perguntas sobre preço e fotos, coloque sua Vitrine Dudit na bio. O cliente vê fotos, escolhe produtos e envia o pedido pronto no seu WhatsApp.
                                            </p>
                                        </div>

                                        <div className="mt-6">
                                            <Button asChild size="lg" variant="outline" className="w-full">
                                                <Link href="/auth/login?mode=partner">
                                                    <span>Criar catálogo online gratuito</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </Link>
                                            </Button>
                                            <p className="text-center text-xs text-gray-400 dark:text-dark-body mt-3">
                                                Link único na bio com todos os seus produtos e 0% de comissão
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <FaqSection title="Dúvidas sobre links de WhatsApp" items={faqs} />
            </main>

            <CTA onNavigate={onNavigate} />
            <Footer onNavigate={onNavigate} />
        </div>
    )
}
