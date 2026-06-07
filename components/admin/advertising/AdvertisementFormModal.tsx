"use client"

import { useEffect, useMemo, useState } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button, Input } from "@/components/reusable"
import citiesData from "@/lib/data/cities.json"
import { BRAZILIAN_UFS } from "@/lib/ads/constants"
import type { AdminAdvertisementRow } from "@/app/actions/admin/advertisements"
import type { AdStatus, AdTargetMode } from "@/lib/ads/types"

export interface AdvertisementFormState {
    title: string
    description: string
    image_url: string
    destination_url: string
    advertiser_name: string
    advertiser_logo: string
    target_mode: AdTargetMode
    center_lat: string
    center_lng: string
    radius_km: string
    cities: string[]
    state: string
    country: string
    priority: string
    status: AdStatus
    starts_at: string
    ends_at: string
}

const EMPTY_FORM: AdvertisementFormState = {
    title: "",
    description: "",
    image_url: "",
    destination_url: "",
    advertiser_name: "",
    advertiser_logo: "",
    target_mode: "cities",
    center_lat: "",
    center_lng: "",
    radius_km: "10",
    cities: [],
    state: "SP",
    country: "BR",
    priority: "0",
    status: "draft",
    starts_at: "",
    ends_at: "",
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
    if (!iso) return ""
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocalValue(value: string): string {
    if (!value) return ""
    return new Date(value).toISOString()
}

function adToForm(ad: AdminAdvertisementRow): AdvertisementFormState {
    return {
        title: ad.title,
        description: ad.description || "",
        image_url: ad.image_url,
        destination_url: ad.destination_url,
        advertiser_name: ad.advertiser_name,
        advertiser_logo: ad.advertiser_logo || "",
        target_mode: ad.target_mode,
        center_lat: ad.center_lat != null ? String(ad.center_lat) : "",
        center_lng: ad.center_lng != null ? String(ad.center_lng) : "",
        radius_km: ad.radius_km != null ? String(ad.radius_km) : "10",
        cities: ad.cities || [],
        state: ad.state || "SP",
        country: ad.country || "BR",
        priority: String(ad.priority ?? 0),
        status: ad.status,
        starts_at: toDatetimeLocalValue(ad.starts_at),
        ends_at: toDatetimeLocalValue(ad.ends_at),
    }
}

interface AdvertisementFormModalProps {
    open: boolean
    editing: AdminAdvertisementRow | null
    onClose: () => void
    onSubmit: (values: AdvertisementFormState) => Promise<void>
    isSubmitting: boolean
}

export default function AdvertisementFormModal({
    open,
    editing,
    onClose,
    onSubmit,
    isSubmitting,
}: AdvertisementFormModalProps) {
    const [form, setForm] = useState<AdvertisementFormState>(EMPTY_FORM)
    const [citySearch, setCitySearch] = useState("")

    useEffect(() => {
        if (!open) return
        setForm(editing ? adToForm(editing) : EMPTY_FORM)
        setCitySearch("")
    }, [open, editing])

    const filteredCities = useMemo(() => {
        if (!citySearch || citySearch.trim().length < 2) return []
        const q = citySearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        return (citiesData as string[])
            .filter((slug) => slug.includes(q.replace(/\s+/g, "-")))
            .slice(0, 8)
    }, [citySearch])

    const update = (patch: Partial<AdvertisementFormState>) => setForm((prev) => ({ ...prev, ...patch }))

    const toggleCity = (slug: string) => {
        setForm((prev) => ({
            ...prev,
            cities: prev.cities.includes(slug)
                ? prev.cities.filter((c) => c !== slug)
                : [...prev.cities, slug],
        }))
    }

    const handleSubmit = async () => {
        await onSubmit(form)
    }

    return (
        <DefaultModal
            isOpen={open}
            onClose={onClose}
            title={editing ? "Editar anúncio" : "Novo anúncio"}
            maxWidth="lg"
        >
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <Input label="Título" value={form.title} onChange={(e) => update({ title: e.target.value })} required />
                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-body mb-1 block">Descrição (opcional)</label>
                    <textarea
                        value={form.description}
                        onChange={(e) => update({ description: e.target.value })}
                        rows={2}
                        className="w-full px-4 py-2.5 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm"
                    />
                </div>
                <Input label="URL da imagem" value={form.image_url} onChange={(e) => update({ image_url: e.target.value })} required />
                <Input label="URL de destino" value={form.destination_url} onChange={(e) => update({ destination_url: e.target.value })} required />
                <Input label="Nome do anunciante" value={form.advertiser_name} onChange={(e) => update({ advertiser_name: e.target.value })} required />
                <Input label="Logo do anunciante (opcional)" value={form.advertiser_logo} onChange={(e) => update({ advertiser_logo: e.target.value })} />

                <div>
                    <label className="text-sm font-medium text-brand-dark dark:text-dark-body mb-2 block">Modo de targeting</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {(["cities", "radius", "state", "country"] as AdTargetMode[]).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => update({ target_mode: mode })}
                                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                                    form.target_mode === mode
                                        ? "border-brand-green bg-brand-green/10 text-brand-green font-semibold"
                                        : "border-brand-border dark:border-dark-border"
                                }`}
                            >
                                {mode === "cities" ? "Cidades" : mode === "radius" ? "Raio" : mode === "state" ? "Estado" : "País"}
                            </button>
                        ))}
                    </div>
                </div>

                {form.target_mode === "radius" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input label="Latitude" value={form.center_lat} onChange={(e) => update({ center_lat: e.target.value })} />
                        <Input label="Longitude" value={form.center_lng} onChange={(e) => update({ center_lng: e.target.value })} />
                        <Input label="Raio (km)" value={form.radius_km} onChange={(e) => update({ radius_km: e.target.value })} />
                    </div>
                )}

                {form.target_mode === "cities" && (
                    <div>
                        <Input label="Buscar cidade" value={citySearch} onChange={(e) => setCitySearch(e.target.value)} placeholder="Ex: sao paulo" />
                        {filteredCities.length > 0 && (
                            <div className="mt-2 border border-brand-border dark:border-dark-border rounded-lg overflow-hidden">
                                {filteredCities.map((slug) => (
                                    <button
                                        key={slug}
                                        type="button"
                                        onClick={() => toggleCity(slug)}
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-gray dark:hover:bg-dark-border/30 ${
                                            form.cities.includes(slug) ? "bg-brand-green/10 text-brand-green" : ""
                                        }`}
                                    >
                                        {slug}
                                    </button>
                                ))}
                            </div>
                        )}
                        {form.cities.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {form.cities.map((slug) => (
                                    <span key={slug} className="text-xs bg-brand-gray dark:bg-dark-border/40 px-2 py-1 rounded-full">
                                        {slug}
                                        <button type="button" className="ml-1" onClick={() => toggleCity(slug)}>×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {form.target_mode === "state" && (
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-body mb-1 block">Estado (UF)</label>
                        <select
                            value={form.state}
                            onChange={(e) => update({ state: e.target.value })}
                            className="w-full h-[42px] px-4 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm"
                        >
                            {BRAZILIAN_UFS.map((uf) => (
                                <option key={uf} value={uf}>{uf}</option>
                            ))}
                        </select>
                    </div>
                )}

                {form.target_mode === "country" && (
                    <Input label="País (ISO)" value={form.country} onChange={(e) => update({ country: e.target.value.toUpperCase() })} />
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input label="Prioridade" value={form.priority} onChange={(e) => update({ priority: e.target.value })} />
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-body mb-1 block">Status</label>
                        <select
                            value={form.status}
                            onChange={(e) => update({ status: e.target.value as AdStatus })}
                            className="w-full h-[42px] px-4 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm"
                        >
                            <option value="draft">Rascunho</option>
                            <option value="active">Ativo</option>
                            <option value="paused">Pausado</option>
                            <option value="expired">Expirado</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-body mb-1 block">Início</label>
                        <input
                            type="datetime-local"
                            value={form.starts_at}
                            onChange={(e) => update({ starts_at: e.target.value })}
                            className="w-full h-[42px] px-4 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-brand-dark dark:text-dark-body mb-1 block">Término</label>
                        <input
                            type="datetime-local"
                            value={form.ends_at}
                            onChange={(e) => update({ ends_at: e.target.value })}
                            className="w-full h-[42px] px-4 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm"
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-brand-border dark:border-dark-border">
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? "Salvando..." : editing ? "Salvar alterações" : "Criar anúncio"}
                </Button>
            </div>
        </DefaultModal>
    )
}

export function formStateToPayload(form: AdvertisementFormState) {
    return {
        title: form.title,
        description: form.description || null,
        image_url: form.image_url,
        destination_url: form.destination_url,
        advertiser_name: form.advertiser_name,
        advertiser_logo: form.advertiser_logo || null,
        target_mode: form.target_mode,
        center_lat: form.center_lat ? parseFloat(form.center_lat) : null,
        center_lng: form.center_lng ? parseFloat(form.center_lng) : null,
        radius_km: form.radius_km ? parseFloat(form.radius_km) : null,
        cities: form.cities,
        state: form.state || null,
        country: form.country || "BR",
        priority: parseInt(form.priority || "0", 10) || 0,
        status: form.status,
        starts_at: fromDatetimeLocalValue(form.starts_at),
        ends_at: fromDatetimeLocalValue(form.ends_at),
    }
}
