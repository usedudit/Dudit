"use client"

import React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { AlertCircleIcon } from "@/lib/icons"
import { Button } from "@/components/reusable"
import { InfoCard } from "@/components/reusable"
import MarketplaceFooter from "../marketplace/MarketplaceFooter"
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
                <div className="w-full bg-[#003229] h-[250px] absolute top-0 left-0 z-0 overflow-hidden">
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

    const handleSignOut = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            document.cookie = "dudit_city=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
            localStorage.removeItem("dudit_city")
            await supabase.auth.signOut({ scope: "local" })
            window.location.href = "/auth/login"
        } catch (error) {
            console.error("Erro ao sair da conta:", error)
        }
    }

    // Monta o e-mail pré-formatado para contestação
    const mailSubject = encodeURIComponent(`[Recurso Dudit] Solicitação de Revisão - Protocolo #${caseId}`)
    const mailBody = encodeURIComponent(
        `Olá equipe de suporte da Dudit,\n\n` +
        `Gostaria de solicitar a revisão e recurso do bloqueio da minha conta sob o protocolo #${caseId}.\n\n` +
        `--- Informações do Caso ---\n` +
        `• Protocolo do Caso: ${caseId}\n` +
        `• ID do Usuário: ${profile?.user_id || user?.id || "N/A"}\n` +
        `• E-mail cadastrado: ${user?.email || "N/A"}\n` +
        `• Motivo registrado: ${reasonText}\n\n` +
        `--- Justificativa do Recurso ---\n` +
        `[Por favor, descreva aqui seus argumentos ou esclarecimentos sobre o ocorrido]:\n\n`
    )
    const appealMailUrl = `mailto:contato@dudit.com.br?subject=${mailSubject}&body=${mailBody}`

    return (
        <Shell>
            <div className="mx-auto h-20 w-20 bg-brand-red/10 text-brand-red rounded-full flex items-center justify-center">
                <AlertCircleIcon size={40} />
            </div>

            <div>
                <h2 className="text-2xl font-bold text-brand-dark mb-2">Conta Suspensa</h2>
                <p className="text-brand-inactive-text text-sm">
                    O acesso a esta conta foi restrito por inconformidade com os Termos de Serviço da Dudit.
                </p>
            </div>

            {/* Protocolo / Case ID Card */}
            <div className="w-full bg-brand-gray/80 rounded-2xl p-4 border border-brand-border text-left space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">
                        Protocolo do Caso
                    </span>
                    <button
                        onClick={handleCopyCaseId}
                        className="inline-flex items-center gap-1 text-xs font-bold text-brand-green hover:underline cursor-pointer"
                    >
                        {copied ? "✓ Copiado!" : "Copiar Protocolo"}
                    </button>
                </div>
                <div className="flex items-center justify-between bg-white px-3.5 py-2.5 rounded-xl border border-brand-border">
                    <code className="font-mono text-sm font-bold text-brand-dark tracking-wide">
                        {caseId}
                    </code>
                    <span className="text-[11px] font-semibold text-brand-inactive-text">
                        {isPermanent ? "Permanente" : `Até ${unbanDate}`}
                    </span>
                </div>
            </div>

            {/* Detalhes do Caso */}
            <div className="w-full text-left">
                <InfoCard
                    title="Motivo Registrado"
                    message={
                        <div className="space-y-1.5">
                            <p className="font-semibold text-sm">{reasonText}</p>
                            <p className="text-xs opacity-75">
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
            <div className="w-full text-left bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                <p className="font-bold mb-1">Deseja recorrer ou tirar dúvidas?</p>
                <p className="text-blue-800/80 dark:text-blue-300/80">
                    Se você acredita que esta ação foi aplicada incorretamente, você pode submeter uma solicitação de recurso informando seu protocolo acima para que nossa equipe reavalie a decisão.
                </p>
            </div>

            {/* Ações de Recurso */}
            <div className="w-full space-y-2.5">
                <Button
                    type="button"
                    onClick={() => setIsAppealModalOpen(true)}
                    className="w-full h-[46px] text-[15px] font-bold"
                >
                    Recorrer da Decisão
                </Button>

                <Button
                    variant="outline"
                    onClick={handleCopyFullCase}
                    className="w-full h-[40px] text-xs font-semibold"
                >
                    {copiedAll ? "✓ Dados do caso copiados!" : "Copiar resumo completo do caso"}
                </Button>
            </div>

            <form onSubmit={handleSignOut} className="w-full flex justify-center pt-2">
                <button type="submit" className="text-sm text-brand-inactive-text hover:text-brand-red font-medium transition-colors">
                    ← Sair da conta
                </button>
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
