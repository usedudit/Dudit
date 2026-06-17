"use client"

import { useState, useRef, useCallback } from "react"
import { Button, InfoCard, Badge, Spinner, IconPlaceholder } from "@/components/reusable"
import { UploadIcon, FileVerifiedIcon, FileIcon, AlertTriangleIcon, CheckCircleIcon, CheckIcon, XIcon, SearchIcon, PlusIcon, FileTextIcon, ArrowRightIcon } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import { useMediaQuery } from "@/components/erp/hooks"
import { useRouter } from "next/navigation"
import { uploadXMLAction, confirmImportAction, getImportPreviewAction } from "@/app/actions/erp/xml-import"
import { useStore } from "@/lib/store-context"

interface ImportPreview {
  xml_import_id: string
  status: string
  supplier: { id: string | null; name: string; document: string; documentType: string; isNew: boolean }
  invoice: { chave: string; numero: string; serie: string; data_emissao: string; valor_total: number }
  items: ImportItemPreview[]
}

interface ImportItemPreview {
  id: string
  raw_sku: string
  raw_name: string
  raw_ean: string | null
  raw_ncm: string | null
  raw_cest: string | null
  raw_unit: string
  raw_quantity: number
  raw_unit_cost: number
  raw_weight_gross: number | null
  raw_weight_net: number | null
  raw_width: number | null
  raw_height: number | null
  raw_length: number | null
  match_status: string
  matched_product_id: string | null
  matched_product_name: string | null
  match_method: string | null
  match_confidence: number | null
  conflicts: any[] | null
}

interface RecentImport {
  id: string
  access_key: string
  invoice_number: string
  invoice_series: string
  supplier_name: string
  status: string
  items_count: number
  imported_items: number
  skipped_items: number
  created_at: string
}

type PageStep = "upload" | "preview" | "confirming" | "done"

interface XmlImportPageContentProps {
  partnerId: string
  recentImports: RecentImport[]
}

export function XmlImportPageContent({ partnerId, recentImports }: XmlImportPageContentProps) {
  const [step, setStep] = useState<PageStep>("upload")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationInfo, setValidationInfo] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { selectedStore } = useStore()
  const storeId = selectedStore?.id || ""
  const isMobile = useMediaQuery("(max-width: 768px)")
  const { success, error: notifyError } = useNotification()
  const router = useRouter()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.endsWith(".xml")) {
        notifyError("Arquivo inválido", "Selecione um arquivo XML da NF-e.")
        return
      }
      setSelectedFile(file)
      setError(null)
      setValidationInfo(null)
    }
  }

  const triggerFileSelect = () => fileInputRef.current?.click()

  const handleUpload = async () => {
    if (!selectedFile) return
    setIsUploading(true)
    setError(null)

    try {
      const content = await selectedFile.text()
      const result = await uploadXMLAction(content, partnerId, storeId)

      if (!result.success) {
        if (result.validation?.docsMatch === false) {
          setError("O CPF/CNPJ do XML não corresponde ao seu cadastro. Verifique se a nota é sua.")
          setValidationInfo(result.validation)
        } else {
          setError(result.error || "Erro ao processar XML")
        }
        setIsUploading(false)
        return
      }

      if (result.preview) {
        setPreview(result.preview)
        setStep("preview")
      }
    } catch (err: any) {
      setError(err.message || "Erro ao processar arquivo")
    } finally {
      setIsUploading(false)
    }
  }

  if (step === "preview" && preview) {
    return (
      <XmlPreviewPage
        preview={preview}
        partnerId={partnerId}
        storeId={storeId}
        onBack={() => {
          setStep("upload")
          setPreview(null)
          setSelectedFile(null)
        }}
        onComplete={() => {
          setStep("upload")
          setPreview(null)
          setSelectedFile(null)
          success("Importação concluída!", "Os produtos foram importados com sucesso.")
          router.refresh()
        }}
      />
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Upload Area */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
        <div className="p-6 pb-4 border-b border-brand-border dark:border-dark-border">
          <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Upload de XML</h2>
          <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
            Faça upload do arquivo XML da NF-e para importar os produtos
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div
            className={`border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center min-h-[220px] cursor-pointer hover:border-brand-green/50 ${
              selectedFile
                ? "border-brand-green bg-brand-green-light/50 dark:bg-emerald-900/20"
                : "border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-background/50"
            }`}
            onClick={triggerFileSelect}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!selectedFile ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-brand-green-light dark:bg-emerald-900/30 flex items-center justify-center">
                  <UploadIcon className="w-6 h-6 text-brand-green dark:text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Clique para selecionar o XML</p>
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Ou arraste e solte o arquivo</p>
                </div>
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); triggerFileSelect() }}>
                  Selecionar arquivo
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-brand-green-light dark:bg-emerald-900/30 flex items-center justify-center">
                  <FileVerifiedIcon className="w-6 h-6 text-brand-green dark:text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{selectedFile.name}</p>
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}>
                  Remover
                </Button>
              </div>
            )}
          </div>

          {error && (
            <InfoCard color="red" title="Erro" message={error} />
          )}

          {validationInfo && validationInfo.docsMatch === false && (
            <InfoCard color="orange" title="Documento não confere" message="O CPF/CNPJ do destinatário no XML difere do seu cadastro. A importação não pode prosseguir." />
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setSelectedFile(null); setError(null) }} disabled={isUploading}>
              Limpar
            </Button>
            <Button onClick={handleUpload} disabled={!selectedFile || isUploading}>
              {isUploading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="w-4 h-4" /> Processando...
                </span>
              ) : (
                "Importar"
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Imports */}
      {recentImports.length > 0 && (
        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
          <div className="p-6 pb-4 border-b border-brand-border dark:border-dark-border">
            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Importações Recentes</h2>
          </div>
          <div className="divide-y divide-brand-border dark:divide-dark-border">
            {recentImports.map((imp) => (
              <div key={imp.id} className="p-4 flex items-center justify-between hover:bg-brand-gray dark:hover:bg-dark-background/50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    imp.status === "completed" ? "bg-brand-green-light dark:bg-emerald-900/30" :
                    imp.status === "failed" ? "bg-red-50 dark:bg-red-900/20" :
                    "bg-brand-gray dark:bg-dark-background"
                  }`}>
                    {imp.status === "completed" ? (
                      <CheckCircleIcon className="w-5 h-5 text-brand-green dark:text-emerald-400" />
                    ) : imp.status === "failed" ? (
                      <AlertTriangleIcon className="w-5 h-5 text-brand-red dark:text-red-400" />
                    ) : (
                      <FileIcon className="w-5 h-5 text-brand-inactive-text" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                      NF-e {imp.invoice_number || imp.access_key?.slice(-8)}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                      {imp.supplier_name || "Fornecedor não identificado"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                    {imp.imported_items || 0}/{imp.items_count || 0} itens
                  </span>
                  <Badge variant={imp.status === "completed" ? "green" : imp.status === "failed" ? "red" : "orange"}>
                    {imp.status === "completed" ? "Importado" : imp.status === "failed" ? "Erro" : imp.status === "preview" ? "Pendente" : imp.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Preview Page ───────────────────────────────────────────────────────────

function XmlPreviewPage({
  preview,
  partnerId,
  storeId,
  onBack,
  onComplete,
}: {
  preview: ImportPreview
  partnerId: string
  storeId: string
  onBack: () => void
  onComplete: () => void
}) {
  const [decisions, setDecisions] = useState<Record<string, {
    decision: string
    stock_action: string
    cost_action: string
    update_fields?: string[]
  }>>({})
  const [isConfirming, setIsConfirming] = useState(false)
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const isMobile = useMediaQuery("(max-width: 768px)")
  const { success, error: notifyError } = useNotification()

  const getItemDecision = (itemId: string) => {
    return decisions[itemId] || {
      decision: "keep_product" as const,
      stock_action: "add" as const,
      cost_action: "update" as const,
    }
  }

  const updateDecision = (itemId: string, updates: Partial<typeof decisions[string]>) => {
    setDecisions((prev) => ({
      ...prev,
      [itemId]: { ...getItemDecision(itemId), ...updates },
    }))
  }

  const handleConfirm = async () => {
    setIsConfirming(true)

    const decisionsArray: Array<{
      item_id: string
      decision: "keep_product" | "update_fields" | "create_product" | "ignore"
      product_id?: string
      stock_action: "add" | "weighted_average" | "ignore"
      cost_action: "update" | "weighted_average" | "ignore"
      decision_data?: { update_fields: string[] }
    }> = preview.items.map((item) => {
      const d = getItemDecision(item.id)
      return {
        item_id: item.id,
        decision: d.decision as any,
        product_id: item.matched_product_id || undefined,
        stock_action: d.stock_action as any,
        cost_action: d.cost_action as any,
        decision_data: d.update_fields ? { update_fields: d.update_fields } : undefined,
      }
    })

    const result = await confirmImportAction(preview.xml_import_id, partnerId, storeId, decisionsArray)

    if (result.success) {
      success("Importação concluída!", `${result.imported} produto(s) importados.`)
      onComplete()
    } else {
      notifyError("Erro na importação", result.error || "Falha ao processar")
    }

    setIsConfirming(false)
  }

  const matchedCount = preview.items.filter((i) => i.match_status === "matched" && getItemDecision(i.id).decision !== "ignore").length
  const newCount = preview.items.filter((i) => getItemDecision(i.id).decision === "create_product").length
  const skippedCount = preview.items.filter((i) => getItemDecision(i.id).decision === "ignore").length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
        <div className="p-6 pb-4 border-b border-brand-border dark:border-dark-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Preview da Importação</h2>
              <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                Revise os itens antes de confirmar a importação
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onBack}>
              Voltar
            </Button>
          </div>
        </div>

        {/* Supplier & Invoice Info */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">Fornecedor</p>
            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{preview.supplier.name}</p>
            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
              {preview.supplier.documentType === "cnpj" ? "CNPJ" : "CPF"}: {preview.supplier.document}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">Nota Fiscal</p>
            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
              NF-e {preview.invoice.numero}{preview.invoice.serie ? ` (Série ${preview.invoice.serie})` : ""}
            </p>
            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
              Chave: {preview.invoice.chave}
            </p>
            {preview.invoice.valor_total > 0 && (
              <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                Valor total: R$ {preview.invoice.valor_total.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="px-6 pb-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-green-light dark:bg-emerald-900/20">
            <CheckIcon className="w-4 h-4 text-brand-green" />
            <span className="text-xs font-bold text-brand-green">{matchedCount} match</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <PlusIcon className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-blue-600">{newCount} novo(s)</span>
          </div>
          {skippedCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-gray dark:bg-dark-background">
              <XIcon className="w-4 h-4 text-brand-inactive-text" />
              <span className="text-xs font-bold text-brand-inactive-text">{skippedCount} ignorado(s)</span>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3">
        {preview.items.map((item) => {
          const decision = getItemDecision(item.id)
          const isSimilar = item.match_status === "similar"
          const isMatched = item.match_status === "matched"
          const isNew = item.match_status === "new"

          return (
            <div
              key={item.id}
              className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden"
            >
              {/* Item Header */}
              <div className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {isNew ? (
                    <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                      <PlusIcon className="w-5 h-5 text-blue-600" />
                    </div>
                  ) : isSimilar ? (
                    <div className="w-9 h-9 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center shrink-0">
                      <AlertTriangleIcon className="w-5 h-5 text-yellow-600" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-brand-green-light dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                      <CheckIcon className="w-5 h-5 text-brand-green" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{item.raw_name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                      {item.raw_sku && <span className="text-xs text-brand-inactive-text">SKU: {item.raw_sku}</span>}
                      {item.raw_ean && <span className="text-xs text-brand-inactive-text">EAN: {item.raw_ean}</span>}
                      {item.raw_ncm && <span className="text-xs text-brand-inactive-text">NCM: {item.raw_ncm}</span>}
                      <span className="text-xs text-brand-inactive-text">Qtd: {item.raw_quantity}</span>
                      <span className="text-xs text-brand-inactive-text">Custo: R$ {item.raw_unit_cost.toFixed(4)}</span>
                      {item.raw_unit && <span className="text-xs text-brand-inactive-text">Un: {item.raw_unit}</span>}
                    </div>
                    {isSimilar && item.conflicts && item.conflicts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {item.conflicts.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="font-bold text-brand-dark dark:text-dark-heading">{c.campo}:</span>
                            <span className="text-yellow-600 dark:text-yellow-400 line-through">{c.valor_atual}</span>
                            <ArrowRightIcon className="w-3 h-3 text-brand-inactive-text" />
                            <span className="text-brand-green dark:text-emerald-400">{c.valor_xml}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <Badge variant={isNew ? "blue" : isSimilar ? "orange" : "green"}>
                  {isNew ? "Novo" : isSimilar ? "Conflito" : "Match"}
                </Badge>
              </div>

              {/* Item Actions */}
              <div className="px-4 pb-4 space-y-3">
                {/* Match Status Radio */}
                <div className="flex flex-wrap gap-2">
                  {isMatched && (
                    <Button
                      variant={decision.decision === "keep_product" ? "filled" : "outline"}
                      size="sm"
                      onClick={() => updateDecision(item.id, { decision: "keep_product" })}
                    >
                      Manter produto
                    </Button>
                  )}
                  {isSimilar && (
                    <>
                      <Button
                        variant={decision.decision === "keep_product" ? "filled" : "outline"}
                        size="sm"
                        onClick={() => updateDecision(item.id, { decision: "keep_product" })}
                      >
                        Manter cadastro
                      </Button>
                      <Button
                        variant={decision.decision === "update_fields" ? "filled" : "outline"}
                        size="sm"
                        onClick={() => {
                          const conflictFields = item.conflicts?.map((c: any) => c.campo) || []
                          updateDecision(item.id, { decision: "update_fields", update_fields: conflictFields })
                        }}
                      >
                        Atualizar campos
                      </Button>
                    </>
                  )}
                  <Button
                    variant={decision.decision === "create_product" ? "filled" : "outline"}
                    size="sm"
                    onClick={() => updateDecision(item.id, { decision: "create_product" })}
                  >
                    Criar novo
                  </Button>
                  <Button
                    variant={decision.decision === "ignore" ? "filled" : "outline"}
                    size="sm"
                    onClick={() => updateDecision(item.id, { decision: "ignore" })}
                  >
                    Ignorar
                  </Button>
                </div>

                {decision.decision !== "ignore" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* Stock Action */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${decision.decision === "ignore" ? "text-brand-inactive-text" : "text-brand-dark dark:text-dark-heading"}`}>
                        Estoque:
                      </span>
                      <select
                        value={decision.stock_action}
                        onChange={(e) => updateDecision(item.id, { stock_action: e.target.value as any })}
                        className="text-xs border border-brand-border dark:border-dark-border rounded-lg px-2 py-1 bg-transparent text-brand-dark dark:text-dark-heading"
                      >
                        <option value="add">Somar</option>
                        <option value="weighted_average">Média ponderada</option>
                        <option value="ignore">Não alterar</option>
                      </select>
                    </div>

                    {/* Cost Action */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${decision.decision === "ignore" ? "text-brand-inactive-text" : "text-brand-dark dark:text-dark-heading"}`}>
                        Custo:
                      </span>
                      <select
                        value={decision.cost_action}
                        onChange={(e) => updateDecision(item.id, { cost_action: e.target.value as any })}
                        className="text-xs border border-brand-border dark:border-dark-border rounded-lg px-2 py-1 bg-transparent text-brand-dark dark:text-dark-heading"
                      >
                        <option value="update">Atualizar</option>
                        <option value="weighted_average">Média ponderada</option>
                        <option value="ignore">Não alterar</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirm Button */}
      <div className="sticky bottom-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="text-sm text-brand-inactive-text dark:text-dark-body">
            {preview.items.length} item(ns) | {matchedCount} match(es) | {newCount} novo(s)
          </div>
          <Button onClick={handleConfirm} disabled={isConfirming} size="lg">
            {isConfirming ? (
              <span className="flex items-center gap-2">
                <Spinner className="w-4 h-4" /> Importando...
              </span>
            ) : (
              "Confirmar Importação"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
