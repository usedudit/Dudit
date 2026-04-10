"use client"

import React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Building2, User, CheckCircle2, LogOut, HelpCircleIcon } from "lucide-react"
import { Button, InfoCard } from "@/components/reusable"

// ─── Background ──────────────────────────────────────────────────────────────
const CityBackground = React.memo(() => (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <svg className="w-full h-full" preserveAspectRatio="xMidYMax slice" viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg">
            <circle cx="410" cy="110" r="16" fill="white" opacity="0.2" />
            <path d="M480 140 Q 500 110, 520 110 T 560 140 Z" fill="none" stroke="#044d4b" strokeWidth="2" />
            <path d="M360 150 Q 375 130, 390 130 T 420 150 Z" fill="none" stroke="#044d4b" strokeWidth="2" transform="translate(0, 10)" />
            <path d="M630 130 Q 650 110, 670 110 T 700 130 Z" fill="none" stroke="white" strokeWidth="2" opacity="0.3" />
            <path d="M260 320 V190 H300 V320 M270 320 V200 M290 320 V200" stroke="#044d4b" strokeWidth="2" fill="none" />
            <path d="M690 320 V110 H715 V320 M720 320 V80 H750 V320" stroke="#044d4b" strokeWidth="2" fill="none" />
            <line x1="725" y1="90" x2="745" y2="90" stroke="#044d4b" strokeWidth="2" />
            <line x1="725" y1="110" x2="745" y2="110" stroke="#044d4b" strokeWidth="2" />
            <line x1="725" y1="130" x2="745" y2="130" stroke="#044d4b" strokeWidth="2" />
            <path d="M760 320 V160 H775 V180 H780 V320" stroke="#044d4b" strokeWidth="2" fill="none" />
            <path d="M300 190 V140 H450 V200" stroke="#044d4b" strokeWidth="2" fill="none" />
        </svg>
    </div>
))
CityBackground.displayName = "CityBackground"

// ─── Shell compartilhado ─────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col font-sans bg-brand-gray">
            <header className="w-full bg-white border-b border-gray-100 sticky top-0 z-50 h-[80px] flex items-center shadow-sm">
                <div className="container mx-auto px-4 max-w-[1300px]">
                    <Link href="/" prefetch={false}>
                        <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" width={110} height={32} className="h-8 w-auto" />
                    </Link>
                </div>
            </header>

            <main className="flex-grow relative flex flex-col items-center">
                <div className="w-full bg-[#003d32] h-[250px] absolute top-0 left-0 z-0 overflow-hidden">
                    <CityBackground />
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

                    <div className="mt-16 flex items-center text-gray-500 text-[14px]">
                        <HelpCircleIcon className="mr-2 h-5 w-5" />
                        <span>Precisa de ajuda?{" "}
                            <a href="#" className="text-brand-green font-bold hover:underline">Fale com a gente</a>
                        </span>
                    </div>
                </div>
            </main>

            <footer className="bg-[#2D2D37] text-white pt-8 pb-8 mt-auto w-full">
                <div className="container mx-auto px-4 max-w-[1300px] flex flex-col md:flex-row justify-between items-center h-16">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="shrink-0 bg-white p-1 rounded-full w-10 h-10 flex items-center justify-center">
                            <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" width={30} height={10} className="w-full h-auto" />
                        </div>
                        <nav>
                            <ul className="flex flex-wrap justify-center gap-6 text-[13px] font-bold">
                                {["Comprar", "Vender", "Quem somos", "Atendimento", "Termos e Privacidade"].map((item) => (
                                    <li key={item}><a href="#" className="hover:underline">{item}</a></li>
                                ))}
                            </ul>
                        </nav>
                    </div>
                </div>
                <div className="container mx-auto px-4 max-w-[1300px] mt-8 pt-6 flex flex-col md:flex-row justify-between items-center text-[11px] text-gray-400 border-t border-gray-700">
                    <p>© {new Date().getFullYear()} Dudit Inc. Todos os direitos reservados.</p>
                </div>
            </footer>
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
                <InfoCard
                    title="Convite Inválido"
                    message={props.message}
                    color="red"
                />
                <Button asChild className="w-full h-12">
                    <Link href="/" prefetch={false}>Ir para a página inicial</Link>
                </Button>
            </Shell>
        )
    }

    // ── mode: accept ─────────────────────────────────────────────────────────
    if (props.mode === "accept") {
        const { partnerName, userEmail, inviteEmail, isMismatch, onAccept, onLoginRedirect } = props
        return (
            <Shell>
                <div className="mx-auto h-20 w-20 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center">
                    <Building2 size={40} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Finalizar Convite</h2>
                    <p className="text-gray-500 text-sm">
                        Você está prestes a entrar na equipe de <strong className="text-gray-800">{partnerName}</strong>.
                    </p>
                </div>

                <div className={`w-full p-4 rounded-xl border text-left ${isMismatch ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <User size={16} className="text-gray-400" />
                        <span className="text-xs text-gray-500 font-medium">Conectado como:</span>
                    </div>
                    <p className={`font-semibold break-all text-sm ${isMismatch ? "text-brand-red" : "text-gray-800"}`}>
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
                            <button type="submit" className="w-full flex items-center justify-center gap-2 h-12 rounded-lg border border-gray-300 text-gray-700 font-bold text-[15px] hover:bg-gray-50 transition-colors">
                                <LogOut size={18} /> Entrar com outra conta
                            </button>
                        </form>
                    </div>
                ) : (
                    <form action={onAccept} className="w-full">
                        <button type="submit" className="w-full flex items-center justify-center gap-2 h-12 rounded-lg bg-brand-green text-white font-bold text-[15px] hover:opacity-90 transition-opacity">
                            <CheckCircle2 size={18} /> Confirmar Entrada
                        </button>
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
                <Building2 size={40} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Convite para equipe</h2>
                <p className="text-gray-500 text-sm">
                    Você foi convidado para participar de <strong className="text-gray-800">{partnerName}</strong>.
                </p>
            </div>

            <div className="w-full p-4 rounded-xl bg-gray-50 border border-gray-200 text-left">
                <p className="text-xs text-gray-500 mb-1">Este convite foi enviado para:</p>
                <p className="font-semibold text-gray-800 break-all text-sm">{inviteEmail}</p>
            </div>

            {userEmail ? (
                <>
                    <div className="w-full p-4 rounded-xl bg-gray-50 border border-gray-200 text-left">
                        <div className="flex items-center gap-2 mb-1">
                            <User size={16} className="text-gray-400" />
                            <span className="text-xs text-gray-500 font-medium">Conectado como:</span>
                        </div>
                        <p className="font-semibold text-gray-800 break-all text-sm">{userEmail}</p>
                    </div>
                    <form action={onAccept} className="w-full">
                        <button type="submit" className="w-full flex items-center justify-center gap-2 h-12 rounded-lg bg-brand-green text-white font-bold text-[15px] hover:opacity-90 transition-opacity">
                            <CheckCircle2 size={18} /> Confirmar Entrada
                        </button>
                    </form>
                </>
            ) : (
                <form action={onLoginRedirect} className="w-full">
                    <button type="submit" className="w-full flex items-center justify-center gap-2 h-12 rounded-lg bg-brand-green text-white font-bold text-[15px] hover:opacity-90 transition-opacity">
                        Fazer login para aceitar
                    </button>
                </form>
            )}
        </Shell>
    )
}