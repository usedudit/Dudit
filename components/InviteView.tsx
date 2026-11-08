"use client"

import React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { BriefcaseIcon, UserIcon, CheckCircleIcon, LogoutIcon, AlertCircleIcon } from "@/lib/icons"
import { Button, InfoCard } from "@/components/reusable"
import MarketplaceFooter from "./marketplace/MarketplaceFooter"

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
        <div className="min-h-screen flex flex-col font-sans bg-brand-gray dark:bg-dark-background transition-colors duration-300">
            {/* HEADER */}
            <header className="w-full bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border sticky top-0 z-50 h-[80px] flex items-center shadow-sm">
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
                <div className="w-full bg-[#09211b] h-[250px] absolute top-0 left-0 z-0 overflow-hidden">
                    <WavesBackground />
                    <div className="absolute inset-0 opacity-5 pointer-events-none" />
                </div>

                <div className="w-full flex flex-col items-center pt-[60px] pb-12 z-10 px-4">
                    <motion.div
                        initial="hidden" animate="visible" exit="exit"
                        className="bg-white dark:bg-dark-surface rounded-lg shadow-xl w-full max-w-[500px] p-10 flex flex-col items-center text-center space-y-6"
                    >
                        {children}
                    </motion.div>
                </div>
            </main>

            <MarketplaceFooter />
        </div>
    )
}

// ─── Types ───────────────────────────────────────────────────────────────────
type InviteViewProps =
    | {
        mode: "invite"
        partnerName: string
        inviteEmail: string
        userEmail?: string | null
        onAccept: () => Promise<void>
        onLoginRedirect: () => Promise<void>
    }
    | {
        mode: "accept"
        partnerName: string
        userEmail: string
        inviteEmail: string
        isMismatch: boolean
        onAccept: () => Promise<void>
        onLoginRedirect: () => Promise<void>
    }
    | {
        mode: "error"
        message: string
    }

// ─── Componente principal ────────────────────────────────────────────────────
export default function InviteView(props: InviteViewProps) {

    // ── mode: error ──────────────────────────────────────────────────────────
    if (props.mode === "error") {
        return (
            <Shell>
                <div className="mx-auto h-20 w-20 bg-brand-red/10 text-brand-red rounded-full flex items-center justify-center">
                    <AlertCircleIcon size={40} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Convite Inválido</h2>
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm">
                        Ocorreu um problema ao processar seu convite.
                    </p>
                </div>

                <div className="w-full text-left">
                    <InfoCard
                        message={props.message}
                        color="red"
                    />
                </div>

                <Button asChild className="w-full h-[44px] text-[15px] font-bold">
                    <Link href="/" prefetch={false}>Ir para a página inicial</Link>
                </Button>

                <Link href="/" prefetch={false} className="text-sm text-brand-inactive-text dark:text-dark-body hover:text-brand-green mt-4 font-medium">
                    ← Voltar para o início
                </Link>
            </Shell>
        )
    }

    // ── mode: accept ─────────────────────────────────────────────────────────
    if (props.mode === "accept") {
        const { partnerName, userEmail, inviteEmail, isMismatch, onAccept, onLoginRedirect } = props
        return (
            <Shell>
                <div className="mx-auto h-20 w-20 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center">
                    <BriefcaseIcon size={40} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Finalizar Convite</h2>
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm">
                        Você está prestes a entrar na equipe de <strong className="text-brand-dark dark:text-dark-heading">{partnerName}</strong>.
                    </p>
                </div>

                <div className={`w-full p-4 rounded-xl border text-left ${isMismatch ? "bg-red-50 border-red-200" : "bg-gray-50 dark:bg-dark-border/30 border-brand-border dark:border-dark-border"}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">Conectado como:</span>
                    </div>
                    <p className={`font-semibold break-all text-sm ${isMismatch ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"}`}>
                        {userEmail}
                    </p>
                </div>

                {isMismatch ? (
                    <div className="w-full space-y-4">
                        <InfoCard
                            message={`Este convite foi enviado para ${inviteEmail}. Para aceitar, entre com a conta correta.`}
                            color="red"
                        />
                        <form action={onLoginRedirect} className="w-full">
                            <Button variant="outline" type="submit" className="w-full flex h-12" leftIcon={<LogoutIcon size={18} />}>
                                Entrar com outra conta
                            </Button>
                        </form>
                    </div>
                ) : (
                    <form action={onAccept} className="w-full">
                        <Button type="submit" className="w-full flex h-12" leftIcon={<CheckCircleIcon size={18} />}>
                            Confirmar Entrada
                        </Button>
                    </form>
                )}
            </Shell>
        )
    }

    // ── mode: invite ─────────────────────────────────────────────────────────
    const { partnerName, inviteEmail, userEmail, onAccept, onLoginRedirect } = props
    return (
        <Shell>
            <div className="mx-auto h-20 w-20 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center">
                <BriefcaseIcon size={40} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Convite para equipe</h2>
                <p className="text-brand-inactive-text dark:text-dark-body text-sm">
                    Você foi convidado para participar de <strong className="text-brand-dark dark:text-dark-heading">{partnerName}</strong>.
                </p>
            </div>

            <div className="w-full p-4 rounded-xl bg-gray-50 dark:bg-dark-border/30 border border-brand-border dark:border-dark-border text-left">
                <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-1">Este convite foi enviado para:</p>
                <p className="font-semibold text-brand-dark dark:text-dark-heading break-all text-sm">{inviteEmail}</p>
            </div>

            {userEmail ? (
                <>
                    <div className="w-full p-4 rounded-xl bg-gray-50 dark:bg-dark-border/30 border border-brand-border dark:border-dark-border text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">Conectado como:</span>
                        </div>
                        <p className="font-semibold text-brand-dark dark:text-dark-heading break-all text-sm">{userEmail}</p>
                    </div>
                    <form action={onAccept} className="w-full">
                        <Button type="submit" className="w-full flex items-center justify-center gap-2 h-12">
                            <CheckCircleIcon size={18} /> Confirmar Entrada
                        </Button>
                    </form>
                </>
            ) : (
                <form action={onLoginRedirect} className="w-full">
                    <Button type="submit" className="w-full flex items-center justify-center gap-2 h-12">
                        Fazer login para aceitar
                    </Button>
                </form>
            )}
        </Shell>
    )
}