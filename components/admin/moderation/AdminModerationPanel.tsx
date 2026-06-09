"use client"

import React, { useState, useTransition, useRef } from "react"
import { SearchIcon, StoreIcon, PackageIcon, UserIcon, StarIcon, XIcon, AlertTriangleIcon, TrashIcon, EditIcon, SaveIcon, ChevronLeftIcon, InfoIcon } from "@/lib/icons"
import { Button, Input, Badge, Separator, FormDropdown, AlertModal, FormSection, Tabs, TabsList, TabsTrigger, Spinner } from "@/components/reusable"
import { FormTextarea } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { FadeIn } from "@/components/animations/FadeIn"
import { toast } from "@/hooks/use-notification"
import {
    fetchModerationTarget,
    editField, removeImage, editVariant, hideReview, editReview,
    updatePartnerRiskScore, saveModerationChanges, deleteModerationTarget, deleteVariant,
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

export function AdminModerationPanel() {
    const [searchId, setSearchId] = useState("")
    const [searchType, setSearchType] = useState<SearchType>("product")
    const [result, setResult] = useState<any>(null)
    const [error, setError] = useState("")
    const [isPending, startTransition] = useTransition()
    const [activeTab, setActiveTab] = useState("general")
    const scrollRef = useRef<HTMLDivElement>(null)

    const handleSearch = () => {
        if (!searchId.trim()) { setError("Digite um ID"); return }
        setError("")
        startTransition(async () => {
            const res = await fetchModerationTarget(searchType, searchId.trim())
            if (res.success) {
                setResult({ type: searchType, data: res.data })
                setActiveTab("general")
                setError("")
                scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
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

    const data = result?.data
    const rtype = result?.type as SearchType | undefined
    const hasVariants = rtype === "product" && ((data as FetchedProduct)?.variants?.length ?? 0) > 0
    const isPartner = rtype === "partner"

    const typeLabel = SEARCH_TYPES.find(t => t.value === rtype)?.label

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <div ref={scrollRef} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">
                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 pt-4 pb-2">
                            <div className="flex flex-col gap-1 mb-3">
                                <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading truncate">
                                    Painel de Moderação
                                </h1>
                                <p className="text-sm text-brand-inactive-text">
                                    Busque por ID para revisar, editar ou remover conteúdo
                                </p>
                            </div>

                            {/* Search Bar (PageControls style) */}
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="flex gap-2 flex-wrap flex-1">
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
                                <div className="flex gap-2">
                                    <Input
                                        name="search-id"
                                        placeholder={`ID do ${SEARCH_TYPES.find(t => t.value === searchType)?.label.toLowerCase()}...`}
                                        value={searchId}
                                        onChange={(e) => setSearchId(e.target.value)}
                                        onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleSearch()}
                                        className="w-64"
                                        variant="full-rounded"
                                    />
                                    <Button variant="default" onClick={handleSearch} disabled={isPending} isLoading={isPending}>
                                        <SearchIcon size={18} /> Buscar
                                    </Button>
                                </div>
                            </div>

                            {/* Result Tabs */}
                            {result && (
                                <div className="mt-4">
                                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Dados gerais</TabsTrigger>
                                            {hasVariants && <TabsTrigger value="variations">Variações</TabsTrigger>}
                                            {isPartner && <TabsTrigger value="gallery">Galeria</TabsTrigger>}
                                        </TabsList>
                                    </Tabs>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Error State */}
                    {error && (
                        <div className="max-w-[1300px] mx-auto px-4 md:px-6 pt-6">
                            <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-center">
                                <AlertTriangleIcon size={40} className="mx-auto mb-3 text-red-400" />
                                <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Tab Content */}
                    {result && (
                        <div className="px-4 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                            {activeTab === "general" && (
                                <FadeIn key="general" className="block">
                                    {rtype === "product" && <ProductGeneral data={data as FetchedProduct} isPending={isPending} onRefresh={handleRefresh} />}
                                    {rtype === "service" && <ServiceGeneral data={data as FetchedService} isPending={isPending} onRefresh={handleRefresh} />}
                                    {rtype === "recurring_plan" && <RecurringPlanGeneral data={data as FetchedRecurringPlan} isPending={isPending} onRefresh={handleRefresh} />}
                                    {rtype === "partner" && <PartnerGeneral data={data as FetchedPartner} isPending={isPending} onRefresh={handleRefresh} />}
                                    {rtype === "review" && <ReviewGeneral data={data as FetchedReview} isPending={isPending} onRefresh={handleRefresh} />}
                                </FadeIn>
                            )}
                            {activeTab === "variations" && hasVariants && (
                                <FadeIn key="variations" className="block">
                                    <VariationsTab data={data as FetchedProduct} isPending={isPending} onRefresh={handleRefresh} />
                                </FadeIn>
                            )}
                            {activeTab === "gallery" && isPartner && (
                                <FadeIn key="gallery" className="block">
                                    <PartnerGallery data={data as FetchedPartner} isPending={isPending} onRefresh={handleRefresh} />
                                </FadeIn>
                            )}
                        </div>
                    )}
                </div>

                {/* Mobile Bottom Action Bar */}
                {result && (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                        <Button variant="outline" onClick={handleRefresh} disabled={isPending} className="flex-1 h-12">
                            Atualizar
                        </Button>
                    </div>
                )}
            </div>
        </FadeIn>
    )
}

// ─── Shared Sub-components ──────────────────────────────────────────────────

function PartnerInfo({ partner }: { partner: { id: string; store_name: string; risk_score: number } | null }) {
    if (!partner) return null
    return (
        <p className="text-sm text-brand-inactive-text">
            Parceiro: <strong className="text-brand-dark dark:text-dark-heading">{partner.store_name}</strong>
            <span className="ml-2">Risk Score: {partner.risk_score}</span>
        </p>
    )
}

function ImagePreview({ url, onRemove }: { url: string; onRemove?: () => void }) {
    const [showRemoveModal, setShowRemoveModal] = useState(false)
    const fullUrl = getR2ImageUrl(url)
    return (
        <>
            <div className="relative group">
                <img src={fullUrl} alt="" className="w-20 h-20 rounded-lg object-cover border border-brand-border dark:border-dark-border" />
                {onRemove && (
                    <button onClick={() => setShowRemoveModal(true)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <XIcon size={10} />
                    </button>
                )}
            </div>
            <AlertModal isOpen={showRemoveModal} onClose={() => setShowRemoveModal(false)}
                title="Remover Imagem" description="Tem certeza que deseja remover esta imagem? Esta ação não pode ser desfeita."
                confirmText="Remover" cancelText="Cancelar" variant="danger"
                onConfirm={() => { setShowRemoveModal(false); onRemove?.() }} />
        </>
    )
}

function SaveFooter({ riskScore, onRiskScoreChange, notes, onNotesChange, onSave, onDelete, isPending, showDelete = false, deleteLabel = "Remover", deleteConfirmMsg = "Tem certeza?" }: {
    riskScore: string; onRiskScoreChange: (v: string) => void; notes: string; onNotesChange: (v: string) => void
    onSave: () => void; onDelete?: () => void; isPending: boolean; showDelete?: boolean; deleteLabel?: string; deleteConfirmMsg?: string
}) {
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    return (
        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
            <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Ação de Moderação</h3>
            <div className="space-y-5">
                <FormDropdown label="Risk Score" options={RISK_LEVELS} value={riskScore} setValue={onRiskScoreChange} placeholder="Não alterar" width="w-full" />
                <FormTextarea label="Observações" name="notes" value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} placeholder="Observações sobre a ação (opcional)..." />
                <div className="flex items-center gap-3 flex-wrap pt-2">
                    <Button variant="filled" onClick={onSave} disabled={isPending} isLoading={isPending}><SaveIcon size={16} /> Salvar alterações</Button>
                    {showDelete && (
                        <Button variant="destructive" onClick={() => setShowDeleteModal(true)} disabled={isPending}>
                            <TrashIcon size={16} /> {deleteLabel}
                        </Button>
                    )}
                </div>
            </div>
            <AlertModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)}
                title="Confirmar remoção" description={deleteConfirmMsg}
                confirmText="Remover" cancelText="Cancelar" variant="danger"
                onConfirm={() => { setShowDeleteModal(false); onDelete?.() }} />
        </div>
    )
}

// ─── Variant Card ────────────────────────────────────────────────────────────

function VariantCard({ variant, isPending, onRefresh, partnerId }: { variant: FetchedVariant; isPending: boolean; onRefresh: () => void; partnerId?: string }) {
    const [editName, setEditName] = useState(variant.variant_name)
    const [saving, startSaving] = useTransition()
    const [showDeleteModal, setShowDeleteModal] = useState(false)

    const variantImage = variant.variant_options?.image || null

    const handleSaveName = () => {
        startSaving(async () => {
            const r = await editVariant(variant.id, "name", editName, 0, undefined, partnerId)
            if (r.success) { toast.success("Variante atualizada!"); onRefresh() }
            else toast.error(r.error || "Erro")
        })
    }

    const handleRemoveImage = async () => {
        if (!variantImage) return
        const r = await removeImage("variant", variant.id, variantImage, "variant_options", 0, undefined, partnerId)
        if (r.success) { toast.success("Imagem removida!"); onRefresh() }
        else toast.error(r.error || "Erro")
    }

    const handleDelete = () => {
        startSaving(async () => {
            const r = await deleteVariant(variant.id, 0, undefined, partnerId)
            if (r.success) { toast.success("Variante removida!"); onRefresh() }
            else toast.error(r.error || "Erro")
        })
    }

    return (
        <div className="p-4 border border-brand-border dark:border-dark-border rounded-xl">
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <div className="flex gap-2 items-center">
                        <Input name={`variant-name-${variant.id}`} value={editName}
                            onChange={(e) => setEditName(e.target.value)} className="flex-1" />
                        <div className="flex gap-1 shrink-0">
                            <Button variant="outline" size="sm" onClick={handleSaveName}
                                disabled={saving || editName === variant.variant_name}>Salvar</Button>
                            <Button variant="destructive" size="sm" onClick={() => setShowDeleteModal(true)} disabled={saving}>
                                <TrashIcon size={14} />
                            </Button>
                        </div>
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
            <AlertModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)}
                title="Remover Variante" description="Tem certeza que deseja remover esta variante?"
                confirmText="Remover" cancelText="Cancelar" variant="danger"
                onConfirm={() => { setShowDeleteModal(false); handleDelete() }} />
        </div>
    )
}

// ─── General Tabs (Two-column ERP layout) ────────────────────────────────────

function SidebarCard({ title, children, topStrip = true }: { title: string; children: React.ReactNode; topStrip?: boolean }) {
    return (
        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
            {topStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />}
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">{title}</h3>
            <div className="space-y-5">{children}</div>
        </div>
    )
}

function TwoColLayout({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
    return (
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">{left}</div>
            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">{right}</div>
        </div>
    )
}

// ─── Product General ────────────────────────────────────────────────────────

function ProductGeneral({ data, isPending, onRefresh }: { data: FetchedProduct; isPending: boolean; onRefresh: () => void }) {
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
                const r = await removeImage("product", data.id, img, "images", 0, notes || undefined, partnerId)
                if (!r.success) { toast.error(r.error || "Erro ao remover imagem"); return }
            }
            if (changes.length > 0 || Number(riskScore) > 0) {
                const r = await saveModerationChanges({ type: "product", targetId: data.id, changes, removedImages: [], riskScoreIncrement: Number(riskScore), notes: notes || undefined, knownPartnerId: partnerId })
                if (r.success) { toast.success("Alterações salvas!"); onRefresh(); setRemovedImages([]) } else toast.error(r.error || "Erro ao salvar")
            } else if (removedImages.length === 0) toast.warning("Nenhuma alteração para salvar")
        })
    }

    const handleDelete = () => {
        startDeleting(async () => {
            const r = await deleteModerationTarget("product", data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Produto removido!"); onRefresh() } else toast.error(r.error || "Erro ao remover")
        })
    }

    return (
        <TwoColLayout
            left={
                <FormSection title="Informações do Produto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Nome</label>
                            <Input name="name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Preço</label>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/30 rounded-lg px-4 py-2.5 h-[42px] flex items-center">
                                R$ {Number(data.price).toFixed(2)}
                            </p>
                        </div>
                    </div>
                    <FormTextarea label="Descrição" name="description" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} />
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Tags (separadas por vírgula)</label>
                        <Input name="tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                    </div>
                    {data.video_url && (
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">URL do Vídeo</label>
                            <Input name="video_url" value={editVideoUrl} onChange={(e) => setEditVideoUrl(e.target.value)} />
                        </div>
                    )}
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">
                            Imagens ({(data.images?.length || 0) - removedImages.length})
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {(data.images || []).map((url, i) => removedImages.includes(url) ? null : (
                                <ImagePreview key={i} url={url} onRemove={() => setRemovedImages(prev => [...prev, url])} />
                            ))}
                        </div>
                    </div>
                </FormSection>
            }
            right={
                <>
                    <SidebarCard title="Status">
                        <Badge variant={data.is_active ? "green" : "red"}>{data.is_active ? "Ativo" : "Inativo"}</Badge>
                        <p className="text-sm text-brand-inactive-text">Moderação: {data.moderation_status}</p>
                    </SidebarCard>
                    <SidebarCard title="Parceiro">
                        {data.partner ? (
                            <>
                                <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">{data.partner.store_name}</p>
                                <p className="text-sm text-brand-inactive-text">ID: {data.partner.id}</p>
                                <p className="text-sm text-brand-inactive-text">Risk Score: {data.partner.risk_score}</p>
                            </>
                        ) : <p className="text-sm text-brand-inactive-text">Nenhum</p>}
                    </SidebarCard>
                    <SaveFooter riskScore={riskScore} onRiskScoreChange={setRiskScore} notes={notes} onNotesChange={setNotes}
                        onSave={handleSave} onDelete={handleDelete} isPending={saving || deleting} showDelete
                        deleteLabel="Remover produto" deleteConfirmMsg="Tem certeza que deseja remover este produto? Ele ficará oculto da vitrine." />
                </>
            }
        />
    )
}

// ─── Service General ─────────────────────────────────────────────────────────

function ServiceGeneral({ data, isPending, onRefresh }: { data: FetchedService; isPending: boolean; onRefresh: () => void }) {
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
                const r = await saveModerationChanges({ type: "service", targetId: data.id, changes, removedImages: [], riskScoreIncrement: Number(riskScore), notes: notes || undefined, knownPartnerId: partnerId })
                if (r.success) { toast.success("Alterações salvas!"); onRefresh(); setRemovedImages([]) } else toast.error(r.error || "Erro ao salvar")
            } else if (removedImages.length === 0) toast.warning("Nenhuma alteração para salvar")
        })
    }

    const handleDelete = () => {
        startDeleting(async () => {
            const r = await deleteModerationTarget("service", data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Serviço removido!"); onRefresh() } else toast.error(r.error || "Erro ao remover")
        })
    }

    return (
        <TwoColLayout
            left={
                <FormSection title="Informações do Serviço">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Nome</label>
                            <Input name="name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Preço</label>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/30 rounded-lg px-4 py-2.5 h-[42px] flex items-center">
                                R$ {Number(data.price).toFixed(2)}
                            </p>
                        </div>
                    </div>
                    <FormTextarea label="Descrição" name="description" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} />
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Tags (separadas por vírgula)</label>
                        <Input name="tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} />
                    </div>
                    {data.video_url && (
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">URL do Vídeo</label>
                            <Input name="video_url" value={editVideoUrl} onChange={(e) => setEditVideoUrl(e.target.value)} />
                        </div>
                    )}
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Imagens</label>
                        <div className="flex flex-wrap gap-3">
                            {(data.images || []).map((url, i) => removedImages.includes(url) ? null : (
                                <ImagePreview key={i} url={url} onRemove={() => setRemovedImages(prev => [...prev, url])} />
                            ))}
                        </div>
                    </div>
                </FormSection>
            }
            right={
                <>
                    <SidebarCard title="Status">
                        <Badge variant={data.is_active ? "green" : "red"}>{data.is_active ? "Ativo" : "Inativo"}</Badge>
                        <p className="text-sm text-brand-inactive-text">Moderação: {data.moderation_status}</p>
                    </SidebarCard>
                    <SidebarCard title="Parceiro">
                        {data.partner ? (
                            <>
                                <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">{data.partner.store_name}</p>
                                <p className="text-sm text-brand-inactive-text">ID: {data.partner.id}</p>
                                <p className="text-sm text-brand-inactive-text">Risk Score: {data.partner.risk_score}</p>
                            </>
                        ) : <p className="text-sm text-brand-inactive-text">Nenhum</p>}
                    </SidebarCard>
                    <SaveFooter riskScore={riskScore} onRiskScoreChange={setRiskScore} notes={notes} onNotesChange={setNotes}
                        onSave={handleSave} onDelete={handleDelete} isPending={saving || deleting} showDelete
                        deleteLabel="Remover serviço" deleteConfirmMsg="Tem certeza que deseja remover este serviço? Ele ficará oculto da vitrine." />
                </>
            }
        />
    )
}

// ─── Recurring Plan General ──────────────────────────────────────────────────

function RecurringPlanGeneral({ data, isPending, onRefresh }: { data: FetchedRecurringPlan; isPending: boolean; onRefresh: () => void }) {
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
                const r = await saveModerationChanges({ type: "recurring_plan", targetId: data.id, changes, removedImages: [], riskScoreIncrement: Number(riskScore), notes: notes || undefined, knownPartnerId: partnerId })
                if (r.success) { toast.success("Alterações salvas!"); onRefresh() } else toast.error(r.error || "Erro ao salvar")
            } else toast.warning("Nenhuma alteração para salvar")
        })
    }

    const handleDelete = () => {
        startDeleting(async () => {
            const r = await deleteModerationTarget("recurring_plan", data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Assinatura removida!"); onRefresh() } else toast.error(r.error || "Erro ao remover")
        })
    }

    return (
        <TwoColLayout
            left={
                <FormSection title="Informações da Assinatura">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Nome</label>
                            <Input name="name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Frequência</label>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/30 rounded-lg px-4 py-2.5 h-[42px] flex items-center capitalize">
                                {data.frequency_type}
                            </p>
                        </div>
                    </div>
                    <FormTextarea label="Descrição" name="description" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} />
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
                </FormSection>
            }
            right={
                <>
                    <SidebarCard title="Status">
                        <Badge variant={data.status === "active" ? "green" : "gray"}>{data.status}</Badge>
                    </SidebarCard>
                    <SidebarCard title="Parceiro">
                        {data.partner ? (
                            <>
                                <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">{data.partner.store_name}</p>
                                <p className="text-sm text-brand-inactive-text">ID: {data.partner.id}</p>
                                <p className="text-sm text-brand-inactive-text">Risk Score: {data.partner.risk_score}</p>
                            </>
                        ) : <p className="text-sm text-brand-inactive-text">Nenhum</p>}
                    </SidebarCard>
                    <SaveFooter riskScore={riskScore} onRiskScoreChange={setRiskScore} notes={notes} onNotesChange={setNotes}
                        onSave={handleSave} onDelete={handleDelete} isPending={saving || deleting} showDelete
                        deleteLabel="Remover assinatura" deleteConfirmMsg="Tem certeza que deseja remover esta assinatura? Ela será cancelada." />
                </>
            }
        />
    )
}

// ─── Partner General ─────────────────────────────────────────────────────────

function PartnerGeneral({ data, isPending, onRefresh }: { data: FetchedPartner; isPending: boolean; onRefresh: () => void }) {
    const [editName, setEditName] = useState(data.store_name)
    const [editDesc, setEditDesc] = useState(data.store_description || "")
    const [manualRiskScore, setManualRiskScore] = useState(String(data.risk_score))
    const [showRiskEditor, setShowRiskEditor] = useState(false)
    const [riskScore, setRiskScore] = useState("0")
    const [notes, setNotes] = useState("")
    const [saving, startSaving] = useTransition()

    const handleUpdateRiskScore = () => {
        startSaving(async () => {
            const r = await updatePartnerRiskScore(data.id, Number(manualRiskScore), notes || undefined)
            if (r.success) { toast.success("Risk score atualizado!"); onRefresh(); setShowRiskEditor(false) } else toast.error(r.error || "Erro")
        })
    }

    const handleSave = () => {
        startSaving(async () => {
            const changes: { field: string; value: string }[] = []
            if (editName !== data.store_name) changes.push({ field: "store_name", value: editName })
            if (editDesc !== (data.store_description || "")) changes.push({ field: "store_description", value: editDesc })
            if (changes.length > 0 || Number(riskScore) > 0) {
                const r = await saveModerationChanges({ type: "partner", targetId: data.id, changes, removedImages: [], riskScoreIncrement: Number(riskScore), notes: notes || undefined, knownPartnerId: data.id })
                if (r.success) { toast.success("Alterações salvas!"); onRefresh() } else toast.error(r.error || "Erro ao salvar")
            } else toast.warning("Nenhuma alteração para salvar")
        })
    }

    return (
        <TwoColLayout
            left={
                <FormSection title="Informações do Parceiro">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Nome da Loja</label>
                            <Input name="store_name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 block">Risk Score</label>
                            <div className="flex items-center gap-2">
                                <Badge variant={data.risk_score >= 50 ? "red" : data.risk_score >= 20 ? "orange" : data.risk_score >= 10 ? "blue" : "green"}>
                                    {data.risk_score}
                                </Badge>
                                <Button variant="outline" size="sm" onClick={() => setShowRiskEditor(!showRiskEditor)}>Alterar</Button>
                            </div>
                            {showRiskEditor && (
                                <div className="flex gap-2 mt-2">
                                    <Input name="manual-risk-score" value={manualRiskScore}
                                        onChange={(e) => setManualRiskScore(e.target.value)} type="number" className="w-20" />
                                    <Button variant="filled" size="sm" onClick={handleUpdateRiskScore} disabled={saving}>Salvar</Button>
                                </div>
                            )}
                        </div>
                    </div>
                    <FormTextarea label="Descrição" name="store_description" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} />
                </FormSection>
            }
            right={
                <>
                    <SidebarCard title="Proprietário">
                        {data.owner ? (
                            <>
                                <p className="text-sm font-medium text-brand-dark dark:text-dark-heading">{data.owner.full_name}</p>
                                <p className="text-sm text-brand-inactive-text">{data.owner.email}</p>
                                <p className="text-sm text-brand-inactive-text">Risk Score: {data.owner.risk_score}</p>
                            </>
                        ) : <p className="text-sm text-brand-inactive-text">N/A</p>}
                    </SidebarCard>
                    <SaveFooter riskScore={riskScore} onRiskScoreChange={setRiskScore} notes={notes} onNotesChange={setNotes}
                        onSave={handleSave} isPending={saving} />
                </>
            }
        />
    )
}

// ─── Partner Gallery Tab ─────────────────────────────────────────────────────

function PartnerGallery({ data, isPending, onRefresh }: { data: FetchedPartner; isPending: boolean; onRefresh: () => void }) {
    const [riskScore, setRiskScore] = useState("0")
    const [notes, setNotes] = useState("")
    const [saving, startSaving] = useTransition()

    const handleRemoveImage = async (url: string, field: string) => {
        startSaving(async () => {
            const r = await removeImage("partner", data.id, url, field, Number(riskScore), notes || undefined, data.id)
            if (r.success) { toast.success("Imagem removida!"); onRefresh() } else toast.error(r.error || "Erro")
        })
    }

    return (
        <TwoColLayout
            left={
                <FormSection title="Logo">
                    {data.store_image_url ? (
                        <div className="flex items-start gap-3">
                            <ImagePreview url={data.store_image_url} onRemove={() => handleRemoveImage(data.store_image_url!, "store_image_url")} />
                        </div>
                    ) : <p className="text-sm text-brand-inactive-text">Nenhum logo</p>}
                </FormSection>
            }
            right={
                <SidebarCard title="Ações">
                    <SaveFooter riskScore={riskScore} onRiskScoreChange={setRiskScore} notes={notes} onNotesChange={setNotes}
                        onSave={() => { }} isPending={saving} />
                </SidebarCard>
            }
        />
    )
}

// ─── Variations Tab ──────────────────────────────────────────────────────────

function VariationsTab({ data, isPending, onRefresh }: { data: FetchedProduct; isPending: boolean; onRefresh: () => void }) {
    const partnerId = data.partner?.id

    if (!data.variants || data.variants.length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-brand-inactive-text">Este produto não possui variantes.</p>
            </div>
        )
    }

    return (
        <div>
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Variações ({data.variants.length})</h3>
            <div className="space-y-4">
                {data.variants.map((v: FetchedVariant) => (
                    <VariantCard key={v.id} variant={v} isPending={isPending} onRefresh={onRefresh} partnerId={partnerId} />
                ))}
            </div>
        </div>
    )
}

// ─── Review General ──────────────────────────────────────────────────────────

function ReviewGeneral({ data, isPending, onRefresh }: { data: FetchedReview; isPending: boolean; onRefresh: () => void }) {
    const [editComment, setEditComment] = useState(data.comment || "")
    const [riskScore, setRiskScore] = useState("0")
    const [notes, setNotes] = useState("")
    const [saving, startSaving] = useTransition()
    const [deleting, startDeleting] = useTransition()

    const handleSave = () => {
        startSaving(async () => {
            const r = await editReview(data.id, editComment, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Review editado!"); onRefresh() } else toast.error(r.error || "Erro ao editar")
        })
    }

    const handleHide = () => {
        startSaving(async () => {
            const r = await hideReview(data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Review ocultado!"); onRefresh() } else toast.error(r.error || "Erro")
        })
    }

    const handleDelete = () => {
        startDeleting(async () => {
            const r = await deleteModerationTarget("review", data.id, Number(riskScore), notes || undefined)
            if (r.success) { toast.success("Review removido!"); onRefresh() } else toast.error(r.error || "Erro ao remover")
        })
    }

    return (
        <TwoColLayout
            left={
                <FormSection title="Review">
                    <div className="flex items-center gap-2 mb-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <StarIcon key={i} size={16} className={i < data.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} />
                        ))}
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading ml-1">{data.rating}/5</span>
                        {data.is_hidden && <Badge variant="red">Oculto</Badge>}
                    </div>
                    {data.is_hidden ? (
                        <p className="text-sm italic text-brand-inactive-text">[Review oculto]</p>
                    ) : (
                        <FormTextarea label="Comentário" name="comment" value={editComment}
                            onChange={(e) => setEditComment(e.target.value)} rows={4} />
                    )}
                    {!data.is_hidden && (
                        <div className="mt-4">
                            <Button variant="outline" onClick={handleHide} disabled={saving}>Ocultar review</Button>
                        </div>
                    )}
                </FormSection>
            }
            right={
                <>
                    <SidebarCard title="Informações">
                        {data.user && <p className="text-sm text-brand-inactive-text">Por: <strong className="text-brand-dark dark:text-dark-heading">{data.user.full_name || "Anônimo"}</strong></p>}
                        {data.product && <p className="text-sm text-brand-inactive-text">Produto: <strong className="text-brand-dark dark:text-dark-heading">{data.product.name}</strong></p>}
                        {data.partner && <p className="text-sm text-brand-inactive-text">Parceiro: <strong className="text-brand-dark dark:text-dark-heading">{data.partner.store_name}</strong></p>}
                    </SidebarCard>
                    <SaveFooter riskScore={riskScore} onRiskScoreChange={setRiskScore} notes={notes} onNotesChange={setNotes}
                        onSave={handleSave} onDelete={handleDelete} isPending={saving || deleting} showDelete
                        deleteLabel="Remover review" deleteConfirmMsg="Tem certeza que deseja remover esta review permanentemente?" />
                </>
            }
        />
    )
}