"use client"

import React from "react"
import { motion } from "framer-motion"
import { AlertCircleIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import { InfoCard } from "@/components/reusable"
import { supabaseBrowser as supabase } from "@/lib/supabase/browser-client"
import { EnforcementAppealModal } from "@/components/erp/EnforcementAppealModal"

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
        <div className="min-h-screen flex flex-col font-sans bg-brand-gray dark:bg-dark-bg text-brand-dark dark:text-white">
            {/* HEADER */}
            <header className="w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-white/10 sticky top-0 z-50 h-[70px] flex items-center shadow-sm">
                <div className="container mx-auto px-4 max-w-[1300px] flex justify-between items-center h-full">
                    <div className="shrink-0 flex items-center">
                        <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" width={110} height={32} className="h-8 w-auto" />
                    </div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        Acesso Suspenso
                    </span>
                </div>
            </header>

            <main className="flex-grow relative flex flex-col items-center">
                <div className="w-full bg-[#09211b] h-[250px] absolute top-0 left-0 z-0 overflow-hidden">
                    <WavesBackground />
                    <div className="absolute inset-0 opacity-5 pointer-events-none" />
                </div>

                <div className="w-full flex flex-col items-center pt-[50px] pb-12 z-10 px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl w-full max-w-[540px] p-8 md:p-10 flex flex-col items-center text-center space-y-6 border border-brand-border/60 dark:border-white/10"
                    >
                        {children}
                    </motion.div>
                </div>
            </main>

            <footer className="w-full h-[68px] py-6 border-t border-white/10 bg-brand-dark dark:bg-dark-surface">
                <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-center items-center">
                    <p className="text-white text-xs sm:text-sm font-medium tracking-tight">
                        © {new Date().getFullYear()} Dudit. Todos os direitos reservados.
                    </p>
                </div>
            </footer>
        </div>
    )
}

// ─── Componente Principal ────────────────────────────────────────────────────
export default function BannedView({ profile, user }: { profile: any; user?: any }) {
    const [copied, setCopied] = React.useState(false)
    const [copiedAll, setCopiedAll] = React.useState(false)
    const [isAppealModalOpen, setIsAppealModalOpen] = React.useState(false)

    // Determina o ID do caso (se não existir, gera um determinístico baseado no ID do usuário)
    const rawCaseId = profile?.banned_case_id
    const fallbackCaseId = profile?.user_id || user?.id
        ? `CAS-${(profile?.user_id || user?.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`
        : "CAS-PENDENTE"
    const caseId = rawCaseId || fallbackCaseId

    const isPermanent = !profile?.banned_until
    const banDate = profile?.banned_at ? new Date(profile.banned_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Desconhecida"
    const unbanDate = profile?.banned_until ? new Date(profile.banned_until).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Permanente"
    const reasonText = profile?.banned_reason || "Violação das diretrizes e Termos de Uso da plataforma."

    const handleCopyCaseId = () => {
        navigator.clipboard.writeText(caseId)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
    }

    const handleCopyFullCase = () => {
        const text = [
            `--- DADOS DO CASO DE SUSPENSÃO DUDIT ---`,
            `Protocolo: ${caseId}`,
            `Usuário ID: ${profile?.user_id || user?.id || "N/A"}`,
            `Nome: ${profile?.full_name || "N/A"}`,
            `Status: ${isPermanent ? "Banimento Permanente" : `Suspensão Temporária (Até ${unbanDate})`}`,
            `Data da Aplicação: ${banDate}`,
            `Motivo Informado: ${reasonText}`,
            `----------------------------------------`,
        ].join("\n")

        navigator.clipboard.writeText(text)
        setCopiedAll(true)
        setTimeout(() => setCopiedAll(false), 2500)
    }

    const handleSignOut = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        try {
            document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; max-age=0;"
            document.cookie = "active_partner_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; max-age=0;"
            document.cookie = "active_store_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; max-age=0;"
            localStorage.removeItem("dudit_city")
            localStorage.removeItem("active_partner_id")
            localStorage.removeItem("active_store_id")
            await supabase.auth.signOut({ scope: "local" })
            window.location.href = "/auth/login"
        } catch (error) {
            console.error("Erro ao sair da conta:", error)
            window.location.href = "/auth/login"
        }
    }

    return (
        <Shell>
            <div className="mx-auto h-20 w-20 bg-brand-red/10 text-brand-red rounded-full flex items-center justify-center">
                <AlertCircleIcon size={40} />
            </div>

            <div>
                <h2 className="text-2xl font-bold text-brand-dark dark:text-white mb-2">Conta Suspensa</h2>
                <p className="text-brand-inactive-text dark:text-white/60 text-sm">
                    O acesso a esta conta foi restrito por inconformidade com os Termos de Serviço da Dudit.
                </p>
            </div>

            {/* Protocolo / Case ID Card */}
            <div className="w-full text-left space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-heading">
                        Protocolo do Caso
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <code className="text-sm font-bold text-brand-dark dark:text-white">
                        {caseId}
                    </code>
                    <Button
                        variant="link"
                        onClick={handleCopyCaseId}
                    >
                        {copied ? "Copiado!" : "Copiar Protocolo"}
                    </Button>
                </div>
            </div>

            {/* Detalhes do Caso */}
            <div className="w-full text-left">
                <InfoCard
                    title="Motivo Registrado"
                    message={
                        <div className="space-y-1.5">
                            <p>{reasonText}</p>
                            <p>
                                {isPermanent
                                    ? `Decisão aplicada em: ${banDate}`
                                    : `Vigência: de ${banDate} até ${unbanDate}`
                                }
                            </p>
                        </div>
                    }
                    color="red"
                />
            </div>

            {/* Instruções de Recurso */}
            <div className="w-full text-left pt-4 border-t border-brand-border dark:border-dark-border text-sm text-brand-dark dark:text-dark-body">
                <p className="font-bold mb-1">Deseja recorrer ou tirar dúvidas?</p>
                <p>
                    Se você acredita que esta ação foi aplicada incorretamente, você pode submeter uma solicitação de recurso informando seu protocolo acima para que nossa equipe reavalie a decisão.
                </p>
            </div>

            {/* Ações de Recurso */}
            <div className="w-full space-y-2.5">
                <Button
                    onClick={() => setIsAppealModalOpen(true)}
                    className="w-full"
                >
                    Recorrer da Decisão
                </Button>

                <Button
                    variant="outline"
                    onClick={handleCopyFullCase}
                    className="w-full"
                >
                    {copiedAll ? "Dados do caso copiados!" : "Copiar resumo completo do caso"}
                </Button>
            </div>

            <form onSubmit={handleSignOut} className="w-full flex justify-center pt-2">
                <Button type="submit" variant="link" className="text-red-700 dark:text-red-300/80 hover:text-red-800 dark:hover:text-red-300">
                    Sair da conta
                </Button>
            </form>

            <EnforcementAppealModal
                isOpen={isAppealModalOpen}
                onClose={() => setIsAppealModalOpen(false)}
                caseId={caseId}
                entityId={profile?.user_id || user?.id || "user"}
                entityName={profile?.full_name || user?.email || "Usuário"}
                entityType="user"
                reason={reasonText}
                userEmail={user?.email}
                userName={profile?.full_name}
            />
        </Shell>
    )
}
