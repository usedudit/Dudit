"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
    Button,
    Checkbox,
    Spinner,
    SelectionBanner,
    Pagination,
    IconPlaceholder,
    Badge,
    Input,
    Combobox,
    FormSection,
    ListItem,
    RadioButton,
    InfoCard,
} from "@/components/reusable"
import {
    ChevronLeftIcon,
    UploadIcon,
    CheckCircleIcon,
    SearchIcon,
    AlertCircleIcon,
    GridIcon,
    ListIcon,
    CalendarIcon,
    ClockIcon,
} from "@/lib/icons"
import { useDropzone } from "react-dropzone"
import { useNotification } from "@/hooks/use-notification"
import { useStore } from "@/lib/store-context"
import {
    uploadPlanilhaAction,
    confirmImportAction,
    applyMappingAction,
    downloadImportTemplateAction,
    downloadFailedRowsAction,
} from "@/app/actions/erp/spreadsheet-import"
import { formatCurrency } from "@/lib/utils"
import type { ColumnMapping, FailedRow } from "@/lib/erp/import/types"
import { FadeIn } from "@/components/animations/FadeIn"

interface FieldOption {
    name: string
    label: string
    required?: boolean
    type?: string
    example?: string
}

interface ImportAppointmentsPageProps {
    partnerId: string
}

const COLUMNS = [
    { id: "customer", label: "Cliente", align: "left" as const, width: "240px" },
    { id: "service", label: "Serviço", align: "left" as const, width: "200px" },
    { id: "datetime", label: "Data e Horário", align: "left" as const, width: "180px" },
    { id: "staff", label: "Profissional", align: "left" as const, width: "160px" },
    { id: "price", label: "Valor", align: "left" as const, width: "120px" },
    { id: "status", label: "Status", align: "center" as const, width: "110px" },
]

const ITEMS_PER_PAGE = 25

function MappingRow({
    col,
    availableFields,
    onMappingChange,
    mappedFieldCounts,
}: {
    col: ColumnMapping
    availableFields: FieldOption[]
    onMappingChange: (headerIndex: number, newField: string | null) => void
    mappedFieldCounts: Map<string, number>
}) {
    const confidenceKey = col.confidence.toFixed(2)
    const confidenceVal = parseFloat(confidenceKey)

    let badgeVariant: "green" | "blue" | "orange" | "red" | "gray" = "gray"
    let badgeLabel = "Baixo"

    if (confidenceVal >= 0.9) {
        badgeVariant = "green"
        badgeLabel = "Exato"
    } else if (confidenceVal >= 0.8) {
        badgeVariant = "blue"
        badgeLabel = "Alto"
    } else if (confidenceVal >= 0.6) {
        badgeVariant = "orange"
        badgeLabel = "Médio"
    } else if (col.field) {
        badgeVariant = "red"
        badgeLabel = "Baixo"
    }

    const isDuplicateTarget = col.field ? (mappedFieldCounts.get(col.field) || 0) > 1 : false

    const comboboxOptions = useMemo(() => [
        { value: "", label: "- Não importar -" },
        ...availableFields.map((f) => ({
            value: f.name,
            label: `${f.label}${f.required ? " *" : ""}`,
        })),
    ], [availableFields])

    return (
        <tr className="hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors">
            <td className="py-4 px-4 align-middle">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                            {col.headerIndex + 1}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                            {col.header}
                        </span>
                        {col.sampleValues && col.sampleValues.length > 0 && (
                            <span className="text-[11px] text-brand-inactive-text dark:text-dark-body truncate max-w-[220px]" title={col.sampleValues.join(", ")}>
                                Ex: {col.sampleValues.slice(0, 2).join(", ")}
                            </span>
                        )}
                    </div>
                </div>
            </td>
            <td className="py-4 px-4 align-middle">
                <div className="flex flex-col gap-1 max-w-sm">
                    <Combobox
                        value={col.field || ""}
                        onChange={(newVal) => onMappingChange(col.headerIndex, newVal || null)}
                        options={comboboxOptions}
                        placeholder="- Não importar -"
                        searchPlaceholder="Buscar campo..."
                    />
                    {isDuplicateTarget && (
                        <span className="text-[11px] text-red-500 font-medium">
                            Campo duplicado! Selecione apenas uma vez.
                        </span>
                    )}
                    {col.typeMismatchWarning && (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            {col.typeMismatchWarning}
                        </span>
                    )}
                </div>
            </td>
            <td className="py-4 px-4 align-middle">
                {col.field ? (
                    <Badge variant={badgeVariant}>
                        {badgeLabel}
                    </Badge>
                ) : (
                    <span className="text-[12px] text-brand-inactive-text dark:text-dark-body">
                        Ignorado
                    </span>
                )}
            </td>
        </tr>
    )
}

function MappingMobileItem({
    col,
    availableFields,
    onMappingChange,
    mappedFieldCounts,
}: {
    col: ColumnMapping
    availableFields: FieldOption[]
    onMappingChange: (headerIndex: number, newField: string | null) => void
    mappedFieldCounts: Map<string, number>
}) {
    const isDuplicateTarget = col.field ? (mappedFieldCounts.get(col.field) || 0) > 1 : false

    const comboboxOptions = useMemo(() => [
        { value: "", label: "- Não importar -" },
        ...availableFields.map((f) => ({
            value: f.name,
            label: `${f.label}${f.required ? " *" : ""}`,
        })),
    ], [availableFields])

    return (
        <div className="border-b border-brand-border dark:border-dark-border p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center text-[11px] font-bold">
                        {col.headerIndex + 1}
                    </div>
                    <span className="font-bold text-brand-dark dark:text-dark-heading text-[13px]">{col.header}</span>
                </div>
            </div>
            {col.sampleValues && col.sampleValues.length > 0 && (
                <div className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                    Amostra: {col.sampleValues.slice(0, 2).join(", ")}
                </div>
            )}
            <Combobox
                value={col.field || ""}
                onChange={(newVal) => onMappingChange(col.headerIndex, newVal || null)}
                options={comboboxOptions}
                placeholder="- Não importar -"
                searchPlaceholder="Buscar campo..."
            />
            {isDuplicateTarget && (
                <span className="text-[11px] text-red-500 font-medium">
                    Campo duplicado! Selecione apenas uma vez.
                </span>
            )}
            {col.typeMismatchWarning && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    {col.typeMismatchWarning}
                </span>
            )}
        </div>
    )
}

function AppointmentPreviewRow({
    item,
    selected,
    onSelect,
}: {
    item: any
    selected: boolean
    onSelect: (id: string) => void
}) {
    let statusVariant: "green" | "blue" | "orange" | "red" | "gray" = "green"
    const st = String(item.status || "").toLowerCase()
    if (st.includes("concl")) statusVariant = "green"
    else if (st.includes("pago")) statusVariant = "green"
    else if (st.includes("confirma")) statusVariant = "blue"
    else if (st.includes("reserva") || st.includes("aguarda")) statusVariant = "orange"
    else if (st.includes("cancel") || st.includes("ausen")) statusVariant = "red"
    else statusVariant = "gray"

    return (
        <tr className="hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors">
            <td className="py-3 pl-6 pr-3 w-12 align-middle">
                <Checkbox
                    checked={selected}
                    onCheckedChange={() => onSelect(item.id)}
                    className="bg-white dark:bg-dark-background"
                />
            </td>
            <td className="py-3 px-2 align-middle" style={{ width: "240px" }}>
                <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{item.customer_name}</span>
                    {(item.customer_phone || item.customer_email) && (
                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                            {item.customer_phone || item.customer_email}
                        </span>
                    )}
                </div>
            </td>
            <td className="py-3 px-2 text-[13px] text-brand-dark dark:text-dark-heading align-middle" style={{ width: "200px" }}>
                <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">{item.service_name}</span>
                    {item.notes && (
                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body truncate max-w-[180px]">
                            {item.notes}
                        </span>
                    )}
                </div>
            </td>
            <td className="py-3 px-2 text-[13px] text-brand-dark dark:text-dark-heading align-middle" style={{ width: "180px" }}>
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{item.start_date}</span>
                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body flex items-center gap-1">
                        <ClockIcon size={12} /> {item.start_time} - {item.end_time || `${item.duration_minutes || 60}m`}
                    </span>
                </div>
            </td>
            <td className="py-3 px-2 text-[13px] text-brand-dark dark:text-dark-heading align-middle" style={{ width: "160px" }}>
                {item.staff_name || "Profissional"}
            </td>
            <td className="py-3 px-2 text-[13px] font-bold text-brand-dark dark:text-dark-heading align-middle" style={{ width: "120px" }}>
                {formatCurrency(Number(item.price ?? 0))}
            </td>
            <td className="py-3 px-2 text-center align-middle" style={{ width: "110px" }}>
                <Badge variant={statusVariant}>
                    {item.status || "Confirmado"}
                </Badge>
            </td>
        </tr>
    )
}

function AppointmentPreviewCard({
    item,
    selected,
    onSelect,
}: {
    item: any
    selected: boolean
    onSelect: (id: string) => void
}) {
    let statusVariant: "green" | "blue" | "orange" | "red" | "gray" = "green"
    const st = String(item.status || "").toLowerCase()
    if (st.includes("concl") || st.includes("pago")) statusVariant = "green"
    else if (st.includes("confirma")) statusVariant = "blue"
    else if (st.includes("reserva") || st.includes("aguarda")) statusVariant = "orange"
    else if (st.includes("cancel") || st.includes("ausen")) statusVariant = "red"
    else statusVariant = "gray"

    return (
        <div className="p-4 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface flex flex-col justify-between gap-3 shadow-xs hover:border-brand-primary/40 transition-colors">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                    <Checkbox
                        checked={selected}
                        onCheckedChange={() => onSelect(item.id)}
                    />
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">{item.customer_name}</span>
                        <span className="text-[12px] text-brand-inactive-text dark:text-dark-body truncate">{item.service_name}</span>
                    </div>
                </div>
                <Badge variant={statusVariant}>
                    {item.status || "Confirmado"}
                </Badge>
            </div>

            <div className="flex flex-col gap-1 text-[12px] text-brand-inactive-text dark:text-dark-body border-t border-brand-border dark:border-dark-border pt-2.5">
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1"><CalendarIcon size={13} /> {item.start_date}</span>
                    <span className="flex items-center gap-1"><ClockIcon size={13} /> {item.start_time}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                    <span>Profissional: <strong className="text-brand-dark dark:text-dark-heading">{item.staff_name || "Equipe"}</strong></span>
                    <strong className="text-[13px] text-brand-dark dark:text-dark-heading">{formatCurrency(Number(item.price ?? 0))}</strong>
                </div>
            </div>
        </div>
    )
}

export function ImportAppointmentsPage({ partnerId }: ImportAppointmentsPageProps) {
    const router = useRouter()
    const { success: notifySuccess, error: notifyError } = useNotification()
    const { selectedStore } = useStore()

    const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload")
    const [uploading, setUploading] = useState(false)
    const [importing, setImporting] = useState(false)
    const [downloadingTemplate, setDownloadingTemplate] = useState(false)
    const [downloadingFailedRows, setDownloadingFailedRows] = useState(false)

    // Data from upload
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [headers, setHeaders] = useState<string[]>([])
    const [totalRows, setTotalRows] = useState(0)
    const [fileName, setFileName] = useState("")
    const [mapping, setMapping] = useState<ColumnMapping[]>([])
    const [availableFields, setAvailableFields] = useState<FieldOption[]>([])
    const [parsedAppointments, setParsedAppointments] = useState<any[]>([])

    // Options
    const [duplicateStrategy, setDuplicateStrategy] = useState<"update" | "skip">("skip")

    // Import stats
    const [importDone, setImportDone] = useState(false)
    const [importStats, setImportStats] = useState<{
        successRows: number
        createdRows: number
        updatedRows: number
        duplicateRows: number
        errorRows: number
        durationMs: number
        failedRows: FailedRow[]
    } | null>(null)

    // Preview Page Controls State
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const [selection, setSelection] = useState<Set<string>>(new Set())
    const [viewMode, setViewMode] = useState<"grid" | "list">("list")

    // UI Scroll States
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) {
            setIsScrolled(scrollContainerRef.current.scrollTop > 20)
        }
    }, [])

    const checkScroll = useCallback(() => {
        if (tableContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
            setScrollState({
                left: scrollLeft > 0,
                right: scrollLeft < scrollWidth - clientWidth - 1,
            })
        }
    }, [])

    useEffect(() => {
        if (step === "preview" && parsedAppointments.length > 0) {
            const timer = setTimeout(checkScroll, 50)
            window.addEventListener("resize", checkScroll)
            return () => {
                clearTimeout(timer)
                window.removeEventListener("resize", checkScroll)
            }
        }
    }, [checkScroll, step, parsedAppointments])

    // Download template
    const handleDownloadTemplate = useCallback(async () => {
        try {
            setDownloadingTemplate(true)
            const res = await downloadImportTemplateAction("appointments")
            if (!res.success || !res.base64) {
                notifyError(res.error || "Erro ao baixar planilha modelo.")
                return
            }
            const binary = atob(res.base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            const blob = new Blob([bytes], { type: res.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement("a")
            anchor.href = url
            anchor.download = res.filename || "modelo-importacao-agendamentos.xlsx"
            anchor.click()
            URL.revokeObjectURL(url)
            notifySuccess("Planilha modelo baixada com sucesso!")
        } catch {
            notifyError("Erro ao baixar planilha modelo.")
        } finally {
            setDownloadingTemplate(false)
        }
    }, [notifyError, notifySuccess])

    // Download failed rows
    const handleDownloadFailedRows = useCallback(async () => {
        if (!importStats?.failedRows || importStats.failedRows.length === 0) return
        try {
            setDownloadingFailedRows(true)
            const res = await downloadFailedRowsAction("appointments", headers, importStats.failedRows)
            if (!res.success || !res.base64) {
                notifyError(res.error || "Erro ao baixar relatório de falhas.")
                return
            }
            const binary = atob(res.base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            const blob = new Blob([bytes], { type: res.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement("a")
            anchor.href = url
            anchor.download = res.filename || "falhas-importacao-agendamentos.xlsx"
            anchor.click()
            URL.revokeObjectURL(url)
        } catch {
            notifyError("Erro ao baixar relatório de falhas.")
        } finally {
            setDownloadingFailedRows(false)
        }
    }, [importStats, headers, notifyError])

    // Dropzone upload handler
    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            const file = acceptedFiles[0]
            if (!file) return

            setUploading(true)
            const formData = new FormData()
            formData.append("file", file)
            formData.append("partnerId", partnerId)
            formData.append("entityType", "appointments")
            if (selectedStore?.id) {
                formData.append("storeId", selectedStore.id)
            }

            const result = await uploadPlanilhaAction(formData)

            if (!result.success || !result.sessionId) {
                notifyError(result.error || "Erro ao processar planilha.")
                setUploading(false)
                return
            }

            setSessionId(result.sessionId)
            setHeaders(Array.isArray(result.headers) ? result.headers : [])
            setTotalRows(typeof result.totalRows === "number" ? result.totalRows : 0)
            setFileName(result.fileName || file.name)
            setMapping(Array.isArray(result.suggestedMapping) ? result.suggestedMapping : [])
            setAvailableFields(Array.isArray(result.availableFields) ? result.availableFields : [])
            setParsedAppointments(Array.isArray(result.previewProducts) ? result.previewProducts : [])
            setUploading(false)
            setStep("mapping")
        },
        [partnerId, selectedStore, notifyError],
    )

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            "application/vnd.ms-excel": [".xls"],
            "text/csv": [".csv"],
            "text/plain": [".csv"],
        },
        maxFiles: 1,
        maxSize: 10 * 1024 * 1024,
        noClick: true,
        disabled: uploading || importing,
    })

    const updateMapping = useCallback((headerIndex: number, newField: string | null) => {
        setMapping((prev) => {
            const prevArray = Array.isArray(prev) ? prev : []
            return prevArray.map((m) =>
                m.headerIndex === headerIndex
                    ? {
                        ...m,
                        field: newField,
                        fieldLabel: availableFields.find((f) => f.name === newField)?.label || newField || undefined,
                        isCustom: false,
                        confidence: newField ? 1.0 : 0,
                    }
                    : m,
            )
        })
    }, [availableFields])

    const mappedFieldCounts = useMemo(() => {
        const counts = new Map<string, number>()
        const mappingArray = Array.isArray(mapping) ? mapping : []
        for (const m of mappingArray) {
            if (m.field) {
                counts.set(m.field, (counts.get(m.field) || 0) + 1)
            }
        }
        return counts
    }, [mapping])

    const hasDuplicateMapping = useMemo(() => {
        return Array.from(mappedFieldCounts.values()).some((c) => c > 1)
    }, [mappedFieldCounts])

    const handleMappingConfirm = useCallback(async () => {
        if (!sessionId) return
        if (hasDuplicateMapping) {
            notifyError("Existem campos vinculados a múltiplas colunas. Corrija antes de continuar.")
            return
        }

        setUploading(true)
        const result = await applyMappingAction(sessionId, partnerId, mapping)
        if (!result.success) {
            notifyError(result.error || "Erro ao aplicar mapeamento.")
            setUploading(false)
            return
        }

        setParsedAppointments(Array.isArray(result.previewProducts) ? result.previewProducts : [])
        setPage(1)
        setSearch("")
        setSelection(new Set())
        setUploading(false)
        setStep("preview")
    }, [sessionId, partnerId, mapping, hasDuplicateMapping, notifyError])

    const handleImport = useCallback(async () => {
        if (!sessionId) return
        setImporting(true)

        const result = await confirmImportAction(sessionId, partnerId, mapping, {
            duplicateStrategy,
            skipErrors: true,
        })

        if (!result.success && !result.result) {
            notifyError(result.error || "Erro ao importar agendamentos.")
            setImporting(false)
            return
        }

        const res = result.result || {}
        setImportStats({
            successRows: res.successRows ?? 0,
            createdRows: res.createdRows ?? 0,
            updatedRows: res.updatedRows ?? 0,
            duplicateRows: res.duplicateRows ?? 0,
            errorRows: res.errorRows ?? 0,
            durationMs: res.durationMs ?? 0,
            failedRows: res.failedRows || [],
        })

        setImportDone(true)
        setImporting(false)
    }, [sessionId, partnerId, mapping, duplicateStrategy, notifyError])

    const filteredAppointments = useMemo(() => {
        const items = Array.isArray(parsedAppointments) ? parsedAppointments : []
        if (search) {
            const q = search.toLowerCase()
            return items.filter((a: any) =>
                a.customer_name?.toLowerCase().includes(q) ||
                a.service_name?.toLowerCase().includes(q) ||
                a.staff_name?.toLowerCase().includes(q)
            )
        }
        return items
    }, [parsedAppointments, search])

    const paginated = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredAppointments.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredAppointments, page])

    const totalPages = Math.ceil(filteredAppointments.length / ITEMS_PER_PAGE)
    const mappedCount = (Array.isArray(mapping) ? mapping : []).filter((m) => m.field).length

    if (importDone && importStats) {
        return (
            <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="mx-auto w-full pt-8 flex flex-col h-full overflow-y-auto px-4 max-w-[800px]">
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <IconPlaceholder
                            icon={CheckCircleIcon}
                            title="Importação Concluída!"
                            subtitle={`Processamos ${totalRows} agendamento(s) em ${(importStats.durationMs / 1000).toFixed(1)}s.`}
                        />

                        {/* Breakdown Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mb-8">
                            <InfoCard
                                title="Criados"
                                message={importStats.createdRows}
                                color="green"
                            />
                            <InfoCard
                                title="Atualizados"
                                message={importStats.updatedRows}
                                color="blue"
                            />
                            <InfoCard
                                title="Ignorados"
                                message={importStats.duplicateRows}
                                color="orange"
                            />
                            <InfoCard
                                title="Com Falhas"
                                message={importStats.errorRows}
                                color="red"
                            />
                        </div>

                        {/* Error Download if any */}
                        {importStats.failedRows.length > 0 && (
                            <div className="mb-6 w-full">
                                <IconPlaceholder
                                    icon={AlertCircleIcon}
                                    title={`${importStats.failedRows.length} agendamento(s) com inconsistência`}
                                    subtitle="Algumas linhas da planilha apresentaram erros de formato (como datas ou horários inválidos). Baixe o relatório detalhado para corrigir."
                                    itemButton={{
                                        text: downloadingFailedRows ? "Gerando..." : "Baixar Relatório de Falhas (.xlsx)",
                                        action: handleDownloadFailedRows,
                                        variant: "outline",
                                    }}
                                />
                            </div>
                        )}

                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => {
                                router.refresh()
                                router.push("/erp/agendamentos")
                            }}>
                                Ver Agendamentos
                            </Button>
                            <Button onClick={() => {
                                setStep("upload")
                                setImportDone(false)
                                setImportStats(null)
                                setParsedAppointments([])
                                setMapping([])
                            }}>
                                Nova Importação
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <FadeIn className="h-full">
            <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={() => step === "upload" ? router.push("/erp/agendamentos") : setStep("upload")} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        {step === "upload" ? "Importar Agendamentos" : step === "mapping" ? "Revisar Mapeamento de Colunas" : fileName}
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        {step === "upload"
                                            ? "Faça upload de uma planilha .xlsx, .xls ou .csv com agendamentos do seu sistema anterior ou controle próprio."
                                            : step === "mapping"
                                                ? `${totalRows} agendamento(s) encontrados - ${mappedCount} de ${headers.length} colunas mapeadas`
                                                : `${totalRows} agendamento(s) prontos para importar`}
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    {step === "mapping" && (
                                        <>
                                            <Button variant="outline" leftIcon={<UploadIcon size={18} />} onClick={() => { setStep("upload"); setParsedAppointments([]); setMapping([]) }}>
                                                Nova planilha
                                            </Button>
                                            <Button onClick={handleMappingConfirm} disabled={uploading || mappedCount === 0 || hasDuplicateMapping}>
                                                {uploading ? <><Spinner /> Aplicando...</> : `Continuar (${mappedCount} campos)`}
                                            </Button>
                                        </>
                                    )}
                                    {step === "preview" && (
                                        <>
                                            <Button variant="outline" onClick={() => setStep("mapping")}>
                                                Voltar ao mapeamento
                                            </Button>
                                            <Button onClick={handleImport} disabled={importing || parsedAppointments.length === 0}>
                                                {importing ? <><Spinner /> Importando...</> : `Importar ${parsedAppointments.length} agendamento(s)`}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="max-w-[1300px] mx-auto w-full px-4 md:px-6 py-6 min-h-[400px]">
                        {step === "upload" && (
                            <div className="max-w-[800px] mx-auto w-full pt-8 flex flex-col gap-6">
                                <div
                                    {...getRootProps()}
                                    className={`cursor-pointer transition-opacity ${uploading ? "opacity-60 pointer-events-none" : ""}`}
                                    onClick={open}
                                >
                                    <input {...getInputProps()} />
                                    {uploading ? (
                                        <IconPlaceholder
                                            placeholderType="default"
                                            icon={Spinner}
                                            title="Lendo e Validando Planilha..."
                                            subtitle="Processando os dados da sua planilha de agendamentos. Aguarde um instante."
                                        />
                                    ) : (
                                        <IconPlaceholder
                                            placeholderType="default"
                                            icon={UploadIcon}
                                            title={isDragActive ? "Solte a planilha aqui..." : "Importar Planilha de Agendamentos"}
                                            subtitle="Arraste o arquivo ou clique para selecionar. Suporta exportações de sistemas como Trinks, Avec, Booksy, Google Calendar, Calendly e Excel/CSV."
                                            buttons={[
                                                { text: "Selecionar Planilha", type: "button", action: open },
                                                {
                                                    text: downloadingTemplate ? "Baixando Modelo..." : "Baixar Planilha Modelo (.xlsx)",
                                                    type: "button",
                                                    variant: "outline",
                                                    action: () => handleDownloadTemplate()
                                                }
                                            ]}
                                        />
                                    )}
                                </div>

                                {/* Template Guidelines Card */}
                                <div className="p-5 rounded-2xl bg-brand-gray/50 dark:bg-dark-surface border border-brand-border dark:border-dark-border">
                                    <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-2 flex items-center gap-2">
                                        💡 Dicas para importar agendamentos com facilidade:
                                    </h3>
                                    <ul className="text-xs text-brand-inactive-text dark:text-dark-body space-y-2 list-disc list-inside">
                                        <li><strong>Campos obrigatórios:</strong> Nome do Cliente, Nome do Serviço, Data e Horário de Início.</li>
                                        <li><strong>Formatos aceitos:</strong> Datas no padrão <code>DD/MM/AAAA</code> (ex: 28/08/2026) e horários no formato <code>HH:MM</code> (ex: 14:30).</li>
                                        <li><strong>Profissionais & Serviços:</strong> Se o nome do profissional coincidir com alguém da sua equipe, será vinculado automaticamente. O mesmo vale para serviços cadastrados!</li>
                                        <li><strong>Duração:</strong> O sistema calcula a duração automaticamente se você informar Horário de Início e Horário de Término.</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {step === "mapping" && (
                            <div className="flex flex-col gap-4">
                                {hasDuplicateMapping && (
                                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
                                        <AlertCircleIcon size={18} className="shrink-0" />
                                        <span>Existem campos do sistema atribuídos a mais de uma coluna da planilha. Por favor, ajuste as duplicadas para prosseguir.</span>
                                    </div>
                                )}

                                {/* Desktop Table View */}
                                <div className="hidden md:block overflow-hidden bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border">
                                    <table className="w-full text-left border-separate border-spacing-0">
                                        <thead>
                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading">Coluna da Planilha</th>
                                                <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading">Campo na Dudit</th>
                                                <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading">Confiança</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mapping.map((col) => (
                                                <MappingRow
                                                    key={col.headerIndex}
                                                    col={col}
                                                    availableFields={availableFields}
                                                    onMappingChange={updateMapping}
                                                    mappedFieldCounts={mappedFieldCounts}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Card List View */}
                                <div className="md:hidden bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border">
                                    {mapping.map((col) => (
                                        <MappingMobileItem
                                            key={col.headerIndex}
                                            col={col}
                                            availableFields={availableFields}
                                            onMappingChange={updateMapping}
                                            mappedFieldCounts={mappedFieldCounts}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {step === "preview" && (
                            <div className="flex flex-col gap-6">
                                {/* Import Options Bar */}
                                <FormSection title="Estratégia para agendamentos no mesmo horário">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <ListItem
                                            left={
                                                <RadioButton
                                                    name="duplicateStrategy"
                                                    value="skip"
                                                    checked={duplicateStrategy === "skip"}
                                                    onChange={() => setDuplicateStrategy("skip")}
                                                />
                                            }
                                            className="px-4 py-3"
                                            title="Ignorar agendamentos duplicados"
                                            description="Mantém o agendamento atual e não altera nada caso já exista um com mesmo cliente, data e horário."
                                            onClick={() => setDuplicateStrategy("skip")}
                                        />
                                        <ListItem
                                            left={
                                                <RadioButton
                                                    name="duplicateStrategy"
                                                    value="update"
                                                    checked={duplicateStrategy === "update"}
                                                    onChange={() => setDuplicateStrategy("update")}
                                                />
                                            }
                                            className="px-4 py-3"
                                            title="Atualizar agendamentos existentes"
                                            description="Sobrescreve os dados do agendamento já existente com as informações mais recentes da planilha."
                                            onClick={() => setDuplicateStrategy("update")}
                                        />
                                    </div>
                                </FormSection>

                                {/* Controls: Search & View Toggle */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <div className="w-full sm:w-80">
                                        <Input
                                            label=""
                                            name="search"
                                            placeholder="Buscar cliente, serviço ou profissional..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            prefix={<SearchIcon size={16} className="text-brand-inactive-text" />}
                                            className="mb-0 h-[40px]"
                                            variant="full-rounded"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                        <span className="text-[13px] text-brand-inactive-text dark:text-dark-body font-medium">
                                            {filteredAppointments.length} agendamento(s)
                                        </span>
                                        <div className="flex items-center border border-brand-border dark:border-dark-border rounded-lg overflow-hidden bg-white dark:bg-dark-surface">
                                            <button
                                                type="button"
                                                onClick={() => setViewMode("list")}
                                                className={`p-2 transition-colors ${viewMode === "list" ? "bg-brand-gray dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text"}`}
                                                title="Visualização em Lista"
                                            >
                                                <ListIcon size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setViewMode("grid")}
                                                className={`p-2 transition-colors ${viewMode === "grid" ? "bg-brand-gray dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-brand-inactive-text"}`}
                                                title="Visualização em Cards"
                                            >
                                                <GridIcon size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Preview Content */}
                                {viewMode === "list" ? (
                                    <div className="relative rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
                                        <div
                                            ref={tableContainerRef}
                                            onScroll={checkScroll}
                                            className="overflow-x-auto w-full"
                                        >
                                            <table className="w-full text-left border-collapse min-w-[900px]">
                                                <thead>
                                                    <tr className="bg-brand-gray/60 dark:bg-dark-border/40 border-b border-brand-border dark:border-dark-border">
                                                        <th className="py-3 pl-6 pr-3 w-12">
                                                            <Checkbox
                                                                checked={selection.size === paginated.length && paginated.length > 0}
                                                                onCheckedChange={() => {
                                                                    if (selection.size === paginated.length) {
                                                                        setSelection(new Set())
                                                                    } else {
                                                                        setSelection(new Set(paginated.map((p) => p.id)))
                                                                    }
                                                                }}
                                                            />
                                                        </th>
                                                        {COLUMNS.map((col) => (
                                                            <th
                                                                key={col.id}
                                                                className={`py-3 px-2 text-[12px] font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body ${col.align === "center" ? "text-center" : "text-left"}`}
                                                                style={{ width: col.width }}
                                                            >
                                                                {col.label}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                                    {paginated.map((item) => (
                                                        <AppointmentPreviewRow
                                                            key={item.id}
                                                            item={item}
                                                            selected={selection.has(item.id)}
                                                            onSelect={(id) => {
                                                                setSelection((prev) => {
                                                                    const next = new Set(prev)
                                                                    if (next.has(id)) next.delete(id)
                                                                    else next.add(id)
                                                                    return next
                                                                })
                                                            }}
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {paginated.map((item) => (
                                            <AppointmentPreviewCard
                                                key={item.id}
                                                item={item}
                                                selected={selection.has(item.id)}
                                                onSelect={(id) => {
                                                    setSelection((prev) => {
                                                        const next = new Set(prev)
                                                        if (next.has(id)) next.delete(id)
                                                        else next.add(id)
                                                        return next
                                                    })
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {totalPages > 1 && (
                                    <div className="flex justify-center mt-2">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile Bottom Action Bar */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md border-t border-brand-border dark:border-dark-border z-40 flex items-center justify-between gap-3">
                    {step === "upload" ? (
                        <Button className="w-full" onClick={open}>
                            Selecionar Planilha
                        </Button>
                    ) : step === "mapping" ? (
                        <>
                            <Button variant="outline" className="flex-1" onClick={() => setStep("upload")}>
                                Voltar
                            </Button>
                            <Button className="flex-1" onClick={handleMappingConfirm} disabled={uploading || mappedCount === 0 || hasDuplicateMapping}>
                                {uploading ? <Spinner /> : "Continuar"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="outline" className="flex-1" onClick={() => setStep("mapping")}>
                                Voltar
                            </Button>
                            <Button className="flex-1" onClick={handleImport} disabled={importing || parsedAppointments.length === 0}>
                                {importing ? <Spinner /> : "Importar"}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </FadeIn>
    )
}
