"use client"

import Link from "next/link"
import Button from "../reusable/Button"

export function HomeSellerBanner() {
    return (
        <section className="py-10 bg-white dark:bg-dark-background relative">
            <div className="max-w-[1400px] mx-auto relative z-10">
                <div className="relative bg-brand-dark rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center gap-8 md:gap-12 overflow-hidden">
                    {/* Background decorative faint rings */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none select-none">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] lg:w-[1000px] lg:h-[1000px] border border-white rounded-full" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] lg:w-[750px] lg:h-[750px] border border-white rounded-full" />
                    </div>

                    {/* Texto + Botão */}
                    <div className="flex-1 text-center md:text-left relative z-10">
                        <h2 className="text-2xl md:text-[32px] font-black text-white mb-3 leading-tight">
                            Pronto para vender na sua cidade e em todo o Brasil?
                        </h2>
                        <p className="text-white/70 text-base md:text-lg leading-relaxed mb-6">
                            Crie sua vitrine em minutos, receba pedidos pelo WhatsApp ou direto na Dudit e venda com 0% de comissão. Sem taxas por pedido ou surpresas no fim do mês.
                        </p>
                        <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
                            <Button asChild className="h-11 text-brand-dark font-bold">
                                <Link href="/auth/login?mode=partner" prefetch={false}>
                                    Começar grátis
                                </Link>
                            </Button>
                        </div>
                    </div>

                    {/* Dino */}
                    <div className="w-[160px] md:w-[220px] shrink-0 flex items-center justify-center relative z-10">
                        <img
                            src="https://img.dudit.com.br/static/mascots/Carousel2.png"
                            alt="Venda na Dudit"
                            width={220}
                            height={220}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-auto object-contain select-none"
                        />
                    </div>
                </div>
            </div>
        </section>
    )
}
