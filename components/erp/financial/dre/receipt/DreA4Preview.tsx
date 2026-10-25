"use client"

import { useMemo } from "react"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  QUOTE_PREVIEW_PRIMARY_COLOR,
  QUOTE_PREVIEW_SECONDARY_COLOR,
} from "@/lib/quotes/quote-preview-theme"
import type { DreReportData, DreRegime, DreNode } from "@/lib/services/dre.service"
import { ReceiptA4Document, ReceiptA4Page, ReceiptStoreHeaderA4, ReceiptA4StoreData, ReceiptA4Footer } from "@/components/erp/orders/receipt/ReceiptComponents"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"

interface DreA4PreviewProps {
  report: DreReportData
  regime: DreRegime
  startDate: string
  endDate: string
  storeName: string
  showSubItems?: boolean
  showComparison?: boolean
  showKpiSummary?: boolean
  showSignatures?: boolean
  printMode?: boolean
  primaryColor?: string
  secondaryColor?: string
  partnerHeader?: SaleReceiptPartnerHeader
}

function translateType(type: "income" | "expense" | "subtotal" | "result" | "item"): string {
  switch (type) {
    case "income":
      return "Receita"
    case "expense":
      return "Despesa / Custo"
    case "subtotal":
      return "Subtotal"
    case "result":
      return "Resultado Líquido"
    case "item":
      return "Item Detalhado"
    default:
      return type
  }
}

function getNodeRowHeight(node: DreNode, showSubItems: boolean): number {
  const SUBITEM_HEIGHT = 32
  const ROW_HEIGHT = 40
  if (!showSubItems) return ROW_HEIGHT
  return ROW_HEIGHT + (node.items?.length || 0) * SUBITEM_HEIGHT
}

export function DreA4Preview({
  report,
  regime,
  startDate,
  endDate,
  storeName,
  showSubItems = true,
  showComparison = true,
  showKpiSummary = true,
  showSignatures = true,
  printMode = false,
  primaryColor: requestedPrimaryColor,
  secondaryColor: requestedSecondaryColor,
  partnerHeader,
}: DreA4PreviewProps) {
  const primary = requestedPrimaryColor || QUOTE_PREVIEW_PRIMARY_COLOR
  const secondary = requestedSecondaryColor || QUOTE_PREVIEW_SECONDARY_COLOR
  const partnerName = report.companyInfo?.partnerName || "Empresa Parceira"
  const partnerAvatar = report.companyInfo?.partnerAvatar
  const kpis = report.kpis
  const documentNumber = report.companyInfo?.documentNumber
  const documentType = report.companyInfo?.documentType
  const resolvedHeader: SaleReceiptPartnerHeader = partnerHeader ?? {
    fantasyName: partnerName,
    legalName: report.companyInfo?.tradeName || partnerName,
    addressLine: "",
    taxIdLine: documentNumber ? `${documentType === "cpf" ? "CPF" : "CNPJ"}: ${documentNumber}` : "",
    phone: "",
  }

  const pages = useMemo(() => {
    const ROW_HEIGHT = 40
    const TOTALS_SECTION_HEIGHT = showKpiSummary ? 200 : 0
    const SIGNATURES_HEIGHT = showSignatures ? 160 : 0
    const FOOTER_HEIGHT = 40
    const TABLE_HEADER_HEIGHT = 40

    const P1_FIXED_CONTENT_HEIGHT = 160 + 200 + 80 + TABLE_HEADER_HEIGHT
    const P1_TOTAL_AVAILABLE_HEIGHT = 1123
    const P1_AVAILABLE_FOR_ROWS = P1_TOTAL_AVAILABLE_HEIGHT - P1_FIXED_CONTENT_HEIGHT - FOOTER_HEIGHT

    const PN_FIXED_CONTENT_HEIGHT = TABLE_HEADER_HEIGHT
    const PN_AVAILABLE_FOR_ROWS = P1_TOTAL_AVAILABLE_HEIGHT - PN_FIXED_CONTENT_HEIGHT - FOOTER_HEIGHT - TOTALS_SECTION_HEIGHT - SIGNATURES_HEIGHT

    const nodes = Object.values(report.structure)

    const chunks: { nodes: DreNode[]; type: "first" | "middle" }[] = []
    let remainingNodes = [...nodes]

    const requiredHeightAllOnP1 = nodes.reduce((h, n) => h + getNodeRowHeight(n, showSubItems), 0) + TOTALS_SECTION_HEIGHT + SIGNATURES_HEIGHT
    if (requiredHeightAllOnP1 <= P1_AVAILABLE_FOR_ROWS) {
      chunks.push({ nodes: remainingNodes, type: "first" })
      return chunks
    }

    const maxItemsP1 = Math.max(1, Math.floor(P1_AVAILABLE_FOR_ROWS / ROW_HEIGHT))
    let accumulated = 0
    let itemCount = 0
    for (const n of remainingNodes) {
      const h = getNodeRowHeight(n, showSubItems)
      if (accumulated + h > P1_AVAILABLE_FOR_ROWS && itemCount > 0) break
      accumulated += h
      itemCount++
    }
    itemCount = Math.max(1, itemCount)
    chunks.push({ nodes: remainingNodes.slice(0, itemCount), type: "first" })
    remainingNodes = remainingNodes.slice(itemCount)

    while (remainingNodes.length > 0) {
      let accumulatedPn = 0
      let pnItemCount = 0
      for (const n of remainingNodes) {
        const h = getNodeRowHeight(n, showSubItems)
        if (accumulatedPn + h > PN_AVAILABLE_FOR_ROWS && pnItemCount > 0) break
        accumulatedPn += h
        pnItemCount++
      }
      pnItemCount = Math.max(1, pnItemCount)
      chunks.push({ nodes: remainingNodes.slice(0, pnItemCount), type: "middle" })
      remainingNodes = remainingNodes.slice(pnItemCount)
    }

    if (chunks.length === 0) {
      chunks.push({ nodes, type: "first" })
    }

    return chunks
  }, [report.structure, showSubItems, showKpiSummary, showSignatures])

  const renderDreTable = (nodes: DreNode[]) => (
    <>
      {/* ── 3. Tabela Principal da DRE ─────────────────────────────────── */}
      <div className="px-8 pb-4">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead>
            <tr className="bg-brand-gray/40">
              <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">
                Estrutura / Conta Contábil
              </th>
              <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center w-24 border-b border-gray-100">
                Tipo
              </th>
              <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-28 border-b border-gray-100">
                Atual (R$)
              </th>
              <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-16 border-b border-gray-100">
                AV (%)
              </th>
              {showComparison && (
                <>
                  <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-24 border-b border-gray-100">
                    Anterior (R$)
                  </th>
                  <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-16 rounded-tr-xl border-b border-gray-100">
                    AH (%)
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <DreA4TableRow
                key={node.key}
                node={node}
                showSubItems={showSubItems}
                showComparison={showComparison}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )

  const isLastPage = (index: number) => index === pages.length - 1

  return (
    <ReceiptA4Document printMode={printMode} printClassName="dre-a4-print">
      {pages.map((page, pageIndex) => (
        <ReceiptA4Page key={pageIndex} printMode={printMode}>
          <ReceiptStoreHeaderA4
            partnerName={partnerName}
            partnerAvatar={partnerAvatar}
            primaryColor={primary}
            secondaryColor={secondary}
            title="Demonstração do Resultado"
            subtitle={`Período: ${formatDate(startDate)} até ${formatDate(endDate)} • Regime de ${regime === "competencia" ? "Competência" : "Caixa"}`}
          />

          <div className="flex-1 flex flex-col">
            {page.type === "first" && (
              <>
                {/* ── 2. Metadados e Informações Institucionais ────────────────────── */}
                <div className="px-8 py-6">
                  <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-6 w-full">
                    <div className="flex flex-col">
                      <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Empresa</span>
                      <span className="font-bold text-sm text-brand-dark">{partnerName}</span>
                      {documentNumber && (
                        <span className="text-[10px] text-gray-500">
                          {documentType === "cpf" ? "CPF" : "CNPJ"}: {documentNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Unidade / Loja</span>
                      <span className="font-bold text-sm text-brand-dark">{storeName}</span>
                      <span className="text-[10px] text-gray-500">{report.companyInfo?.taxRegimeLabel}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Emissão / Gerado em</span>
                      <span className="font-bold text-sm text-brand-dark">{report.companyInfo?.generatedAt}</span>
                      <span className="text-[10px] text-gray-500">Base 100%: {formatCurrency(kpis?.grossRevenue || 0)}</span>
                    </div>
                  </div>
                </div>

                <ReceiptA4StoreData
                  partnerHeader={resolvedHeader}
                  partnerName={partnerName}
                />
              </>
            )}

            {renderDreTable(page.nodes)}

            {isLastPage(pageIndex) && (
              <>
                {/* ── 4. Resumo de Indicadores e Margens Contábeis ────────────────── */}
                {showKpiSummary && kpis && (
                  <div className="px-8 pb-4">
                    <div className="bg-brand-gray/40 p-6 rounded-2xl text-black">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-2">
                        Resumo de Margens e Indicadores Operacionais
                      </h4>
                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="bg-white p-2.5 rounded-md border border-gray-200/60">
                          <span className="text-[10px] text-gray-500 font-medium block">Receita Líquida</span>
                          <span className="font-bold text-xs text-brand-dark">{formatCurrency(kpis.netRevenue)}</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-md border border-gray-200/60">
                          <span className="text-[10px] text-gray-500 font-medium block">Margem Bruta</span>
                          <span className="font-bold text-xs text-brand-dark">{kpis.grossMarginPercent}%</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-md border border-gray-200/60">
                          <span className="text-[10px] text-gray-500 font-medium block">Margem EBITDA</span>
                          <span className="font-bold text-xs text-brand-dark">{kpis.ebitdaMarginPercent}%</span>
                        </div>
                        <div className="bg-white p-2.5 rounded-md border border-gray-200/60">
                          <span className="text-[10px] text-gray-500 font-medium block">Margem Líquida</span>
                          <span className="font-bold text-xs text-brand-green">{kpis.netMarginPercent}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 5. Bloco de Assinaturas Formais Contábeis ─────────────────────── */}
                {showSignatures && (
                  <div className="px-8 pt-8 pb-16">
                    <div className="grid grid-cols-2 gap-12 text-center text-xs text-gray-800">
                      <div className="border-t border-gray-400 pt-2">
                        <p className="font-bold text-brand-dark text-xs">{partnerName}</p>
                        <p className="text-[10px] text-gray-600">Representante Legal / Sócio Administrador</p>
                      </div>
                      <div className="border-t border-gray-400 pt-2">
                        <p className="font-bold text-brand-dark text-xs">Responsável Contábil</p>
                        <p className="text-[10px] text-gray-600">CRC / Contador Responsável</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {!isLastPage(pageIndex) && <div className="mt-auto" />}

            {/* ── Rodapé Oficial Dudit ───────────────────────────────────────── */}
            <ReceiptA4Footer primaryColor={primary} />
          </div>
        </ReceiptA4Page>
      ))}
    </ReceiptA4Document>
  )
}

function DreA4TableRow({
  node,
  showSubItems,
  showComparison,
}: {
  node: DreNode
  showSubItems: boolean
  showComparison: boolean
}) {
  const isResult = node.type === "result"
  const isSubtotal = node.type === "subtotal"
  const hasItems = node.items && node.items.length > 0

  const getRowBg = () => {
    if (isResult) return "bg-[#E8F5E9] font-bold border-t border-b-2 border-brand-green"
    if (isSubtotal) return "bg-brand-gray/50 font-bold border-t border-b border-gray-200"
    return "border-b border-gray-100"
  }

  const getAmountColor = () => {
    if (isResult) return node.amount >= 0 ? "text-brand-green font-bold" : "text-[#cc4745] font-bold"
    if (node.type === "expense") return "text-[#cc4745]"
    if (node.type === "income") return "text-brand-green"
    return "text-brand-dark font-semibold"
  }

  return (
    <>
      <tr className={getRowBg()}>
        <td className="py-2 pl-6 pr-4 text-[13px]">
          <span className={isResult || isSubtotal ? "font-bold text-brand-dark" : "font-medium text-brand-dark"}>
            {node.title}
          </span>
        </td>

        <td className="py-2 px-4 text-center text-[11px] text-gray-400 font-medium">
          {translateType(node.type)}
        </td>

        <td className={`py-2 px-4 text-right text-[13px] ${getAmountColor()}`}>
          {formatCurrency(node.amount)}
        </td>

        <td className="py-2 px-4 text-right text-[11px] font-semibold text-gray-700">
          {node.verticalPercent > 0 ? `${node.verticalPercent}%` : "-"}
        </td>

        {showComparison && (
          <>
            <td className="py-2 px-4 text-right text-[11px] text-gray-400">
              {node.previousAmount !== undefined ? formatCurrency(node.previousAmount) : "-"}
            </td>
            <td className="py-2 pl-4 pr-6 text-right text-[11px]">
              <VariationBadgeA4 value={node.horizontalVariation} type={node.type} />
            </td>
          </>
        )}
      </tr>

      {/* Subitens detalhados */}
      {showSubItems &&
        hasItems &&
        node.items.map((item) => (
          <tr key={item.id} className="bg-gray-50/40 text-[11px] border-b border-gray-50">
            <td className="py-1.5 pl-10 pr-4 text-gray-700">
              <span className="mr-1 text-brand-green">•</span>
              {item.name}
            </td>
            <td className="py-1.5 px-4 text-center text-gray-400">Item</td>
            <td className="py-1.5 px-4 text-right font-medium text-gray-800">
              {formatCurrency(item.amount)}
            </td>
            <td className="py-1.5 px-4 text-right text-gray-500">
              {item.verticalPercent > 0 ? `${item.verticalPercent}%` : "-"}
            </td>
            {showComparison && (
              <>
                <td className="py-1.5 px-4 text-right text-gray-400">
                  {item.previousAmount !== undefined ? formatCurrency(item.previousAmount) : "-"}
                </td>
                <td className="py-1.5 pl-4 pr-6 text-right">
                  <VariationBadgeA4 value={item.horizontalVariation} type={node.type} />
                </td>
              </>
            )}
          </tr>
        ))}
    </>
  )
}

function VariationBadgeA4({
  value,
  type,
}: {
  value?: number
  type: "income" | "expense" | "subtotal" | "result"
}) {
  if (value === undefined) return <span className="text-gray-400">-</span>
  if (value === 0) return <span className="text-gray-400">0%</span>

  const isPositive = value > 0
  let isGood = isPositive
  if (type === "expense") {
    isGood = !isPositive
  }

  return (
    <span
      className={`font-semibold ${isGood ? "text-brand-green" : "text-[#cc4745]"
        }`}
    >
      {isPositive ? `+${value}%` : `${value}%`}
    </span>
  )
}
