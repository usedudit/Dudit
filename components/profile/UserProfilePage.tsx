"use client"

import { useState, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { updateProfileAction } from "@/app/actions/profile"
import { changePasswordAction } from "@/app/actions/shared/password"
import { useNotification } from "@/hooks/use-notification"
import { useRouter, useSearchParams } from "next/navigation"
import { formatE164ToDisplay } from "@/lib/utils/phone-utils"
import { MarketplaceHeader } from "../marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "../marketplace/MarketplaceFooter"
import { createClient } from "@/lib/supabase/client"
import { DefaultModal, RadioButton, Button, FormTextarea, InfoCard, Input } from "@/components/reusable"
import { Calendar, Users as UsersIcon, FileText, AlertOctagon, CheckCircle } from "lucide-react"

import { View, EditField } from "./profile-shared"
import { MainView } from "./MainView"
import { AccountView } from "./AccountView"
import { AddressView } from "./AddressView"
import { SecurityView } from "./SecurityView"
import { TwoFactorView } from "./TwoFactorView"
import { ReviewsView } from "./ReviewsView"
import { NotificationsView } from "./NotificationsView"
import { AlertTriangleIcon } from "@/lib/icons"

interface UserProfilePageProps {
    userId: string
    profile: any
    addresses: any[]
    initialFullName?: string
    email: string
    hasPassword: boolean
    authProvider: string
}

export function UserProfilePage({ userId, profile, addresses: initialAddresses, initialFullName, email, hasPassword, authProvider }: UserProfilePageProps) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const router = useRouter()
    const searchParams = useSearchParams()
    const initialTab = searchParams.get("tab") as View | null

    const [currentView, setCurrentView] = useState<View>(initialTab || "main")

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const tabFromUrl = params.get("tab") as View | null

        if (tabFromUrl && tabFromUrl !== currentView) {
            setCurrentView(tabFromUrl)
        } else if (!tabFromUrl && currentView !== "main") {
            setCurrentView("main")
        }
    }, [])

    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search)
            const tabFromUrl = params.get("tab") as View | null
            setCurrentView(tabFromUrl || "main")
        }

        window.addEventListener("popstate", handlePopState)
        return () => window.removeEventListener("popstate", handlePopState)
    }, [])

    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState<string | null>(null)

    // Account deletion states
    const [deleteStep, setDeleteStep] = useState<"none" | "reason" | "confirm" | "success">("none")
    const [customReason, setCustomReason] = useState("")
    const [isDeleting, setIsDeleting] = useState(false)
    const [dryRunReport, setDryRunReport] = useState<any>(null)
    const [loadingDryRun, setLoadingDryRun] = useState(false)
    const [confirmText, setConfirmText] = useState("")
    const [activeSubModalOpen, setActiveSubModalOpen] = useState(false)

    const handleContinueToConfirm = async () => {
        setLoadingDryRun(true)
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const { getAccountDeletionDryRunAction } = await import("@/app/actions/shared/account")
            const res = await getAccountDeletionDryRunAction(token)
            if (res.success && res.report) {
                setDryRunReport(res.report)
                setDeleteStep("confirm")
            } else {
                notifyError("Erro", res.error || "Não foi possível carregar o resumo da conta.")
            }
        } catch (err) {
            notifyError("Erro", "Erro ao carregar o resumo da conta.")
        } finally {
            setLoadingDryRun(false)
        }
    }

    const handleDeleteAccount = async () => {
        if (confirmText !== "EXCLUIR") {
            notifyError("Erro", "Por favor, digite EXCLUIR para confirmar.")
            return
        }

        setIsDeleting(true)
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const finalReason = customReason.trim() || null

            const { deleteAccountAction } = await import("@/app/actions/shared/account")
            const res = await deleteAccountAction(userId, finalReason, token)

            if (res.error) {
                if (res.error === "active_subscription") {
                    setDeleteStep("none")
                    setActiveSubModalOpen(true)
                } else {
                    notifyError("Erro ao excluir", res.error)
                }
                return
            }

            // On success, sign out and redirect immediately
            const supabase = createClient()
            await supabase.auth.signOut()
            window.location.href = "/auth/login?deleted=true"
        } catch (e: any) {
            notifyError("Erro", "Ocorreu um erro ao excluir a conta.")
        } finally {
            setIsDeleting(false)
        }
    }
    const [userAddresses, setUserAddresses] = useState<any[]>(initialAddresses || [])
    const [error, setError] = useState<string | null>(null)
    const [editing, setEditing] = useState<Record<EditField, boolean>>({
        name: false, cpf: false, phone: false, password: false, address: false,
        secPhone: false, secEmail: false,
    })

    // Email change flow (account page)
    const [isChangingEmail, setIsChangingEmail] = useState(false)
    const [newEmail, setNewEmail] = useState("")
    const [emailOtp, setEmailOtp] = useState("")
    const [otpSent, setOtpSent] = useState(false)
    const [canResend, setCanResend] = useState(true)
    const [resendTimer, setResendTimer] = useState(0)
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const nextResendRef = useRef(0)
    const resendAttempts = useRef(0)

    // Email change flow (security page)
    const [isChangingSecEmail, setIsChangingSecEmail] = useState(false)
    const [newSecEmail, setNewSecEmail] = useState("")
    const [secEmailOtp, setSecEmailOtp] = useState("")
    const [secOtpSent, setSecOtpSent] = useState(false)
    const [secCanResend, setSecCanResend] = useState(true)
    const [secResendTimer, setSecResendTimer] = useState(0)
    const secTimerRef = useRef<NodeJS.Timeout | null>(null)
    const secNextResendRef = useRef(0)
    const secResendAttempts = useRef(0)

    const [accountData, setAccountData] = useState({
        fullName: profile?.full_name || initialFullName || "",
        cpf: profile?.cpf || "",
        phone: profile?.phone ? formatE164ToDisplay(profile.phone) : "",
        email,
    })

    const [addressData, setAddressData] = useState({
        zipCode: profile?.zip_code || "",
        street: profile?.street || "",
        number: profile?.number || "",
        complement: profile?.complement || "",
        neighborhood: profile?.neighborhood || "",
        city: profile?.city || "",
        state: profile?.state || "",
    })

    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    })

    useEffect(() => {
        if (isChangingEmail && nextResendRef.current > Date.now()) {
            const remaining = Math.ceil((nextResendRef.current - Date.now()) / 1000)
            startTimer(timerRef, setResendTimer, setCanResend, nextResendRef, remaining, false)
        }
    }, [isChangingEmail])

    useEffect(() => () => {
        if (timerRef.current) clearInterval(timerRef.current)
        if (secTimerRef.current) clearInterval(secTimerRef.current)
    }, [])

    // ── Helpers ───────────────────────────────────────────────────────────────

    const clearMessages = () => { setError(null); setSuccess(null) }

    const setEdit = (field: EditField, val: boolean) => {
        clearMessages()
        setEditing(e => ({ ...e, [field]: val }))
    }

    const navigate = (view: View) => {
        clearMessages()
        setEditing({ name: false, cpf: false, phone: false, password: false, address: false, secPhone: false, secEmail: false })
        setIsChangingEmail(false)
        setIsChangingSecEmail(false)

        setCurrentView(view)

        const url = view === "main" ? "/perfil" : `/perfil?tab=${view}`
        window.history.pushState(null, "", url)
    }

    const startTimer = (
        ref: React.MutableRefObject<NodeJS.Timeout | null>,
        setTimer: any,
        setCanSend: (v: boolean) => void,
        nextRef: React.MutableRefObject<number>,
        seconds: number,
        setRef = true,
    ) => {
        if (setRef) nextRef.current = Date.now() + seconds * 1000
        setCanSend(false)
        setTimer(seconds)
        if (ref.current) clearInterval(ref.current)
        ref.current = setInterval(() => {
            setTimer((prev: number) => {
                if (prev <= 1) {
                    clearInterval(ref.current!); ref.current = null
                    setCanSend(true); nextRef.current = 0
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    const saveField = async (
        fn: (csrfToken: string) => Promise<{ error?: string }>,
        successMsg: string,
        onSuccess?: () => void,
    ) => {
        setIsLoading(true); clearMessages()
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const result = await fn(token)
            if (result.error) {
                setError(result.error)
                notifyError("Erro ao salvar", result.error)
            }
            else {
                setSuccess(successMsg)
                notifySuccess("Sucesso", successMsg)
                onSuccess?.()
            }
        } catch {
            setError("Erro de validação de segurança. Tente novamente.")
            notifyError("Erro de segurança", "Tente novamente mais tarde.")
        } finally {
            setIsLoading(false)
        }
    }

    // ── Save handlers ─────────────────────────────────────────────────────────

    const handleSaveName = () => {
        if (!accountData.fullName.trim()) { setError("O nome completo é obrigatório"); return }
        saveField((token) => updateProfileAction({ fullName: accountData.fullName, csrf_token: token }), "Nome atualizado!", () => setEdit("name", false))
    }

    const handleSaveCpf = () =>
        saveField((token) => updateProfileAction({ cpf: accountData.cpf, csrf_token: token }), "CPF atualizado!", () => setEdit("cpf", false))

    const handleSavePhone = (field: "phone" | "secPhone" = "phone") =>
        saveField((token) => updateProfileAction({ phone: accountData.phone, csrf_token: token }), "Telefone atualizado!", () => setEdit(field, false))

    const handleSaveAddress = () => {
        const { zipCode, street, number, neighborhood, city, state } = addressData
        if (!zipCode || !street || !number || !neighborhood || !city || !state) {
            setError("Preencha todos os campos obrigatórios"); return
        }
        saveField((token) => updateProfileAction({ ...addressData, csrf_token: token }), "Endereço atualizado!", () => setEdit("address", false))
    }

    const handleChangePassword = async () => {
        if (passwordData.newPassword.length < 6) { setError("A senha deve ter pelo menos 6 caracteres"); return }
        if (passwordData.newPassword !== passwordData.confirmPassword) { setError("As senhas não coincidem"); return }
        if (hasPassword && !passwordData.currentPassword) { setError("Digite sua senha atual"); return }
        setIsLoading(true); clearMessages()
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const result = await changePasswordAction({
                currentPassword: hasPassword ? passwordData.currentPassword : undefined,
                newPassword: passwordData.newPassword,
                confirmPassword: passwordData.confirmPassword,
                csrf_token: token,
            })
            if (result.error) {
                setError(result.error)
                notifyError("Erro", result.error)
            }
            else {
                notifySuccess("Sucesso", "Senha alterada com sucesso!")
                // Automatically restore session using the new password, then refresh UI
                const { supabaseBrowser: supabase } = await import("@/lib/supabase/browser-client")
                await supabase.auth.signInWithPassword({
                    email: email,
                    password: passwordData.newPassword
                })

                // Sign out all OTHER devices/sessions (keeps current session active)
                await supabase.auth.signOut({ scope: 'others' })

                // Give a moment for the toast to be visible before reloading
                setTimeout(() => {
                    window.location.reload()
                }, 1500)
            }
        } catch {
            setError("Erro ao alterar senha")
            notifyError("Erro", "Erro ao alterar senha")
        }
        finally { setIsLoading(false) }
    }

    // ── Email change helpers ──────────────────────────────────────────────────

    const makeEmailHandlers = (
        emailVal: string,
        setEmailVal: (v: string) => void,
        setOtpVal: (v: string) => void,
        setOtpSentVal: (v: boolean) => void,
        setCanResendVal: (v: boolean) => void,
        setResendTimerVal: (v: number) => void,
        tRef: React.MutableRefObject<NodeJS.Timeout | null>,
        nRef: React.MutableRefObject<number>,
        attemptsRef: React.MutableRefObject<number>,
        setChanging: (v: boolean) => void,
        otpVal: string,
    ) => ({
        sendOtp: async () => {
            setError("Funcionalidade temporariamente desabilitada")
            setIsLoading(false)
        },
        verifyOtp: async () => {
            setError("Funcionalidade temporariamente desabilitada")
            setIsLoading(false)
        },
        cancel: () => { setChanging(false); setOtpSentVal(false); setEmailVal(""); setOtpVal(""); clearMessages() },
    })

    const accountEmailHandlers = makeEmailHandlers(
        newEmail, setNewEmail, setEmailOtp, setOtpSent, setCanResend, setResendTimer,
        timerRef, nextResendRef, resendAttempts, setIsChangingEmail, emailOtp,
    )

    const secEmailHandlers = makeEmailHandlers(
        newSecEmail, setNewSecEmail, setSecEmailOtp, setSecOtpSent, setSecCanResend, setSecResendTimer,
        secTimerRef, secNextResendRef, secResendAttempts, setIsChangingSecEmail, secEmailOtp,
    )

    const formattedAddress = () => {
        const { street, number, complement, neighborhood, city, state, zipCode } = addressData
        if (!street && !city) return ""
        return [
            street && number ? `${street}, ${number}` : street,
            complement, neighborhood,
            city && state ? `${city} - ${state}` : city || state,
            zipCode,
        ].filter(Boolean).join(", ")
    }

    // ── Render ───────────────────────────────────────────────────────────────

    const getViewTitle = () => {
        switch (currentView) {
            case "main": return "Meu perfil"
            case "informacoes-da-conta": return "Informações da conta"
            case "enderecos": return "Endereço"
            case "seguranca": return "Segurança"
            case "two-factor": return "Autenticação 2FA"
            case "avaliacoes": return "Minhas avaliações"
            case "notificacoes": return "Notificações"
            default: return "Meu perfil"
        }
    }

    return (
        <>
            <MarketplaceHeader simpleTitle={getViewTitle()} />
            <div className="min-h-screen bg-white pt-[40px] lg:pt-[110px] font-sans flex flex-col">
                <style>{`.animate-fade-in{animation:fadeIn 0.4s ease-out forwards}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
                <div className="container mx-auto px-4 max-w-[1300px] mt-12 lg:mt-6 mb-6 flex-grow pb-24 lg:pb-12">
                    <AnimatePresence mode="wait">
                        {currentView === "main" && <MainView key="main" navigate={navigate} />}
                        {currentView === "informacoes-da-conta" && (
                            <AccountView
                                key="account"
                                navigate={navigate}
                                accountData={accountData}
                                setAccountData={setAccountData}
                                editing={editing}
                                setEdit={setEdit}
                                isLoading={isLoading}
                                error={error}
                                success={success}
                                isChangingEmail={isChangingEmail}
                                setIsChangingEmail={setIsChangingEmail}
                                otpSent={otpSent}
                                setOtpSent={setOtpSent}
                                newEmail={newEmail}
                                setNewEmail={setNewEmail}
                                emailOtp={emailOtp}
                                setEmailOtp={setEmailOtp}
                                canResend={canResend}
                                resendTimer={resendTimer}
                                accountEmailHandlers={accountEmailHandlers}
                                handleSavePhone={handleSavePhone}
                                handleSaveName={handleSaveName}
                                handleSaveCpf={handleSaveCpf}
                                clearMessages={clearMessages}
                            />
                        )}
                        {currentView === "enderecos" && (
                            <AddressView
                                key="address"
                                navigate={navigate}
                                userId={userId}
                                addresses={userAddresses}
                                setAddresses={setUserAddresses}
                                isLoading={isLoading}
                                setIsLoading={setIsLoading}
                                error={error}
                                setError={setError}
                                success={success}
                                setSuccess={setSuccess}
                                clearMessages={clearMessages}
                            />
                        )}
                        {currentView === "seguranca" && (
                            <SecurityView
                                key="password"
                                navigate={navigate}
                                accountData={accountData}
                                setAccountData={setAccountData}
                                editing={editing}
                                setEdit={setEdit}
                                isLoading={isLoading}
                                error={error}
                                success={success}
                                isChangingSecEmail={isChangingSecEmail}
                                setIsChangingSecEmail={setIsChangingSecEmail}
                                secOtpSent={secOtpSent}
                                setSecOtpSent={setSecOtpSent}
                                newSecEmail={newSecEmail}
                                setNewSecEmail={setNewSecEmail}
                                secEmailOtp={secEmailOtp}
                                setSecEmailOtp={setSecEmailOtp}
                                secCanResend={secCanResend}
                                secResendTimer={secResendTimer}
                                secEmailHandlers={secEmailHandlers}
                                passwordData={passwordData}
                                setPasswordData={setPasswordData}
                                hasPassword={hasPassword}
                                authProvider={authProvider}
                                handleChangePassword={handleChangePassword}
                                handleSavePhone={handleSavePhone}
                                clearMessages={clearMessages}
                                onDeleteClick={() => setDeleteStep("reason")}
                            />
                        )}
                        {currentView === "two-factor" && <TwoFactorView key="2fa" navigate={navigate} />}
                        {currentView === "avaliacoes" && <ReviewsView key="avaliacoes" navigate={navigate} />}
                        {currentView === "notificacoes" && <NotificationsView key="notificacoes" navigate={navigate} />}
                    </AnimatePresence>
                </div>
                <MarketplaceFooter />
            </div>

            {/* Account Deletion Flow Modal */}
            <DefaultModal
                isOpen={deleteStep !== "none" && deleteStep !== "success"}
                onClose={() => {
                    if (!isDeleting) {
                        setDeleteStep("none")
                        setCustomReason("")
                    }
                }}
                title={deleteStep === "confirm" ? "Confirmar encerramento da conta" : "O que fez você decidir encerrar sua conta?"}
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteStep("none")}
                            disabled={isDeleting}
                            className="flex-1 h-12"
                        >
                            Continuar com minha conta
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteAccount}
                            disabled={isDeleting || confirmText !== "EXCLUIR"}
                            className="flex-1 h-12 bg-red-600"
                        >
                            {isDeleting ? "Excluindo..." : "Confirmar exclusão da conta"}
                        </Button>
                    </>
                }
            >
                {deleteStep === "reason" && (
                    <div className="space-y-6 pt-2 pb-4">
                        <p className="text-sm text-brand-dark dark:text-dark-body">
                            Antes de continuar, queremos apenas garantir que você saiba exatamente o que acontecerá. Ao confirmar, iniciaremos o processo de encerramento da sua conta. Durante as próximas 48 horas você poderá cancelar essa decisão. Depois desse período, a exclusão será definitiva e não poderá ser revertida.
                        </p>

                        <div className="space-y-2">
                            <FormTextarea
                                label="Sua resposta (opcional)"
                                placeholder="Seu feedback ajuda a melhorar a Dudit."
                                value={customReason}
                                onChange={(e: any) => setCustomReason(e.target.value)}
                                maxLength={500}
                                showCharacterCount
                                name="observacoes"
                                className="min-h-[120px]"
                            />
                        </div>

                        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-brand-border dark:border-dark-border">
                            <Button
                                variant="outline"
                                onClick={() => setDeleteStep("none")}
                                disabled={loadingDryRun}
                            >
                                Cancelar
                            </Button>
                            <Button
                                variant="default"
                                onClick={handleContinueToConfirm}
                                disabled={loadingDryRun}
                                className="bg-brand-green text-white hover:bg-brand-green/90"
                            >
                                {loadingDryRun ? "Carregando..." : "Continuar"}
                            </Button>
                        </div>
                    </div>
                )}

                {deleteStep === "confirm" && (
                    <div className="space-y-6 pt-2 pb-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                        <InfoCard title="Essa decisão é sua." message="Ao confirmar, sua assinatura será cancelada e iniciaremos o encerramento da sua conta." color="red" />

                        {/* SUA CONTA HOJE */}
                        {dryRunReport && (
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-brand-inactive-text">
                                    Sua conta hoje
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {dryRunReport.customersCount > 0 && (
                                        <div className="p-3 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/50 text-center">
                                            <span className="block text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                {dryRunReport.customersCount}
                                            </span>
                                            <span className="text-[11px] text-brand-inactive-text font-medium">
                                                Clientes cadastrados
                                            </span>
                                        </div>
                                    )}
                                    {dryRunReport.productsCount > 0 && (
                                        <div className="p-3 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/50 text-center">
                                            <span className="block text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                {dryRunReport.productsCount}
                                            </span>
                                            <span className="text-[11px] text-brand-inactive-text font-medium">
                                                Produtos
                                            </span>
                                        </div>
                                    )}
                                    {dryRunReport.servicesCount > 0 && (
                                        <div className="p-3 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/50 text-center">
                                            <span className="block text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                {dryRunReport.servicesCount}
                                            </span>
                                            <span className="text-[11px] text-brand-inactive-text font-medium">
                                                Serviços
                                            </span>
                                        </div>
                                    )}
                                    {dryRunReport.ordersCount > 0 && (
                                        <div className="p-3 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/50 text-center">
                                            <span className="block text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                {dryRunReport.ordersCount}
                                            </span>
                                            <span className="text-[11px] text-brand-inactive-text font-medium">
                                                Pedidos realizados
                                            </span>
                                        </div>
                                    )}
                                    {dryRunReport.serviceOrdersCount > 0 && (
                                        <div className="p-3 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/50 text-center">
                                            <span className="block text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                {dryRunReport.serviceOrdersCount}
                                            </span>
                                            <span className="text-[11px] text-brand-inactive-text font-medium">
                                                Ordens de Serviço
                                            </span>
                                        </div>
                                    )}
                                    {dryRunReport.appointmentsCount > 0 && (
                                        <div className="p-3 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/50 text-center">
                                            <span className="block text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                {dryRunReport.appointmentsCount}
                                            </span>
                                            <span className="text-[11px] text-brand-inactive-text font-medium">
                                                Compromissos agendados
                                            </span>
                                        </div>
                                    )}

                                    {dryRunReport.whatsappCount > 0 && (
                                        <div className="p-3 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/50 text-center">
                                            <span className="block text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                {dryRunReport.whatsappCount}
                                            </span>
                                            <span className="text-[11px] text-brand-inactive-text font-medium">
                                                Integrações WhatsApp
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* O QUE SERÁ PERDIDO */}
                        {dryRunReport && (
                            <div className="space-y-3 pt-2">
                                <h4 className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">
                                    Ao encerrar sua conta, você perderá permanentemente:
                                </h4>
                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-brand-dark/80 dark:text-dark-body">
                                    {dryRunReport.customersCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-red-500 mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Cadastro de clientes</strong>
                                                <span className="block text-xs text-brand-inactive-text">({dryRunReport.customersCount} registros)</span>
                                            </div>
                                        </li>
                                    )}
                                    {(dryRunReport.productsCount > 0 || dryRunReport.servicesCount > 0) && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-red-500 mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Produtos e serviços</strong>
                                                <span className="block text-xs text-brand-inactive-text">({dryRunReport.productsCount + dryRunReport.servicesCount} itens)</span>
                                            </div>
                                        </li>
                                    )}
                                    {dryRunReport.appointmentsCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-red-500 mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Agenda</strong>
                                                <span className="block text-xs text-brand-inactive-text">({dryRunReport.appointmentsCount} compromissos)</span>
                                            </div>
                                        </li>
                                    )}
                                    {dryRunReport.ordersCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-red-500 mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Financeiro</strong>
                                                <span className="block text-xs text-brand-inactive-text">(histórico completo de faturamento)</span>
                                            </div>
                                        </li>
                                    )}
                                    {dryRunReport.whatsappCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-red-500 mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Integrações</strong>
                                                <span className="block text-xs text-brand-inactive-text">(conexões ativas de WhatsApp)</span>
                                            </div>
                                        </li>
                                    )}

                                    <li className="flex items-start gap-2">
                                        <span className="text-red-500 mt-0.5">•</span>
                                        <div>
                                            <strong className="text-brand-dark dark:text-dark-heading">Configurações e Equipe</strong>
                                            <span className="block text-xs text-brand-inactive-text">(dados da empresa e permissões de acesso)</span>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        )}

                        {/* O QUE SERÁ PRESERVADO */}
                        <div className="space-y-3 pt-2">
                            <h4 className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">
                                O que será preservado
                            </h4>
                            <p className="text-xs text-brand-inactive-text">
                                Para cumprir obrigações legais, manteremos apenas registros mínimos anonimizados relacionados a pedidos, auditoria e compliance.
                            </p>
                            <ul className="space-y-1.5 text-xs font-semibold text-brand-dark/90 dark:text-dark-heading">
                                <li className="flex items-center gap-2">
                                    <span className="text-emerald-500 font-bold">✓</span> Nenhum dado pessoal permanecerá acessível.
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-emerald-500 font-bold">✓</span> Nenhuma cobrança continuará sendo realizada.
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-emerald-500 font-bold">✓</span> Nenhum usuário conseguirá acessar sua conta.
                                </li>
                            </ul>
                        </div>

                        {/* CONFIRMAÇÃO POR ESCRITO */}
                        <div className="py-4 border-t border-brand-border dark:border-dark-border text-center space-y-3">
                            <p className="text-xs font-bold text-brand-red">
                                Atenção: Esta ação é definitiva e removerá todos os seus dados.
                            </p>
                            <p className="text-xs text-brand-inactive-text">
                                Digite <strong className="text-brand-dark dark:text-dark-heading">EXCLUIR</strong> abaixo para confirmar.
                            </p>
                            <Input
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="EXCLUIR"
                            />
                        </div>
                    </div>
                )}
            </DefaultModal>

            {/* Modal para Assinatura Ativa (Bloqueio) */}
            <DefaultModal
                isOpen={activeSubModalOpen}
                onClose={() => setActiveSubModalOpen(false)}
                title="Assinatura Ativa Detectada"
            >
                <div className="space-y-6 pt-2 pb-4 text-center">
                    <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-500 mb-2">
                        <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                        Cancele sua Assinatura Primeiro
                    </h3>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body px-4">
                        Você possui uma assinatura ativa da plataforma. Cancele sua assinatura antes de excluir sua conta.
                    </p>
                    <div className="flex gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                        <Button
                            variant="outline"
                            onClick={() => setActiveSubModalOpen(false)}
                            className="flex-1 h-12 font-bold"
                        >
                            Fechar
                        </Button>
                        <Button
                            variant="default"
                            onClick={() => {
                                setActiveSubModalOpen(false)
                                window.location.href = "/erp/configuracoes/assinatura"
                            }}
                            className="flex-1 h-12 font-bold bg-amber-600 text-white hover:bg-amber-700"
                        >
                            Ir para Assinaturas
                        </Button>
                    </div>
                </div>
            </DefaultModal>
        </>
    )
}
