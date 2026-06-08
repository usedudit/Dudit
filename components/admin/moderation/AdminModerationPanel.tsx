"use client"

import React, { useState, useTransition, useCallback } from "react"
import { SearchIcon, StoreIcon, PackageIcon, UserIcon, StarIcon, XIcon, AlertTriangleIcon, TrashIcon } from "@/lib/icons"
import { Button, Input, Badge, Separator, FormDropdown, AlertModal } from "@/components/reusable"
import { FormTextarea } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { toast } from "@/hooks/use-notification"
import {
    fetchModerationTarget,
    editField,
    removeImage,
    editVariant,
    hideReview,
    editReview,
    updatePartnerRiskScore,
    saveModerationChanges,
    deleteModerationTarget,
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
    { value: "0", label: "Não alterar risk score" },
    { value: "5", label: "5 - Normal" },
    { value: "10", label: "10 - Médio" },
    { value: "20", label: "20 - Grave" },
    { value: "50", label: "50 - Muito Grave" },
]

function PartnerInfo({ partner }: { partner: { id: string; store_name: string; risk_score: number } | null }) {
    if (!partner) return null
    return (
        <div className="p-3 bg-brand-gray dark:bg-dark-border/20 rounded-lg">
            <span className="text-sm text-brand-inactive-text">Parceiro: </span>
            <strong className="text-sm text-brand-dark dark:text-dark-heading">{partner.store_name}</strong>
            <span className="ml-2 text-sm text-brand-inactive-text">| Risk Score: {partner.risk_score}</span>
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
                    <div className="flex gap-2 flex-wrap">
                        {SEARCH_TYPES.map((t) => (
                            <Button
                                key={t.value}
                                variant={searchType === t.value ? "default" : "ghost"}
                                size="sm"
                                onClick={() => { setSearchType(t.value); setResult(null); setError("") }}
                            >
                                {t.label}
                            </Button>
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
                            variant="full-rounded"
                        />
                        <Button variant="default" onClick={handleSearch} disabled={isPending} isLoading={isPending}>
                            <SearchIcon size={18} /> Buscar
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

// ─── Unified Save Footer ─────────────────────────────────────────────────────

function SaveFooter({
    riskScore,
    onRiskScoreChange,
    notes,
    onNotesChange,
    onSave,
    onDelete,
    isPending,
    showDelete = false,
    deleteLabel = "Remover",
    deleteConfirmMsg = "Tem certeza que deseja remover este item?",
}: {
    riskScore: string
    onRiskScoreChange: (v: string) => void
    notes: string
    onNotesChange: (v: string) => void
    onSave: () => void
    onDelete?: () => void
    isPending: boolean
    showDelete?: boolean
    deleteLabel?: string
    deleteConfirmMsg?: string
}) {
    const [showDeleteModal, setShowDeleteModal] = useState(false)

    return (
        <div className="flex flex-col gap-4 mt-6 p-4 bg-brand-gray dark:bg-dark-border/20 rounded-xl border border-brand-border dark:border-dark-border">
            <FormDropdown
                label="Risk Score"
                options={RISK_LEVELS}
                value={riskScore}
                setValue={onRiskScoreChange}
                placeholder="Não alterar"
                width="w-full"
            />

            <FormTextarea
                label="Observações"
                name="notes"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                rows={2}
                placeholder="Observações sobre a ação (opcional)..."
            />

            <div className="flex items-center gap-3 flex-wrap">
                <Button variant="filled" onClick={onSave} disabled={isPending} isLoading={isPending}>
                    Salvar alterações
                </Button>
                {showDelete && (
                    <Button variant="destructive" onClick={() => setShowDeleteModal(true)} disabled={isPending}>
                        <TrashIcon size={16} /> {deleteLabel}
                    </Button>
                )}
            </div>

            {showDelete && (
                <AlertModal
                    isOpen={showDeleteModal}
                    onClose={() => setShowDeleteModal(false)}
                    title="Confirmar remoção"
                    description={deleteConfirmMsg}
                    confirmText="Remover"
                    cancelText="Cancelar"
                    variant="danger"
                    onConfirm={() => { setShowDeleteModal(false); onDelete?.() }}
                />
            )}
        </div>
    )
}

// ─── Image Preview with AlertModal ───────────────────────────────────────────

function ImagePreview({ url, onRemove }: { url: string; onRemove?: () => void }) {
    const [showRemoveModal, setShowRemoveModal] = useState(false)
    const fullUrl = getR2ImageUrl(url)

    return (
        <>
            <div className="relative group">
                <img src={fullUrl} alt="" className="w-24 h-24 rounded-lg object-cover border border-brand-border dark:border-dark-border" />
                {onRemove && (
                    <button
                        onClick={() => setShowRemoveModal(true)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <XIcon size={12} />
                    </button>
                )}
            </div>
            <AlertModal
                isOpen={showRemoveModal}
                onClose={() => setShowRemoveModal(false)}
                title="Remover Imagem"
                description="Tem certeza que deseja remover esta imagem? Esta ação não pode ser desfeita."
                confirmText="Remover"
                cancelText="Cancelar"
                variant="danger"
                onConfirm={() => { setShowRemoveModal(false); onRemove?.() }}
            />
        </>
    )
}

// ─── Product View ────────────────────────────────────────────────────────────

function ProductView({ data, isPending, onRefresh }: { data: FetchedProduct; isPending: boolean; onRefresh: () => void }) {
    const [editName, setEditName] = useState(data.name)
    const [editDesc, setEditDesc] = useState(data.description || "")
    const [editTags, setEditTags] = useState(data.tags?.join(", ") || "")
    const [editVideoUrl, setEditVideoUrl] = useState(data.video_url || "")
    const [removedImages, setRemovedImages] = useState<string[]>([])
    const [riskScore, setRiskScore] = useState("0")
    const [notes, setNotes] = useState("")
    const [saving, startSaving] = useTransition()
    const [deleting, startDeleting] = useTransition()

    const partnerId = data.partner?.id

    const handleSave = () => {
        startSaving(async () => {
            const changes: { field: string; value: string }[] = []
            if (editName !== data.name) changes.push({ field: "name", value: editName })
            if (editDesc !== (data.description || "")) changes.push({ field: "description", value: editDesc })
            const tagsStr = data.tags?.join(", ") || ""
            if (editTags !== tagsStr) changes.push({ field: "tags", value: JSON.stringify(editTags.split(",").map(t => t.trim()).filter(Boolean)) })
            if (editVideoUrl !== (data.video_url || "")) changes.push({ field: "video_url", value: editVideoUrl })

            // First remove images (without risk increment - it's applied once below)
            for (const img of removedImages) {
                const r = await removeImage("product", data.id, img, "images", 0, notes || undefined, partnerId)
                if (!r.success) { toast.error(r.error || "Erro ao remover imagem"); return }
            }

            // Then save field changes + risk score (single increment)
            if (changes.length > 0 || Number(riskScore) > 0) {
                const r = await saveModerationChanges({
                    type: "product",
                    targetId: data.id,
                    changes,
                    removedImages: [],
                    riskScoreIncrement: Number(riskScore),
                    notes: notes || undefined,
                    knownPartnerId: partnerId,
                })
                if (r.success) { toast.success("Alterações salvas!"); onRefresh(); setRemovedImages([]) }
                else toast.error(r.error || "Erro ao salvar")
            } else if (removedImages.length === 0) {
                toast.warning("Nenhuma alteração para salvar")
            }
        })
    }

    const handleDelete = () => {
        startDeleting(async () => {
            const r = await deleteModerationTarget("product", data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Produto removido!"); onRefresh() }
            else toast.error(r.error || "Erro ao remover")
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{data.name}</h3>
                <Badge variant={data.is_active ? "green" : "red"}>{data.is_active ? "Ativo" : "Inativo"}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Nome</label>
                    <Input name="name" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
                </div>
                {data.price !== undefined && (
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Preço</label>
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/30 rounded-lg px-4 py-2.5">
                            R$ {Number(data.price).toFixed(2)}
                        </p>
                    </div>
                )}
            </div>

            <FormTextarea
                label="Descrição"
                name="description"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
            />

            <div>
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Tags (separadas por vírgula)</label>
                <Input name="tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} className="flex-1" />
            </div>

            {data.video_url && (
                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">URL do Vídeo</label>
                    <Input name="video_url" value={editVideoUrl} onChange={(e) => setEditVideoUrl(e.target.value)} className="flex-1" />
                </div>
            )}

            <div>
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">
                    Imagens ({(data.images?.length || 0) - removedImages.length})
                </label>
                <div className="flex flex-wrap gap-3">
                    {(data.images || []).map((url: string, i: number) => {
                        if (removedImages.includes(url)) return null
                        return <ImagePreview key={i} url={url} onRemove={() => setRemovedImages(prev => [...prev, url])} />
                    })}
                </div>
            </div>

            <Separator />

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

            <Separator />

            <PartnerInfo partner={data.partner} />

            <SaveFooter
                riskScore={riskScore}
                onRiskScoreChange={setRiskScore}
                notes={notes}
                onNotesChange={setNotes}
                onSave={handleSave}
                onDelete={handleDelete}
                isPending={saving || deleting}
                showDelete
                deleteLabel="Remover produto"
                deleteConfirmMsg="Tem certeza que deseja remover este produto? Ele ficará oculto da vitrine."
            />
        </div>
    )
}

// ─── Variant Card ────────────────────────────────────────────────────────────

function VariantCard({ variant, productId, isPending, onRefresh, partnerId }: { variant: FetchedVariant; productId: string; isPending: boolean; onRefresh: () => void; partnerId?: string }) {
    const [editName, setEditName] = useState(variant.variant_name)
    const [riskScore, setRiskScore] = useState("0")
    const [notes, setNotes] = useState("")
    const [saving, startSaving] = useTransition()

    const variantImage = variant.variant_options?.image || null

    const handleSaveName = () => {
        startSaving(async () => {
            const r = await editVariant(variant.id, "name", editName, Number(riskScore), notes || undefined, partnerId)
            if (r.success) { toast.success("Variante atualizada!"); onRefresh() }
            else toast.error(r.error || "Erro")
        })
    }

    const handleRemoveImage = async () => {
        if (!variantImage) return
        const r = await removeImage("variant", variant.id, variantImage, "variant_options", Number(riskScore), notes || undefined, partnerId)
        if (r.success) { toast.success("Imagem removida!"); onRefresh() }
        else toast.error(r.error || "Erro")
    }

    return (
        <div className="p-4 border border-brand-border dark:border-dark-border rounded-xl">
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <div className="flex gap-2 items-center">
                        <Input
                            name={`variant-name-${variant.id}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1"
                        />
                        <Button variant="outline" size="sm" onClick={handleSaveName} disabled={saving || editName === variant.variant_name}>
                            Salvar
                        </Button>
                    </div>
                    {variant.sku && <p className="text-xs text-brand-inactive-text mt-1">SKU: {variant.sku}</p>}
                </div>
                <div className="flex gap-2 text-xs text-brand-inactive-text shrink-0 ml-2">
                    <span>Estoque: {variant.stock_quantity}</span>
                    {variant.price_adjustment !== 0 && <span>R$ {Number(variant.price_adjustment).toFixed(2)}</span>}
                </div>
            </div>

            {variantImage && (
                <div className="flex flex-wrap gap-2 mb-2">
                    <ImagePreview url={variantImage} onRemove={handleRemoveImage} />
                </div>
            )}

            <div className="flex items-center gap-2 mt-2">
                <FormDropdown
                    label="Risk Score"
                    options={RISK_LEVELS}
                    value={riskScore}
                    setValue={(v) => setRiskScore(v)}
                    placeholder="Não alterar"
                />
            </div>
        </div>
    )
}

// ─── Service View ────────────────────────────────────────────────────────────

function ServiceView({ data, isPending, onRefresh }: { data: FetchedService; isPending: boolean; onRefresh: () => void }) {
    const [editName, setEditName] = useState(data.name)
    const [editDesc, setEditDesc] = useState(data.description || "")
    const [editTags, setEditTags] = useState(data.tags?.join(", ") || "")
    const [editVideoUrl, setEditVideoUrl] = useState(data.video_url || "")
    const [removedImages, setRemovedImages] = useState<string[]>([])
    const [riskScore, setRiskScore] = useState("0")
    const [notes, setNotes] = useState("")
    const [saving, startSaving] = useTransition()
    const [deleting, startDeleting] = useTransition()

    const partnerId = data.partner?.id

    const handleSave = () => {
        startSaving(async () => {
            const changes: { field: string; value: string }[] = []
            if (editName !== data.name) changes.push({ field: "name", value: editName })
            if (editDesc !== (data.description || "")) changes.push({ field: "description", value: editDesc })
            const tagsStr = data.tags?.join(", ") || ""
            if (editTags !== tagsStr) changes.push({ field: "tags", value: JSON.stringify(editTags.split(",").map(t => t.trim()).filter(Boolean)) })
            if (editVideoUrl !== (data.video_url || "")) changes.push({ field: "video_url", value: editVideoUrl })

            for (const img of removedImages) {
                const r = await removeImage("service", data.id, img, "images", 0, notes || undefined, partnerId)
                if (!r.success) { toast.error(r.error || "Erro ao remover imagem"); return }
            }

            if (changes.length > 0 || Number(riskScore) > 0) {
                const r = await saveModerationChanges({
                    type: "service", targetId: data.id, changes, removedImages: [],
                    riskScoreIncrement: Number(riskScore), notes: notes || undefined, knownPartnerId: partnerId,
                })
                if (r.success) { toast.success("Alterações salvas!"); onRefresh(); setRemovedImages([]) }
                else toast.error(r.error || "Erro ao salvar")
            } else {
                toast.warning("Nenhuma alteração para salvar")
            }
        })
    }

    const handleDelete = () => {
        startDeleting(async () => {
            const r = await deleteModerationTarget("service", data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Serviço removido!"); onRefresh() }
            else toast.error(r.error || "Erro ao remover")
        })
    }

    return (
        <div className="space-y-6">
            <div>
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Nome</label>
                <Input name="name" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
            </div>

            <FormTextarea
                label="Descrição"
                name="description"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
            />

            <div>
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Tags (separadas por vírgula)</label>
                <Input name="tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} className="flex-1" />
            </div>

            {data.video_url && (
                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">URL do Vídeo</label>
                    <Input name="video_url" value={editVideoUrl} onChange={(e) => setEditVideoUrl(e.target.value)} className="flex-1" />
                </div>
            )}

            <div>
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">
                    Imagens ({(data.images?.length || 0) - removedImages.length})
                </label>
                <div className="flex flex-wrap gap-3">
                    {(data.images || []).map((url: string, i: number) => {
                        if (removedImages.includes(url)) return null
                        return <ImagePreview key={i} url={url} onRemove={() => setRemovedImages(prev => [...prev, url])} />
                    })}
                </div>
            </div>

            <Separator />
            <PartnerInfo partner={data.partner} />

            <SaveFooter
                riskScore={riskScore}
                onRiskScoreChange={setRiskScore}
                notes={notes}
                onNotesChange={setNotes}
                onSave={handleSave}
                onDelete={handleDelete}
                isPending={saving || deleting}
                showDelete
                deleteLabel="Remover serviço"
                deleteConfirmMsg="Tem certeza que deseja remover este serviço? Ele ficará oculto da vitrine."
            />
        </div>
    )
}

// ─── Recurring Plan View ─────────────────────────────────────────────────────

function RecurringPlanView({ data, isPending, onRefresh }: { data: FetchedRecurringPlan; isPending: boolean; onRefresh: () => void }) {
    const [editName, setEditName] = useState(data.name)
    const [editDesc, setEditDesc] = useState(data.description || "")
    const [riskScore, setRiskScore] = useState("0")
    const [notes, setNotes] = useState("")
    const [saving, startSaving] = useTransition()
    const [deleting, startDeleting] = useTransition()

    const partnerId = data.partner?.id

    const handleSave = () => {
        startSaving(async () => {
            const changes: { field: string; value: string }[] = []
            if (editName !== data.name) changes.push({ field: "name", value: editName })
            if (editDesc !== (data.description || "")) changes.push({ field: "description", value: editDesc })

            if (changes.length > 0 || Number(riskScore) > 0) {
                const r = await saveModerationChanges({
                    type: "recurring_plan", targetId: data.id, changes, removedImages: [],
                    riskScoreIncrement: Number(riskScore), notes: notes || undefined, knownPartnerId: partnerId,
                })
                if (r.success) { toast.success("Alterações salvas!"); onRefresh() }
                else toast.error(r.error || "Erro ao salvar")
            } else {
                toast.warning("Nenhuma alteração para salvar")
            }
        })
    }

    const handleDelete = () => {
        startDeleting(async () => {
            const r = await deleteModerationTarget("recurring_plan", data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Assinatura removida!"); onRefresh() }
            else toast.error(r.error || "Erro ao remover")
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{data.name}</h3>
                <Badge variant={data.status === "active" ? "green" : "gray"}>{data.status}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Nome</label>
                    <Input name="name" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
                </div>
                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Frequência</label>
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/30 rounded-lg px-4 py-2.5 capitalize">
                        {data.frequency_type}
                    </p>
                </div>
            </div>

            <FormTextarea
                label="Descrição"
                name="description"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
            />

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

            <Separator />
            <PartnerInfo partner={data.partner} />

            <SaveFooter
                riskScore={riskScore}
                onRiskScoreChange={setRiskScore}
                notes={notes}
                onNotesChange={setNotes}
                onSave={handleSave}
                onDelete={handleDelete}
                isPending={saving || deleting}
                showDelete
                deleteLabel="Remover assinatura"
                deleteConfirmMsg="Tem certeza que deseja remover esta assinatura? Ela será cancelada."
            />
        </div>
    )
}

// ─── Partner View ────────────────────────────────────────────────────────────

function PartnerView({ data, isPending, onRefresh }: { data: FetchedPartner; isPending: boolean; onRefresh: () => void }) {
    const [editName, setEditName] = useState(data.store_name)
    const [editDesc, setEditDesc] = useState(data.store_description || "")
    const [manualRiskScore, setManualRiskScore] = useState(String(data.risk_score))
    const [showRiskEditor, setShowRiskEditor] = useState(false)
    const [removedImages, setRemovedImages] = useState<{ field: string; url: string }[]>([])
    const [riskScore, setRiskScore] = useState("0")
    const [notes, setNotes] = useState("")
    const [saving, startSaving] = useTransition()

    const handleRemovePartnerImage = async (url: string, field: string) => {
        const r = await removeImage("partner", data.id, url, field, Number(riskScore), notes || undefined, data.id)
        if (r.success) { toast.success("Imagem removida!"); onRefresh() }
        else toast.error(r.error || "Erro")
    }

    const handleUpdateRiskScore = () => {
        startSaving(async () => {
            const r = await updatePartnerRiskScore(data.id, Number(manualRiskScore), notes || undefined)
            if (r.success) { toast.success("Risk score atualizado!"); onRefresh(); setShowRiskEditor(false) }
            else toast.error(r.error || "Erro")
        })
    }

    const handleSave = () => {
        startSaving(async () => {
            const changes: { field: string; value: string }[] = []
            if (editName !== data.store_name) changes.push({ field: "store_name", value: editName })
            if (editDesc !== (data.store_description || "")) changes.push({ field: "store_description", value: editDesc })

            for (const { field, url } of removedImages) {
                await handleRemovePartnerImage(url, field)
            }

            if (changes.length > 0 || Number(riskScore) > 0) {
                const r = await saveModerationChanges({
                    type: "partner", targetId: data.id, changes, removedImages: [],
                    riskScoreIncrement: Number(riskScore), notes: notes || undefined, knownPartnerId: data.id,
                })
                if (r.success) { toast.success("Alterações salvas!"); onRefresh(); setRemovedImages([]) }
                else toast.error(r.error || "Erro ao salvar")
            } else {
                toast.warning("Nenhuma alteração para salvar")
            }
        })
    }

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">{data.store_name}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Nome da Loja</label>
                    <Input name="store_name" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
                </div>
                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Risk Score</label>
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
                            <Input
                                name="manual-risk-score"
                                value={manualRiskScore}
                                onChange={(e) => setManualRiskScore(e.target.value)}
                                type="number"
                                className="w-20"
                            />
                            <Button variant="filled" size="sm" onClick={handleUpdateRiskScore} disabled={saving}>Salvar</Button>
                        </div>
                    )}
                </div>
            </div>

            <FormTextarea
                label="Descrição"
                name="store_description"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={4}
            />

            <div>
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Logo</label>
                {data.store_image_url ? (
                    <div className="flex items-start gap-3">
                        <ImagePreview url={data.store_image_url} onRemove={() => setRemovedImages(prev => [...prev, { field: "store_image_url", url: data.store_image_url! }])} />
                    </div>
                ) : <p className="text-sm text-brand-inactive-text">Nenhum logo</p>}
            </div>

            <div>
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Banner</label>
                {data.banner_url ? (
                    <div className="flex items-start gap-3">
                        <ImagePreview url={data.banner_url} onRemove={() => setRemovedImages(prev => [...prev, { field: "banner_url", url: data.banner_url! }])} />
                    </div>
                ) : <p className="text-sm text-brand-inactive-text">Nenhum banner</p>}
            </div>

            <div>
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Galeria ({data.gallery?.length || 0})</label>
                <div className="flex flex-wrap gap-3">
                    {(data.gallery || []).map((url: string, i: number) => {
                        if (removedImages.some(r => r.url === url)) return null
                        return <ImagePreview key={i} url={url} onRemove={() => setRemovedImages(prev => [...prev, { field: "gallery", url }])} />
                    })}
                </div>
            </div>

            {data.owner && (
                <div className="p-3 bg-brand-gray dark:bg-dark-border/20 rounded-lg space-y-1">
                    <p className="text-sm"><span className="text-brand-inactive-text">Proprietário: </span>
                        <strong className="text-brand-dark dark:text-dark-heading">{data.owner.full_name}</strong></p>
                    <p className="text-sm"><span className="text-brand-inactive-text">Email: </span>{data.owner.email}</p>
                    <p className="text-sm"><span className="text-brand-inactive-text">Risk Score (usuário): </span>{data.owner.risk_score}</p>
                </div>
            )}

            <SaveFooter
                riskScore={riskScore}
                onRiskScoreChange={setRiskScore}
                notes={notes}
                onNotesChange={setNotes}
                onSave={handleSave}
                isPending={saving}
            />
        </div>
    )
}

// ─── Review View ─────────────────────────────────────────────────────────────

function ReviewView({ data, isPending, onRefresh }: { data: FetchedReview; isPending: boolean; onRefresh: () => void }) {
    const [editComment, setEditComment] = useState(data.comment || "")
    const [riskScore, setRiskScore] = useState("0")
    const [notes, setNotes] = useState("")
    const [saving, startSaving] = useTransition()
    const [deleting, startDeleting] = useTransition()

    const handleSave = () => {
        startSaving(async () => {
            const r = await editReview(data.id, editComment, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Review editado!"); onRefresh() }
            else toast.error(r.error || "Erro ao editar")
        })
    }

    const handleHide = () => {
        startSaving(async () => {
            const r = await hideReview(data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Review ocultado!"); onRefresh() }
            else toast.error(r.error || "Erro")
        })
    }

    const handleDelete = () => {
        startDeleting(async () => {
            const r = await deleteModerationTarget("review", data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Review removido!"); onRefresh() }
            else toast.error(r.error || "Erro ao remover")
        })
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
                {data.is_hidden ? (
                    <p className="text-sm italic text-brand-inactive-text">[Review oculto]</p>
                ) : (
                    <FormTextarea
                        label="Comentário"
                        name="comment"
                        value={editComment}
                        onChange={(e) => setEditComment(e.target.value)}
                        rows={4}
                    />
                )}
            </div>

            <div className="flex gap-2">
                {!data.is_hidden && (
                    <Button variant="outline" onClick={handleHide} disabled={saving}>
                        Ocultar review
                    </Button>
                )}
            </div>

            <Separator />
            <PartnerInfo partner={data.partner} />

            <SaveFooter
                riskScore={riskScore}
                onRiskScoreChange={setRiskScore}
                notes={notes}
                onNotesChange={setNotes}
                onSave={handleSave}
                onDelete={handleDelete}
                isPending={saving || deleting}
                showDelete
                deleteLabel="Remover review"
                deleteConfirmMsg="Tem certeza que deseja remover esta review permanentemente?"
            />
        </div>
    )
}