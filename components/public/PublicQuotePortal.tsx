"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import {
    getPublicQuoteAction,
    submitPublicCommentAction,
    approvePublicQuoteAction,
    rejectPublicQuoteAction
} from "@/app/actions/erp/quotes"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    CustomerCard,
    ThreeDotsLoader,
    FormSection,
    DefaultModal,
    Input,
    FormTextarea
} from "@/components/reusable"
import QuotePreview from "@/components/erp/quotes/QuotePreview"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils"

interface PublicQuotePortalProps {
    token: string
    initialData: {
        quote: any
        snapshot: any
        interactions: any[]
    }
    ip: string
    userAgent: string
}

const getStatusBadgeVariant = (status: string) => {
    switch (status) {
        case "approved": return "green" as const
        case "rejected": return "red" as const
        case "expired": return "orange" as const
        case "cancelled": return "gray" as const
        case "viewed": return "cyan" as const
        default: return "blue" as const
    }
}

const getStatusLabel = (status: string) => {
    switch (status) {
        case "approved": return "Aprovado"
        case "rejected": return "Recusado"
        case "expired": return "Expirado"
        case "cancelled": return "Cancelado"
        case "viewed": return "Visualizado"
        default: return "Pendente"
    }
}

export default function PublicQuotePortal({ token, initialData, ip, userAgent }: PublicQuotePortalProps) {
    // ─── STATE MANAGEMENT ────────────────────────────────────────────────────
    const [quote, setQuote] = useState(initialData.quote)
    const [snapshot, setSnapshot] = useState(initialData.snapshot)
    const [interactions, setInteractions] = useState(initialData.interactions)
    const [activeTab, setActiveTab] = useState("Dados Gerais")

    const [newComment, setNewComment] = useState("")
    const [isSubmittingComment, setIsSubmittingComment] = useState(false)

    // Approval Modals
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [showRejectModal, setShowRejectModal] = useState(false)
    const [isProcessingAction, setIsProcessingAction] = useState(false)

    // Verification Inputs
    const [approverName, setApproverName] = useState("")
    const [approvalCode, setApprovalCode] = useState("")
    const [rejectionReason, setRejectionReason] = useState("")

    // Notifications & Messages
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    const commentEndRef = useRef<HTMLDivElement>(null)

    // ─── FORMATTING HELPERS ──────────────────────────────────────────────────
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

    // ─── REAL-TIME POLLING ───────────────────────────────────────────────────
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await getPublicQuoteAction(token, ip, userAgent)
                if (res.success && res.data) {
                    setQuote(res.data.quote)
                    setSnapshot(res.data.snapshot)
                    setInteractions(res.data.interactions)
                }
            } catch (err) {
                console.error("Erro no polling do orçamento público:", err)
            }
        }, 15000)

        return () => clearInterval(interval)
    }, [token, ip, userAgent])

    // Scroll to comments end
    useEffect(() => {
        commentEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [interactions])

    // ─── ACTIONS ─────────────────────────────────────────────────────────────
    const handleSendComment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newComment.trim() || isSubmittingComment) return

        setIsSubmittingComment(true)
        setErrorMessage(null)

        let guestName = "Cliente"
        if (typeof window !== "undefined") {
            const savedName = localStorage.getItem("dudit_guest_name")
            if (savedName) guestName = savedName
        }

        try {
            const res = await submitPublicCommentAction(token, guestName, newComment, ip)
            if (res.success) {
                setNewComment("")
                // Sync comments instantly
                const refreshRes = await getPublicQuoteAction(token, ip, userAgent)
                if (refreshRes.success && refreshRes.data) {
                    setInteractions(refreshRes.data.interactions)
                }
            } else {
                setErrorMessage(res.error || "Erro ao enviar mensagem.")
            }
        } catch {
            setErrorMessage("Erro de conexão ao enviar comentário.")
        } finally {
            setIsSubmittingComment(false)
        }
    }

    const handleApprove = async () => {
        setIsProcessingAction(true)
        setErrorMessage(null)
        try {
            const res = await approvePublicQuoteAction(token, approverName, approvalCode, ip, userAgent)
            if (res.success) {
                setSuccessMessage("Orçamento aprovado com sucesso!")
                setShowApproveModal(false)
                if (typeof window !== "undefined") {
                    localStorage.setItem("dudit_guest_name", approverName)
                }
                // Reload data
                const refreshRes = await getPublicQuoteAction(token, ip, userAgent)
                if (refreshRes.success && refreshRes.data) {
                    setQuote(refreshRes.data.quote)
                    setSnapshot(refreshRes.data.snapshot)
                }
            } else {
                setErrorMessage(res.error || "Erro ao aprovar orçamento.")
            }
        } catch (err: any) {
            setErrorMessage(err.message || "Erro de conexão ao processar aprovação.")
        } finally {
            setIsProcessingAction(false)
        }
    }

    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            setErrorMessage("O motivo da recusa é obrigatório.")
            return
        }
        setIsProcessingAction(true)
        setErrorMessage(null)
        try {
            const res = await rejectPublicQuoteAction(token, approverName, approvalCode, rejectionReason, ip, userAgent)
            if (res.success) {
                setSuccessMessage("Orçamento recusado com sucesso.")
                setShowRejectModal(false)
                if (typeof window !== "undefined") {
                    localStorage.setItem("dudit_guest_name", approverName)
                }
                // Reload data
                const refreshRes = await getPublicQuoteAction(token, ip, userAgent)
                if (refreshRes.success && refreshRes.data) {
                    setQuote(refreshRes.data.quote)
                    setSnapshot(refreshRes.data.snapshot)
                }
            } else {
                setErrorMessage(res.error || "Erro ao recusar orçamento.")
            }
        } catch (err: any) {
            setErrorMessage(err.message || "Erro de conexão ao processar recusa.")
        } finally {
            setIsProcessingAction(false)
        }
    }

    // ─── RENDERING COMPUTED DATA ─────────────────────────────────────────────
    const dataQuote = { ...quote, ...snapshot }
    const items = snapshot?.items || quote.items || []

    const resolvedPartner = useMemo(() => {
        const qp = quote.partners
        return Array.isArray(qp) ? qp[0] : qp
    }, [quote.partners])

    const partnerName = useMemo(() => {
        const snapName = snapshot?.partner?.name
        if (snapName && snapName !== "Parceiro") return snapName
        return resolvedPartner?.store_name || snapName || "Parceiro"
    }, [snapshot, resolvedPartner])

    const partnerLogo = useMemo(() => {
        const snapLogo = snapshot?.partner?.image_url
        return getR2ImageUrl(snapLogo || resolvedPartner?.store_image_url || null)
    }, [snapshot, resolvedPartner])

    const partnerAddress = snapshot?.partner?.address || "Endereço comercial não disponível"
    const partnerEmail = snapshot?.partner?.email || resolvedPartner?.email || "vendas@dudit.com"
    const partnerPhone = snapshot?.partner?.phone || resolvedPartner?.phone || ""

    const sellerName = snapshot?.seller?.name || "Vendedor Responsável"
    const sellerEmail = snapshot?.seller?.email || ""

    const selectedCustomer = snapshot?.customer || quote.customers || null
    const customerName = selectedCustomer?.name || "Consumidor final"
    const customerEmail = selectedCustomer?.email || ""
    const customerPhone = selectedCustomer?.phone || ""

    // Address rendering for customer
    const customerAddressText = (() => {
        if (!selectedCustomer?.addresses?.length) return null
        const addr = selectedCustomer.addresses.find((a: any) => a.address_type === "primary" || a.is_default) || selectedCustomer.addresses[0]
        return `${addr.street || ""}, ${addr.number || ""}${addr.complement ? ` - ${addr.complement}` : ""}\n${addr.neighborhood || ""} - ${addr.city || ""}/${addr.state || ""}\nCEP: ${addr.zip_code || ""}`
    })()

    // Items mapping for QuotePreview component
    const mappedPreviewItems = useMemo(() => {
        return items.map((item: any) => ({
            name: item.name || item.custom_name || "Produto sem nome",
            qty: item.quantity,
            price: Number(item.unit_price || 0),
            sku: item.sku || "N/A"
        }))
    }, [items])

    // Disable approval features if quote is finalized
    const isFinalized = quote.status === "approved" || quote.status === "rejected" || quote.status === "expired" || quote.status === "cancelled" || quote.converted

    return (
        <div className="flex flex-col h-screen bg-white dark:bg-dark-background overflow-hidden relative">
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
                            {/* Sticky Header inside left column */}
                            <div className="shrink-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
                                <div className="px-4 md:px-6 pt-4 pb-2">
                                    <div className="flex items-center justify-between">
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
                                                <span className="text-[11px] text-brand-inactive-text dark:text-dark-body block tracking-wider">Proposta comercial</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Badge variant={getStatusBadgeVariant(quote.status)}>
                                                {getStatusLabel(quote.status)}
                                            </Badge>
                                        </div>
                                    </div>

                                    {/* Responsive Tabs List */}
                                    <div className="w-full mt-4">
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="Dados Gerais">Dados Gerais</TabsTrigger>
                                            <TabsTrigger value="Canal de Negociação">Canal de Negociação</TabsTrigger>
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

                                {/* TABS CONTENT */}
                                <div className={`${activeTab === "Visualização" ? "hidden lg:block" : "block"}`}>

                                    {/* ─── TAB: DADOS GERAIS ─── */}
                                    {activeTab === "Dados Gerais" && (
                                        <div className="space-y-8 text-left">
                                            {/* Code & Expiry FormSection */}
                                            <FormSection title="Informações da proposta">
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Código da proposta</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{dataQuote.quote_number || "Orçamento"}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Data de emissão</span>
                                                        <span className="font-medium text-brand-dark dark:text-dark-heading">{formatDateString(dataQuote.issue_date)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Validade da proposta</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDateString(dataQuote.expiration_date)}</span>
                                                    </div>
                                                </div>
                                            </FormSection>

                                            {/* Issuer / Seller FormSection */}
                                            <FormSection title="Fornecedor" hasSeparator>
                                                <div className="space-y-2">
                                                    <p className="font-bold text-brand-dark dark:text-dark-heading text-sm">{partnerName}</p>
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap">{partnerAddress}</p>
                                                    {partnerPhone && <p className="text-xs text-brand-inactive-text dark:text-dark-body">Telefone: {partnerPhone}</p>}
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">E-mail: {partnerEmail}</p>
                                                    {sellerName && <p className="text-xs font-semibold text-brand-green mt-2">Vendedor: {sellerName} ({sellerEmail})</p>}
                                                </div>
                                            </FormSection>

                                            {/* Customer FormSection */}
                                            <FormSection title="Cliente" hasSeparator>
                                                {selectedCustomer ? (
                                                    <CustomerCard customer={selectedCustomer} chrome="minimal" />
                                                ) : (
                                                    <div className="space-y-2">
                                                        <p className="font-bold text-brand-dark dark:text-dark-heading text-sm">{customerName}</p>
                                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body italic">Nenhum endereço especificado.</p>
                                                        {customerPhone && <p className="text-xs text-brand-inactive-text dark:text-dark-body">Telefone: {customerPhone}</p>}
                                                        {customerEmail && <p className="text-xs text-brand-inactive-text dark:text-dark-body">E-mail: {customerEmail}</p>}
                                                    </div>
                                                )}
                                            </FormSection>

                                            {/* Commercial Notes / Observation FormSection */}
                                            {dataQuote.notes && (
                                                <FormSection title="Observações comerciais" hasSeparator>
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap leading-relaxed">{dataQuote.notes}</p>
                                                </FormSection>
                                            )}

                                            {/* Decision Action Buttons */}
                                            {!isFinalized ? (
                                                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-brand-border dark:border-dark-border">
                                                    <Button
                                                        onClick={() => setShowApproveModal(true)}
                                                        className="flex-1 bg-brand-green hover:bg-brand-green/90 text-white font-bold text-sm h-11"
                                                    >
                                                        ✓ Aprovar proposta
                                                    </Button>
                                                    <Button
                                                        onClick={() => setShowRejectModal(true)}
                                                        variant="outline"
                                                        className="flex-1 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 font-bold text-sm h-11 border-red-200 dark:border-red-900/30"
                                                    >
                                                        ✕ Recusar proposta
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="p-4 rounded-2xl border text-xs font-semibold text-left space-y-2">
                                                    {quote.status === "approved" ? (
                                                        <div className="bg-green-50 border-green-100 text-green-800 p-2.5 rounded-xl space-y-1">
                                                            <div className="font-bold text-sm text-green-900 flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                                Aprovado pelo cliente
                                                            </div>
                                                            <div>Aprovador: <span className="font-bold">{quote.approver_name || "Cliente"}</span></div>
                                                            <div>Data: {formatDateTime(quote.approved_at)}</div>
                                                        </div>
                                                    ) : quote.status === "rejected" ? (
                                                        <div className="bg-red-50 border-red-100 text-red-800 p-2.5 rounded-xl space-y-1">
                                                            <div className="font-bold text-sm text-red-900 flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                                Recusado pelo cliente
                                                            </div>
                                                            <div>Autor: <span className="font-bold">{quote.approver_name || "Cliente"}</span></div>
                                                            <div>Data: {formatDateTime(quote.rejected_at)}</div>
                                                            {quote.rejection_reason && <div className="mt-1.5 italic text-slate-500 bg-white/60 p-2 rounded-lg border border-red-100">"{quote.rejection_reason}"</div>}
                                                        </div>
                                                    ) : quote.status === "expired" ? (
                                                        <div className="bg-orange-50 border-orange-100 text-brand-orange p-2.5 rounded-xl">
                                                            A proposta atingiu seu limite de validade em <span className="font-bold">{formatDateString(quote.expiration_date)}</span> e expirou.
                                                        </div>
                                                    ) : (
                                                        <div className="bg-gray-50 border-brand-border text-brand-dark p-2.5 rounded-xl">
                                                            Orçamento cancelado pelo vendedor.
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ─── TAB: CANAL DE NEGOCIAÇÃO ─── */}
                                    {activeTab === "Canal de Negociação" && (
                                        <div className="space-y-4 text-left h-full flex flex-col">
                                            <div className="border border-brand-border dark:border-dark-border rounded-2xl p-4 bg-brand-gray/5 dark:bg-dark-surface/5">
                                                <h3 className="font-bold text-xs text-brand-dark dark:text-dark-heading tracking-wide">Mensagens</h3>
                                                <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-1">Dúvidas, pedidos de desconto ou prazos diferenciados? Negocie diretamente com o vendedor.</p>
                                            </div>

                                            {/* Chat stream */}
                                            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 no-scrollbar flex flex-col gap-2 border border-brand-border dark:border-dark-border rounded-2xl p-4 flex-1">
                                                {interactions.length === 0 ? (
                                                    <div className="text-center py-8 text-xs text-brand-inactive-text italic my-auto">
                                                        Nenhuma mensagem trocada ainda.
                                                    </div>
                                                ) : (
                                                    interactions.map((msg: any) => {
                                                        const isCustomer = msg.author_role === "customer"
                                                        return (
                                                            <div
                                                                key={msg.id}
                                                                className={`p-3 rounded-2xl text-xs max-w-[85%] ${isCustomer
                                                                    ? "bg-brand-gray/20 dark:bg-dark-border/40 text-brand-dark dark:text-dark-heading align-self-start self-start"
                                                                    : "bg-green-50 border border-green-100 text-green-900 align-self-end self-end text-right ml-auto"
                                                                    }`}
                                                            >
                                                                <div className="font-bold mb-1">
                                                                    {isCustomer ? `${msg.author_name} (Cliente)` : `${msg.author_name} (Vendedor)`}
                                                                </div>
                                                                <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                                                <span className="text-[9px] text-brand-inactive-text dark:text-dark-body block mt-1">
                                                                    {formatDateTime(msg.created_at)}
                                                                </span>
                                                            </div>
                                                        )
                                                    })
                                                )}
                                                <div ref={commentEndRef}></div>
                                            </div>

                                            {/* Chat Input Form */}
                                            {!isFinalized && (
                                                <form onSubmit={handleSendComment} className="flex gap-2 pt-2">
                                                    <input
                                                        type="text"
                                                        value={newComment}
                                                        onChange={(e) => setNewComment(e.target.value)}
                                                        placeholder="Digite sua dúvida ou contraproposta..."
                                                        className="flex-1 text-xs bg-brand-gray/10 dark:bg-dark-surface/20 p-3 rounded-2xl border border-brand-border dark:border-dark-border outline-none focus:border-brand-inactive-text text-brand-dark dark:text-dark-heading"
                                                        disabled={isSubmittingComment}
                                                    />
                                                    <Button
                                                        type="submit"
                                                        disabled={!newComment.trim() || isSubmittingComment}
                                                        className="bg-brand-dark text-white hover:bg-brand-dark/90 font-semibold text-xs px-4 h-11 shrink-0 rounded-2xl"
                                                    >
                                                        {isSubmittingComment ? "..." : "Enviar"}
                                                    </Button>
                                                </form>
                                            )}
                                        </div>
                                    )}

                                </div>

                                {/* ─── TAB: VISUALIZAÇÃO (MOBILE ONLY) ─── */}
                                <TabsContent value="Visualização" className="mt-0 focus-visible:outline-none h-full lg:hidden" forceMount>
                                    <div className={`${activeTab === "Visualização" ? "block" : "hidden"}`}>
                                        <div className="w-full h-[calc(100vh-220px)] bg-brand-gray dark:bg-dark-border/20 rounded-2xl overflow-hidden">
                                            <QuotePreview
                                                invoiceNumber={dataQuote.quote_number || "ORC-0000"}
                                                quoteDate={dataQuote.issue_date || ""}
                                                expiryDate={dataQuote.expiration_date || ""}
                                                selectedCustomer={selectedCustomer}
                                                quoteItems={mappedPreviewItems}
                                                subtotal={Number(dataQuote.subtotal || 0)}
                                                shippingNum={Number(dataQuote.shipping_cost || 0)}
                                                otherCosts={Number(dataQuote.additional_costs || 0)}
                                                discountValue={Number(dataQuote.discount_value || 0)}
                                                total={Number(dataQuote.total || 0)}
                                                note={dataQuote.notes || undefined}
                                                primaryColor={dataQuote.primary_color || undefined}
                                                secondaryColor={dataQuote.secondary_color || undefined}
                                                quoteTitle={dataQuote.quote_title || undefined}
                                                quoteSubtitle={dataQuote.quote_subtitle || undefined}
                                                partnerName={partnerName}
                                                partnerAddress={partnerAddress}
                                                partnerAvatar={partnerLogo || undefined}
                                                printMode={false}
                                                showCustomerContact={false}
                                                salespersonName={dataQuote.seller_name || undefined}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: PREVIEW (DESKTOP ONLY) */}
                        <div className="hidden lg:flex lg:w-1/2 bg-brand-gray/30 dark:bg-dark-border/10 overflow-auto no-scrollbar relative flex-col h-full">
                            <QuotePreview
                                invoiceNumber={dataQuote.quote_number || "ORC-0000"}
                                quoteDate={dataQuote.issue_date || ""}
                                expiryDate={dataQuote.expiration_date || ""}
                                selectedCustomer={selectedCustomer}
                                quoteItems={mappedPreviewItems}
                                subtotal={Number(dataQuote.subtotal || 0)}
                                shippingNum={Number(dataQuote.shipping_cost || 0)}
                                otherCosts={Number(dataQuote.additional_costs || 0)}
                                discountValue={Number(dataQuote.discount_value || 0)}
                                total={Number(dataQuote.total || 0)}
                                note={dataQuote.notes || undefined}
                                primaryColor={dataQuote.primary_color || undefined}
                                secondaryColor={dataQuote.secondary_color || undefined}
                                quoteTitle={dataQuote.quote_title || undefined}
                                quoteSubtitle={dataQuote.quote_subtitle || undefined}
                                partnerName={partnerName}
                                partnerAddress={partnerAddress}
                                partnerAvatar={partnerLogo || undefined}
                                printMode={false}
                                showCustomerContact={false}
                                salespersonName={dataQuote.seller_name || undefined}
                            />
                        </div>

                    </div>
                </div>
            </Tabs>

            {/* ─── MODAL: APPROVE PROPOSAL ─────────────────────────────────────── */}
            <DefaultModal
                isOpen={showApproveModal}
                onClose={() => setShowApproveModal(false)}
                title="Aprovar proposta"
                maxWidth="md"
                footer={
                    <div className="flex gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setShowApproveModal(false)}
                            className="flex-1 py-2.5 h-auto"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleApprove}
                            disabled={!approverName.trim() || approvalCode.length < 4 || isProcessingAction}
                            className="flex-1 bg-brand-green hover:bg-brand-green/90 text-white font-bold py-2.5 h-auto border-none"
                        >
                            {isProcessingAction ? "Aprovando..." : "Confirmar aprovação"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                        Insira suas credenciais abaixo. O código de aprovação de 4 dígitos foi gerado pelo vendedor responsável.
                    </p>

                    <div className="space-y-3">
                        <Input
                            label="Seu nome completo"
                            value={approverName}
                            onChange={(e) => setApproverName(e.target.value)}
                            placeholder="Ex: João da Silva"
                        />

                        <Input
                            label="Código de aprovação (4 dígitos)"
                            maxLength={4}
                            value={approvalCode}
                            onChange={(e) => setApprovalCode(e.target.value.replace(/\D/g, ""))}
                            placeholder="0000"
                        />
                    </div>
                </div>
            </DefaultModal>

            {/* ─── MODAL: REJECT PROPOSAL ─────────────────────────────────────── */}
            <DefaultModal
                isOpen={showRejectModal}
                onClose={() => setShowRejectModal(false)}
                title="Recusar proposta"
                maxWidth="md"
                footer={
                    <div className="flex gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setShowRejectModal(false)}
                            className="flex-1 py-2.5 h-auto"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleReject}
                            disabled={!approverName.trim() || approvalCode.length < 4 || !rejectionReason.trim() || isProcessingAction}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 h-auto border-none"
                        >
                            {isProcessingAction ? "Recusando..." : "Confirmar recusa"}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                        Insira suas credenciais e informe o motivo comercial. O vendedor receberá uma notificação imediata.
                    </p>

                    <div className="space-y-3">
                        <Input
                            label="Seu nome completo"
                            value={approverName}
                            onChange={(e) => setApproverName(e.target.value)}
                            placeholder="Ex: João da Silva"
                        />

                        <Input
                            label="Código de aprovação (4 dígitos)"
                            maxLength={4}
                            value={approvalCode}
                            onChange={(e) => setApprovalCode(e.target.value.replace(/\D/g, ""))}
                            placeholder="0000"
                        />

                        <FormTextarea
                            label="Motivo da recusa"
                            name="rejectionReason"
                            rows={3}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Ex: Preço acima do orçamento planejado / Prazo de entrega inviável..."
                        />
                    </div>
                </div>
            </DefaultModal>
        </div>
    )
}
