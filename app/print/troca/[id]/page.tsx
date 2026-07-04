import { getAdminClient } from "@/lib/supabase/admin"
import { getReturnRequestDetailsAction } from "@/app/actions/erp/returns"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import { notFound, redirect } from "next/navigation"
import { formatCurrency, formatDate } from "@/lib/utils"
import PrintLayout from "@/components/erp/shared/PrintLayout"

interface PageProps {
    params: Promise<{ id: string }>
}

const STATUS_LABELS: Record<string, string> = {
    pending: "Pendente",
    received: "Recebido/Em Análise",
    approved: "Aprovado",
    completed: "Concluído",
    cancelled: "Cancelado",
    rejected: "Rejeitado"
};

const CONDITION_LABELS: Record<string, string> = {
    sealed: "Lacrado",
    lacrado: "Lacrado",
    opened: "Aberto",
    aberto: "Aberto",
    damaged: "Danificado",
    danificado: "Danificado"
};

export default async function PrintTrocaPage({ params }: PageProps) {
    const { id } = await params
    
    const user = await getCurrentUser()
    if (!user) {
        redirect("/auth/login")
    }

    const supabase = getAdminClient()
    
    // Find partner_id from return_requests table
    const { data: requestData } = await supabase
        .from("return_requests")
        .select("partner_id")
        .eq("id", id)
        .maybeSingle()

    if (!requestData?.partner_id) {
        notFound()
    }

    const partnerId = requestData.partner_id

    // Verify authorized access to view return details
    try {
        await requirePartnerAccessWithPermission(partnerId, "orders", "view", user)
    } catch {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Acesso negado. Você não possui permissão para visualizar este comprovante.
            </div>
        )
    }

    // Fetch return/exchange details
    const returnRes = await getReturnRequestDetailsAction(partnerId, id)
    if (!returnRes.success || !returnRes.data) {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Solicitação de troca/devolução não encontrada.
            </div>
        )
    }
    const returnRequest = returnRes.data as any

    // Fetch partner header details
    const headerRes = await getPartnerReceiptHeaderAction(partnerId)
    const partnerHeader = headerRes.success && headerRes.data ? headerRes.data : {
        fantasyName: "",
        legalName: "",
        addressLine: "",
        taxIdLine: "",
    }

    const isExchange = returnRequest.type === "exchange" || returnRequest.type === "troca"
    const title = isExchange ? "COMPROVANTE DE SOLICITAÇÃO DE TROCA" : "COMPROVANTE DE SOLICITAÇÃO DE DEVOLUÇÃO"

    return (
        <PrintLayout>
            <div className="w-full max-w-[800px] mx-auto p-6 bg-white text-black font-sans print:p-0">
                {/* Header Section */}
                <div className="text-center mb-6 pb-6 border-b border-gray-300">
                    {partnerHeader.fantasyName && (
                        <h1 className="text-2xl font-black tracking-tight">{partnerHeader.fantasyName}</h1>
                    )}
                    {partnerHeader.legalName && (
                        <p className="text-xs text-gray-600 mt-1 font-semibold">{partnerHeader.legalName}</p>
                    )}
                    {partnerHeader.addressLine && (
                        <p className="text-xs text-gray-500 mt-0.5">{partnerHeader.addressLine}</p>
                    )}
                    {partnerHeader.taxIdLine && (
                        <p className="text-xs text-gray-500 mt-0.5">{partnerHeader.taxIdLine}</p>
                    )}
                    
                    <h2 className="text-lg font-bold uppercase tracking-wider mt-5 bg-gray-100 py-1 text-gray-800 rounded">
                        {title}
                    </h2>
                </div>

                {/* Info Block */}
                <div className="grid grid-cols-2 gap-4 text-xs mb-6">
                    <div>
                        <p className="text-gray-500">Número da Solicitação</p>
                        <p className="font-bold text-sm">#{returnRequest.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Data de Abertura</p>
                        <p className="font-bold text-sm">{formatDate(returnRequest.createdAt)}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Pedido Original</p>
                        <p className="font-bold text-sm">#{returnRequest.orderNumber}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Status Atual</p>
                        <p className="font-bold text-sm text-brand-dark">
                            {STATUS_LABELS[returnRequest.status] || returnRequest.status}
                        </p>
                    </div>
                </div>

                {/* Customer Section */}
                <div className="mb-6 bg-gray-50 p-3.5 rounded border border-gray-200">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">Dados do Cliente</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-gray-500">Nome:</span> <strong className="text-gray-900">{returnRequest.customerName}</strong>
                        </div>
                        {returnRequest.customerPhone && (
                            <div>
                                <span className="text-gray-500">Telefone:</span> <strong className="text-gray-900">{returnRequest.customerPhone}</strong>
                            </div>
                        )}
                        {returnRequest.customerEmail && (
                            <div className="col-span-2">
                                <span className="text-gray-500">E-mail:</span> <strong className="text-gray-900">{returnRequest.customerEmail}</strong>
                            </div>
                        )}
                    </div>
                </div>

                {/* Items Table */}
                <div className="mb-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">Itens Solicitados</h3>
                    <table className="w-full text-xs text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-100 border-b border-gray-300">
                                <th className="p-2 font-bold text-gray-700">Produto</th>
                                <th className="p-2 font-bold text-gray-700 text-center">Qtd</th>
                                <th className="p-2 font-bold text-gray-700 text-right">Valor Unit.</th>
                                <th className="p-2 font-bold text-gray-700 text-right">Subtotal</th>
                                <th className="p-2 font-bold text-gray-700">Motivo / Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {returnRequest.items.map((item: any) => {
                                const unitPrice = Number(item.netItemValue || item.price || 0)
                                const total = unitPrice * Number(item.quantity || 0)
                                const conditionLabel = CONDITION_LABELS[item.condition?.toLowerCase()] || item.condition || "-"
                                return (
                                    <tr key={item.id} className="border-b border-gray-200">
                                        <td className="p-2 font-medium py-3">
                                            <div>{item.productName}</div>
                                            {item.sku && <span className="text-[10px] text-gray-500">SKU: {item.sku}</span>}
                                        </td>
                                        <td className="p-2 text-center">{item.quantity}</td>
                                        <td className="p-2 text-right">{formatCurrency(unitPrice)}</td>
                                        <td className="p-2 text-right font-semibold">{formatCurrency(total)}</td>
                                        <td className="p-2">
                                            <div className="italic text-gray-600">"{item.reason || 'Não informado'}"</div>
                                            <div className="text-[10px] text-gray-500 mt-0.5">Estado: <span className="font-semibold">{conditionLabel}</span></div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Financial Summary */}
                <div className="mb-8 grid grid-cols-2 gap-4">
                    <div className="text-xs text-gray-500 space-y-1">
                        {returnRequest.observations && (
                            <div>
                                <p className="font-bold text-gray-700">Observações:</p>
                                <p className="italic">"{returnRequest.observations}"</p>
                            </div>
                        )}
                    </div>
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 text-xs space-y-2">
                        {Number(returnRequest.refundValue || 0) > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-600 font-medium">Valor Reembolsado:</span>
                                <span className="font-bold text-gray-900">{formatCurrency(returnRequest.refundValue)}</span>
                            </div>
                        )}
                        {Number(returnRequest.storeCreditValue || 0) > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-600 font-medium">Vale-Compra Gerado:</span>
                                <span className="font-bold text-brand-green">{formatCurrency(returnRequest.storeCreditValue)}</span>
                            </div>
                        )}
                        {Number(returnRequest.exchangeShortfallAmount || 0) > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-600 font-medium">Complemento a Pagar:</span>
                                <span className="font-bold text-red-600">{formatCurrency(returnRequest.exchangeShortfallAmount || 0)}</span>
                            </div>
                        )}
                        {Number(returnRequest.exchangeSurplusAmount || 0) > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-600 font-medium">Saldo de Troca Restante:</span>
                                <span className="font-bold text-brand-green">{formatCurrency(returnRequest.exchangeSurplusAmount || 0)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Timeline Events if any */}
                {returnRequest.returnEvents && returnRequest.returnEvents.length > 0 && (
                    <div className="mb-8 border-t border-gray-200 pt-5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3">Histórico de Eventos</h3>
                        <div className="space-y-3.5">
                            {returnRequest.returnEvents.map((event: any) => (
                                <div key={event.id} className="text-xs flex items-start gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 shrink-0" />
                                    <div className="flex-1">
                                        <div className="flex justify-between text-[11px] text-gray-500 mb-0.5">
                                            <span>
                                                Status: <strong className="text-gray-700">{STATUS_LABELS[event.new_status] || event.new_status || "Atualizado"}</strong>
                                            </span>
                                            <span>{formatDate(event.created_at)}</span>
                                        </div>
                                        {event.notes && <p className="text-gray-700 italic font-medium">"{event.notes}"</p>}
                                        <span className="text-[10px] text-gray-400">Responsável: {event.actor_name || "Sistema"}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer Signature */}
                <div className="mt-16 pt-10 border-t border-gray-300 grid grid-cols-2 gap-8 text-center text-xs">
                    <div className="space-y-1">
                        <div className="border-b border-gray-400 w-4/5 mx-auto h-8" />
                        <p className="font-semibold text-gray-600">Assinatura do Cliente</p>
                    </div>
                    <div className="space-y-1">
                        <div className="border-b border-gray-400 w-4/5 mx-auto h-8" />
                        <p className="font-semibold text-gray-600">Assinatura do Responsável</p>
                    </div>
                </div>
            </div>
            
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        window.onload = function() {
                            setTimeout(function() {
                                window.print();
                            }, 500);
                        }
                    `
                }}
            />
        </PrintLayout>
    )
}
