"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import {
    getServiceOrderByTokenAction,
    getPublicPresignedUploadUrlAction,
    signPublicServiceOrderAction,
    approvePublicServiceOrderAction,
    rejectPublicServiceOrderAction
} from "@/app/actions/erp/service-orders"
import { useTimezone } from "@/lib/date"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    CustomerCard,
    FormSection,
    DefaultModal,
    Input,
    InfoCard,
    IconPlaceholder,
    FormTextarea,
    ListItem
} from "@/components/reusable"
import OSPreview from "@/components/erp/service-orders/OSPreview"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from "@/lib/types/service-order"
import { HistoryTimeline } from "@/components/erp/shared/HistoryTimeline"
import { maskEmail } from "@/lib/utils"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { useSupabase } from "@/providers/supabase-provider"
import { FileIcon } from "@/lib/icons"
import { ClockIcon } from "lucide-react"

const CDN_URL = r2PublicConfig.cdnUrl || "https://img.dudit.com.br"

interface PublicOSPortalProps {
    token: string
    ip: string
    userAgent: string
    data: {
        serviceOrder: any
        services: any[]
        products: any[]
        attachments: any[]
        history: any[]
        sale: any
    }
}

export default function PublicOSPortal({ token, data: initialData, ip, userAgent }: PublicOSPortalProps) {
    const tz = useTimezone()
    // ─── STATE MANAGEMENT ────────────────────────────────────────────────────
    const [order, setOrder] = useState(initialData.serviceOrder)
    const [services, setServices] = useState(initialData.services)
    const [products, setProducts] = useState(initialData.products)
    const [attachments, setAttachments] = useState(initialData.attachments)
    const [history, setHistory] = useState(initialData.history)
    const [sale, setSale] = useState(initialData.sale)

    const [activeTab, setActiveTab] = useState("Dados Gerais")

    // Signature Modal
    const [showSignModal, setShowSignModal] = useState(false)
    const [isProcessingSignature, setIsProcessingSignature] = useState(false)
    const [signerName, setSignerName] = useState("")
    const [signatureCode, setSignatureCode] = useState("")
    const [hasCanvasContent, setHasCanvasContent] = useState(false)

    // Canvas drawing states
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)

    // Modal Error State
    const [signModalError, setSignModalError] = useState<string | null>(null)

    // Approval Modal
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [isProcessingApproval, setIsProcessingApproval] = useState(false)
    const [approvalCode, setApprovalCode] = useState("")
    const [approveModalError, setApproveModalError] = useState<string | null>(null)

    // Reject Modal State
    const [showRejectModal, setShowRejectModal] = useState(false)
    const [rejectReason, setRejectReason] = useState("")
    const [isProcessingReject, setIsProcessingReject] = useState(false)
    const [rejectError, setRejectError] = useState<string | null>(null)

    // Notifications & Messages
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const { supabase } = useSupabase()
    const [currentUser, setCurrentUser] = useState<any>(null)
    useEffect(() => {
        supabase.auth.getUser().then(({ data }: any) => {
            if (data?.user) setCurrentUser(data.user)
        })
    }, [supabase])

    const selectedCustomer = useMemo(() => {
        let raw = order.customer_snapshot || order.customer || null
        if (typeof raw === "string") {
            try {
                raw = JSON.parse(raw)
            } catch {
                raw = null
            }
        }
        if (raw && (raw.name || raw.email || raw.phone)) {
            return raw
        }
        if (order.customer_name && order.customer_name !== "Consumidor final") {
            return {
                name: order.customer_name,
                email: order.customer_email || null,
                phone: order.customer_phone || null,
            }
        }
        return null
    }, [order.customer_snapshot, order.customer, order.customer_name, order.customer_email, order.customer_phone])

    const customerName = selectedCustomer?.name || order.customer_name || "Consumidor final"
    const customerEmail = selectedCustomer?.email || order.customer_email || ""
    const customerPhone = selectedCustomer?.phone || order.customer_phone || ""

    const isClientEmailMatched = useMemo(() => {
        return !!(currentUser && customerEmail && currentUser.email?.toLowerCase() === customerEmail.toLowerCase())
    }, [currentUser, customerEmail])

    const isDirectSigner = Boolean(order?.can_direct_sign || isClientEmailMatched)
    // Quando a OS já foi aprovada pelo portal, o aceite final (assinatura) não
    // exige novo código.
    const canSignWithoutCode = isDirectSigner || Boolean(order?.approved_at)

    // ─── FORMATTING HELPERS ──────────────────────────────────────────────────
    const buildImageUrl = (key: string) => {
        if (!key) return ""
        return key.startsWith("http") ? key : `${CDN_URL}/${key}`
    }

    const formatDateString = (dateStr: string) => {
        if (!dateStr) return "---"
        const clean = String(dateStr).split("T")[0]
        const parts = clean.split("-")
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`
        }
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return dateStr
        return d.toLocaleDateString("pt-BR", { timeZone: tz })
    }

    const formatDateTime = (dateVal: string | Date) => {
        const d = new Date(dateVal)
        if (isNaN(d.getTime())) return ""
        return `${d.toLocaleDateString("pt-BR", { timeZone: tz })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz })}`
    }

    const formatFileSize = (size: any) => {
        if (size === undefined || size === null) return ""
        const bytes = Number(size)
        if (isNaN(bytes) || bytes === 0) return ""
        const k = 1024
        const sizes = ["B", "KB", "MB", "GB"]
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
    }

    const filteredHistory = useMemo(() => {
        return (history || []).filter((h: any) => {
            const action = (h.action_type || "").toLowerCase()
            return action !== "created" && action !== "order_created"
        })
    }, [history])

    const partner = order?.partners || null
    const partnerName = partner?.name || "Parceiro"
    const partnerPhone = partner?.phone || ""
    const partnerLogo = partner?.logo_url ? buildImageUrl(partner.logo_url) : null
    const partnerPlan = partner?.plan_tier || "free"

    // Check if Before & After sections are allowed based on the partner's plan
    const beforeAfterEnabled = hasMinimumPlan(partnerPlan, "crescer")

    // ─── REAL-TIME POLLING ───────────────────────────────────────────────────
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                // Find token from URL path or parameter
                const token = order?.public_token || window.location.pathname.split("/").pop() || ""
                if (!token) return

                const res = await getServiceOrderByTokenAction(token)
                if (res.success && res.data) {
                    setOrder(res.data.serviceOrder)
                    setServices(res.data.services)
                    setProducts(res.data.products)
                    setAttachments(res.data.attachments)
                    setHistory(res.data.history)
                    setSale(res.data.sale)
                }
            } catch (err) {
                console.error("Erro no polling da OS pública:", err)
            }
        }, 15000)

        return () => clearInterval(interval)
    }, [order?.public_token])

    // ─── CANVAS DRAWING LOGIC ────────────────────────────────────────────────
    useEffect(() => {
        if (!showSignModal) return
        // Small delay to ensure modal is rendered
        const timer = setTimeout(() => {
            const canvas = canvasRef.current
            if (!canvas) return
            const ctx = canvas.getContext("2d")
            if (!ctx) return
            ctx.strokeStyle = "#1a1a2e"
            ctx.lineWidth = 2.5
            ctx.lineCap = "round"
            ctx.lineJoin = "round"
        }, 100)
        return () => clearTimeout(timer)
    }, [showSignModal])

    const getPos = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current
        if (!canvas) return { x: 0, y: 0 }
        const rect = canvas.getBoundingClientRect()

        if ("touches" in e) {
            if (e.touches.length === 0) return { x: 0, y: 0 }
            const touch = e.touches[0]
            return {
                x: (touch.clientX - rect.left) * (canvas.width / rect.width),
                y: (touch.clientY - rect.top) * (canvas.height / rect.height),
            }
        }

        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        }
    }

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault()
        const pos = getPos(e)
        const canvas = canvasRef.current
        const ctx = canvas?.getContext("2d")
        if (!ctx || !canvas) return

        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        setIsDrawing(true)
        setHasCanvasContent(true)
    }

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault()
        if (!isDrawing) return
        const pos = getPos(e)
        const canvas = canvasRef.current
        const ctx = canvas?.getContext("2d")
        if (!ctx) return

        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
    }

    const stopDrawing = () => {
        setIsDrawing(false)
    }

    const clearCanvas = () => {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext("2d")
        if (!ctx || !canvas) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        setHasCanvasContent(false)
    }

    // ─── ONLINE SIGNING FLOW ─────────────────────────────────────────────────
    const handleSignOS = async () => {
        const canvas = canvasRef.current
        if (!canvas || (!canSignWithoutCode && signatureCode.length < 4)) return

        setIsProcessingSignature(true)
        setErrorMessage(null)

        try {
            // 1. Convert Canvas signature to Blob
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/png")
            )

            if (!blob) {
                throw new Error("Erro ao capturar imagem da assinatura.")
            }

            const token = order.public_token || window.location.pathname.split("/").pop() || ""
            const fileName = `signature-${Date.now()}.png`

            // 2. Request public presigned upload URL
            const urlRes = await getPublicPresignedUploadUrlAction(token, fileName, "image/png", blob.size)
            if (!urlRes.success) {
                throw new Error(urlRes.error || "Erro ao obter autorização para salvar assinatura.")
            }

            // 3. Upload Blob to R2
            const uploadRes = await fetch(urlRes.uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": "image/png" },
                body: blob,
            })

            if (!uploadRes.ok) {
                throw new Error("Erro ao fazer o upload da assinatura.")
            }

            // 4. Submit signature & verify code on backend
            const signRes = await signPublicServiceOrderAction(
                token,
                customerName,
                canSignWithoutCode ? "" : signatureCode,
                urlRes.key,
                ip,
                userAgent
            )

            if (signRes.success) {
                setSuccessMessage("Ordem de serviço assinada com sucesso!")
                setShowSignModal(false)
                setSignModalError(null)

                // Refresh local data
                const refreshRes = await getServiceOrderByTokenAction(token)
                if (refreshRes.success && refreshRes.data) {
                    setOrder(refreshRes.data.serviceOrder)
                    setServices(refreshRes.data.services)
                    setProducts(refreshRes.data.products)
                    setAttachments(refreshRes.data.attachments)
                    setHistory(refreshRes.data.history)
                    setSale(refreshRes.data.sale)
                }
            } else {
                setSignModalError(signRes.error || "Erro ao verificar código e assinar.")
            }

        } catch (err: any) {
            setSignModalError(err.message || "Ocorreu um erro ao processar a assinatura.")
        } finally {
            setIsProcessingSignature(false)
        }
    }

    // ─── APPROVAL FLOW (autorização pré-execução) ────────────────────────────
    const handleApproveOS = async () => {
        if (!isDirectSigner && approvalCode.length < 4) return

        setIsProcessingApproval(true)
        setApproveModalError(null)

        try {
            const token = order.public_token || window.location.pathname.split("/").pop() || ""
            const res = await approvePublicServiceOrderAction(
                token,
                customerName,
                isDirectSigner ? "" : approvalCode,
                ip,
                userAgent
            )

            if (res.success) {
                setSuccessMessage("Ordem de serviço aprovada com sucesso!")
                setShowApproveModal(false)
                setApproveModalError(null)

                const refreshRes = await getServiceOrderByTokenAction(token)
                if (refreshRes.success && refreshRes.data) {
                    setOrder(refreshRes.data.serviceOrder)
                    setServices(refreshRes.data.services)
                    setProducts(refreshRes.data.products)
                    setAttachments(refreshRes.data.attachments)
                    setHistory(refreshRes.data.history)
                    setSale(refreshRes.data.sale)
                }
            } else {
                setApproveModalError(res.error || "Erro ao aprovar a ordem de serviço.")
            }
        } catch (err: any) {
            setApproveModalError(err.message || "Ocorreu um erro ao aprovar a ordem de serviço.")
        } finally {
            setIsProcessingApproval(false)
        }
    }

    const isFinalized = order.status === "concluida" || order.status === "entregue" || order.status === "cancelada" || order.signature_image_key
    const statusMeta = SERVICE_ORDER_STATUS_META[order.status as ServiceOrderStatus]

    const canReject = !order.signature_image_key && (order.status === "aberta" || order.status === "aguardando_aprovacao")
    const canApprove = !order.signature_image_key && (order.status === "aberta" || order.status === "aguardando_aprovacao")
    const canSign = !order.signature_image_key && (order.status === "concluida" || order.status === "entregue")
    const hasActions = canApprove || canSign || canReject

    const handleRejectOS = async () => {
        setIsProcessingReject(true)
        setRejectError(null)
        try {
            const token = order.public_token || window.location.pathname.split("/").pop() || ""
            const res = await rejectPublicServiceOrderAction(token, rejectReason.trim(), ip, userAgent)
            if (res.success) {
                setShowRejectModal(false)
                setRejectReason("")
                setSuccessMessage("Ordem de serviço recusada.")
                const refreshRes = await getServiceOrderByTokenAction(token)
                if (refreshRes.success && refreshRes.data) {
                    setOrder(refreshRes.data.serviceOrder)
                    setHistory(refreshRes.data.history)
                }
            } else {
                setRejectError(res.error || "Erro ao recusar a ordem de serviço.")
            }
        } catch (err: any) {
            setRejectError(err.message || "Ocorreu um erro ao recusar a ordem de serviço.")
        } finally {
            setIsProcessingReject(false)
        }
    }

    // Group attachments by category. Legacy "normal" images are treated as "antes".
    const groupedAttachments = useMemo(() => {
        const groups: Record<string, any[]> = { normal: [], antes: [], depois: [] }
        for (const att of attachments || []) {
            const cat = att.category || "normal"
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(att)
        }

        const isImage = (att: any) => att.file_type?.startsWith("image/")

        if (!beforeAfterEnabled) {
            return {
                antes: [] as any[],
                depois: [] as any[],
                anexos: [...groups.normal, ...groups.antes, ...groups.depois],
            }
        }

        return {
            antes: [...groups.normal.filter(isImage), ...groups.antes],
            depois: groups.depois,
            anexos: groups.normal.filter((att: any) => !isImage(att)),
        }
    }, [attachments, beforeAfterEnabled])

    return (
        <>
            <header className="lg:flex flex-col w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 sticky top-0 z-50 shadow-md">
                <div className="w-full h-[68px] flex items-center justify-center max-w-[1400px] px-2 mx-auto gap-4">
                    <a href="/" className="cursor-pointer shrink-0 z-[110] pt-1">
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            width={140}
                            height={40}
                            className="h-10 w-auto object-contain"
                        />
                    </a>
                </div>
            </header>

            <div className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden relative text-left">
                <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                    <div className="flex-1 w-full h-full relative pb-20 md:pb-0 flex flex-col overflow-hidden">
                        <div className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden">

                            {/* LEFT COLUMN: INFO & ACTIONS */}
                            <div
                                className={`w-full lg:w-1/2 flex flex-col shrink-0 border-r-0 lg:border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-background relative`}
                            >
                                {/* Sticky Header */}
                                <div className="shrink-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
                                    <div className="px-4 md:px-6 pt-4">
                                        <div className="flex items-center justify-between pb-2">
                                            <div className="flex items-center gap-3">
                                                {partnerLogo ? (
                                                    <img src={partnerLogo} alt={partnerName} className="h-9 w-9 object-cover rounded-full border border-brand-border dark:border-dark-border" />
                                                ) : (
                                                    <div className="h-9 w-9 rounded-lg bg-brand-green flex items-center justify-center text-white font-bold text-sm shrink-0">
                                                        {partnerName.substring(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading block leading-tight">{partnerName}</span>
                                                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body block tracking-wider flex items-center gap-1.5">
                                                        Ordem de Serviço #{order.order_number}
                                                        {Number(order.metadata?.version || 1) > 1 && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-light-primary text-brand-primary dark:bg-dark-accent dark:text-dark-primary">
                                                                v{order.metadata.version}
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {statusMeta && (
                                                    <Badge variant={statusMeta.variant}>
                                                        {statusMeta.label}
                                                    </Badge>
                                                )}
                                                {order.payment_status && order.payment_status !== "unpaid" && (
                                                    <Badge variant={order.payment_status === "paid" ? "green" : "orange"}>
                                                        {order.payment_status === "paid" ? "Pago" : "Parcial"}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {/* Responsive Tabs List */}
                                        <div className="w-full mt-4">
                                            <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                                <TabsTrigger value="Dados Gerais">Dados Gerais</TabsTrigger>
                                                <TabsTrigger value="Anexos">Anexos</TabsTrigger>
                                                <TabsTrigger value="Histórico">Histórico</TabsTrigger>
                                                <TabsTrigger value="Visualização" className="lg:hidden">Visualização</TabsTrigger>
                                            </TabsList>
                                        </div>
                                    </div>
                                </div>

                                {/* Scrollable Content inside left column */}
                                <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-6 pb-24">
                                    {/* Success and Error Banners */}
                                    {successMessage && (
                                        <div className="mb-8">
                                            <InfoCard message={successMessage} color='green' rightElement={<Button variant="link" className="text-brand-green" onClick={() => setSuccessMessage(null)} />} />
                                        </div>
                                    )}

                                    {errorMessage && (
                                        <div className="mb-8">
                                            <InfoCard message={errorMessage} color='red' rightElement={<Button variant="link" className="text-brand-red" onClick={() => setErrorMessage(null)} />} />
                                        </div>
                                    )}

                                    <div className={`mb-8 ${activeTab === "Visualização" ? "hidden lg:block" : "block"}`}>
                                        {/* ─── TAB: DADOS GERAIS ─── */}
                                        {activeTab === "Dados Gerais" && (
                                            <div className="space-y-8 text-left">
                                                {(order.approved_at || order.signature_image_key || isFinalized) && (
                                                    <div className="space-y-3">
                                                        {order.approved_at && order.status !== "cancelada" && (
                                                            <InfoCard
                                                                title='Aprovado pelo cliente'
                                                                message={`Aprovador: ${order.approver_name || "Cliente"} - Data: ${formatDateTime(order.approved_at)}`}
                                                                color='green'
                                                            />
                                                        )}
                                                        {order.signature_image_key ? (
                                                            <InfoCard
                                                                title='Assinado pelo cliente'
                                                                message={`Aprovador: ${order.approver_name || "Cliente"} - Data: ${formatDateTime(order.signed_at)}`}
                                                                color='green'
                                                            />
                                                        ) : isFinalized && (!order.approved_at || order.status === "cancelada") && (
                                                            <InfoCard title='Ordem de serviço finalizada ou cancelada' message="" color='red' />
                                                        )}
                                                    </div>
                                                )}
                                                <FormSection title="Informações do serviço">
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Código da OS</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">#{order.order_number}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Data de abertura</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDateTime(order.created_at)}</span>
                                                        </div>
                                                        {order.expected_completion_date && (
                                                            <div className="flex justify-between items-center text-sm">
                                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">Previsão de conclusão</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                    {formatDateString(order.expected_completion_date)}
                                                                    {order.expected_completion_time ? ` às ${order.expected_completion_time}` : ""}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </FormSection>

                                                <FormSection title="Cliente" hasSeparator>
                                                    {order.customer_snapshot ? (
                                                        <CustomerCard
                                                            customer={order.customer_snapshot}
                                                            chrome="minimal"
                                                        />
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <p className="font-bold text-brand-dark dark:text-dark-heading text-sm">{order.customer_name || "Consumidor final"}</p>
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum cadastro de cliente vinculado.</p>
                                                        </div>
                                                    )}
                                                </FormSection>

                                                <div>
                                                    {order.description && (
                                                        <FormSection title="Descrição" hasSeparator>
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap leading-relaxed">{order.description}</p>
                                                        </FormSection>
                                                    )}
                                                    {order.diagnosis && (
                                                        <FormSection title="Diagnóstico" hasSeparator>
                                                            <p className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap leading-relaxed">{order.diagnosis}</p>
                                                        </FormSection>
                                                    )}
                                                </div>

                                                {/* Specifications if any */}
                                                {order.specifications && order.specifications.length > 0 && (
                                                    <FormSection title="Especificações" hasSeparator>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            {order.specifications.map((spec: any, idx: number) => (
                                                                <div key={idx} className="border border-brand-border dark:border-dark-border rounded-xl p-3">
                                                                    <span className="text-[10px] text-brand-inactive-text block font-bold uppercase">{spec.name}</span>
                                                                    <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading mt-0.5 block">{spec.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </FormSection>
                                                )}

                                                {/* Action Buttons */}
                                                {hasActions && (
                                                    <div className="pt-6 border-t border-brand-border dark:border-dark-border space-y-3">
                                                        {canApprove && Number(order.metadata?.version || 1) > 1 && (
                                                            <div className="mb-3">
                                                                <InfoCard
                                                                    title="Ordem de Serviço Revisada"
                                                                    message={`Esta ordem de serviço foi atualizada para a Versão ${order.metadata.version}. Por favor, confira os itens e informe o novo código para aprovar.`}
                                                                    color="orange"
                                                                />
                                                            </div>
                                                        )}
                                                        {canApprove && (
                                                            <Button
                                                                onClick={() => {
                                                                    setApprovalCode("")
                                                                    setApproveModalError(null)
                                                                    setShowApproveModal(true)
                                                                }}
                                                                className="w-full h-12"
                                                            >
                                                                Aprovar Ordem de Serviço
                                                            </Button>
                                                        )}
                                                        {canSign && (
                                                            <Button
                                                                onClick={() => {
                                                                    setSignerName(order.customer_name || "")
                                                                    setShowSignModal(true)
                                                                }}
                                                                className="w-full h-12"
                                                            >
                                                                Assinar Ordem de Serviço
                                                            </Button>
                                                        )}
                                                        {canReject && (
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => {
                                                                    setRejectReason("")
                                                                    setRejectError(null)
                                                                    setShowRejectModal(true)
                                                                }}
                                                                className="w-full h-12 text-brand-red border-brand-red/40 hover:bg-brand-red/5"
                                                            >
                                                                Recusar Ordem de Serviço
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* ─── TAB: ANEXOS ─── */}
                                        {activeTab === "Anexos" && (
                                            <div className="space-y-6 text-left">
                                                {beforeAfterEnabled && (
                                                    <>
                                                        <FormSection title="Imagens Antes da OS">
                                                            {groupedAttachments.antes.length === 0 ? (
                                                                <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhuma imagem registrada antes da OS.</p>
                                                            ) : (
                                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                                    {groupedAttachments.antes.map((att: any, idx: number) => (
                                                                        <div key={idx} className="rounded-xl overflow-hidden border border-brand-border relative bg-white aspect-square flex items-center justify-center">
                                                                            {att.file_type?.startsWith("image/") ? (
                                                                                <img src={buildImageUrl(att.file_key)} alt="" className="w-full h-full object-cover" />
                                                                            ) : (
                                                                                <span className="text-xs text-brand-inactive-text text-center px-2 truncate w-full">{att.file_name || "Anexo"}</span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </FormSection>

                                                        <FormSection title="Imagens Após a OS" hasSeparator>
                                                            {groupedAttachments.depois.length === 0 ? (
                                                                <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhuma imagem registrada após a OS.</p>
                                                            ) : (
                                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                                    {groupedAttachments.depois.map((att: any, idx: number) => (
                                                                        <div key={idx} className="rounded-xl overflow-hidden border border-brand-border relative bg-white aspect-square flex items-center justify-center">
                                                                            {att.file_type?.startsWith("image/") ? (
                                                                                <img src={buildImageUrl(att.file_key)} alt="" className="w-full h-full object-cover" />
                                                                            ) : (
                                                                                <span className="text-xs text-brand-inactive-text text-center px-2 truncate w-full">{att.file_name || "Anexo"}</span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </FormSection>
                                                    </>
                                                )}

                                                {groupedAttachments.anexos.length > 0 && (
                                                    <FormSection title="Anexos" hasSeparator={beforeAfterEnabled}>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                                            {groupedAttachments.anexos.map((att: any) => (
                                                                <ListItem
                                                                    key={att.id || att.file_key}
                                                                    icon={
                                                                        att.file_type?.startsWith("image/") ? (
                                                                            <img src={buildImageUrl(att.file_key)} alt="" className="w-full h-full object-cover rounded-full" />
                                                                        ) : (
                                                                            FileIcon
                                                                        )
                                                                    }
                                                                    title={att.file_name || "Documento"}
                                                                    description={att.file_size ? formatFileSize(att.file_size) : undefined}
                                                                    onClick={() => {
                                                                        if (att.file_key) {
                                                                            window.open(buildImageUrl(att.file_key), "_blank")
                                                                        }
                                                                    }}
                                                                    className="p-3.5"
                                                                />
                                                            ))}
                                                        </div>
                                                    </FormSection>
                                                )}
                                            </div>
                                        )}

                                        {/* ─── TAB: HISTÓRICO ─── */}
                                        {activeTab === "Histórico" && (
                                            <div className="space-y-4 text-left">
                                                {filteredHistory.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center text-center py-8">
                                                        <IconPlaceholder
                                                            icon={ClockIcon}
                                                            title="Nenhum histórico encontrado"
                                                            subtitle="Não foram encontrados eventos para esta OS."
                                                        />
                                                    </div>
                                                ) : (
                                                    <HistoryTimeline
                                                        entries={filteredHistory.map((h: any) => ({
                                                            id: h.id,
                                                            actor_name: "Sistema",
                                                            change_lines: h.change_lines || [],
                                                            created_at: h.created_at,
                                                            entry_type: h.action_type,
                                                        }))}
                                                    />
                                                )}
                                            </div>
                                        )}

                                    </div>

                                    {/* ─── TAB: VISUALIZAÇÃO (MOBILE ONLY) ─── */}
                                    <TabsContent value="Visualização" className="mt-0 focus-visible:outline-none h-full lg:hidden" forceMount>
                                        <div className={`${activeTab === "Visualização" ? "block" : "hidden"} space-y-4`}>
                                            <div className="w-full h-[calc(100vh-220px)] bg-brand-gray dark:bg-dark-border/20 rounded-2xl overflow-hidden">
                                                <OSPreview
                                                    invoiceNumber={order.order_number}
                                                    orderDate={order.created_at}
                                                    expectedCompletionDate={order.expected_completion_date}
                                                    expectedCompletionTime={order.expected_completion_time}
                                                    selectedCustomer={selectedCustomer}
                                                    services={services}
                                                    products={products}
                                                    totalServiceAmount={Number(order.total_service_amount || 0)}
                                                    totalProductAmount={Number(order.total_product_amount || 0)}
                                                    totalAmount={Number(order.total_amount || 0)}
                                                    description={order.description}
                                                    diagnosis={order.diagnosis}
                                                    signatureImageKey={order.signature_image_key}
                                                    signedAt={order.signed_at}
                                                    partnerName={partnerName}
                                                    partnerAddress={partner?.address || undefined}
                                                    partnerPhone={partnerPhone}
                                                    partnerAvatar={partnerLogo || undefined}
                                                    printMode={false}
                                                    showCustomerContact={false}
                                                    salespersonName={order.assigned_user_name || undefined}
                                                />
                                            </div>
                                        </div>
                                    </TabsContent>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: PREVIEW (DESKTOP ONLY) */}
                            <div className="hidden lg:flex lg:w-1/2 bg-brand-gray/30 dark:bg-dark-border/10 overflow-auto no-scrollbar relative flex-col h-full">
                                <OSPreview
                                    invoiceNumber={order.order_number}
                                    orderDate={order.created_at}
                                    expectedCompletionDate={order.expected_completion_date}
                                    expectedCompletionTime={order.expected_completion_time}
                                    selectedCustomer={selectedCustomer}
                                    services={services}
                                    products={products}
                                    totalServiceAmount={Number(order.total_service_amount || 0)}
                                    totalProductAmount={Number(order.total_product_amount || 0)}
                                    totalAmount={Number(order.total_amount || 0)}
                                    description={order.description}
                                    diagnosis={order.diagnosis}
                                    signatureImageKey={order.signature_image_key}
                                    signedAt={order.signed_at}
                                    partnerName={partnerName}
                                    partnerAddress={partner?.address || undefined}
                                    partnerPhone={partnerPhone}
                                    partnerAvatar={partnerLogo || undefined}
                                    printMode={false}
                                    showCustomerContact={false}
                                    salespersonName={order.assigned_user_name || undefined}
                                />
                            </div>

                        </div>
                    </div>
                </Tabs >

                {/* ─── MODAL: APPROVE SERVICE ORDER ─────────────────────────────────── */}
                <DefaultModal
                    isOpen={showApproveModal}
                    onClose={() => {
                        setShowApproveModal(false)
                        setApproveModalError(null)
                    }}
                    title="Aprovar Ordem de Serviço"
                    maxWidth="md"
                    footer={
                        <div className="flex gap-3 w-full">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowApproveModal(false)
                                    setApproveModalError(null)
                                }}
                                className="flex-1 py-2.5 h-auto"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleApproveOS}
                                disabled={(!isDirectSigner && approvalCode.length < 4) || isProcessingApproval}
                                className="flex-1 bg-brand-green hover:bg-brand-green/90 text-white font-bold py-2.5 h-auto border-none"
                            >
                                {isProcessingApproval ? "Aprovando..." : "Confirmar Aprovação"}
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 text-left">
                        {approveModalError && (
                            <InfoCard message={approveModalError} color="red" />
                        )}

                        <InfoCard color="blue" message={isDirectSigner
                            ? `Você está conectado como ${maskEmail(currentUser?.email || "usuário autorizado")} e pode aprovar esta ordem de serviço diretamente.`
                            : "Digite o código de aprovação de 4 dígitos gerado pelo profissional responsável pela OS para autorizar a execução do serviço."
                        } />

                        {!isDirectSigner && (
                            <Input
                                label="Código de aprovação (4 dígitos)"
                                maxLength={4}
                                value={approvalCode}
                                onChange={(e) => {
                                    setApprovalCode(e.target.value.replace(/\D/g, ""))
                                    if (approveModalError) setApproveModalError(null)
                                }}
                                placeholder="0000"
                            />
                        )}

                        <InfoCard color="gray" message="A assinatura de aceite será solicitada ao final da execução do serviço." />
                    </div>
                </DefaultModal>

                {/* ─── MODAL: SIGN SERVICE ORDER ─────────────────────────────────────── */}
                <DefaultModal
                    isOpen={showSignModal}
                    onClose={() => {
                        setShowSignModal(false)
                        setSignModalError(null)
                    }}
                    title="Assinar Ordem de Serviço"
                    maxWidth="md"
                    footer={
                        <div className="flex gap-3 w-full">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowSignModal(false)
                                    setSignModalError(null)
                                }}
                                className="flex-1 py-2.5 h-auto"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSignOS}
                                disabled={(!canSignWithoutCode && signatureCode.length < 4) || !hasCanvasContent || isProcessingSignature}
                                className="flex-1 bg-brand-green hover:bg-brand-green/90 text-white font-bold py-2.5 h-auto border-none"
                            >
                                {isProcessingSignature ? "Assinando..." : "Confirmar Assinatura"}
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 text-left">
                        {signModalError && (
                            <InfoCard message={signModalError} color="red" />
                        )}

                        <InfoCard color="blue" message={canSignWithoutCode
                            ? `Você está conectado como ${maskEmail(currentUser?.email || "usuário autorizado")} e pode assinar esta ordem de serviço diretamente. Desenhe sua assinatura abaixo.`
                            : "Preencha o campo de código e desenhe sua assinatura no quadro. O código de 4 dígitos foi gerado pelo profissional responsável pela OS."
                        } />

                        <div className="space-y-3">
                            {!canSignWithoutCode && (
                                <Input
                                    label="Código de assinatura (4 dígitos)"
                                    maxLength={4}
                                    value={signatureCode}
                                    onChange={(e) => {
                                        setSignatureCode(e.target.value.replace(/\D/g, ""))
                                        if (signModalError) setSignModalError(null)
                                    }}
                                    placeholder="0000"
                                />
                            )}

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">Desenhe sua assinatura abaixo</label>
                                <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white">
                                    <canvas
                                        ref={canvasRef}
                                        width={500}
                                        height={200}
                                        className="w-full touch-none cursor-crosshair"
                                        style={{ height: "200px" }}
                                        onMouseDown={startDrawing}
                                        onMouseMove={draw}
                                        onMouseUp={stopDrawing}
                                        onMouseLeave={stopDrawing}
                                        onTouchStart={startDrawing}
                                        onTouchMove={draw}
                                        onTouchEnd={stopDrawing}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={clearCanvas}
                                    className="text-[11px] font-semibold text-brand-inactive-text hover:text-brand-dark transition-colors pt-1"
                                >
                                    Limpar quadro
                                </button>
                            </div>
                        </div>
                    </div>
                </DefaultModal>

                {/* ─── MODAL: REJECT SERVICE ORDER ───────────────────────────────────── */}
                <DefaultModal
                    isOpen={showRejectModal}
                    onClose={() => {
                        setShowRejectModal(false)
                        setRejectError(null)
                    }}
                    title="Recusar Ordem de Serviço"
                    maxWidth="md"
                    footer={
                        <div className="flex gap-3 w-full">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowRejectModal(false)
                                    setRejectError(null)
                                }}
                                className="flex-1 py-2.5 h-auto"
                            >
                                Voltar
                            </Button>
                            <Button
                                onClick={handleRejectOS}
                                disabled={isProcessingReject}
                                className="flex-1 bg-brand-red hover:bg-brand-red/90 text-white font-bold py-2.5 h-auto border-none"
                            >
                                {isProcessingReject ? "Recusando..." : "Confirmar Recusa"}
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 text-left">
                        {rejectError && (
                            <InfoCard message={rejectError} color="red" />
                        )}

                        <InfoCard color="red" message="Ao recusar, esta ordem de serviço será cancelada e não poderá mais ser aprovada pelo link." />

                        <div className="space-y-2">
                            <FormTextarea
                                label="Motivo da recusa (opcional)"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={4}
                                maxLength={500}
                                placeholder="Descreva o motivo da recusa, se desejar."
                                className="w-full"
                            />
                        </div>
                    </div>
                </DefaultModal>
            </div>
        </>
    )
}
