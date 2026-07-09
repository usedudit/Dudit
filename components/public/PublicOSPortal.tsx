"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import {
    getServiceOrderByTokenAction,
    getPublicPresignedUploadUrlAction,
    signPublicServiceOrderAction
} from "@/app/actions/erp/service-orders"
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
    InfoCard
} from "@/components/reusable"
import OSPreview from "@/components/erp/service-orders/OSPreview"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import { formatCurrency } from "@/lib/utils"
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from "@/lib/types/service-order"
import { HistoryTimeline } from "@/components/erp/shared/HistoryTimeline"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { useSupabase } from "@/providers/supabase-provider"

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
        statusHistory: any[]
        sale: any
    }
}

export default function PublicOSPortal({ token, data: initialData, ip, userAgent }: PublicOSPortalProps) {
    // ─── STATE MANAGEMENT ────────────────────────────────────────────────────
    const [order, setOrder] = useState(initialData.serviceOrder)
    const [services, setServices] = useState(initialData.services)
    const [products, setProducts] = useState(initialData.products)
    const [attachments, setAttachments] = useState(initialData.attachments)
    const [history, setHistory] = useState(initialData.history)
    const [statusHistory, setStatusHistory] = useState(initialData.statusHistory)
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

    const customerEmail = order.customer_snapshot?.email || ""
    const isClientEmailMatched = useMemo(() => {
        return !!(currentUser && customerEmail && currentUser.email?.toLowerCase() === customerEmail.toLowerCase())
    }, [currentUser, customerEmail])

    // ─── FORMATTING HELPERS ──────────────────────────────────────────────────
    const buildImageUrl = (key: string) => {
        if (!key) return ""
        return key.startsWith("http") ? key : `${CDN_URL}/${key}`
    }

    const formatDateString = (dateStr: string) => {
        if (!dateStr) return "---"
        const parts = dateStr.split("-")
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`
        }
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return dateStr
        return d.toLocaleDateString("pt-BR")
    }

    const formatDateTime = (dateVal: string | Date) => {
        const d = new Date(dateVal)
        if (isNaN(d.getTime())) return ""
        return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    }

    // Resolve Partner Details
    const partner = order?.partners || null
    const partnerName = partner?.store_name || "Parceiro"
    const partnerLogo = partner?.store_image_url ? buildImageUrl(partner.store_image_url) : null
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
                    setStatusHistory(res.data.statusHistory)
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
        if (!canvas || (!isClientEmailMatched && signatureCode.length < 4)) return

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
                "Cliente",
                isClientEmailMatched ? "" : signatureCode,
                urlRes.key,
                ip,
                userAgent
            )

            if (signRes.success) {
                setSuccessMessage("Ordem de serviço assinada com sucesso!")
                setShowSignModal(false)

                // Refresh local data
                const refreshRes = await getServiceOrderByTokenAction(token)
                if (refreshRes.success && refreshRes.data) {
                    setOrder(refreshRes.data.serviceOrder)
                    setServices(refreshRes.data.services)
                    setProducts(refreshRes.data.products)
                    setAttachments(refreshRes.data.attachments)
                    setHistory(refreshRes.data.history)
                }
            } else {
                setErrorMessage(signRes.error || "Erro ao verificar código e assinar.")
            }

        } catch (err: any) {
            setErrorMessage(err.message || "Ocorreu um erro ao processar a assinatura.")
        } finally {
            setIsProcessingSignature(false)
        }
    }

    const isFinalized = order.status === "concluida" || order.status === "entregue" || order.status === "cancelada" || order.signature_image_key
    const statusMeta = SERVICE_ORDER_STATUS_META[order.status as ServiceOrderStatus]

    // Group attachments by category
    const groupedAttachments = useMemo(() => {
        const g: Record<string, any[]> = { normal: [], antes: [], depois: [] }
        for (const att of attachments || []) {
            const cat = att.category || "normal"
            if (!g[cat]) g[cat] = []
            g[cat].push(att)
        }
        return g
    }, [attachments])

    return (
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
                                                <img src={partnerLogo} alt={partnerName} className="h-9 w-9 object-cover rounded-lg border border-brand-border dark:border-dark-border" />
                                            ) : (
                                                <div className="h-9 w-9 rounded-lg bg-brand-green flex items-center justify-center text-white font-bold text-sm shrink-0">
                                                    {partnerName.substring(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading block leading-tight">{partnerName}</span>
                                                <span className="text-[11px] text-brand-inactive-text dark:text-dark-body block tracking-wider">Ordem de Serviço #{order.order_number}</span>
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
                                    <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-800 rounded-2xl flex items-center gap-3">
                                        <span className="text-xs font-semibold">{successMessage}</span>
                                        <button onClick={() => setSuccessMessage(null)} className="ml-auto text-green-500 hover:text-green-700">✕</button>
                                    </div>
                                )}

                                {errorMessage && (
                                    <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex items-center gap-3">
                                        <span className="text-xs font-semibold">{errorMessage}</span>
                                        <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-500 hover:text-red-700">✕</button>
                                    </div>
                                )}

                                <div className={`${activeTab === "Visualização" ? "hidden lg:block" : "block"}`}>
                                    {/* Messages */}
                                    {isFinalized && (
                                        <div>
                                            {order.signature_image_key ? (
                                                <InfoCard title='Aprovado pelo cliente' message={`Aprovador: ${order.approver_name || "Cliente"} - Data: ${formatDateTime(order.signed_at)}`} color='green' />
                                            ) : (
                                                <InfoCard title='Ordem de serviço finalizada ou cancelada' message="" color='red' />
                                            )}
                                        </div>
                                    )}

                                    {/* ─── TAB: DADOS GERAIS ─── */}
                                    {activeTab === "Dados Gerais" && (
                                        <div className="space-y-8 text-left">
                                            <FormSection title="Informações do serviço">
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Código da OS</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">#{order.order_number}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Data de abertura</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDateTime(order.created_at)}</span>
                                                    </div>
                                                    {order.expected_completion_date && (
                                                        <div className="flex justify-between items-center text-sm">
                                                            <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Previsão de conclusão</span>
                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDateString(order.expected_completion_date)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </FormSection>


                                            <FormSection title="Cliente" hasSeparator>
                                                {order.customer_snapshot ? (
                                                    <CustomerCard
                                                        customer={order.customer_snapshot}
                                                        address={order.customer_snapshot ? {
                                                            street: order.customer_snapshot.street || order.customer_snapshot.address_street,
                                                            number: order.customer_snapshot.number || order.customer_snapshot.address_number,
                                                            complement: order.customer_snapshot.complement || order.customer_snapshot.address_complement,
                                                            neighborhood: order.customer_snapshot.neighborhood || order.customer_snapshot.address_neighborhood,
                                                            city: order.customer_snapshot.city || order.customer_snapshot.address_city,
                                                            state: order.customer_snapshot.state || order.customer_snapshot.address_state || order.customer_snapshot.address_uf || order.customer_snapshot.uf,
                                                            zipCode: order.customer_snapshot.zip_code || order.customer_snapshot.zipCode || order.customer_snapshot.address_zip_code,
                                                        } : null}
                                                        chrome="minimal"
                                                    />
                                                ) : (
                                                    <div className="space-y-2">
                                                        <p className="font-bold text-brand-dark dark:text-dark-heading text-sm">{order.customer_name || "Consumidor final"}</p>
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body italic">Nenhum cadastro de cliente vinculado.</p>
                                                    </div>
                                                )}
                                            </FormSection>

                                            {order.description && (
                                                <FormSection title="Observações" hasSeparator>
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap leading-relaxed">{order.description}</p>
                                                </FormSection>
                                            )}

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

                                            {/* Sign Button */}
                                            {!isFinalized && (
                                                <div className="pt-6 border-t border-brand-border dark:border-dark-border">
                                                    <Button
                                                        onClick={() => {
                                                            setSignerName(order.customer_name || "")
                                                            setShowSignModal(true)
                                                        }}
                                                        className="w-full h-12"
                                                    >
                                                        Assinar Ordem de Serviço
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ─── TAB: ANEXOS ─── */}
                                    {activeTab === "Anexos" && (
                                        <div className="space-y-6 text-left">
                                            {/* If before/after enabled, group attachments */}
                                            {beforeAfterEnabled ? (
                                                <>
                                                    {/* Antes */}
                                                    <FormSection title="Antes">
                                                        {groupedAttachments.antes.length === 0 ? (
                                                            <p className="text-xs italic text-brand-inactive-text">Nenhum anexo registrado antes do serviço.</p>
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

                                                    {/* Depois */}
                                                    <FormSection title="Depois" hasSeparator>
                                                        {groupedAttachments.depois.length === 0 ? (
                                                            <p className="text-xs italic text-brand-inactive-text">Nenhum anexo registrado depois do serviço.</p>
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

                                                    {/* Gerais / Outros */}
                                                    {groupedAttachments.normal.length > 0 && (
                                                        <FormSection title="Outros Anexos" hasSeparator>
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                                {groupedAttachments.normal.map((att: any, idx: number) => (
                                                                    <div key={idx} className="rounded-xl overflow-hidden border border-brand-border relative bg-white aspect-square flex items-center justify-center">
                                                                        {att.file_type?.startsWith("image/") ? (
                                                                            <img src={buildImageUrl(att.file_key)} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <span className="text-xs text-brand-inactive-text text-center px-2 truncate w-full">{att.file_name || "Anexo"}</span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </FormSection>
                                                    )}
                                                </>
                                            ) : (
                                                /* Standalone list of all attachments */
                                                <FormSection title="Anexos">
                                                    {attachments.length === 0 ? (
                                                        <p className="text-xs italic text-brand-inactive-text">Nenhum anexo registrado nesta ordem de serviço.</p>
                                                    ) : (
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                            {attachments.map((att: any, idx: number) => (
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
                                            )}
                                        </div>
                                    )}

                                    {/* ─── TAB: HISTÓRICO ─── */}
                                    {activeTab === "Histórico" && (
                                        <div className="space-y-4 text-left">
                                            {history.length === 0 ? (
                                                <div className="text-center py-8 text-xs text-brand-inactive-text italic">
                                                    Nenhum histórico operacional disponível.
                                                </div>
                                            ) : (
                                                <HistoryTimeline
                                                    entries={history.map((h: any) => ({
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
                                        {order.customer_snapshot && (
                                            <CustomerCard
                                                customer={order.customer_snapshot}
                                                address={order.customer_snapshot ? {
                                                    street: order.customer_snapshot.street || order.customer_snapshot.address_street,
                                                    number: order.customer_snapshot.number || order.customer_snapshot.address_number,
                                                    complement: order.customer_snapshot.complement || order.customer_snapshot.address_complement,
                                                    neighborhood: order.customer_snapshot.neighborhood || order.customer_snapshot.address_neighborhood,
                                                    city: order.customer_snapshot.city || order.customer_snapshot.address_city,
                                                    state: order.customer_snapshot.state || order.customer_snapshot.address_state || order.customer_snapshot.address_uf || order.customer_snapshot.uf,
                                                    zipCode: order.customer_snapshot.zip_code || order.customer_snapshot.zipCode || order.customer_snapshot.address_zip_code,
                                                } : null}
                                                chrome="minimal"
                                            />
                                        )}
                                        <div className="w-full h-[calc(100vh-220px)] bg-brand-gray dark:bg-dark-border/20 rounded-2xl overflow-hidden">
                                            <OSPreview
                                                invoiceNumber={order.order_number}
                                                orderDate={order.created_at}
                                                expectedCompletionDate={order.expected_completion_date}
                                                selectedCustomer={order.customer_snapshot}
                                                services={services}
                                                products={products}
                                                totalServiceAmount={Number(order.total_service_amount || 0)}
                                                totalProductAmount={Number(order.total_product_amount || 0)}
                                                totalAmount={Number(order.total_amount || 0)}
                                                description={order.description}
                                                signatureImageKey={order.signature_image_key}
                                                signedAt={order.signed_at}
                                                partnerName={partnerName}
                                                partnerAddress={partner?.address || undefined}
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
                            {order.customer_snapshot && (
                                <div className="px-4 pt-4">
                                    <CustomerCard
                                        customer={order.customer_snapshot}
                                        address={order.customer_snapshot ? {
                                            street: order.customer_snapshot.street || order.customer_snapshot.address_street,
                                            number: order.customer_snapshot.number || order.customer_snapshot.address_number,
                                            complement: order.customer_snapshot.complement || order.customer_snapshot.address_complement,
                                            neighborhood: order.customer_snapshot.neighborhood || order.customer_snapshot.address_neighborhood,
                                            city: order.customer_snapshot.city || order.customer_snapshot.address_city,
                                            state: order.customer_snapshot.state || order.customer_snapshot.address_state || order.customer_snapshot.address_uf || order.customer_snapshot.uf,
                                            zipCode: order.customer_snapshot.zip_code || order.customer_snapshot.zipCode || order.customer_snapshot.address_zip_code,
                                        } : null}
                                        chrome="minimal"
                                    />
                                </div>
                            )}
                            <OSPreview
                                invoiceNumber={order.order_number}
                                orderDate={order.created_at}
                                expectedCompletionDate={order.expected_completion_date}
                                selectedCustomer={order.customer_snapshot}
                                services={services}
                                products={products}
                                totalServiceAmount={Number(order.total_service_amount || 0)}
                                totalProductAmount={Number(order.total_product_amount || 0)}
                                totalAmount={Number(order.total_amount || 0)}
                                description={order.description}
                                signatureImageKey={order.signature_image_key}
                                signedAt={order.signed_at}
                                partnerName={partnerName}
                                partnerAddress={partner?.address || undefined}
                                partnerAvatar={partnerLogo || undefined}
                                printMode={false}
                                showCustomerContact={false}
                                salespersonName={order.assigned_user_name || undefined}
                            />
                        </div>

                    </div>
                </div>
            </Tabs>

            {/* ─── MODAL: SIGN SERVICE ORDER ─────────────────────────────────────── */}
            <DefaultModal
                isOpen={showSignModal}
                onClose={() => setShowSignModal(false)}
                title="Assinar Ordem de Serviço"
                maxWidth="md"
                footer={
                    <div className="flex gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setShowSignModal(false)}
                            className="flex-1 py-2.5 h-auto"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSignOS}
                            disabled={(!isClientEmailMatched && signatureCode.length < 4) || !hasCanvasContent || isProcessingSignature}
                            className="flex-1 bg-brand-green hover:bg-brand-green/90 text-white font-bold py-2.5 h-auto border-none"
                        >
                            {isProcessingSignature ? "Assinando..." : "Confirmar Assinatura"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 text-left">
                    <InfoCard color="blue" message={isClientEmailMatched
                        ? `Você está conectado como ${currentUser.email} e pode assinar esta ordem de serviço diretamente. Desenhe sua assinatura abaixo.`
                        : "Preencha o campo de código e desenhe sua assinatura no quadro. O código de assinatura de 4 dígitos foi gerado pelo profissional responsável pela OS."
                    } />

                    <div className="space-y-3">
                        {!isClientEmailMatched && (
                            <Input
                                label="Código de assinatura (4 dígitos)"
                                maxLength={4}
                                value={signatureCode}
                                onChange={(e) => setSignatureCode(e.target.value.replace(/\D/g, ""))}
                                placeholder="0000"
                            />
                        )}

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase text-brand-inactive-text dark:text-dark-body">Desenhe sua assinatura abaixo</label>
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
        </div>
    )
}
