"use client"

import React from "react"
import { motion } from "framer-motion"
import { AlertOctagon, HelpCircleIcon } from "lucide-react"
import { Button } from "@/components/reusable"
import { InfoCard } from "@/components/reusable"

// ─── Background ──────────────────────────────────────────────────────────────
const WavesBackground = React.memo(() => (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <img 
            src="https://img.dudit.com.br/static/banners/WavesPattern.png" 
            alt="" 
            className="w-full h-full object-cover"
        />
    </div>
))
WavesBackground.displayName = "WavesBackground"

// ─── Shell compartilhado ─────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col font-sans bg-brand-gray">
            <header className="w-full bg-white border-b border-gray-100 sticky top-0 z-50 h-[80px] flex items-center shadow-sm">
                <div className="container mx-auto px-4 max-w-[1300px]">
                    <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" width={110} height={32} className="h-8 w-auto grayscale opacity-50" />
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

            <footer className="bg-[#2D2D37] text-white pt-8 pb-8 mt-auto w-full">
                <div className="container mx-auto px-4 max-w-[1300px] mt-8 pt-6 flex justify-between items-center text-[11px] text-gray-400 border-t border-gray-700">
                    <p>© {new Date().getFullYear()} Dudit Inc. Todos os direitos reservados.</p>
                </div>
            </footer>
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
                <AlertOctagon size={40} />
            </div>

            <div className="space-y-2">
                <h2 className="text-2xl font-bold text-gray-800">Conta Banida</h2>
                <p className="text-gray-500 text-sm">
                    Sua conta foi {isPermanent ? "banida permanentemente" : "suspensa temporariamente"} por violar nossos Termos de Serviço.
                </p>
            </div>

            <div className="w-full space-y-3 mt-4 text-left">
                <InfoCard
                    title="Motivo da Punição"
                    message={profile?.banned_reason || "Violação dos Termos de Uso."}
                    color="red"
                />

                <div className="flex gap-3">
                    <div className="flex-1">
                        <InfoCard
                            title="Data de Início"
                            message={banDate}
                            color="gray"
                        />
                    </div>
                    <div className="flex-1">
                        <InfoCard
                            title="Término"
                            message={unbanDate}
                            color={isPermanent ? "gray" : "orange"}
                        />
                    </div>
                </div>
            </div>

            <div className="w-full pt-4 space-y-3 border-t mt-6">
                <Button asChild className="w-full h-12" variant="outline">
                    <a href="mailto:suporte@dudit.com.br?subject=Contestação%20de%20Banimento">
                        Contestar esta decisão
                    </a>
                </Button>

                <form action="/auth/sign-out" method="POST" className="w-full">
                    <Button type="submit" variant="ghost" className="w-full h-12 text-gray-500 hover:text-gray-800">
                        Sair da conta
                    </Button>
                </form>
            </div>
        </Shell>
    )
}
