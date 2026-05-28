"use client"

import React, { useState, useEffect, useRef } from "react"
import { 
    getPublicQuoteAction, 
    submitPublicCommentAction, 
    approvePublicQuoteAction, 
    rejectPublicQuoteAction 
} from "@/app/actions/erp/quotes"

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

export default function PublicQuotePortal({ token, initialData, ip, userAgent }: PublicQuotePortalProps) {
    // ─── STATE MANAGEMENT ────────────────────────────────────────────────────
    const [quote, setQuote] = useState(initialData.quote)
    const [snapshot, setSnapshot] = useState(initialData.snapshot)
    const [interactions, setInteractions] = useState(initialData.interactions)
    
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
    const [copied, setCopied] = useState(false)
    
    const commentEndRef = useRef<HTMLDivElement>(null)

    // ─── FORMATTING HELPERS ──────────────────────────────────────────────────
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val)
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

    // ─── REAL-TIME POLLING ───────────────────────────────────────────────────
    useEffect(() => {
        // Poll for updates every 15 seconds to sync comments or status changes
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
        
        // Ask for guest name if not provided
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
    // Prefer snapshot if available to guarantee historical consistency
    const dataQuote = snapshot || quote
    const items = snapshot?.items || quote.items || []
    
    // Status Badge Helpers
    const getStatusBadge = (status: string) => {
        switch (status) {
            case "approved":
                return <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Aprovado</span>
            case "rejected":
                return <span className="bg-rose-100 text-rose-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Recusado</span>
            case "expired":
                return <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Expirado</span>
            case "cancelled":
                return <span className="bg-gray-100 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>Cancelado</span>
            case "viewed":
                return <span className="bg-sky-100 text-sky-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>Visualizado</span>
            default:
                return <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>Pendente</span>
        }
    }

    const partnerName = snapshot?.partner?.name || "Parceiro"
    const partnerLogo = snapshot?.partner?.image_url || null
    const partnerAddress = snapshot?.partner?.address || "Endereço comercial não disponível"
    const partnerEmail = snapshot?.partner?.email || "vendas@dudit.com"
    const partnerPhone = snapshot?.partner?.phone || ""

    const sellerName = snapshot?.seller?.name || "Vendedor Responsável"
    const sellerEmail = snapshot?.seller?.email || ""

    const customerName = snapshot?.customer?.name || "Consumidor final"
    const customerEmail = snapshot?.customer?.email || ""
    const customerPhone = snapshot?.customer?.phone || ""
    
    // Address rendering for customer
    const customerAddressText = (() => {
        if (!snapshot?.customer?.addresses?.length) return null
        const addr = snapshot.customer.addresses.find((a: any) => a.address_type === "primary" || a.is_default) || snapshot.customer.addresses[0]
        return `${addr.street || ""}, ${addr.number || ""}${addr.complement ? ` - ${addr.complement}` : ""}\n${addr.neighborhood || ""} - ${addr.city || ""}/${addr.state || ""}\nCEP: ${addr.zip_code || ""}`
    })()

    // Disable approval features if quote is finalized
    const isFinalized = quote.status === "approved" || quote.status === "rejected" || quote.status === "expired" || quote.status === "cancelled" || quote.converted

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16 relative">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    .print-card { box-shadow: none !important; border: none !important; background: white !important; }
                }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {/* ─── HEADER BAR ─────────────────────────────────────────────────── */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40 no-print shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {partnerLogo ? (
                            <img src={partnerLogo} alt={partnerName} className="h-8 w-8 object-cover rounded-lg border border-slate-200" />
                        ) : (
                            <div className="h-8 w-8 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                                {partnerName.substring(0, 2).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <span className="font-bold text-sm text-slate-900 block leading-tight">{partnerName}</span>
                            <span className="text-[11px] text-slate-400 block uppercase tracking-wider">Proposta Comercial</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {getStatusBadge(quote.status)}
                        <button 
                            onClick={() => window.print()}
                            className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition-colors border border-slate-200"
                            title="Imprimir Proposta"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Notification banners */}
                {successMessage && (
                    <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 animate-fade-in no-print">
                        <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium">{successMessage}</span>
                        <button onClick={() => setSuccessMessage(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">✕</button>
                    </div>
                )}

                {errorMessage && (
                    <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-3 animate-fade-in no-print">
                        <svg className="w-5 h-5 text-rose-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium">{errorMessage}</span>
                        <button onClick={() => setErrorMessage(null)} className="ml-auto text-rose-500 hover:text-rose-700">✕</button>
                    </div>
                )}

                <div className="grid grid-cols-12 gap-8 items-start">
                    {/* ─── LEFT COLUMN: QUOTE DETAILS ─────────────────────────────── */}
                    <div className="col-span-12 lg:col-span-8 space-y-8 print-card">
                        {/* Quote Main Details Box */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-slate-100 pb-6 mb-6">
                                <div>
                                    <span className="text-xs text-slate-400 block uppercase tracking-wider mb-1">Código da Proposta</span>
                                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                                        {dataQuote.quote_number || "Orçamento"}
                                    </h2>
                                </div>

                                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-600">
                                    <div>
                                        <span className="text-slate-400 block">Data de Emissão</span>
                                        <span className="font-bold text-slate-800">{formatDateString(dataQuote.issue_date)}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block">Validade da Proposta</span>
                                        <span className="font-bold text-slate-800">{formatDateString(dataQuote.expiration_date)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Issuer vs Customer Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8 text-xs text-slate-600">
                                <div className="space-y-2">
                                    <h3 className="font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-2">Emitente (Fornecedor)</h3>
                                    <p className="font-bold text-slate-800 text-sm">{partnerName}</p>
                                    <p className="whitespace-pre-wrap">{partnerAddress}</p>
                                    {partnerPhone && <p>Telefone: {partnerPhone}</p>}
                                    <p>E-mail: {partnerEmail}</p>
                                    {sellerName && <p className="mt-2 text-emerald-800 dark:text-emerald-400 font-medium">Vendedor: {sellerName}</p>}
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-2">Destinatário (Cliente)</h3>
                                    <p className="font-bold text-slate-800 text-sm">{customerName}</p>
                                    {customerAddressText ? (
                                        <p className="whitespace-pre-wrap">{customerAddressText}</p>
                                    ) : (
                                        <p className="text-slate-400 italic">Endereço de entrega não especificado.</p>
                                    )}
                                    {customerPhone && <p>Telefone: {customerPhone}</p>}
                                    {customerEmail && <p>E-mail: {customerEmail}</p>}
                                </div>
                            </div>

                            {/* Itemized Table */}
                            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide mb-3">Itens da Proposta</h3>
                            <div className="overflow-x-auto -mx-6 sm:-mx-8">
                                <table className="w-full text-left border-collapse min-w-[600px]">
                                    <thead>
                                        <tr className="bg-slate-50/70 border-b border-t border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                            <th className="py-3 pl-8 pr-4">Item / Produto</th>
                                            <th className="py-3 px-4 text-center w-24">Qtd</th>
                                            <th className="py-3 px-4 text-right w-32">Preço Unit.</th>
                                            <th className="py-3 pl-4 pr-8 text-right w-36">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {items.map((item: any, idx: number) => {
                                            const total = (item.quantity || 0) * (item.unit_price || 0)
                                            return (
                                                <tr key={item.id || idx}>
                                                    <td className="py-4 pl-8 pr-4 flex items-center gap-3">
                                                        {item.image && (
                                                            <img 
                                                                src={item.image} 
                                                                alt={item.name} 
                                                                className="w-10 h-10 object-cover rounded-lg border border-slate-100 shrink-0" 
                                                                onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                                            />
                                                        )}
                                                        <div className="min-w-0">
                                                            <span className="font-bold text-slate-900 block truncate max-w-[280px]" title={item.name}>{item.name}</span>
                                                            {item.sku && <span className="text-[10px] text-slate-400 block uppercase">{item.sku}</span>}
                                                            {item.description && <span className="text-xs text-slate-400 block mt-0.5 max-w-[280px] truncate">{item.description}</span>}
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 text-center font-medium text-slate-600">
                                                        {item.quantity} <span className="text-xs text-slate-400">{item.unit || "un"}</span>
                                                    </td>
                                                    <td className="py-4 px-4 text-right text-slate-600 font-medium">
                                                        {formatCurrency(item.unit_price)}
                                                    </td>
                                                    <td className="py-4 pl-4 pr-8 text-right font-bold text-slate-900">
                                                        {formatCurrency(total)}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary / Totals */}
                            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-6 border-t border-slate-100">
                                <div className="text-xs text-slate-500">
                                    {dataQuote.notes ? (
                                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                            <h4 className="font-bold text-slate-700 uppercase mb-2">Observações Comerciais</h4>
                                            <p className="whitespace-pre-wrap leading-relaxed">{dataQuote.notes}</p>
                                        </div>
                                    ) : (
                                        <p className="italic">Nenhuma observação informada.</p>
                                    )}
                                </div>

                                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3 text-xs text-slate-600 ml-auto w-full max-w-[360px]">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400 font-medium">Subtotal</span>
                                        <span className="font-bold text-slate-800">{formatCurrency(Number(dataQuote.subtotal || 0))}</span>
                                    </div>
                                    {Number(dataQuote.shipping_cost || 0) > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-400 font-medium">Frete</span>
                                            <span className="font-bold text-slate-800">{formatCurrency(Number(dataQuote.shipping_cost))}</span>
                                        </div>
                                    )}
                                    {Number(dataQuote.additional_costs || 0) > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-400 font-medium">Outras taxas</span>
                                            <span className="font-bold text-slate-800">{formatCurrency(Number(dataQuote.additional_costs))}</span>
                                        </div>
                                    )}
                                    {Number(dataQuote.discount_value || 0) > 0 && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-400 font-medium">Desconto</span>
                                            <span className="font-bold text-rose-600">-{formatCurrency(Number(dataQuote.discount_value))}</span>
                                        </div>
                                    )}

                                    <div className="border-t border-slate-200 my-2"></div>

                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-slate-900 text-sm">Valor Total</span>
                                        <span className="bg-slate-900 text-white font-extrabold text-base px-3 py-1.5 rounded-lg">
                                            {formatCurrency(Number(dataQuote.total || 0))}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── RIGHT COLUMN: INTERACTION PANEL ───────────────────────── */}
                    <div className="col-span-12 lg:col-span-4 space-y-8 no-print">
                        {/* Action Panel for Approval */}
                        {!isFinalized ? (
                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                                <h3 className="font-bold text-slate-950 text-base leading-tight">Decisão Comercial</h3>
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    Analise os itens e valores acima e responda online. É rápido, prático e dispensa reuniões.
                                </p>
                                
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => setShowApproveModal(true)}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-3 px-4 rounded-2xl transition-colors shadow-md"
                                    >
                                        ✓ Aprovar Proposta
                                    </button>
                                    
                                    <button 
                                        onClick={() => setShowRejectModal(true)}
                                        className="w-full bg-white hover:bg-rose-50 border border-slate-200 text-rose-600 font-bold text-sm py-3 px-4 rounded-2xl transition-colors"
                                    >
                                        ✕ Recusar Proposta
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm text-center space-y-3">
                                <h3 className="font-bold text-slate-950 text-base leading-tight">Proposta Finalizada</h3>
                                <div className="flex justify-center">
                                    {quote.status === "approved" ? (
                                        <div className="bg-emerald-50 text-emerald-800 text-xs font-semibold px-4 py-2 rounded-2xl border border-emerald-100 space-y-1 w-full text-left">
                                            <div className="font-bold text-sm flex items-center gap-1.5 text-emerald-900">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                Aprovado pelo Cliente
                                            </div>
                                            <div>Aprovador: <span className="font-bold">{quote.approver_name || "Cliente"}</span></div>
                                            <div>Data: {formatDateTime(quote.approved_at)}</div>
                                        </div>
                                    ) : quote.status === "rejected" ? (
                                        <div className="bg-rose-50 text-rose-800 text-xs font-semibold px-4 py-2 rounded-2xl border border-rose-100 space-y-1 w-full text-left">
                                            <div className="font-bold text-sm flex items-center gap-1.5 text-rose-900">
                                                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                                Recusado pelo Cliente
                                            </div>
                                            <div>Autor: <span className="font-bold">{quote.approver_name || "Cliente"}</span></div>
                                            <div>Data: {formatDateTime(quote.rejected_at)}</div>
                                            {quote.rejection_reason && <div className="mt-1.5 italic text-slate-500 bg-white/60 p-2 rounded-lg border border-rose-100">"{quote.rejection_reason}"</div>}
                                        </div>
                                    ) : quote.status === "expired" ? (
                                        <div className="bg-amber-50 text-amber-800 text-xs font-semibold px-4 py-2 rounded-2xl border border-amber-100 w-full text-left">
                                            A proposta atingiu seu limite de validade em <span className="font-bold">{formatDateString(quote.expiration_date)}</span> e expirou.
                                        </div>
                                    ) : (
                                        <div className="bg-gray-50 text-gray-800 text-xs font-semibold px-4 py-2 rounded-2xl border border-gray-100 w-full text-left">
                                            Orçamento cancelado pelo vendedor.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Negotiation Chat Card */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                            <h3 className="font-bold text-slate-950 text-base leading-tight">Canal de Negociação</h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Dúvidas, pedidos de desconto ou prazos diferenciados? Negocie diretamente com o vendedor abaixo.
                            </p>

                            {/* Chat stream */}
                            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 no-scrollbar flex flex-col gap-2 border-b border-slate-100 pb-4">
                                {interactions.length === 0 ? (
                                    <div className="text-center py-8 text-xs text-slate-400 italic">
                                        Nenhuma mensagem trocada ainda.
                                    </div>
                                ) : (
                                    interactions.map((msg: any) => {
                                        const isCustomer = msg.author_role === "customer"
                                        return (
                                            <div 
                                                key={msg.id} 
                                                className={`p-3.5 rounded-2xl text-xs max-w-[85%] ${
                                                    isCustomer 
                                                        ? "bg-slate-100 text-slate-800 align-self-start self-start" 
                                                        : "bg-emerald-50 border border-emerald-100 text-emerald-900 align-self-end self-end text-right ml-auto"
                                                }`}
                                            >
                                                <div className="font-bold mb-1">
                                                    {isCustomer ? `${msg.author_name} (Cliente)` : `${msg.author_name} (Vendedor)`}
                                                </div>
                                                <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                                <span className="text-[9px] text-slate-400 block mt-1.5">
                                                    {formatDateTime(msg.created_at)}
                                                </span>
                                            </div>
                                        )
                                    })
                                )}
                                <div ref={commentEndRef}></div>
                            </div>

                            {/* Input Form */}
                            {!isFinalized && (
                                <form onSubmit={handleSendComment} className="flex gap-2">
                                    <input 
                                        type="text"
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Digite sua dúvida ou contraproposta..."
                                        className="flex-1 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200 outline-none focus:border-slate-400 text-slate-800"
                                        disabled={isSubmittingComment}
                                    />
                                    <button 
                                        type="submit"
                                        disabled={!newComment.trim() || isSubmittingComment}
                                        className="bg-slate-900 text-white hover:bg-slate-800 font-semibold text-xs px-4 py-2 rounded-2xl transition-colors shrink-0 disabled:opacity-50"
                                    >
                                        {isSubmittingComment ? "..." : "Enviar"}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* ─── MODAL: APPROVE PROPOSAL ─────────────────────────────────────── */}
            {showApproveModal && (
                <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-in text-left">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-slate-900 text-lg">Aprovar Proposta</h3>
                            <button onClick={() => setShowApproveModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">
                            Insira suas credenciais abaixo. O código de aprovação de 4 dígitos foi gerado pelo vendedor responsável.
                        </p>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Seu Nome Completo</label>
                                <input 
                                    type="text" 
                                    value={approverName}
                                    onChange={(e) => setApproverName(e.target.value)}
                                    placeholder="Ex: João da Silva"
                                    className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-200 outline-none text-sm text-slate-800"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Código de Aprovação (4 dígitos)</label>
                                <input 
                                    type="text" 
                                    maxLength={4}
                                    value={approvalCode}
                                    onChange={(e) => setApprovalCode(e.target.value.replace(/\D/g, ""))}
                                    placeholder="0000"
                                    className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-200 outline-none text-center font-bold tracking-widest text-lg text-slate-800"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setShowApproveModal(false)}
                                className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleApprove}
                                disabled={!approverName.trim() || approvalCode.length < 4 || isProcessingAction}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50"
                            >
                                {isProcessingAction ? "Aprovando..." : "Confirmar Aprovação"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL: REJECT PROPOSAL ─────────────────────────────────────── */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-in text-left">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-slate-900 text-lg text-rose-600">Recusar Proposta</h3>
                            <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">
                            Insira suas credenciais e informe o motivo comercial. O vendedor receberá uma notificação imediata.
                        </p>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Seu Nome Completo</label>
                                <input 
                                    type="text" 
                                    value={approverName}
                                    onChange={(e) => setApproverName(e.target.value)}
                                    placeholder="Ex: João da Silva"
                                    className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-200 outline-none text-sm text-slate-800"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Código de Aprovação (4 dígitos)</label>
                                <input 
                                    type="text" 
                                    maxLength={4}
                                    value={approvalCode}
                                    onChange={(e) => setApprovalCode(e.target.value.replace(/\D/g, ""))}
                                    placeholder="0000"
                                    className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-200 outline-none text-center font-bold tracking-widest text-lg text-slate-800"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 block mb-1">Motivo da Recusa</label>
                                <textarea 
                                    rows={3}
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    placeholder="Ex: Preço acima do orçamento planejado / Prazo de entrega inviável..."
                                    className="w-full bg-slate-50 p-2.5 rounded-xl border border-slate-200 outline-none text-xs text-slate-800 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => setShowRejectModal(false)}
                                className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleReject}
                                disabled={!approverName.trim() || approvalCode.length < 4 || !rejectionReason.trim() || isProcessingAction}
                                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50"
                            >
                                {isProcessingAction ? "Recusando..." : "Confirmar Recusa"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
