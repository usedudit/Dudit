"use client"

import React, { useState, useTransition } from "react"
import { SearchIcon, StoreIcon, PackageIcon, UserIcon, StarIcon, XIcon, AlertTriangleIcon, InfoIcon } from "@/lib/icons"
import { Button, Input, Badge } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import {
    fetchModerationTarget,
    editField,
    removeImage,
    editVariant,
    hideReview,
    editReview,
    updatePartnerRiskScore,
} from "@/app/actions/admin/moderation-v2"
import type {
    FetchedProduct, FetchedVariant, FetchedService,
    FetchedRecurringPlan, FetchedPartner, FetchedReview,
} from "@/lib/admin/types"

type SearchType = "product" | "service" | "recurring_plan" | "partner" | "review"

const SEARCH_TYPES: { value: SearchType; label: string }[] = [
    { value: "product", label: "Produto" },
    { value: "service", label: "Serviço" },
    { value: "recurring_plan", label: "Assinatura" },
    { value: "partner", label: "Parceiro" },
    { value: "review", label: "Review" },
]

const RISK_LEVELS = [
    { value: 5, label: "5 - Normal" },
    { value: 10, label: "10 - Médio" },
    { value: 20, label: "20 - Grave" },
    { value: 50, label: "50 - Muito Grave" },
]

function ImagePreview({ url, onRemove, label }: { url: string; onRemove?: () => void; label?: string }) {
    const fullUrl = url.startsWith("http") ? url : `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ""}/${url}`
    return (
        <div className="relative group">
            <img src={fullUrl} alt={label || ""} className="w-24 h-24 rounded-lg object-cover border border-brand-border dark:border-dark-border" />
            {onRemove && (
                <button
                    onClick={onRemove}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <XIcon size={12} />
                </button>
            )}
        </div>
    )
}

function RiskScoreSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading"
        >
            <option value={0}>Não alterar risk score</option>
            {RISK_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
            ))}
        </select>
    )
}

function ActionButtons({
    onSave,
    riskScore,
    onRiskScoreChange,
    isPending,
    label = "Salvar",
}: {
    onSave: (notes?: string) => void
    riskScore: number
    onRiskScoreChange: (v: number) => void
    isPending: boolean
    label?: string
}) {
    const [notes, setNotes] = useState("")
    const [showNotes, setShowNotes] = useState(false)

    return (
        <div className="flex flex-col gap-2 mt-4 p-4 bg-brand-gray dark:bg-dark-border/20 rounded-xl border border-brand-border dark:border-dark-border">
            <div className="flex items-center gap-3 flex-wrap">
                <RiskScoreSelector value={riskScore} onChange={onRiskScoreChange} />
                <Button variant="filled" onClick={() => onSave(notes)} disabled={isPending} isLoading={isPending}>
                    {label}
                </Button>
                <button
                    type="button"
                    onClick={() => setShowNotes(!showNotes)}
                    className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                >
                    <InfoIcon size={18} />
                </button>
            </div>
            {showNotes && (
                <Input
                    name="action-notes"
                    placeholder="Observações (opcional)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    multiline
                    rows={2}
                />
            )}
        </div>
    )
}

// ─── Product View ───────────────────────────────────────────────────────────

function ProductView({ data, isPending, onRefresh }: { data: FetchedProduct; isPending: boolean; onRefresh: () => void }) {
    const [riskScore, setRiskScore] = useState(0)
    const [editName, setEditName] = useState(data.name)
    const [editDesc, setEditDesc] = useState(data.description || "")
    const [editTags, setEditTags] = useState(data.tags?.join(", ") || "")
    const [editVideoUrl, setEditVideoUrl] = useState(data.video_url || "")

    const partnerId = data.partner?.id

    const handleSaveField = async (field: string, value: string) => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await editField("product", data.id, field, value, riskScore, `Editado por admin`, partnerId)
        if (r.success) { toast.success(`${field} atualizado!`); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    const handleRemoveImage = async (url: string) => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await removeImage("product", data.id, url, "images", riskScore, undefined, partnerId)
        if (r.success) { toast.success("Imagem removida!"); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{data.name}</h3>
                <Badge variant={data.is_active ? "green" : "red"}>{data.is_active ? "Ativo" : "Inativo"}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-brand-inactive-text block mb-1">Nome</label>
                    <div className="flex gap-2">
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                        <Button variant="outline" size="sm" onClick={() => handleSaveField("name", editName)}
                            disabled={isPending || editName === data.name}>Salvar</Button>
                    </div>
                </div>
                {data.price !== undefined && (
                    <div>
                        <label className="text-xs font-bold text-brand-inactive-text block mb-1">Preço</label>
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">R$ {Number(data.price).toFixed(2)}</p>
                    </div>
                )}
            </div>

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Descrição</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4}
                    className="w-full text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                <ActionButtons onSave={() => handleSaveField("description", editDesc)}
                    riskScore={riskScore} onRiskScoreChange={setRiskScore} isPending={isPending} />
            </div>

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Tags (separadas por vírgula)</label>
                <div className="flex gap-2">
                    <input type="text" value={editTags} onChange={(e) => setEditTags(e.target.value)}
                        className="flex-1 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                    <Button variant="outline" size="sm" onClick={() => handleSaveField("tags", JSON.stringify(editTags.split(",").map(t => t.trim()).filter(Boolean)))}
                        disabled={isPending}>Salvar</Button>
                </div>
            </div>

            {data.video_url && (
                <div>
                    <label className="text-xs font-bold text-brand-inactive-text block mb-1">URL do Vídeo</label>
                    <div className="flex gap-2">
                        <input type="text" value={editVideoUrl} onChange={(e) => setEditVideoUrl(e.target.value)}
                            className="flex-1 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                        <Button variant="outline" size="sm" onClick={() => handleSaveField("video_url", editVideoUrl)}
                            disabled={isPending}>Salvar</Button>
                    </div>
                </div>
            )}

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Imagens ({data.images?.length || 0})</label>
                <div className="flex flex-wrap gap-3">
                    {(data.images || []).map((url: string, i: number) => (
                        <ImagePreview key={i} url={url} onRemove={() => handleRemoveImage(url)} />
                    ))}
                </div>
            </div>

            {data.variants && data.variants.length > 0 && (
                <div>
                    <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">Variantes ({data.variants.length})</h4>
                    <div className="space-y-4">
                        {data.variants.map((v: FetchedVariant) => (
                            <VariantCard key={v.id} variant={v} productId={data.id} isPending={isPending} onRefresh={onRefresh} partnerId={partnerId} />
                        ))}
                    </div>
                </div>
            )}

            {data.partner && (
                <div className="p-3 bg-brand-gray dark:bg-dark-border/20 rounded-lg text-sm">
                    <span className="text-brand-inactive-text">Parceiro: </span>
                    <strong className="text-brand-dark dark:text-dark-heading">{data.partner.store_name}</strong>
                    <span className="ml-2 text-brand-inactive-text">| Risk Score: {data.partner.risk_score}</span>
                </div>
            )}
        </div>
    )
}

// ─── Variant Card ────────────────────────────────────────────────────────────

function VariantCard({ variant, productId, isPending, onRefresh, partnerId }: { variant: FetchedVariant; productId: string; isPending: boolean; onRefresh: () => void; partnerId?: string }) {
    const [riskScore, setRiskScore] = useState(0)
    const [editName, setEditName] = useState(variant.name || "")

    const handleSave = async () => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await editVariant(variant.id, "name", editName, riskScore, undefined, partnerId)
        if (r.success) { toast.success("Variante atualizada!"); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    const handleRemoveImage = async (url: string) => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await removeImage("variant", variant.id, url, "images", riskScore, undefined, partnerId)
        if (r.success) { toast.success("Imagem removida!"); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    return (
        <div className="p-4 border border-brand-border dark:border-dark-border rounded-xl">
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <div className="flex gap-2 items-center">
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                            className="text-sm font-bold rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-1.5 text-brand-dark dark:text-dark-heading flex-1" />
                        <Button variant="outline" size="sm" onClick={handleSave} disabled={isPending || editName === variant.name}>Salvar</Button>
                    </div>
                    {variant.sku && <p className="text-xs text-brand-inactive-text mt-1">SKU: {variant.sku}</p>}
                </div>
                <div className="flex gap-2 text-xs text-brand-inactive-text">
                    <span>Estoque: {variant.stock_quantity}</span>
                    {variant.price !== null && <span>R$ {Number(variant.price).toFixed(2)}</span>}
                </div>
            </div>
            {(variant.images || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {(variant.images || []).map((url: string, i: number) => (
                        <ImagePreview key={i} url={url} onRemove={() => handleRemoveImage(url)} />
                    ))}
                </div>
            )}
            <RiskScoreSelector value={riskScore} onChange={setRiskScore} />
        </div>
    )
}

// ─── Service View ────────────────────────────────────────────────────────────

function ServiceView({ data, isPending, onRefresh }: { data: FetchedService; isPending: boolean; onRefresh: () => void }) {
    const [riskScore, setRiskScore] = useState(0)
    const [editName, setEditName] = useState(data.name)
    const [editDesc, setEditDesc] = useState(data.description || "")
    const [editTags, setEditTags] = useState(data.tags?.join(", ") || "")
    const [editVideoUrl, setEditVideoUrl] = useState(data.video_url || "")

    const partnerId = data.partner?.id

    const handleSaveField = async (field: string, value: string) => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await editField("service", data.id, field, value, riskScore, `Editado por admin`, partnerId)
        if (r.success) { toast.success(`${field} atualizado!`); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    const handleRemoveImage = async (url: string) => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await removeImage("service", data.id, url, "images", riskScore, undefined, partnerId)
        if (r.success) { toast.success("Imagem removida!"); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    return (
        <div className="space-y-6">
            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Nome</label>
                <div className="flex gap-2">
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                    <Button variant="outline" size="sm" onClick={() => handleSaveField("name", editName)}
                        disabled={isPending || editName === data.name}>Salvar</Button>
                </div>
            </div>
            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Descrição</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4}
                    className="w-full text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                <ActionButtons onSave={() => handleSaveField("description", editDesc)}
                    riskScore={riskScore} onRiskScoreChange={setRiskScore} isPending={isPending} />
            </div>

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Tags</label>
                <div className="flex gap-2">
                    <input type="text" value={editTags} onChange={(e) => setEditTags(e.target.value)}
                        className="flex-1 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                    <Button variant="outline" size="sm" onClick={() => handleSaveField("tags", JSON.stringify(editTags.split(",").map(t => t.trim()).filter(Boolean)))}
                        disabled={isPending}>Salvar</Button>
                </div>
            </div>

            {data.video_url && (
                <div>
                    <label className="text-xs font-bold text-brand-inactive-text block mb-1">URL do Vídeo</label>
                    <div className="flex gap-2">
                        <input type="text" value={editVideoUrl} onChange={(e) => setEditVideoUrl(e.target.value)}
                            className="flex-1 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                        <Button variant="outline" size="sm" onClick={() => handleSaveField("video_url", editVideoUrl)}
                            disabled={isPending}>Salvar</Button>
                    </div>
                </div>
            )}

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Imagens</label>
                <div className="flex flex-wrap gap-3">
                    {(data.images || []).map((url: string, i: number) => (
                        <ImagePreview key={i} url={url} onRemove={() => handleRemoveImage(url)} />
                    ))}
                </div>
            </div>

            {data.partner && (
                <div className="p-3 bg-brand-gray dark:bg-dark-border/20 rounded-lg text-sm">
                    <span className="text-brand-inactive-text">Parceiro: </span>
                    <strong className="text-brand-dark dark:text-dark-heading">{data.partner.store_name}</strong>
                    <span className="ml-2 text-brand-inactive-text">| Risk Score: {data.partner.risk_score}</span>
                </div>
            )}
        </div>
    )
}

// ─── Recurring Plan View ──────────────────────────────────────────────────────

function RecurringPlanView({ data, isPending, onRefresh }: { data: FetchedRecurringPlan; isPending: boolean; onRefresh: () => void }) {
    const [riskScore, setRiskScore] = useState(0)
    const [editName, setEditName] = useState(data.name)
    const [editDesc, setEditDesc] = useState(data.description || "")

    const partnerId = data.partner?.id

    const handleSaveField = async (field: string, value: string) => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await editField("recurring_plan", data.id, field, value, riskScore, `Editado por admin`, partnerId)
        if (r.success) { toast.success(`${field} atualizado!`); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{data.name}</h3>
                <Badge variant={data.status === "active" ? "green" : "gray"}>{data.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-brand-inactive-text block mb-1">Nome</label>
                    <div className="flex gap-2">
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                        <Button variant="outline" size="sm" onClick={() => handleSaveField("name", editName)}
                            disabled={isPending}>Salvar</Button>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-brand-inactive-text block mb-1">Frequência</label>
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading capitalize">{data.frequency_type}</p>
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Descrição</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4}
                    className="w-full text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                <ActionButtons onSave={() => handleSaveField("description", editDesc)}
                    riskScore={riskScore} onRiskScoreChange={setRiskScore} isPending={isPending} />
            </div>

            {data.items && data.items.length > 0 && (
                <div>
                    <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">Itens do Plano</h4>
                    <div className="space-y-2">
                        {data.items.map((item) => (
                            <div key={item.id} className="p-3 bg-brand-gray dark:bg-dark-border/20 rounded-lg text-sm flex justify-between">
                                <span className="text-brand-dark dark:text-dark-heading font-medium">
                                    {item.item_type === "product" ? "Produto" : "Serviço"} ({item.product_id || item.service_id})
                                </span>
                                <span className="text-brand-inactive-text">Qtd: {item.quantity}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {data.partner && (
                <div className="p-3 bg-brand-gray dark:bg-dark-border/20 rounded-lg text-sm">
                    <span className="text-brand-inactive-text">Parceiro: </span>
                    <strong className="text-brand-dark dark:text-dark-heading">{data.partner.store_name}</strong>
                    <span className="ml-2 text-brand-inactive-text">| Risk Score: {data.partner.risk_score}</span>
                </div>
            )}
        </div>
    )
}

// ─── Partner View ────────────────────────────────────────────────────────────

function PartnerView({ data, isPending, onRefresh }: { data: FetchedPartner; isPending: boolean; onRefresh: () => void }) {
    const [riskScore, setRiskScore] = useState(0)
    const [editName, setEditName] = useState(data.store_name)
    const [editDesc, setEditDesc] = useState(data.store_description || "")
    const [manualRiskScore, setManualRiskScore] = useState(data.risk_score)
    const [showRiskEditor, setShowRiskEditor] = useState(false)

    const handleSaveField = async (field: string, value: string) => {
        const r = await editField("partner", data.id, field, value, 0, `Editado por admin`, data.id)
        if (r.success) { toast.success(`${field} atualizado!`); onRefresh() }
        else toast.error(r.error || "Erro")
    }

    const handleRemoveImage = async (url: string, field: string) => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await removeImage("partner", data.id, url, field, riskScore, undefined, data.id)
        if (r.success) { toast.success("Imagem removida!"); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    const handleUpdateRiskScore = async () => {
        const r = await updatePartnerRiskScore(data.id, manualRiskScore, "Atualizado manualmente pelo admin")
        if (r.success) { toast.success("Risk score atualizado!"); onRefresh(); setShowRiskEditor(false) }
        else toast.error(r.error || "Erro")
    }

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{data.store_name}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-brand-inactive-text block mb-1">Nome da Loja</label>
                    <div className="flex gap-2">
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                        <Button variant="outline" size="sm" onClick={() => handleSaveField("store_name", editName)}
                            disabled={isPending}>Salvar</Button>
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-brand-inactive-text block mb-1">Risk Score</label>
                    <div className="flex items-center gap-2">
                        <Badge variant={data.risk_score >= 50 ? "red" : data.risk_score >= 20 ? "orange" : data.risk_score >= 10 ? "blue" : "green"}>
                            {data.risk_score}
                        </Badge>
                        <Button variant="outline" size="sm" onClick={() => setShowRiskEditor(!showRiskEditor)}>
                            Alterar
                        </Button>
                    </div>
                    {showRiskEditor && (
                        <div className="flex gap-2 mt-2">
                            <input type="number" value={manualRiskScore} onChange={(e) => setManualRiskScore(Number(e.target.value))}
                                min={0} max={100}
                                className="w-20 text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-1.5 text-brand-dark dark:text-dark-heading" />
                            <Button variant="filled" size="sm" onClick={handleUpdateRiskScore} disabled={isPending}>Salvar</Button>
                        </div>
                    )}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Descrição</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4}
                    className="w-full text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                <ActionButtons onSave={() => handleSaveField("store_description", editDesc)}
                    riskScore={riskScore} onRiskScoreChange={setRiskScore} isPending={isPending} label="Salvar descrição" />
            </div>

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Logo</label>
                {data.store_image_url ? (
                    <div className="flex items-start gap-3">
                        <ImagePreview url={data.store_image_url} />
                        <Button variant="destructive" size="sm" onClick={() => handleRemoveImage(data.store_image_url!, "store_image_url")}
                            disabled={isPending}>Remover</Button>
                    </div>
                ) : <p className="text-sm text-brand-inactive-text">Nenhum logo</p>}
            </div>

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Banner</label>
                {data.banner_url ? (
                    <div className="flex items-start gap-3">
                        <ImagePreview url={data.banner_url} />
                        <Button variant="destructive" size="sm" onClick={() => handleRemoveImage(data.banner_url!, "banner_url")}
                            disabled={isPending}>Remover</Button>
                    </div>
                ) : <p className="text-sm text-brand-inactive-text">Nenhum banner</p>}
            </div>

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Galeria ({data.gallery?.length || 0})</label>
                <div className="flex flex-wrap gap-3">
                    {(data.gallery || []).map((url: string, i: number) => (
                        <ImagePreview key={i} url={url} onRemove={() => handleRemoveImage(url, "gallery")} />
                    ))}
                </div>
            </div>

            {data.owner && (
                <div className="p-3 bg-brand-gray dark:bg-dark-border/20 rounded-lg text-sm space-y-1">
                    <p><span className="text-brand-inactive-text">Proprietário: </span>
                        <strong className="text-brand-dark dark:text-dark-heading">{data.owner.full_name}</strong></p>
                    <p><span className="text-brand-inactive-text">Email: </span>{data.owner.email}</p>
                    <p><span className="text-brand-inactive-text">Risk Score (usuário): </span>{data.owner.risk_score}</p>
                </div>
            )}
        </div>
    )
}

// ─── Review View ─────────────────────────────────────────────────────────────

function ReviewView({ data, isPending, onRefresh }: { data: FetchedReview; isPending: boolean; onRefresh: () => void }) {
    const [riskScore, setRiskScore] = useState(0)
    const [editComment, setEditComment] = useState(data.comment || "")
    const [actionType, setActionType] = useState<"edit" | "hide">("edit")

    const handleHide = async () => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await hideReview(data.id, riskScore, `Ocultado por admin`)
        if (r.success) { toast.success("Review ocultado!"); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    const handleEdit = async () => {
        if (riskScore === 0) { toast.warning("Selecione um risk score primeiro"); return }
        const r = await editReview(data.id, editComment, riskScore, `Editado por admin`)
        if (r.success) { toast.success("Review editado!"); onRefresh(); setRiskScore(0) }
        else toast.error(r.error || "Erro")
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <StarIcon key={i} size={16} className={i < data.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} />
                    ))}
                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading ml-1">{data.rating}/5</span>
                </div>
                {data.is_hidden && <Badge variant="red">Oculto</Badge>}
            </div>

            {data.user && (
                <p className="text-sm text-brand-inactive-text">Por: <strong className="text-brand-dark dark:text-dark-heading">{data.user.full_name || "Anônimo"}</strong></p>
            )}

            {data.product && (
                <p className="text-sm text-brand-inactive-text">Produto: <strong className="text-brand-dark dark:text-dark-heading">{data.product.name}</strong></p>
            )}

            <div>
                <label className="text-xs font-bold text-brand-inactive-text block mb-1">Comentário</label>
                {data.is_hidden ? (
                    <p className="text-sm italic text-brand-inactive-text">[Review oculto]</p>
                ) : (
                    <>
                        <textarea value={editComment} onChange={(e) => setEditComment(e.target.value)} rows={4}
                            className="w-full text-sm rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-brand-dark dark:text-dark-heading" />
                        <div className="flex gap-2 mt-2">
                            <Button variant="filled" onClick={handleEdit} disabled={isPending}>Salvar edição</Button>
                            <Button variant="destructive" onClick={handleHide} disabled={isPending}>Ocultar review</Button>
                        </div>
                        <RiskScoreSelector value={riskScore} onChange={setRiskScore} />
                    </>
                )}
            </div>

            {data.partner && (
                <div className="p-3 bg-brand-gray dark:bg-dark-border/20 rounded-lg text-sm">
                    <span className="text-brand-inactive-text">Parceiro: </span>
                    <strong className="text-brand-dark dark:text-dark-heading">{data.partner.store_name}</strong>
                    <span className="ml-2 text-brand-inactive-text">| Risk Score: {data.partner.risk_score}</span>
                </div>
            )}
        </div>
    )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function AdminModerationPanel() {
    const [searchId, setSearchId] = useState("")
    const [searchType, setSearchType] = useState<SearchType>("product")
    const [result, setResult] = useState<any>(null)
    const [error, setError] = useState("")
    const [isPending, startTransition] = useTransition()

    const handleSearch = () => {
        if (!searchId.trim()) { setError("Digite um ID"); return }
        setError("")
        startTransition(async () => {
            const res = await fetchModerationTarget(searchType, searchId.trim())
            if (res.success) {
                setResult({ type: searchType, data: res.data })
                setError("")
            } else {
                setResult(null)
                setError(res.error || "Não encontrado")
            }
        })
    }

    const handleRefresh = () => {
        if (searchId.trim()) {
            startTransition(async () => {
                const res = await fetchModerationTarget(searchType, searchId.trim())
                if (res.success) setResult({ type: searchType, data: res.data })
            })
        }
    }

    return (
        <div className="mx-auto w-full px-4 md:px-8 py-6">
            <div className="mb-6">
                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium mb-4">
                    Busque por ID para revisar, editar ou remover conteúdo de produtos, serviços, assinaturas, parceiros e reviews.
                </p>

                <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex gap-2">
                        {SEARCH_TYPES.map((t) => (
                            <button
                                key={t.value}
                                onClick={() => { setSearchType(t.value); setResult(null); setError("") }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    searchType === t.value
                                        ? "bg-brand-green text-white"
                                        : "bg-brand-gray dark:bg-dark-border/30 text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2 flex-1">
                        <Input
                            name="search-id"
                            placeholder={`ID do ${SEARCH_TYPES.find(t => t.value === searchType)?.label.toLowerCase()}...`}
                            value={searchId}
                            onChange={(e) => setSearchId(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleSearch()}
                            className="flex-1"
                        />
                        <Button variant="filled" onClick={handleSearch} disabled={isPending} isLoading={isPending}>
                            <SearchIcon size={18} className="mr-1" /> Buscar
                        </Button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-center">
                    <AlertTriangleIcon size={40} className="mx-auto mb-3 text-red-400" />
                    <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
                </div>
            )}

            {result && (
                <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-brand-border dark:border-dark-border">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-brand-inactive-text uppercase tracking-wider">
                                {SEARCH_TYPES.find(t => t.value === result.type)?.label}
                            </span>
                            <Badge variant="blue">ID: {result.data.id}</Badge>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
                            Atualizar
                        </Button>
                    </div>

                    {result.type === "product" && (
                        <ProductView data={result.data as FetchedProduct} isPending={isPending} onRefresh={handleRefresh} />
                    )}
                    {result.type === "service" && (
                        <ServiceView data={result.data as FetchedService} isPending={isPending} onRefresh={handleRefresh} />
                    )}
                    {result.type === "recurring_plan" && (
                        <RecurringPlanView data={result.data as FetchedRecurringPlan} isPending={isPending} onRefresh={handleRefresh} />
                    )}
                    {result.type === "partner" && (
                        <PartnerView data={result.data as FetchedPartner} isPending={isPending} onRefresh={handleRefresh} />
                    )}
                    {result.type === "review" && (
                        <ReviewView data={result.data as FetchedReview} isPending={isPending} onRefresh={handleRefresh} />
                    )}
                </div>
            )}
        </div>
    )
}
