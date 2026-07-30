"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
    getPublicQuoteAction,
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
    FormSection,
    DefaultModal,
    Input,
    FormTextarea,
    InfoCard
} from "@/components/reusable"
import QuotePreview from "@/components/erp/quotes/QuotePreview"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils"
import { useSupabase } from "@/providers/supabase-provider"

interface PublicQuotePortalProps {
    token: string
    initialData: {
        quote: any
        snapshot: any
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
    const [activeTab, setActiveTab] = useState("Dados Gerais")

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

    const { supabase } = useSupabase()
    const [currentUser, setCurrentUser] = useState<any>(null)
    useEffect(() => {
        supabase.auth.getUser().then(({ data }: any) => {
            if (data?.user) setCurrentUser(data.user)
        })
    }, [supabase])

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
                }
            } catch (err) {
                console.error("Erro no polling do orçamento público:", err)
            }
        }, 15000)

        return () => clearInterval(interval)
    }, [token, ip, userAgent])

    const handleApprove = async () => {
        setIsProcessingAction(true)
        setErrorMessage(null)
        try {
            const res = await approvePublicQuoteAction(token, "Cliente", isClientEmailMatched ? "" : approvalCode, ip, userAgent)
            if (res.success) {
                setSuccessMessage("Orçamento aprovado com sucesso!")
                setShowApproveModal(false)
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
            const res = await rejectPublicQuoteAction(token, "Cliente", isClientEmailMatched ? "" : approvalCode, rejectionReason, ip, userAgent)
            if (res.success) {
                setSuccessMessage("Orçamento recusado com sucesso.")
                setShowRejectModal(false)
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

    const previewMeta = useMemo(() => {
        const meta = quote?.metadata || {}
        const preview = meta.preview || {}
        return {
            primaryColor: preview.primaryColor || undefined,
            secondaryColor: preview.secondaryColor || undefined,
            quoteTitle: preview.quoteTitle || undefined,
            quoteSubtitle: preview.quoteSubtitle || undefined,
            showDecoration: preview.showDecoration !== false,
        }
    }, [quote?.metadata])

    const resolvedPartner = useMemo(() => {
        const qp = quote.partners
        return Array.isArray(qp) ? qp[0] : qp
    }, [quote.partners])

    const partnerName = useMemo(() => {
        const snapName = snapshot?.partner?.name
        if (snapName && snapName !== "Parceiro") return snapName
        return resolvedPartner?.stores?.[0]?.name || resolvedPartner?.store_name || snapName || "Parceiro"
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

    const isClientEmailMatched = useMemo(() => {
        return !!(currentUser && customerEmail && currentUser.email?.toLowerCase() === customerEmail.toLowerCase())
    }, [currentUser, customerEmail])

    // Address rendering for customer
    const customerAddressText = (() => {
        if (!selectedCustomer?.addresses?.length) return null
        const addr = selectedCustomer.addresses.find((a: any) => a.address_type === "primary" || a.is_default) || selectedCustomer.addresses[0]
        return `${addr.street || ""}, ${addr.number || ""}${addr.complement ? ` - ${addr.complement}` : ""}\n${addr.neighborhood || ""} - ${addr.city || ""}/${addr.state || ""}`
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

    const isFinalized = quote.status === "approved" || quote.status === "rejected" || quote.status === "expired" || quote.status === "cancelled" || quote.converted
    const isActionable = !isFinalized && (quote.status === "sent" || quote.status === "pending_client" || quote.status === "viewed")

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
                                            <TabsTrigger value="Visualização" className="lg:hidden">Visualização</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable Content inside left column */}
                            <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-6 pb-24">
                                {/* Success and Error Banners */}
                                {successMessage && (
                                    <InfoCard message={successMessage} color='green' rightElement={<Button variant="link" className="text-brand-green mb-8" onClick={() => setSuccessMessage(null)} value="X" />} />
                                )}

                                {errorMessage && (
                                    <InfoCard message={errorMessage} color='red' rightElement={<Button variant="link" className="text-brand-red mb-8" onClick={() => setErrorMessage(null)} value="X" />} />
                                )}

                                {/* TABS CONTENT */}
                                <div className={`${activeTab === "Visualização" ? "hidden lg:block" : "block"}`}>
                                    {/* Messages */}
                                    {isFinalized && (
                                        <div className="mb-8">
                                            {quote.status === "approved" ? (
                                                <InfoCard title='Aprovado pelo cliente' message={`Aprovador: ${quote.approver_name || "Cliente"} - Data: ${formatDateTime(quote.approved_at)}`} color='green' />
                                            ) : quote.status === "rejected" ? (
                                                <InfoCard title='Recusado pelo cliente' message={`Autor: ${quote.approver_name || "Cliente"} - Data: ${formatDateTime(quote.rejected_at)}` + (quote.rejection_reason && ` - Motivo: ${quote.rejection_reason}`)} color='red' />
                                            ) : quote.status === "expired" ? (
                                                <InfoCard title="Proposta Expirada" message={`A proposta atingiu seu limite de validade em ${formatDateString(quote.expiration_date)} e expirou.`} color="orange" />
                                            ) : (
                                                <InfoCard title="Proposta Cancelada" message="Orçamento cancelado pelo vendedor." color="red" />
                                            )}
                                        </div>
                                    )}

                                    {/* ─── TAB: DADOS GERAIS ─── */}
                                    {activeTab === "Dados Gerais" && (
                                        <div className="space-y-8 text-left">
                                            {/* Code & Expiry FormSection */}
                                            <FormSection title="Informações da proposta">
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Código da proposta</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{dataQuote.quote_number || "Orçamento"}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Data de emissão</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDateString(dataQuote.issue_date)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Validade da proposta</span>
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDateString(dataQuote.expiration_date)}</span>
                                                    </div>
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

                                            {isActionable && (
                                                <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-brand-border dark:border-dark-border">
                                                    <Button
                                                        onClick={() => setShowRejectModal(true)}
                                                        variant="outlinered"
                                                        className="flex-1 h-12"
                                                    >
                                                        Recusar proposta
                                                    </Button>
                                                    <Button
                                                        onClick={() => setShowApproveModal(true)}
                                                        className="flex-1 h-12"
                                                    >
                                                        Aprovar proposta
                                                    </Button>
                                                </div>
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
                                                 primaryColor={previewMeta.primaryColor}
                                                 secondaryColor={previewMeta.secondaryColor}
                                                 quoteTitle={previewMeta.quoteTitle}
                                                 quoteSubtitle={previewMeta.quoteSubtitle}
                                                 showDecoration={previewMeta.showDecoration}
                                                 partnerName={partnerName}
                                                 partnerAddress={partnerAddress}
                                                 partnerPhone={partnerPhone}
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
                                primaryColor={previewMeta.primaryColor}
                                secondaryColor={previewMeta.secondaryColor}
                                quoteTitle={previewMeta.quoteTitle}
                                quoteSubtitle={previewMeta.quoteSubtitle}
                                showDecoration={previewMeta.showDecoration}
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
            </Tabs >

            {/* ─── MODAL: APPROVE PROPOSAL ─────────────────────────────────────── */}
            < DefaultModal
                isOpen={showApproveModal}
                onClose={() => setShowApproveModal(false)
                }
                title="Aprovar proposta"
                maxWidth="md"
                footer={
                    < div className="flex gap-3 w-full" >
                        <Button
                            variant="outline"
                            onClick={() => setShowApproveModal(false)}
                            className="flex-1 py-2.5 h-auto"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleApprove}
                            disabled={(!isClientEmailMatched && approvalCode.length < 4) || isProcessingAction}
                            className="flex-1 bg-brand-green hover:bg-brand-green/90 text-white font-bold py-2.5 h-auto border-none"
                        >
                            {isProcessingAction ? "Aprovando..." : "Confirmar aprovação"}
                        </Button>
                    </div >
                }
            >
                <div className="space-y-4 text-left">
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                        {isClientEmailMatched
                            ? `Você está conectado como ${currentUser.email} e pode aprovar esta proposta diretamente.`
                            : "Insira o código de aprovação de 4 dígitos gerado pelo vendedor responsável."
                        }
                    </p>

                    {!isClientEmailMatched && (
                        <div className="space-y-3">
                            <Input
                                label="Código de aprovação (4 dígitos)"
                                maxLength={4}
                                value={approvalCode}
                                onChange={(e) => setApprovalCode(e.target.value.replace(/\D/g, ""))}
                                placeholder="0000"
                            />
                        </div>
                    )}
                </div>
            </DefaultModal >

            {/* ─── MODAL: REJECT PROPOSAL ─────────────────────────────────────── */}
            < DefaultModal
                isOpen={showRejectModal}
                onClose={() => setShowRejectModal(false)}
                title="Recusar proposta"
                maxWidth="md"
                footer={
                    < div className="flex gap-3 w-full" >
                        <Button
                            variant="outline"
                            onClick={() => setShowRejectModal(false)}
                            className="flex-1 py-2.5 h-auto"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleReject}
                            disabled={(!isClientEmailMatched && approvalCode.length < 4) || !rejectionReason.trim() || isProcessingAction}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 h-auto border-none"
                        >
                            {isProcessingAction ? "Recusando..." : "Confirmar recusa"}
                        </Button>
                    </div >
                }
            >
                <div className="space-y-4 text-left">
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                        {isClientEmailMatched
                            ? `Você está conectado como ${currentUser.email} e pode recusar esta proposta diretamente.`
                            : "Insira o código de aprovação de 4 dígitos gerado pelo vendedor responsável."
                        }
                    </p>

                    <div className="space-y-3">
                        {!isClientEmailMatched && (
                            <Input
                                label="Código de aprovação (4 dígitos)"
                                maxLength={4}
                                value={approvalCode}
                                onChange={(e) => setApprovalCode(e.target.value.replace(/\D/g, ""))}
                                placeholder="0000"
                            />
                        )}

                        <FormTextarea
                            label="Motivo da recusa"
                            name="rejectionReason"
                            rows={3}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Ex: Preço acima do orçamento planejado / Prazo de entrega inviável..."
                            maxLength={500}
                            showCharacterCount
                        />
                    </div>
                </div>
            </DefaultModal >
        </div >
    )
}
