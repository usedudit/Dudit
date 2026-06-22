"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, Checkbox, Spinner, SelectionBanner, Pagination, IconPlaceholder, Badge, Input, FormDropdown } from "@/components/reusable"
import { ChevronLeftIcon, UploadIcon, CheckCircleIcon, SearchIcon } from "@/lib/icons"
import { useDropzone } from "react-dropzone"
import { useNotification } from "@/hooks/use-notification"
import { uploadPlanilhaAction, confirmImportAction, applyMappingAction } from "@/app/actions/erp/spreadsheet-import"
import type { ColumnMapping } from "@/lib/erp/import/types"
import { FadeIn } from "@/components/animations/FadeIn"

interface FieldOption {
    name: string
    label: string
    required?: boolean
}

interface ImportCustomersPageProps {
    partnerId: string
}

const COLUMNS = [
    { id: "name", label: "Cliente / E-mail", align: "left" as const, width: "300px" },
    { id: "phone", label: "Telefone", align: "left" as const, width: "150px" },
    { id: "cpf_cnpj", label: "CPF/CNPJ", align: "left" as const, width: "150px" },
    { id: "location", label: "Localização", align: "left" as const, width: "200px" },
    { id: "status", label: "Status", align: "center" as const, width: "90px" },
]

const ITEMS_PER_PAGE = 25

function MappingRow({
    col,
    availableFields,
    onMappingChange
}: {
    col: any
    availableFields: FieldOption[]
    onMappingChange: (headerIndex: number, newField: string | null) => void
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

    return (
        <tr className="hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors">
            <td className="py-4 px-4 align-middle">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                            {col.headerIndex + 1}
                        </span>
                    </div>
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                        {col.header}
                    </span>
                </div>
            </td>
            <td className="py-4 px-4 align-middle">
                <div className="w-full max-w-xs">
                    <FormDropdown
                        value={col.field || ""}
                        setValue={(newVal) => onMappingChange(col.headerIndex, newVal || null)}
                        options={[
                            { value: "", label: "— Não importar —" },
                            ...availableFields.map((f) => ({
                                value: f.name,
                                label: `${f.label}${f.required ? " *" : ""}`,
                            })),
                        ]}
                        placeholder="— Não importar —"
                    />
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
    onMappingChange
}: {
    col: any
    availableFields: FieldOption[]
    onMappingChange: (headerIndex: number, newField: string | null) => void
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

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <span className="text-[10px] font-bold text-brand-dark dark:text-dark-heading">
                            {col.headerIndex + 1}
                        </span>
                    </div>
                    <h4 className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                        {col.header}
                    </h4>
                </div>
                {col.field ? (
                    <Badge variant={badgeVariant}>{badgeLabel}</Badge>
                ) : (
                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body italic">Ignorado</span>
                )}
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase font-bold tracking-wider">Campo no Sistema</span>
                <FormDropdown
                    value={col.field || ""}
                    setValue={(newVal) => onMappingChange(col.headerIndex, newVal || null)}
                    options={[
                        { value: "", label: "— Não importar —" },
                        ...availableFields.map((f) => ({
                            value: f.name,
                            label: `${f.label}${f.required ? " *" : ""}`,
                        })),
                    ]}
                    placeholder="— Não importar —"
                />
            </div>
        </div>
    )
}

function CustomerPreviewRow({
    customer,
    selected,
    onSelect,
}: {
    customer: any
    selected: boolean
    onSelect: (id: string) => void
}) {
    return (
        <tr className="border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors">
            <td className="py-4 pl-6 pr-3 align-middle w-12">
                <Checkbox
                    checked={selected}
                    onCheckedChange={() => onSelect(customer.id)}
                    className="bg-white dark:bg-dark-background"
                />
            </td>
            <td className="py-4 px-3 align-middle">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading text-sm">
                        {customer.name?.charAt(0).toUpperCase() || "C"}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-[200px]">
                            {customer.name}
                        </span>
                        {customer.email && (
                            <span className="text-[11px] text-brand-inactive-text dark:text-dark-body truncate max-w-[200px]">
                                {customer.email}
                            </span>
                        )}
                    </div>
                </div>
            </td>
            <td className="py-4 px-3 align-middle">
                <span className="text-[13px] text-brand-dark dark:text-dark-heading font-medium">
                    {customer.phone || "—"}
                </span>
            </td>
            <td className="py-4 px-3 align-middle">
                <span className="text-[13px] text-brand-dark dark:text-dark-heading font-medium">
                    {customer.cpf || customer.cnpj || "—"}
                </span>
            </td>
            <td className="py-4 px-3 align-middle">
                <span className="text-[13px] text-brand-inactive-text dark:text-dark-body">
                    {customer.city ? `${customer.city}${customer.state ? ` / ${customer.state}` : ""}` : "—"}
                </span>
            </td>
            <td className="py-4 px-3 align-middle text-center">
                <Badge variant="green">Ativo</Badge>
            </td>
        </tr>
    )
}

export function ImportCustomersPage({ partnerId }: ImportCustomersPageProps) {
    const router = useRouter()
    const { error: notifyError, success: notifySuccess } = useNotification()

    const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload")
    const [uploading, setUploading] = useState(false)
    const [importing, setImporting] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [parsedCustomers, setParsedCustomers] = useState<any[]>([])
    const [totalRows, setTotalRows] = useState(0)
    const [mapping, setMapping] = useState<ColumnMapping[]>([])
    const [fileName, setFileName] = useState("")
    const [availableFields, setAvailableFields] = useState<FieldOption[]>([])
    const [headers, setHeaders] = useState<string[]>([])

    const [page, setPage] = useState(1)
    const [search, setSearch] = useState("")
    const [selection, setSelection] = useState<Set<string>>(new Set())
    const [importDone, setImportDone] = useState(false)
    const [importCount, setImportCount] = useState(0)

    const [scrollState, setScrollState] = useState({ left: false, right: false })
    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState((prev) => {
            const nextLeft = scrollLeft > 0
            const nextRight = scrollLeft < scrollWidth - clientWidth - 2
            if (prev.left === nextLeft && prev.right === nextRight) return prev
            return { left: nextLeft, right: nextRight }
        })
    }, [])

    useEffect(() => {
        if (step === "preview" && parsedCustomers.length > 0) {
            const timer = setTimeout(checkScroll, 50)
            window.addEventListener("resize", checkScroll)
            return () => {
                clearTimeout(timer)
                window.removeEventListener("resize", checkScroll)
            }
        }
    }, [checkScroll, step, parsedCustomers])

    const onDrop = useCallback(async (accepted: File[]) => {
        const file = accepted[0]
        if (!file) return
        setUploading(true)

        const formData = new FormData()
        formData.append("file", file)
        formData.append("partnerId", partnerId)
        formData.append("entityType", "customers")

        const result = await uploadPlanilhaAction(formData)

        if (!result.success) {
            notifyError(result.error || "Erro ao processar arquivo")
            setUploading(false)
            return
        }

        setSessionId(result.sessionId!)
        setTotalRows(result.totalRows!)
        setFileName(result.fileName!)
        setHeaders(result.headers!)
        setMapping(structuredClone(result.suggestedMapping!))
        setAvailableFields(result.availableFields || [])
        setParsedCustomers(result.previewProducts || []) // Generic preview list returned in action
        setSelection(new Set())
        setPage(1)
        setSearch("")
        setUploading(false)
        setStep("mapping")
    }, [partnerId, notifyError])

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
                    ? { ...m, field: newField, fieldLabel: availableFields.find((f) => f.name === newField)?.label || newField || undefined, isCustom: false, confidence: newField ? 1.0 : 0 }
                    : m,
            ),
        )
    }, [availableFields])

    const handleMappingConfirm = useCallback(async () => {
        if (!sessionId) return
        setUploading(true)
        const result = await applyMappingAction(sessionId, partnerId, mapping)
        if (!result.success) {
            notifyError(result.error || "Erro ao aplicar mapeamento")
            setUploading(false)
            return
        }
        setParsedCustomers(result.previewProducts || [])
        setPage(1)
        setSearch("")
        setSelection(new Set())
        setUploading(false)
        setStep("preview")
    }, [sessionId, partnerId, mapping, notifyError])

    const handleImport = useCallback(async () => {
        if (!sessionId) return
        setImporting(true)
        const result = await confirmImportAction(sessionId, partnerId, mapping, {
            skipDuplicates: true,
            skipErrors: true,
        })
        if (!result.success) {
            notifyError(result.error || "Erro ao importar")
            setImporting(false)
            return
        }
        setImportCount(result.result.successRows)
        setImportDone(true)
        setImporting(false)
    }, [sessionId, partnerId, mapping, notifyError])

    const filteredCustomers = useMemo(() => {
        let items = parsedCustomers
        if (search) {
            const q = search.toLowerCase()
            items = items.filter((c: any) => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q))
        }
        return items
    }, [parsedCustomers, search])

    const paginated = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredCustomers.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredCustomers, page])

    const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE)

    const mappedCount = mapping.filter((m) => m.field).length

    if (importDone) {
        return (
            <div className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                        <CheckCircleIcon className="w-16 h-16 text-green-500 mb-4" />
                        <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">Importação concluída!</h2>
                        <p className="text-brand-inactive-text dark:text-dark-body mb-6">
                            {importCount} de {totalRows} cliente(s) importados com sucesso.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => router.push("/erp/customers")}>
                                Ver Clientes
                            </Button>
                            <Button onClick={() => { setStep("upload"); setImportDone(false); setParsedCustomers([]); setMapping([]) }}>
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
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">

                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={() => step === "upload" ? router.push("/erp/customers") : setStep("upload")} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        {step === "upload" ? "Importar Clientes" : step === "mapping" ? "Revisar Mapeamento" : fileName}
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        {step === "upload"
                                            ? "Faça upload de uma planilha .xlsx, .xls ou .csv com clientes."
                                            : step === "mapping"
                                                ? `${totalRows} cliente(s) encontrados — ${mappedCount} de ${headers.length} colunas mapeadas`
                                                : `${totalRows} cliente(s) encontrados`}
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    {step === "mapping" && (
                                        <>
                                            <Button variant="outline" leftIcon={<UploadIcon size={18} />} onClick={() => { setStep("upload"); setParsedCustomers([]); setMapping([]) }}>
                                                Nova planilha
                                            </Button>
                                            <Button onClick={handleMappingConfirm} disabled={uploading || mappedCount === 0}>
                                                {uploading ? <><Spinner /> Aplicando...</> : `Continuar (${mappedCount} campos)`}
                                            </Button>
                                        </>
                                    )}
                                    {step === "preview" && (
                                        <>
                                            <Button variant="outline" onClick={() => setStep("mapping")}>
                                                Voltar ao mapeamento
                                            </Button>
                                            <Button onClick={handleImport} disabled={importing || parsedCustomers.length === 0}>
                                                {importing ? <><Spinner /> Importando...</> : `Importar ${parsedCustomers.length} cliente(s)`}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="max-w-[1300px] mx-auto w-full px-4 md:px-6 py-6 min-h-[400px]">
                {step === "upload" && (
                    <div className="max-w-[800px] mx-auto w-full pt-8">
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
                                    title="Lendo Planilha..."
                                    subtitle="Processando os dados da sua planilha de clientes. Aguarde um instante."
                                />
                            ) : (
                                <IconPlaceholder
                                    placeholderType="default"
                                    icon={UploadIcon}
                                    title={isDragActive ? "Solte a planilha aqui..." : "Importar Planilha de Clientes"}
                                    subtitle="Arraste o arquivo ou clique para selecionar. Suporta .xlsx, .xls ou .csv (até 10 MB e 2.000 linhas)."
                                    itemButton={{
                                        text: "Selecionar Planilha",
                                        type: "button",
                                        action: open,
                                        variant: "default"
                                    }}
                                />
                            )}
                        </div>
                    </div>
                )}

                {step === "mapping" && (
                    <div>
                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-hidden bg-white dark:bg-dark-surface">
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                        <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading rounded-l-lg bg-brand-gray dark:bg-dark-border/50">Coluna da Planilha</th>
                                        <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading bg-brand-gray dark:bg-dark-border/50">Campo no Sistema</th>
                                        <th className="py-3 px-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading rounded-r-lg bg-brand-gray dark:bg-dark-border/50">Confiança</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mapping.map((col) => (
                                        <MappingRow
                                            key={col.headerIndex}
                                            col={col}
                                            availableFields={availableFields}
                                            onMappingChange={updateMapping}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card List View */}
                        <div className="md:hidden bg-white dark:bg-dark-surface">
                            {mapping.map((col) => (
                                <MappingMobileItem
                                    key={col.headerIndex}
                                    col={col}
                                    availableFields={availableFields}
                                    onMappingChange={updateMapping}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {step === "preview" && (
                    <div className="flex flex-col overflow-hidden">
                        <div className="flex-none mb-6">
                            <div className="w-80">
                                <Input
                                    name="search"
                                    placeholder="Buscar clientes importados..."
                                    prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="h-[42px]"
                                    variant="full-rounded"
                                    label=""
                                />
                            </div>
                        </div>

                        {filteredCustomers.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-brand-inactive-text dark:text-dark-body text-sm py-12">
                                Nenhum cliente encontrado
                            </div>
                        ) : (
                            <div className="flex-1">
                                <SelectionBanner
                                    selectedCount={selection.size}
                                    totalCount={filteredCustomers.length}
                                    onSelectAll={() => setSelection(new Set(filteredCustomers.map((c: any) => c.id)))}
                                    onClearSelection={() => setSelection(new Set())}
                                    itemName="clientes"
                                    singularItemName="cliente"
                                />

                                <div className="w-full overflow-hidden rounded-xl relative">
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
                                                                        paginated.forEach((c: any) => next.add(c.id))
                                                                        return next
                                                                    })
                                                                } else {
                                                                    setSelection((prev) => {
                                                                        const next = new Set(prev)
                                                                        paginated.forEach((c: any) => next.delete(c.id))
                                                                        return next
                                                                    })
                                                                }
                                                            }}
                                                            className="bg-white dark:bg-dark-background"
                                                        />
                                                    </th>
                                                    {COLUMNS.map((col) => (
                                                        <th
                                                            key={col.id}
                                                            className={`py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "center" ? "text-center" : "text-left"
                                                                } ${col.id === "status" ? "rounded-r-lg" : ""}`}
                                                            style={{ width: col.width }}
                                                        >
                                                            <span>{col.label}</span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginated.map((customer: any) => (
                                                    <CustomerPreviewRow
                                                        key={customer.id}
                                                        customer={customer}
                                                        selected={selection.has(customer.id)}
                                                        onSelect={(id) => setSelection((prev) => {
                                                            const next = new Set(prev)
                                                            next.has(id) ? next.delete(id) : next.add(id)
                                                            return next
                                                        })}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

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

            {/* Mobile Bottom Action Bar */}
            {
                step === "mapping" && (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <Button
                            variant="outline"
                            className="flex-1 h-12"
                            onClick={() => { setStep("upload"); setParsedCustomers([]); setMapping([]) }}
                        >
                            <UploadIcon className="w-[18px] h-[18px]" /> Nova planilha
                        </Button>
                        <Button
                            onClick={handleMappingConfirm}
                            disabled={uploading || mappedCount === 0}
                            className="flex-1 h-12"
                        >
                            {uploading ? <><Spinner /> Aplicando...</> : `Continuar (${mappedCount} campos)`}
                        </Button>
                    </div>
                )
            }

            {
                step === "preview" && (
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
                            disabled={importing || parsedCustomers.length === 0}
                            className="flex-1 h-12"
                        >
                            {importing ? <><Spinner /> Importando...</> : `Importar ${parsedCustomers.length} cli.`}
                        </Button>
                    </div>
                )
            }
        </FadeIn >
    )
}

