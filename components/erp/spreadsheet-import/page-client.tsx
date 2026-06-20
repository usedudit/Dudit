"use client"

import React, { useState, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import { useDropzone } from "react-dropzone"
import { Button, Badge, Spinner, InfoCard, FormSection } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import { FadeIn } from "@/components/animations/FadeIn"
import { useNotification } from "@/hooks/use-notification"
import { useStore } from "@/lib/store-context"
import {
  UploadIcon,
  FileIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  AlertCircleIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  XIcon,
} from "@/lib/icons"
import {
  uploadPlanilhaAction,
  previewImportAction,
  confirmImportAction,
  listImportsAction,
} from "@/app/actions/erp/spreadsheet-import"
import type { EntityType, ColumnMapping } from "@/lib/erp/import/types"

const MappingDropdown = dynamic(
  () => import("./MappingDropdown").then((m) => m.MappingDropdown),
  { ssr: false },
)

type Step = "upload" | "mapping" | "preview" | "done"

const ENTITY_OPTIONS: { value: EntityType; label: string; desc: string }[] = [
  { value: "products", label: "Produtos", desc: "Nome, SKU, preço, estoque, NCM..." },
  { value: "customers", label: "Clientes", desc: "Nome, CPF, telefone, endereço..." },
  { value: "services", label: "Serviços", desc: "Nome, preço, duração, categoria..." },
]

const STATUS_META: Record<string, { label: string; variant: "green" | "red" | "gray" | "orange" }> = {
  completed: { label: "Importado", variant: "green" },
  failed: { label: "Erro", variant: "red" },
  processing: { label: "Processando", variant: "orange" },
}

interface ImportPageClientProps {
  partnerId: string
  initialImports: any[]
}

export function ImportPageClient({ partnerId, initialImports }: ImportPageClientProps) {
  const { selectedStore } = useStore()
  const storeId = selectedStore?.id || ""
  const { success: notifySuccess, error: notifyError } = useNotification()

  const [step, setStep] = useState<Step>("upload")
  const [entityType, setEntityType] = useState<EntityType | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [fileName, setFileName] = useState("")
  const [mapping, setMapping] = useState<ColumnMapping[]>([])
  const [preview, setPreview] = useState<any>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [imports, setImports] = useState<any[]>(initialImports)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [skipErrors, setSkipErrors] = useState(true)

  const handleFile = useCallback(async (file: File) => {
    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("partnerId", partnerId)
    formData.append("storeId", storeId)
    if (entityType) formData.append("entityType", entityType)

    const result = await uploadPlanilhaAction(formData)

    if (!result.success) {
      notifyError(result.error || "Erro ao fazer upload")
      setUploading(false)
      return
    }

    setSessionId(result.sessionId!)
    setEntityType(result.entityType!)
    setHeaders(result.headers!)
    setTotalRows(result.totalRows!)
    setFileName(result.fileName!)
    setMapping(result.suggestedMapping!)
    setUploading(false)
    setStep("mapping")
  }, [partnerId, storeId, entityType, notifyError])

  const handlePreview = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    const result = await previewImportAction(sessionId, partnerId, mapping)
    if (!result.success) {
      notifyError(result.error || "Erro ao gerar preview")
      setLoading(false)
      return
    }
    setPreview(result.preview)
    setLoading(false)
    setStep("preview")
  }, [sessionId, partnerId, mapping, notifyError])

  const handleConfirm = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    const result = await confirmImportAction(sessionId, partnerId, mapping, {
      skipDuplicates,
      skipErrors,
    })
    if (!result.success) {
      notifyError(result.error || "Erro ao importar")
      setLoading(false)
      return
    }
    setImportResult(result.result)
    notifySuccess(`${result.result.successRows} registros importados!`)
    setLoading(false)
    setStep("done")

    const refreshed = await listImportsAction(partnerId, 10)
    if (refreshed.success) setImports(refreshed.imports || [])
  }, [sessionId, partnerId, mapping, skipDuplicates, skipErrors, notifyError, notifySuccess])

  const reset = useCallback(() => {
    setStep("upload")
    setSessionId(null)
    setHeaders([])
    setTotalRows(0)
    setFileName("")
    setMapping([])
    setPreview(null)
    setImportResult(null)
  }, [])

  const updateMapping = useCallback((index: number, field: string | null, isCustom: boolean, label: string) => {
    setMapping((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, field, isCustom, fieldLabel: label, confidence: field ? 1 : 0 } : m,
      ),
    )
  }, [])

  return (
    <FadeIn className="p-4 max-w-4xl mx-auto">
      {step === "upload" && (
        <UploadStep
          entityType={entityType}
          setEntityType={setEntityType}
          onFile={handleFile}
          uploading={uploading}
        />
      )}

      {step === "mapping" && (
        <MappingStep
          headers={headers}
          mapping={mapping}
          totalRows={totalRows}
          fileName={fileName}
          entityType={entityType!}
          onUpdateMapping={updateMapping}
          onBack={() => setStep("upload")}
          onContinue={handlePreview}
          loading={loading}
        />
      )}

      {step === "preview" && preview && (
        <PreviewStep
          preview={preview}
          totalRows={totalRows}
          entityType={entityType!}
          skipDuplicates={skipDuplicates}
          skipErrors={skipErrors}
          onSkipDuplicatesChange={setSkipDuplicates}
          onSkipErrorsChange={setSkipErrors}
          onBack={() => setStep("mapping")}
          onConfirm={handleConfirm}
          loading={loading}
        />
      )}

      {step === "done" && importResult && (
        <DoneStep
          result={importResult}
          totalRows={totalRows}
          onNewImport={reset}
        />
      )}

      <div className="mt-8">
        <ImportHistoryList imports={imports} />
      </div>
    </FadeIn>
  )
}

function UploadStep({
  entityType,
  setEntityType,
  onFile,
  uploading,
}: {
  entityType: EntityType | null
  setEntityType: (v: EntityType | null) => void
  onFile: (file: File) => void
  uploading: boolean
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFile(accepted[0])
    },
    [onFile],
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
    disabled: uploading,
  })

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Importar Planilha</h1>
      <p className="text-sm text-gray-500 mb-6">
        Selecione o tipo de dados e faça upload de um arquivo .xlsx, .xls ou .csv
      </p>

      <div className="flex gap-3 mb-6">
        {ENTITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setEntityType(entityType === opt.value ? null : opt.value)}
            className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${
              entityType === opt.value
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <div className="font-medium text-sm">{opt.label}</div>
            <div className="text-xs text-gray-400 mt-1">{opt.desc}</div>
          </button>
        ))}
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
          isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        onClick={open}
      >
        <input {...getInputProps()} />
        <UploadIcon className="w-10 h-10 mx-auto mb-3 text-gray-400" />
        {isDragActive ? (
          <p className="text-gray-600">Solte o arquivo aqui...</p>
        ) : (
          <>
            <p className="text-gray-600 font-medium">Arraste o arquivo ou clique para selecionar</p>
            <p className="text-xs text-gray-400 mt-2">.xlsx .xls .csv — até 10 MB e 2.000 linhas</p>
          </>
        )}
      </div>

      {uploading && (
        <div className="flex items-center justify-center gap-2 mt-4 text-gray-500">
          <Spinner />
          <span>Lendo arquivo...</span>
        </div>
      )}
    </div>
  )
}

function MappingStep({
  headers,
  mapping,
  totalRows,
  fileName,
  entityType,
  onUpdateMapping,
  onBack,
  onContinue,
  loading,
}: {
  headers: string[]
  mapping: ColumnMapping[]
  totalRows: number
  fileName: string
  entityType: EntityType
  onUpdateMapping: (index: number, field: string | null, isCustom: boolean, label: string) => void
  onBack: () => void
  onContinue: () => void
  loading: boolean
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Revisar Mapeamento</h1>
          <p className="text-sm text-gray-500">
            {fileName} — {totalRows} linha{totalRows !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left p-3 font-medium text-gray-600 w-1/3">Coluna da Planilha</th>
              <th className="text-center p-3 font-medium text-gray-600 w-16"></th>
              <th className="text-left p-3 font-medium text-gray-600 w-1/3">Campo Dudit</th>
              <th className="text-center p-3 font-medium text-gray-600 w-24">Confiança</th>
            </tr>
          </thead>
          <tbody>
            {mapping.map((col, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-3 font-medium">{col.header}</td>
                <td className="p-3 text-center text-gray-400">
                  <ChevronRightIcon className="w-4 h-4 inline" />
                </td>
                <td className="p-3">
                  <MappingDropdown
                    currentField={col.field}
                    currentLabel={col.fieldLabel || "Especificação"}
                    isCustom={col.isCustom}
                    entityType={entityType}
                    onChange={(field, isCustom, label) => onUpdateMapping(i, field, isCustom, label)}
                  />
                </td>
                <td className="p-3 text-center">
                  {col.isCustom ? (
                    <Badge variant="gray">Novo</Badge>
                  ) : col.confidence >= 0.8 ? (
                    <Badge variant="green">Alta</Badge>
                  ) : col.confidence >= 0.5 ? (
                    <Badge variant="orange">Média</Badge>
                  ) : (
                    <Badge variant="red">Baixa</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onContinue} disabled={loading}>
          {loading ? <><Spinner /> Validando...</> : "Continuar"}
        </Button>
      </div>
    </div>
  )
}

function PreviewStep({
  preview,
  totalRows,
  entityType,
  skipDuplicates,
  skipErrors,
  onSkipDuplicatesChange,
  onSkipErrorsChange,
  onBack,
  onConfirm,
  loading,
}: {
  preview: any
  totalRows: number
  entityType: EntityType
  skipDuplicates: boolean
  skipErrors: boolean
  onSkipDuplicatesChange: (v: boolean) => void
  onSkipErrorsChange: (v: boolean) => void
  onBack: () => void
  onConfirm: () => void
  loading: boolean
}) {
  const hasIssues = preview.errorRows > 0 || preview.duplicateRows > 0

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Prévia da Importação</h1>

      <div className="flex gap-3 mb-6">
        <SummaryCard label="Total" value={totalRows} color="gray" />
        <SummaryCard label="Válidos" value={preview.validRows} color="green" />
        {preview.errorRows > 0 && <SummaryCard label="Erros" value={preview.errorRows} color="red" />}
        {preview.duplicateRows > 0 && <SummaryCard label="Duplicados" value={preview.duplicateRows} color="orange" />}
        {preview.warningRows > 0 && <SummaryCard label="Alertas" value={preview.warningRows} color="yellow" />}
      </div>

      {preview.unknownCategories?.length > 0 && (
        <InfoCard
          color="yellow"
          className="mb-4"
          message={
            <>
              <div className="font-medium mb-1">Categorias não encontradas</div>
              <div className="text-sm">{preview.unknownCategories.join(", ")}</div>
              <div className="text-xs mt-1">
                As categorias acima não existem no sistema. Os produtos serão importados sem categoria.
                Crie as categorias em "Cadastros de Produtos" antes de importar.
              </div>
            </>
          }
        />
      )}

      {preview.unknownSuppliers?.length > 0 && (
        <InfoCard
          color="yellow"
          className="mb-4"
          message={
            <>
              <div className="font-medium mb-1">Fornecedores não encontrados</div>
              {preview.unknownSuppliers.map((s: any) => (
                <div key={s.name} className="text-sm">
                  {s.name} — presente em {s.rows.length} linha(s)
                </div>
              ))}
              <div className="text-xs mt-1">
                Os fornecedores acima não existem no sistema. Crie-os em "Fornecedores" antes de importar.
              </div>
            </>
          }
        />
      )}

      {preview.errors?.length > 0 && (
        <div className="mb-4">
          <InfoCard
            color="red"
            message={
              <>
                <div className="font-medium mb-1">Erros encontrados</div>
                {preview.errors.slice(0, 10).map((e: any, i: number) => (
                  <div key={i} className="text-sm">
                    Linha {e.row}: {e.message}
                  </div>
                ))}
                {preview.errors.length > 10 && (
                  <div className="text-sm mt-1">...e mais {preview.errors.length - 10} erro(s)</div>
                )}
              </>
            }
          />
        </div>
      )}

      {preview.sampleRows?.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Amostra dos primeiros registros</h3>
          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {Object.keys(preview.sampleRows[0] || {}).map((key) => (
                    <th key={key} className="p-2 text-left font-medium text-gray-500 whitespace-nowrap">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sampleRows.map((row: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    {Object.values(row).map((val: any, j: number) => (
                      <td key={j} className="p-2 text-gray-700 truncate max-w-[200px]">
                        {val || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Opções de importação</h3>
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => onSkipDuplicatesChange(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">
            Pular registros duplicados ({preview.duplicateRows})
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={skipErrors}
            onChange={(e) => onSkipErrorsChange(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">
            Pular registros com erro ({preview.errorRows})
          </span>
        </label>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onConfirm} disabled={loading || preview.validRows === 0}>
          {loading ? (
            <><Spinner /> Importando...</>
          ) : (
            `Importar ${preview.validRows} registro${preview.validRows !== 1 ? "s" : ""}`
          )}
        </Button>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: "green" | "red" | "orange" | "gray" | "yellow"
}) {
  const colors: Record<string, string> = {
    green: "bg-green-50 border-green-200 text-green-700",
    red: "bg-red-50 border-red-200 text-red-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    gray: "bg-gray-50 border-gray-200 text-gray-700",
  }
  return (
    <div className={`flex-1 p-3 rounded-lg border text-center ${colors[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  )
}

function DoneStep({
  result,
  totalRows,
  onNewImport,
}: {
  result: any
  totalRows: number
  onNewImport: () => void
}) {
  return (
    <div className="text-center py-12">
      <CheckCircleIcon className="w-16 h-16 mx-auto mb-4 text-green-500" />
      <h1 className="text-xl font-semibold mb-2">Importação concluída!</h1>
      <p className="text-gray-500 mb-6">
        {result.successRows} de {totalRows} registros importados com sucesso
      </p>

      <div className="flex justify-center gap-6 mb-8">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{result.successRows}</div>
          <div className="text-xs text-gray-500">Importados</div>
        </div>
        {result.duplicateRows > 0 && (
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-500">{result.duplicateRows}</div>
            <div className="text-xs text-gray-500">Duplicados</div>
          </div>
        )}
        {result.errorRows > 0 && (
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{result.errorRows}</div>
            <div className="text-xs text-gray-500">Erros</div>
          </div>
        )}
      </div>

      <Button onClick={onNewImport}>Nova Importação</Button>
    </div>
  )
}

function ImportHistoryList({ imports }: { imports: any[] }) {
  if (imports.length === 0) return null

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Importações Recentes</h2>
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left p-3 font-medium text-gray-600">Arquivo</th>
              <th className="text-left p-3 font-medium text-gray-600">Tipo</th>
              <th className="text-right p-3 font-medium text-gray-600">Registros</th>
              <th className="text-center p-3 font-medium text-gray-600">Status</th>
              <th className="text-right p-3 font-medium text-gray-600">Data</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((imp: any) => {
              const meta = STATUS_META[imp.status] || { label: imp.status, variant: "gray" as const }
              const typeLabel =
                imp.entity_type === "products"
                  ? "Produtos"
                  : imp.entity_type === "customers"
                    ? "Clientes"
                    : "Serviços"
              return (
                <tr key={imp.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{imp.file_name}</td>
                  <td className="p-3 text-gray-500">{typeLabel}</td>
                  <td className="p-3 text-right">
                    {imp.success_rows}/{imp.total_rows}
                    {imp.warnings_count > 0 && (
                      <span className="text-yellow-500 ml-1">⚠{imp.warnings_count}</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </td>
                  <td className="p-3 text-right text-gray-500 text-xs">
                    {new Date(imp.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
