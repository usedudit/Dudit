"use client"

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, Checkbox, Spinner, SelectionBanner, Pagination, IconPlaceholder, Badge, Combobox, FormSection, Input, ListItem, RadioButton, InfoCard } from "@/components/reusable"
import { ChevronLeftIcon, UploadIcon, CheckCircleIcon, DownloadIcon, AlertCircleIcon, SearchIcon, GridIcon, ListIcon } from "@/lib/icons"
import { useDropzone } from "react-dropzone"
import { useNotification } from "@/hooks/use-notification"
import { useStore } from "@/lib/store-context"
import type { Product } from "@/lib/types/product"
import {
    uploadPlanilhaAction,
    confirmImportAction,
    applyMappingAction,
    downloadImportTemplateAction,
    downloadFailedRowsAction,
} from "@/app/actions/erp/spreadsheet-import"
import type { ColumnMapping, FailedRow } from "@/lib/erp/import/types"
import ProductListItem from "./ProductListRow"
import ProductGridCard from "./ProductGridCard"
import { FadeIn } from "@/components/animations/FadeIn"

type ColumnId = "name" | "category" | "price" | "stock" | "status" | "actions" | "gtin" | "unit" | "ncm" | "brand" | "visibility"

interface ColumnDef {
    id: ColumnId
    label: string
    align?: "left" | "center" | "right"
    width: string
    minWidth?: string
}

const FIXED_COLUMNS: ColumnDef[] = [
    { id: "name", label: "Produto", align: "left", width: "300px" },
    { id: "category", label: "Categoria", align: "left", width: "130px", minWidth: "120px" },
    { id: "brand", label: "Marca", align: "left", width: "110px", minWidth: "100px" },
    { id: "stock", label: "Estoque", align: "left", width: "160px", minWidth: "140px" },
    { id: "price", label: "Preço", align: "left", width: "110px", minWidth: "100px" },
    { id: "visibility", label: "Visibilidade", align: "center", width: "90px", minWidth: "90px" },
    { id: "status", label: "Status", align: "center", width: "90px", minWidth: "90px" },
    { id: "actions", label: "Ações", align: "center", width: "70px", minWidth: "70px" },
]

const ITEMS_PER_PAGE = 25

interface FieldOption {
    name: string
    label: string
    required?: boolean
    type?: string
    example?: string
}

interface ImportProductsPageProps {
    partnerId: string
}

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
                                Exemplo: {col.sampleValues.slice(0, 2).join(", ")}
                            </span>
                        )}
                    </div>
                </div>
            </td>
            <td className="py-4 px-4 align-middle">
                <div className="flex flex-col gap-1 w-full max-w-xs">
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
                    <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                ) : (
                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body italic">Ignorado</span>
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

export function ImportProductsPage({ partnerId }: ImportProductsPageProps) {
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
    const [parsedProducts, setParsedProducts] = useState<Product[]>([])

    // Options
    const [duplicateStrategy, setDuplicateStrategy] = useState<"update" | "skip">("update")
    const [autoCreateCategories, setAutoCreateCategories] = useState(true)
    const [autoCreateBrands, setAutoCreateBrands] = useState(true)
    const [autoCreateSuppliers, setAutoCreateSuppliers] = useState(true)

    // Import completion stats
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
    const [activeTab, setActiveTab] = useState<"all" | "normal" | "low" | "out_of_stock" | "archived">("all")

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
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, parsedProducts])

    // Download template
    const handleDownloadTemplate = useCallback(async () => {
        try {
            setDownloadingTemplate(true)
            const res = await downloadImportTemplateAction("products")
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
            anchor.download = res.filename || "modelo-importacao-produtos.xlsx"
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
            const res = await downloadFailedRowsAction("products", headers, importStats.failedRows)
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
            anchor.download = res.filename || "falhas-importacao-produtos.xlsx"
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
            formData.append("entityType", "products")
            formData.append("partnerId", partnerId)
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
            setHeaders(result.headers || [])
            setTotalRows(result.totalRows || 0)
            setFileName(result.fileName || file.name)
            setMapping(result.suggestedMapping || [])
            setAvailableFields(result.availableFields || [])
            setParsedProducts(result.previewProducts || [])
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
        setMapping((prev) =>
            prev.map((m) =>
                m.headerIndex === headerIndex
                    ? {
                        ...m,
                        field: newField,
                        fieldLabel: availableFields.find((f) => f.name === newField)?.label || newField || undefined,
                        isCustom: false,
                        confidence: newField ? 1.0 : 0,
                    }
                    : m,
            ),
        )
    }, [availableFields])

    const mappedFieldCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const m of mapping) {
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

        setParsedProducts(result.previewProducts || [])
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
            autoCreateCategories,
            autoCreateBrands,
            autoCreateSuppliers,
            skipErrors: true,
        })

        if (!result.success && !result.result) {
            notifyError(result.error || "Erro ao importar dados.")
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
    }, [sessionId, partnerId, mapping, duplicateStrategy, autoCreateCategories, autoCreateBrands, autoCreateSuppliers, notifyError])

    const filteredProducts = useMemo(() => {
        let items = parsedProducts
        if (search) {
            const q = search.toLowerCase()
            items = items.filter((p: any) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
        }
        return items
    }, [parsedProducts, search])

    const paginated = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredProducts.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredProducts, page])

    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE)
    const mappedCount = mapping.filter((m) => m.field).length

    if (importDone && importStats) {
        return (
            <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="mx-auto w-full pt-8 flex flex-col h-full overflow-y-auto px-4 max-w-[800px]">
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <IconPlaceholder
                            icon={CheckCircleIcon}
                            title='Importação Processada!'
                            subtitle={`Processamos ${totalRows} linhas da sua planilha em ${(importStats.durationMs / 1000).toFixed(1)}s.`}
                            buttons={[
                                { text: "Voltar", action: "/erp/produtos", variant: "outline" },
                                {
                                    text: "Nova Importação", action: () => {
                                        setStep("upload")
                                        setImportDone(false)
                                        setImportStats(null)
                                        setParsedProducts([])
                                        setMapping([])
                                    }
                                }]}
                        />

                        {/* Breakdown Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full mb-8">
                            <InfoCard
                                title="Novos Criados"
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
                                title="Com Erro"
                                message={importStats.errorRows}
                                color="red"
                            />
                        </div>

                        {/* Error Download if any */}
                        {importStats.failedRows.length > 0 && (
                            <>
                                <IconPlaceholder
                                    icon={AlertCircleIcon}
                                    title={`${importStats.failedRows.length} linhas não puderam ser importadas`}
                                    subtitle="Atenção, algumas linhas não puderam ser importadas. Baixe o relatório de falhas para obter mais detalhes."
                                    itemButton={{
                                        text: downloadingFailedRows ? "Gerando..." : "Baixar Relatório de Falhas", action: handleDownloadFailedRows, variant: "outline"
                                    }}
                                />
                            </>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => router.push("/erp/produtos")}>
                                Ver Produtos no ERP
                            </Button>
                            <Button onClick={() => {
                                setStep("upload")
                                setImportDone(false)
                                setImportStats(null)
                                setParsedProducts([])
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
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={() => step === "upload" ? router.push("/erp/produtos") : setStep("upload")} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        {step === "upload" ? "Importar Produtos" : step === "mapping" ? "Revisar Mapeamento de Colunas" : fileName}
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        {step === "upload"
                                            ? "Faça upload de uma planilha .xlsx, .xls ou .csv com produtos."
                                            : step === "mapping"
                                                ? `${totalRows} produto(s) encontrados - ${mappedCount} de ${headers.length} colunas mapeadas`
                                                : `${totalRows} produto(s) prontos para importar`}
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    {step === "mapping" && (
                                        <>
                                            <Button variant="outline" leftIcon={<UploadIcon size={18} />} onClick={() => { setStep("upload"); setParsedProducts([]); setMapping([]) }}>
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
                                            <Button onClick={handleImport} disabled={importing || parsedProducts.length === 0}>
                                                {importing ? <><Spinner /> Importando...</> : `Importar ${parsedProducts.length} produto(s)`}
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
                                            subtitle="Processando os dados da sua planilha de produtos com alta velocidade. Aguarde um instante."
                                        />
                                    ) : (
                                        <IconPlaceholder
                                            placeholderType="default"
                                            icon={UploadIcon}
                                            title={isDragActive ? "Solte a planilha aqui..." : "Importar Planilha de Produtos"}
                                            subtitle="Arraste o arquivo ou clique para selecionar. Suporta .xlsx, .xls ou .csv (até 10 MB e 2.000 linhas)."
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
                                        💡 Dicas para uma importação perfeita:
                                    </h3>
                                    <ul className="text-xs text-brand-inactive-text dark:text-dark-body space-y-1.5 list-disc list-inside">
                                        <li><strong>Campos obrigatórios:</strong> Nome do Produto e Preço de Venda.</li>
                                        <li><strong>Identificador único:</strong> O campo SKU é usado para evitar duplicidade ou atualizar produtos existentes.</li>
                                        <li><strong>Planilha Modelo:</strong> Contém exemplos reais e listas suspensas (dropdown) no Excel para status, unidades e condições.</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {step === "mapping" && (
                            <div className="flex flex-col gap-4">
                                {hasDuplicateMapping && (
                                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
                                        <AlertCircleIcon size={18} className="shrink-0" />
                                        <span>Existem campos do sistema atribuídos a mais de uma coluna da planilha. Por favor, desmarque as duplicadas para prosseguir.</span>
                                    </div>
                                )}

                                {/* Desktop Table View */}
                                <div className="hidden md:block overflow-hidden bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border">
                                    <table className="w-full text-left border-separate border-spacing-0">
                                        <thead>
                                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading">Coluna da Planilha</th>
                                                <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading">Campo no Sistema</th>
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
                                <FormSection title="Estratégia para produtos existentes (mesmo SKU)">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <ListItem
                                            left={
                                                <RadioButton
                                                    name="duplicateStrategy"
                                                    value="update"
                                                    checked={duplicateStrategy === "update"}
                                                    onChange={() => setDuplicateStrategy("update")}
                                                />
                                            }
                                            title="Atualizar dados existentes"
                                            description="Atualiza preços, estoques e dados de produtos já cadastrados"
                                            onClick={() => setDuplicateStrategy("update")}
                                            className={duplicateStrategy === "update" ? "!border-brand-dark/40 dark:!border-white/40 shadow-xs" : ""}
                                        />
                                        <ListItem
                                            left={
                                                <RadioButton
                                                    name="duplicateStrategy"
                                                    value="skip"
                                                    checked={duplicateStrategy === "skip"}
                                                    onChange={() => setDuplicateStrategy("skip")}
                                                />
                                            }
                                            title="Ignorar existentes"
                                            description="Mantém os produtos existentes sem realizar qualquer alteração"
                                            onClick={() => setDuplicateStrategy("skip")}
                                            className={duplicateStrategy === "skip" ? "!border-brand-dark/40 dark:!border-white/40 shadow-xs" : ""}
                                        />
                                    </div>

                                    <div className="pt-2">
                                        <label className="flex items-center gap-2 cursor-pointer text-brand-dark dark:text-dark-heading text-xs font-medium">
                                            <Checkbox
                                                checked={autoCreateCategories}
                                                onCheckedChange={(c) => setAutoCreateCategories(!!c)}
                                            />
                                            <span>Cadastrar marcas novas automaticamente</span>
                                        </label>
                                    </div>
                                </FormSection>

                                <div className="flex-none flex items-center justify-between gap-4 flex-wrap">
                                    <div className="w-80">
                                        <Input
                                            name="search"
                                            placeholder="Buscar produtos importados..."
                                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className="h-[42px]"
                                            variant="full-rounded"
                                            label=""
                                        />
                                    </div>
                                    <div className="flex items-center gap-1 bg-brand-gray/60 dark:bg-dark-border/40 p-1 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => setViewMode("list")}
                                            className={`p-2 rounded-lg transition-colors ${viewMode === "list" ? "bg-white dark:bg-dark-surface shadow-xs text-brand-primary" : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"}`}
                                            title="Visualização em Lista"
                                        >
                                            <ListIcon size={18} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setViewMode("grid")}
                                            className={`p-2 rounded-lg transition-colors ${viewMode === "grid" ? "bg-white dark:bg-dark-surface shadow-xs text-brand-primary" : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"}`}
                                            title="Visualização em Grade"
                                        >
                                            <GridIcon size={18} />
                                        </button>
                                    </div>
                                </div>

                                {filteredProducts.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <IconPlaceholder
                                            placeholderType="image"
                                            imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                                            imageAlt="Nenhum produto encontrado"
                                            title="Nenhum produto encontrado"
                                            subtitle="Parece que a planilha não tem esse produto. Verifique se você digitou corretamente."
                                        />
                                    </div>
                                ) : (
                                    <div className="flex-1">
                                        <SelectionBanner
                                            selectedCount={selection.size}
                                            totalCount={filteredProducts.length}
                                            onSelectAll={() => setSelection(new Set(filteredProducts.map((p: any) => p.id)))}
                                            onClearSelection={() => setSelection(new Set())}
                                            itemName="produtos"
                                            singularItemName="produto"
                                        />

                                        {viewMode === "grid" ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                {paginated.map((product: any) => (
                                                    <ProductGridCard
                                                        key={product.id}
                                                        product={product}
                                                        selected={selection.has(product.id)}
                                                        onSelect={() => setSelection((prev) => {
                                                            const next = new Set(prev)
                                                            next.has(product.id) ? next.delete(product.id) : next.add(product.id)
                                                            return next
                                                        })}
                                                        onEdit={() => { }}
                                                        onDetails={() => { }}
                                                        onDelete={() => { }}
                                                        onDuplicate={() => { }}
                                                        onShare={() => { }}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <>
                                                {/* Mobile/Tablet Card Grid */}
                                                <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
                                                    {paginated.map((product: any) => (
                                                        <ProductGridCard
                                                            key={product.id}
                                                            product={product}
                                                            selected={selection.has(product.id)}
                                                            onSelect={() => setSelection((prev) => {
                                                                const next = new Set(prev)
                                                                next.has(product.id) ? next.delete(product.id) : next.add(product.id)
                                                                return next
                                                            })}
                                                            onEdit={() => { }}
                                                            onDetails={() => { }}
                                                            onDelete={() => { }}
                                                            onDuplicate={() => { }}
                                                            onShare={() => { }}
                                                        />
                                                    ))}
                                                </div>

                                                {/* Desktop Table View */}
                                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                                    <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                    <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                    <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                            <thead>
                                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                    <th className="py-3 pl-6 pr-3 w-12 bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">
                                                                        <Checkbox
                                                                            checked={selection.size === paginated.length && paginated.length > 0}
                                                                            onCheckedChange={(checked) => {
                                                                                if (checked) {
                                                                                    setSelection((prev) => {
                                                                                        const next = new Set(prev)
                                                                                        paginated.forEach((p: any) => next.add(p.id))
                                                                                        return next
                                                                                    })
                                                                                } else {
                                                                                    setSelection((prev) => {
                                                                                        const next = new Set(prev)
                                                                                        paginated.forEach((p: any) => next.delete(p.id))
                                                                                        return next
                                                                                    })
                                                                                }
                                                                            }}
                                                                            className="bg-white dark:bg-dark-background"
                                                                        />
                                                                    </th>
                                                                    {FIXED_COLUMNS.map((col) => (
                                                                        <th
                                                                            key={col.id}
                                                                            className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                                                                } ${col.id === "actions" ? "rounded-r-lg" : ""}`}
                                                                            style={{ width: col.width, minWidth: col.minWidth }}
                                                                        >
                                                                            <span>{col.label}</span>
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {paginated.map((product: any) => (
                                                                    <ProductListItem
                                                                        key={product.id}
                                                                        product={product}
                                                                        columns={FIXED_COLUMNS}
                                                                        selected={selection.has(product.id)}
                                                                        onSelect={(id) => setSelection((prev) => {
                                                                            const next = new Set(prev)
                                                                            next.has(id) ? next.delete(id) : next.add(id)
                                                                            return next
                                                                        })}
                                                                        onEdit={() => { }}
                                                                        onDetails={() => { }}
                                                                        onDelete={() => { }}
                                                                        onDuplicate={() => { }}
                                                                        onShare={() => { }}
                                                                        suppliers={[]}
                                                                    />
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        <div className="flex justify-center py-4">
                                            <Pagination
                                                currentPage={page}
                                                totalPages={totalPages}
                                                onPageChange={setPage}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Mobile Bottom Action Bar */}
            {step === "upload" && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                    <Button
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={handleDownloadTemplate}
                        disabled={downloadingTemplate}
                    >
                        <DownloadIcon className="w-[18px] h-[18px]" /> {downloadingTemplate ? "Baixando..." : "Baixar Modelo"}
                    </Button>
                    <Button
                        onClick={open}
                        className="flex-1 h-12"
                    >
                        <UploadIcon className="w-[18px] h-[18px]" /> Selecionar
                    </Button>
                </div>
            )}

            {step === "mapping" && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                    <Button
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={() => { setStep("upload"); setParsedProducts([]); setMapping([]) }}
                    >
                        <UploadIcon className="w-[18px] h-[18px]" /> Nova planilha
                    </Button>
                    <Button
                        onClick={handleMappingConfirm}
                        disabled={uploading || mappedCount === 0 || hasDuplicateMapping}
                        className="flex-1 h-12"
                    >
                        {uploading ? <><Spinner /> Aplicando...</> : `Continuar (${mappedCount} campos)`}
                    </Button>
                </div>
            )}

            {step === "preview" && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                    <Button
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={() => setStep("mapping")}
                    >
                        Voltar
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={importing || parsedProducts.length === 0}
                        className="flex-1 h-12"
                    >
                        {importing ? <><Spinner /> Importando...</> : `Importar ${parsedProducts.length} prod.`}
                    </Button>
                </div>
            )}
        </FadeIn>
    )
}

export default ImportProductsPage
