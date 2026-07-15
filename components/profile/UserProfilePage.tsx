"use client"

import { useState, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { updateProfileAction, requestEmailChangeAction, verifyEmailChangeAction } from "@/app/actions/profile"
import { changePasswordAction } from "@/app/actions/shared/password"
import { useNotification } from "@/hooks/use-notification"
import { useRouter, useSearchParams } from "next/navigation"
import { formatE164ToDisplay } from "@/lib/utils/phone-utils"
import { MarketplaceHeader } from "../marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "../marketplace/MarketplaceFooter"
import { createClient } from "@/lib/supabase/client"
import { DefaultModal, RadioButton, Button, FormTextarea } from "@/components/reusable"
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
        setIsDeleting(true)
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const finalReason = customReason.trim() || null

            const { deleteAccountAction } = await import("@/app/actions/shared/account")
            const res = await deleteAccountAction(userId, finalReason, token)

            if (res.error) {
                notifyError("Erro ao excluir", res.error)
                return
            }

            setDeleteStep("success")
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
            if (!emailVal || !emailVal.includes("@")) { setError("Digite um email válido"); return }
            if (nRef.current > Date.now()) { setError("Aguarde antes de enviar outro código"); return }
            setIsLoading(true); clearMessages()
            const result = await requestEmailChangeAction(emailVal)
            if (result.error) {
                setError(result.error)
                notifyError("Erro", result.error)
            }
            else {
                setOtpSentVal(true); setSuccess("Código enviado para o novo email!")
                notifySuccess("Código enviado", "Verifique sua caixa de entrada.")
                attemptsRef.current += 1
                if (attemptsRef.current >= 3) {
                    setError("Limite de tentativas atingido.")
                    notifyError("Atenção", "Limite de tentativas atingido.")
                    setCanResendVal(false); setIsLoading(false); return
                }
                startTimer(tRef, setResendTimerVal, setCanResendVal, nRef, attemptsRef.current * 60)
            }
            setIsLoading(false)
        },
        verifyOtp: async () => {
            if (!otpVal || otpVal.length !== 6) { setError("Digite o código de 6 dígitos"); return }
            setIsLoading(true); clearMessages()
            const result = await verifyEmailChangeAction(emailVal, otpVal)
            if (result.error) {
                setError(result.error)
                notifyError("Erro de verificação", result.error)
            }
            else {
                setSuccess("Email alterado com sucesso!")
                notifySuccess("Sucesso", "Email alterado com sucesso!")
                setAccountData(d => ({ ...d, email: emailVal }))
                setChanging(false); setOtpSentVal(false); setEmailVal(""); setOtpVal("")
                attemptsRef.current = 0; nRef.current = 0
                if (tRef.current) { clearInterval(tRef.current); tRef.current = null }
            }
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
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/50">
                            <AlertTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-red-700 dark:text-red-300 space-y-1">
                                <strong>Essa decisão é sua.</strong>
                                <p>Ao confirmar, sua assinatura será cancelada e iniciaremos o encerramento da sua conta. Você terá 48 horas para desistir a qualquer momento.</p>
                            </div>
                        </div>

                        {/* SUA CONTA HOJE */}
                        {dryRunReport && (
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">
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
                                    {dryRunReport.filesCount > 0 && (
                                        <div className="p-3 rounded-2xl border border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-surface/50 text-center">
                                            <span className="block text-lg font-extrabold text-brand-dark dark:text-dark-heading">
                                                {dryRunReport.filesCount}
                                            </span>
                                            <span className="text-[11px] text-brand-inactive-text font-medium">
                                                Arquivos enviados
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
                                    {dryRunReport.filesCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-red-500 mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Arquivos enviados</strong>
                                                <span className="block text-xs text-brand-inactive-text">(imagens e mídias no R2)</span>
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
                                <p className="text-xs text-brand-inactive-text">
                                    Tudo isso será removido definitivamente após o período de carência.
                                </p>
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

                        {/* O QUE ACONTECERÁ AGORA (TIMELINE) */}
                        <div className="space-y-3 pt-2">
                            <h4 className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider">
                                O que acontecerá agora
                            </h4>
                            <div className="relative pl-6 space-y-4 border-l border-brand-border dark:border-dark-border ml-2 py-1">
                                <div className="relative">
                                    <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-brand-green border-4 border-white dark:border-dark-surface" />
                                    <div>
                                        <strong className="text-xs text-brand-dark dark:text-dark-heading block">Agora</strong>
                                        <span className="text-xs text-brand-inactive-text">Sua assinatura é cancelada e nenhuma nova cobrança será criada.</span>
                                    </div>
                                </div>
                                <div className="relative">
                                    <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-amber-50 border-4 border-white dark:border-dark-surface" />
                                    <div>
                                        <strong className="text-xs text-brand-dark dark:text-dark-heading block">Em até 48 horas</strong>
                                        <span className="text-xs text-brand-inactive-text">Você pode desistir do encerramento a qualquer momento.</span>
                                    </div>
                                </div>
                                <div className="relative">
                                    <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-red-50 border-4 border-white dark:border-dark-surface" />
                                    <div>
                                        <strong className="text-xs text-brand-dark dark:text-dark-heading block">Após 48 horas</strong>
                                        <span className="text-xs text-brand-inactive-text">Iniciaremos a exclusão definitiva dos seus dados.</span>
                                    </div>
                                </div>
                                <div className="relative">
                                    <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-gray-400 border-4 border-white dark:border-dark-surface" />
                                    <div>
                                        <strong className="text-xs text-brand-dark dark:text-dark-heading block">Após a conclusão</strong>
                                        <span className="text-xs text-brand-inactive-text">Enviaremos um e-mail confirmando que a exclusão foi finalizada.</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ALTERNATIVAS DISCRETAS */}
                        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 border-t border-brand-border dark:border-dark-border text-xs text-brand-inactive-text">
                            <a href="/erp/clientes" className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors font-medium">
                                Exportar meus dados
                            </a>
                            <a href="https://wa.me/5551999999999" target="_blank" rel="noopener noreferrer" className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors font-medium">
                                Falar com o suporte
                            </a>
                            <a href="/erp/settings/subscription" className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors font-medium">
                                Cancelar apenas a assinatura
                            </a>
                            <button
                                type="button"
                                onClick={() => setDeleteStep("none")}
                                className="hover:text-brand-dark dark:hover:text-dark-heading transition-colors font-medium"
                            >
                                Voltar
                            </button>
                        </div>

                        {/* FOOTER ACTIONS */}
                        <div className="flex flex-col sm:flex-row gap-3 mt-4 pt-4 border-t border-brand-border dark:border-dark-border">
                            <Button
                                variant="outline"
                                onClick={() => setDeleteStep("none")}
                                disabled={isDeleting}
                                className="flex-1 h-12 font-bold"
                            >
                                Continuar com minha conta
                            </Button>
                            <Button
                                variant="default"
                                onClick={handleDeleteAccount}
                                disabled={isDeleting}
                                className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white font-bold"
                            >
                                {isDeleting ? "Excluindo..." : "Confirmar exclusão da conta"}
                            </Button>
                        </div>
                    </div>
                )}
            </DefaultModal>

            {/* Deletion Scheduled Success Modal */}
            <DefaultModal
                isOpen={deleteStep === "success"}
                onClose={() => {
                    setDeleteStep("none")
                    window.location.reload()
                }}
                title="Solicitação Recebida"
            >
                <div className="space-y-6 pt-2 pb-4 text-center">
                    <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 mb-2">
                        <CheckCircle size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                        Exclusão Agendada com Sucesso
                    </h3>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body px-4">
                        A sua conta foi agendada para exclusão definitiva e entrará no período de carência de <strong>48 horas</strong>. Você pode cancelar o encerramento da conta a qualquer momento na página de assinaturas ou através do aviso flutuante no topo.
                    </p>
                    <div className="pt-4 border-t border-brand-border dark:border-dark-border">
                        <Button
                            variant="default"
                            onClick={() => {
                                setDeleteStep("none")
                                window.location.reload()
                            }}
                            className="w-full h-12 font-bold bg-brand-green text-white hover:bg-brand-green/90"
                        >
                            Entendi
                        </Button>
                    </div>
                </div>
            </DefaultModal>
        </>
    )
}
