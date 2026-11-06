"use client"

import { useState, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { updateProfileAction } from "@/app/actions/profile"
import { changePasswordAction } from "@/app/actions/shared/password"
import { useNotification } from "@/hooks/use-notification"
import { useSearchParams } from "next/navigation"
import { pushUrl, replaceUrl } from "@/lib/navigation/history"
import { formatE164ToDisplay } from "@/lib/utils/phone-utils"
import { MarketplaceHeader } from "../marketplace/MarketplaceHeader"
import { MarketplaceFooter } from "../marketplace/MarketplaceFooter"
import { createClient } from "@/lib/supabase/client"
import { DefaultModal, Button, FormTextarea, InfoCard, Input, IconPlaceholder } from "@/components/reusable"
import { View, EditField } from "./profile-shared"
import { MainView } from "./MainView"
import { AccountView } from "./AccountView"
import { AddressView } from "./AddressView"
import { SecurityView } from "./SecurityView"
import { ReviewsView } from "./ReviewsView"
import { NotificationsView } from "./NotificationsView"
import { AlertCircleIcon } from "@/lib/icons"

const VALID_VIEWS: View[] = ["main", "informacoes-da-conta", "enderecos", "seguranca", "avaliacoes", "notificacoes"]
const isValidView = (val: any): val is View => typeof val === "string" && VALID_VIEWS.includes(val as View)

interface UserProfilePageProps {
    userId: string
    profile: any
    addresses: any[]
    initialFullName?: string
    email: string
    hasPassword: boolean
    authProvider: string
    initialTab?: View
}

export function UserProfilePage({
    userId,
    profile,
    addresses: initialAddresses,
    initialFullName,
    email,
    hasPassword,
    authProvider,
    initialTab: serverInitialTab,
}: UserProfilePageProps) {
    const { success: notifySuccess, error: notifyError } = useNotification()
    const searchParams = useSearchParams()
    const clientTab = searchParams?.get("tab")
    const initialView: View = isValidView(serverInitialTab)
        ? serverInitialTab
        : isValidView(clientTab)
            ? clientTab
            : "main"

    const [currentView, setCurrentView] = useState<View>(initialView)
    const currentViewRef = useRef<View>(initialView)

    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState<string | null>(null)

    // Account deletion states
    const [deleteStep, setDeleteStep] = useState<"none" | "reason" | "verify_code" | "success">("none")
    const [customReason, setCustomReason] = useState("")
    const [deleteCode, setDeleteCode] = useState("")
    const [deleteMaskedEmail, setDeleteMaskedEmail] = useState("")
    const [deleteCooldown, setDeleteCooldown] = useState(0)
    const [deleteAttemptsRemaining, setDeleteAttemptsRemaining] = useState<number | null>(null)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [isRequestingCode, setIsRequestingCode] = useState(false)
    const [isConfirmingCode, setIsConfirmingCode] = useState(false)
    const [dryRunReport, setDryRunReport] = useState<any>(null)
    const [loadingDryRun, setLoadingDryRun] = useState(false)
    const [confirmText, setConfirmText] = useState("")
    const [activeSubModalOpen, setActiveSubModalOpen] = useState(false)
    const deleteCooldownRef = useRef<NodeJS.Timeout | null>(null)

    const startDeleteCooldown = (seconds: number) => {
        setDeleteCooldown(seconds)
        if (deleteCooldownRef.current) clearInterval(deleteCooldownRef.current)
        deleteCooldownRef.current = setInterval(() => {
            setDeleteCooldown((prev) => {
                if (prev <= 1) {
                    clearInterval(deleteCooldownRef.current!)
                    deleteCooldownRef.current = null
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    const handleOpenDeleteModal = async () => {
        setDeleteStep("reason")
        setDeleteError(null)
        setDeleteCode("")
        setConfirmText("")
        setLoadingDryRun(true)
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const { getAccountDeletionDryRunAction } = await import("@/app/actions/shared/account")
            const res = await getAccountDeletionDryRunAction(token)
            if (res.success && res.report) {
                setDryRunReport(res.report)
            }
        } catch {
            // non-critical simulation failure
        } finally {
            setLoadingDryRun(false)
        }
    }

    const handleRequestDeletionCode = async () => {
        setIsRequestingCode(true)
        setDeleteError(null)
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const { requestAccountDeletionCodeAction } = await import("@/app/actions/shared/account")
            const res = await requestAccountDeletionCodeAction(customReason.trim() || null, token)

            if (res.error) {
                if (res.error === "active_subscription") {
                    setDeleteStep("none")
                    setActiveSubModalOpen(true)
                } else {
                    setDeleteError(res.error)
                    notifyError("Erro ao solicitar código", res.error)
                }
                if (res.cooldownSeconds) {
                    startDeleteCooldown(res.cooldownSeconds)
                }
                return
            }

            if (res.success) {
                setDeleteMaskedEmail(res.maskedEmail || "seu e-mail")
                setDeleteStep("verify_code")
                setDeleteCode("")
                setConfirmText("")
                setDeleteAttemptsRemaining(null)
                if (res.cooldownSeconds) {
                    startDeleteCooldown(res.cooldownSeconds)
                }
                notifySuccess("Código enviado", `Enviamos o código para ${res.maskedEmail || "seu e-mail"}.`)
            }
        } catch (err) {
            setDeleteError("Ocorreu um erro ao enviar o código de confirmação.")
            notifyError("Erro", "Ocorreu um erro ao enviar o código de confirmação.")
        } finally {
            setIsRequestingCode(false)
        }
    }

    const handleConfirmDeletion = async () => {
        if (deleteCode.trim().length !== 6) {
            setDeleteError("Digite o código de 6 dígitos recebido por e-mail.")
            return
        }

        if (confirmText !== "EXCLUIR") {
            setDeleteError("Digite EXCLUIR para confirmar.")
            return
        }

        setIsConfirmingCode(true)
        setDeleteError(null)
        try {
            const { getCSRFToken } = await import("@/lib/utils/fetch-with-csrf")
            const token = await getCSRFToken()
            const { confirmAccountDeletionAction } = await import("@/app/actions/shared/account")
            const res = await confirmAccountDeletionAction({
                code: deleteCode.trim(),
                reason: customReason.trim() || null,
                csrf_token: token,
            })

            if (res.error) {
                setDeleteError(res.error)
                if (res.remainingAttempts !== undefined) {
                    setDeleteAttemptsRemaining(res.remainingAttempts)
                }
                notifyError("Erro na confirmação", res.error)
                return
            }

            if (res.success) {
                setDeleteStep("success")
                try {
                    const supabase = createClient()
                    await supabase.auth.signOut({ scope: "global" })
                } catch { }
                if (typeof window !== "undefined") {
                    try {
                        localStorage.clear()
                        sessionStorage.clear()
                    } catch { }
                    window.location.replace("/auth/login?deleted=true")
                }
            }
        } catch (err) {
            setDeleteError("Ocorreu um erro ao confirmar a exclusão.")
            notifyError("Erro", "Ocorreu um erro ao confirmar a exclusão.")
        } finally {
            setIsConfirmingCode(false)
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
        if (deleteCooldownRef.current) clearInterval(deleteCooldownRef.current)
    }, [])

    // ── Helpers ───────────────────────────────────────────────────────────────

    const clearMessages = () => { setError(null); setSuccess(null) }

    const setEdit = (field: EditField, val: boolean) => {
        clearMessages()
        setEditing(e => ({ ...e, [field]: val }))
    }

    const resetSubViewStates = () => {
        clearMessages()
        setEditing({ name: false, cpf: false, phone: false, password: false, address: false, secPhone: false, secEmail: false })
        setIsChangingEmail(false)
        setIsChangingSecEmail(false)
    }

    const navigate = (view: View) => {
        resetSubViewStates()

        if (view === currentViewRef.current) return

        if (view === "main") {
            currentViewRef.current = "main"
            setCurrentView("main")
            // This tab can be opened directly from a URL. Going back here can
            // leave /perfil (or follow an unrelated previous history entry),
            // especially after an App Router/RSC navigation on mobile.
            replaceUrl("/perfil")
        } else {
            const url = `/perfil?tab=${view}`
            if (currentViewRef.current === "main") {
                pushUrl(url)
            } else {
                replaceUrl(url)
            }
            currentViewRef.current = view
            setCurrentView(view)
        }
    }

    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search)
            const tabParam = params.get("tab")
            const tab: View = isValidView(tabParam) ? tabParam : "main"

            currentViewRef.current = tab
            setCurrentView(tab)
            resetSubViewStates()
        }
        window.addEventListener("popstate", handlePopState)
        return () => window.removeEventListener("popstate", handlePopState)
    }, [])

    useEffect(() => {
        const tabParam = searchParams?.get("tab")
        const tab: View = isValidView(tabParam) ? tabParam : "main"
        if (tab !== currentViewRef.current) {
            currentViewRef.current = tab
            setCurrentView(tab)
            resetSubViewStates()
        }
    }, [searchParams])

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
        if (accountData.fullName.trim().length > 40) { setError("O nome completo deve ter no máximo 40 caracteres"); return }
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
                // Sign out all OTHER devices/sessions
                const { supabaseBrowser: supabase } = await import("@/lib/supabase/browser-client")
                // Password updated via server action

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
            case "avaliacoes": return "Minhas avaliações"
            case "notificacoes": return "Notificações"
            default: return "Meu perfil"
        }
    }

    return (
        <>
            <MarketplaceHeader simpleTitle={getViewTitle()} />
            <div className="min-h-screen bg-white dark:bg-dark-background pt-[40px] lg:pt-[110px] font-sans flex flex-col">
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
                                onDeleteClick={handleOpenDeleteModal}
                            />
                        )}
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
                    if (!isRequestingCode && !isConfirmingCode) {
                        setDeleteStep("none")
                        setCustomReason("")
                        setDeleteError(null)
                    }
                }}
                title={deleteStep === "verify_code" ? "Confirmação por E-mail" : "Encerramento de Conta"}
                footer={
                    deleteStep === "verify_code" ? (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setDeleteStep("reason")
                                    setDeleteError(null)
                                }}
                                disabled={isConfirmingCode}
                                className="flex-1 h-12"
                            >
                                Voltar
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleConfirmDeletion}
                                disabled={isConfirmingCode || deleteCode.length !== 6 || confirmText !== "EXCLUIR"}
                                className="flex-1 h-12 bg-red-600 hover:bg-red-700 font-bold"
                            >
                                {isConfirmingCode ? "Excluindo conta..." : "Excluir conta definitivamente"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => setDeleteStep("none")}
                                disabled={isRequestingCode || loadingDryRun}
                                className="flex-1 h-12"
                            >
                                Continuar com minha conta
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleRequestDeletionCode}
                                disabled={isRequestingCode || loadingDryRun}
                                className="flex-1 h-12 bg-red-600 hover:bg-red-700 font-bold"
                            >
                                {isRequestingCode ? "Enviando código..." : "Enviar código de confirmação"}
                            </Button>
                        </>
                    )
                }
            >
                {deleteStep === "reason" && (
                    <div className="space-y-6 pt-2 pb-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                        <InfoCard
                            title="Ação permanente"
                            message="Ao solicitar a exclusão, enviaremos um código de 6 dígitos para seu e-mail cadastrado para validação de segurança."
                            color="red"
                        />

                        {deleteError && (
                            <div className="p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-xs font-semibold text-red-700 dark:text-red-400">
                                {deleteError}
                            </div>
                        )}

                        <div className="space-y-2">
                            <FormTextarea
                                label="O que fez você decidir encerrar sua conta? (opcional)"
                                placeholder="Seu feedback ajuda a melhorar a Dudit."
                                value={customReason}
                                onChange={(e: any) => setCustomReason(e.target.value)}
                                maxLength={500}
                                showCharacterCount
                                name="observacoes"
                                className="min-h-[100px]"
                            />
                        </div>

                        {/* O QUE SERÁ PERDIDO */}
                        {dryRunReport && (
                            <div className="space-y-3 pt-2">
                                <h4 className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                    Ao encerrar sua conta, você perderá permanentemente:
                                </h4>
                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-brand-dark/80 dark:text-dark-body">
                                    {dryRunReport.customersCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-brand-red mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Cadastro de clientes</strong>
                                                <span className="block text-xs text-brand-inactive-text dark:text-dark-body">({dryRunReport.customersCount} registros)</span>
                                            </div>
                                        </li>
                                    )}
                                    {(dryRunReport.productsCount > 0 || dryRunReport.servicesCount > 0) && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-brand-red mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Produtos e serviços</strong>
                                                <span className="block text-xs text-brand-inactive-text dark:text-dark-body">({dryRunReport.productsCount + dryRunReport.servicesCount} itens)</span>
                                            </div>
                                        </li>
                                    )}
                                    {dryRunReport.appointmentsCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-brand-red mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Agenda</strong>
                                                <span className="block text-xs text-brand-inactive-text dark:text-dark-body">({dryRunReport.appointmentsCount} compromissos)</span>
                                            </div>
                                        </li>
                                    )}
                                    {dryRunReport.ordersCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-brand-red mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Pedidos realizados</strong>
                                                <span className="block text-xs text-brand-inactive-text dark:text-dark-body">({dryRunReport.ordersCount} pedidos)</span>
                                            </div>
                                        </li>
                                    )}
                                    {dryRunReport.serviceOrdersCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-brand-red mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Ordens de serviço</strong>
                                                <span className="block text-xs text-brand-inactive-text dark:text-dark-body">({dryRunReport.serviceOrdersCount} ordens de serviço)</span>
                                            </div>
                                        </li>
                                    )}
                                    {dryRunReport.ordersCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-brand-red mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Financeiro</strong>
                                                <span className="block text-xs text-brand-inactive-text dark:text-dark-body">(histórico completo de faturamento)</span>
                                            </div>
                                        </li>
                                    )}
                                    {dryRunReport.whatsappCount > 0 && (
                                        <li className="flex items-start gap-2">
                                            <span className="text-brand-red mt-0.5">•</span>
                                            <div>
                                                <strong className="text-brand-dark dark:text-dark-heading">Integrações</strong>
                                                <span className="block text-xs text-brand-inactive-text dark:text-dark-body">(conexões ativas de WhatsApp)</span>
                                            </div>
                                        </li>
                                    )}

                                    <li className="flex items-start gap-2">
                                        <span className="text-brand-red mt-0.5">•</span>
                                        <div>
                                            <strong className="text-brand-dark dark:text-dark-heading">Configurações e Equipe</strong>
                                            <span className="block text-xs text-brand-inactive-text dark:text-dark-body">(dados da empresa e permissões de acesso)</span>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        )}

                        {/* O QUE SERÁ PRESERVADO */}
                        <div className="space-y-3 pt-2">
                            <h4 className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                O que será preservado
                            </h4>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Para cumprir obrigações legais, manteremos apenas registros mínimos anonimizados relacionados a pedidos, auditoria e compliance.
                            </p>
                            <ul className="space-y-1.5 text-xs font-semibold text-brand-dark/90 dark:text-dark-heading">
                                <li className="flex items-center gap-2">
                                    • Nenhum dado pessoal permanecerá acessível.
                                </li>
                                <li className="flex items-center gap-2">
                                    • Nenhuma cobrança continuará sendo realizada.
                                </li>
                                <li className="flex items-center gap-2">
                                    • Nenhum usuário conseguirá acessar sua conta.
                                </li>
                            </ul>
                        </div>
                    </div>
                )}

                {deleteStep === "verify_code" && (
                    <div>
                        <InfoCard
                            title="Código enviado por e-mail"
                            message={`Enviamos um código numérico de 6 dígitos para ${deleteMaskedEmail}. O código expira em 15 minutos.`}
                            color="green"
                            className="mb-4"
                        />

                        {deleteError && (
                            <InfoCard
                                title="Erro ao enviar código"
                                message={`${deleteError} ${deleteAttemptsRemaining !== null && deleteAttemptsRemaining > 0 && `Tentativas restantes: ${deleteAttemptsRemaining}`}`}
                                color="red"
                            />
                        )}

                        <div className="space-y-2">
                            <Input
                                label="Código de Confirmação (6 dígitos)"
                                value={deleteCode}
                                onChange={(e) => setDeleteCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="000000"
                                maxLength={6}
                                autoFocus
                                required
                            />
                            <div className="flex items-center justify-between text-xs mb-2">
                                <span className="text-brand-inactive-text dark:text-dark-body">
                                    Não recebeu o e-mail?
                                </span>
                                {deleteCooldown > 0 ? (
                                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                                        Reenviar em {deleteCooldown}s
                                    </span>
                                ) : (
                                    <Button
                                        variant="link"
                                        onClick={handleRequestDeletionCode}
                                        disabled={isRequestingCode}
                                        className="text-xs"
                                    >
                                        {isRequestingCode ? "Reenviando..." : "Reenviar novo código"}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="pt-3 border-t border-brand-border dark:border-dark-border space-y-2">
                            <Input
                                label="Digite EXCLUIR para confirmar"
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
                maxWidth="md"
                footer={
                    <>
                        <Button variant="outline" onClick={() => setActiveSubModalOpen(false)}>
                            Fechar
                        </Button>
                        <Button onClick={() => window.location.href = "/erp/configuracoes?tab=assinatura"}>
                            Ir para Assinaturas
                        </Button>
                    </>
                }
            >
                <div>
                    <IconPlaceholder
                        icon={AlertCircleIcon}
                        title="Assinatura Ativa Detectada"
                        subtitle="Você possui uma assinatura ativa da plataforma. Cancele sua assinatura antes de excluir sua conta."
                    />
                </div>
            </DefaultModal>
        </>
    )
}
