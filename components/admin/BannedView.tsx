"use client"

import React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { AlertCircleIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import { InfoCard } from "@/components/reusable"
import MarketplaceFooter from "../marketplace/MarketplaceFooter"

// ─── Background ──────────────────────────────────────────────────────────────
const WavesBackground = React.memo(() => (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <img
            src="https://img.dudit.com.br/static/banners/WavesPattern.png"
            alt=""
            className="w-full h-full object-cover opacity-20"
        />
    </div>
))
WavesBackground.displayName = "WavesBackground"

// ─── Shell compartilhado ─────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col font-sans bg-brand-gray">
            {/* HEADER */}
            <header className="w-full bg-white border-b border-brand-border sticky top-0 z-50 h-[80px] flex items-center shadow-sm">
                <div className="container mx-auto px-4 max-w-[1300px] flex justify-between items-center h-full">
                    <Link href="/" prefetch={false} className="shrink-0 cursor-pointer">
                        <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" width={110} height={32} className="h-8 w-auto" />
                    </Link>
                    <nav>
                        <Button asChild className="h-10 px-6 text-sm font-medium"><Link href="https://dudit.com.br/auth/login?mode=partner">Anuncie grátis</Link></Button>
                    </nav>
                </div>
            </header>

            <main className="flex-grow relative flex flex-col items-center">
                <div className="w-full bg-[#003d32] h-[250px] absolute top-0 left-0 z-0 overflow-hidden">
                    <WavesBackground />
                    <div className="absolute inset-0 opacity-5 pointer-events-none" />
                </div>

                <div className="w-full flex flex-col items-center pt-[60px] pb-12 z-10 px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-lg shadow-xl w-full max-w-[500px] p-10 flex flex-col items-center text-center space-y-6"
                    >
                        {children}
                    </motion.div>
                </div>
            </main>

            <MarketplaceFooter />
        </div>
    )
}

// ─── Componente Principal ────────────────────────────────────────────────────
export default function BannedView({ profile }: { profile: any }) {
    const isPermanent = !profile?.banned_until
    const banDate = profile?.banned_at ? new Date(profile.banned_at).toLocaleDateString('pt-BR') : "Desconhecida"
    const unbanDate = profile?.banned_until ? new Date(profile.banned_until).toLocaleDateString('pt-BR') : "Permanente"

    return (
        <Shell>
            <div className="mx-auto h-20 w-20 bg-brand-red/10 text-brand-red rounded-full flex items-center justify-center">
                <AlertCircleIcon size={40} />
            </div>

            <div>
                <h2 className="text-2xl font-bold text-brand-dark mb-2">Conta Banida</h2>
                <p className="text-brand-inactive-text text-sm">
                    Sua conta foi {isPermanent ? "banida permanentemente" : "suspensa temporariamente"} por violar nossos Termos de Serviço.
                </p>
            </div>

            <div className="w-full text-left">
                <InfoCard
                    title="Motivo da Punição"
                    message={
                        <div className="space-y-1">
                            <p className="font-semibold">{profile?.banned_reason || "Violação dos Termos de Uso."}</p>
                            <p className="text-xs opacity-75">
                                {isPermanent
                                    ? `Suspenso em: ${banDate}`
                                    : `Período: ${banDate} até ${unbanDate}`
                                }
                            </p>
                        </div>
                    }
                    color="red"
                />
            </div>

            <Button asChild className="w-full h-[44px] text-[15px] font-bold">
                <a href="mailto:contato@dudit.com.br?subject=Contestação%20de%20Banimento">
                    Contestar esta decisão
                </a>
            </Button>

            <form action="/auth/sign-out" method="POST" className="w-full flex justify-center">
                <button type="submit" className="text-sm text-brand-inactive-text hover:text-brand-red mt-4 font-medium">
                    ← Sair da conta
                </button>
            </form>
        </Shell>
    )
}
