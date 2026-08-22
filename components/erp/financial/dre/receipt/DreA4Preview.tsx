"use client"

import React from "react"
import { formatCurrency } from "@/lib/utils"
import type { DreReportData, DreRegime, DreNode } from "@/lib/services/dre.service"

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
}: DreA4PreviewProps) {
  const primaryColor = "#113833"
  const secondaryColor = "#1E824C"
  const partnerName = report.companyInfo?.partnerName || "Empresa Parceira"
  const kpis = report.kpis

  return (
    <div
      className={`flex flex-col w-full h-full bg-white dark:bg-dark-surface relative overflow-hidden ${
        printMode ? "dre-a4-print" : ""
      }`}
    >
      <div
        className={
          printMode
            ? "w-full flex flex-col items-center p-0"
            : "flex-1 overflow-auto custom-scrollbar p-4 md:p-8 flex flex-col items-center space-y-8 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border"
        }
      >
        {/* Folha A4 Padronizada */}
        <div className="w-[210mm] min-w-[210mm] shrink-0 bg-white text-[#113833] shadow-md overflow-hidden relative font-sans rounded-sm min-h-[297mm] flex flex-col justify-between">
          <div>
            {/* ── 1. Top Banner Estilo Recibo A4 Dudit ───────────────────────── */}
            <div
              className="px-8 py-7 relative overflow-hidden flex flex-col justify-between h-[155px] shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {/* Elementos geométricos decorativos Dudit */}
              <div className="absolute -top-12 right-6 flex gap-3 opacity-90 rotate-180 pointer-events-none">
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-14 h-24 rounded-full"
                      style={{ backgroundColor: secondaryColor }}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-3 -mt-12">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={`b-${i}`}
                      className="w-14 h-24 rounded-full"
                      style={{ backgroundColor: secondaryColor }}
                    />
                  ))}
                </div>
              </div>

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-[15px] font-bold text-black shrink-0">
                    {partnerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white font-bold text-sm">{partnerName}</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">
                    Demonstração do Resultado do Exercício
                  </h1>
                  <p className="text-white/80 text-xs tracking-wider font-light mt-0.5">
                    Período: {startDate} até {endDate} • Regime de {regime === "competencia" ? "Competência" : "Caixa"}
                  </p>
                </div>
              </div>
            </div>

            {/* ── 2. Metadados e Informações Institucionais ────────────────────── */}
            <div className="px-8 py-5 border-b border-gray-100">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Empresa</span>
                  <span className="font-bold text-xs text-brand-dark block truncate">{partnerName}</span>
                  {report.companyInfo?.documentNumber && (
                    <span className="text-[10px] text-gray-500">CNPJ: {report.companyInfo.documentNumber}</span>
                  )}
                </div>
                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Unidade / Loja</span>
                  <span className="font-bold text-xs text-brand-dark block truncate">{storeName}</span>
                  <span className="text-[10px] text-gray-500">{report.companyInfo?.taxRegimeLabel}</span>
                </div>
                <div>
                  <span className="text-[11px] text-gray-500 font-medium block">Emissão / Gerado em</span>
                  <span className="font-bold text-xs text-brand-dark block">{report.companyInfo?.generatedAt}</span>
                  <span className="text-[10px] text-gray-500">Base 100%: {formatCurrency(kpis?.grossRevenue || 0)}</span>
                </div>
              </div>
            </div>

            {/* ── 3. Tabela Principal da DRE ─────────────────────────────────── */}
            <div className="px-8 pt-4 pb-2">
              <table className="w-full text-left border-separate border-spacing-0">
                <thead>
                  <tr className="bg-brand-gray/40">
                    <th className="py-2.5 pl-4 pr-2 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider rounded-tl-lg border-b border-gray-200">
                      Estrutura / Conta Contábil
                    </th>
                    <th className="py-2.5 px-2 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider text-center w-24 border-b border-gray-200">
                      Tipo
                    </th>
                    <th className="py-2.5 px-2 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider text-right w-28 border-b border-gray-200">
                      Atual (R$)
                    </th>
                    <th className="py-2.5 px-2 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider text-right w-16 border-b border-gray-200">
                      AV (%)
                    </th>
                    {showComparison && (
                      <>
                        <th className="py-2.5 px-2 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider text-right w-24 border-b border-gray-200">
                          Anterior (R$)
                        </th>
                        <th className="py-2.5 pl-2 pr-4 text-[10.5px] font-bold text-gray-500 uppercase tracking-wider text-right w-16 rounded-tr-lg border-b border-gray-200">
                          AH (%)
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Object.values(report.structure).map((node) => (
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

            {/* ── 4. Resumo de Indicadores e Margens Contábeis ────────────────── */}
            {showKpiSummary && kpis && (
              <div className="px-8 py-3">
                <div className="bg-brand-gray/40 p-4 rounded-lg text-black">
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
              <div className="px-8 pt-8 pb-4">
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
          </div>

          {/* ── 6. Rodapé Oficial Dudit ───────────────────────────────────────── */}
          <div
            className="text-white/80 px-8 py-2 text-[10px] flex justify-between items-center w-full h-[36px] shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            <span>Demonstração Contábil Gerencial</span>
            <span>Criado via Dudit ERP • dudit.com.br</span>
          </div>
        </div>
      </div>
    </div>
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
        <td className="py-1.5 pl-4 pr-2 text-xs">
          <span className={isResult || isSubtotal ? "font-bold text-brand-dark" : "font-medium text-brand-dark"}>
            {node.title}
          </span>
        </td>

        <td className="py-1.5 px-2 text-center text-[10.5px] text-gray-500 font-medium">
          {translateType(node.type)}
        </td>

        <td className={`py-1.5 px-2 text-right text-xs ${getAmountColor()}`}>
          {formatCurrency(node.amount)}
        </td>

        <td className="py-1.5 px-2 text-right text-[10.5px] font-semibold text-gray-700">
          {node.verticalPercent > 0 ? `${node.verticalPercent}%` : "—"}
        </td>

        {showComparison && (
          <>
            <td className="py-1.5 px-2 text-right text-[10.5px] text-gray-500">
              {node.previousAmount !== undefined ? formatCurrency(node.previousAmount) : "—"}
            </td>
            <td className="py-1.5 pl-2 pr-4 text-right text-[10.5px]">
              <VariationBadgeA4 value={node.horizontalVariation} type={node.type} />
            </td>
          </>
        )}
      </tr>

      {/* Subitens detalhados */}
      {showSubItems &&
        hasItems &&
        node.items.map((item) => (
          <tr key={item.id} className="bg-gray-50/40 text-[10.5px] border-b border-gray-100/60">
            <td className="py-1 pl-8 pr-2 text-gray-700">
              <span className="mr-1 text-brand-green">•</span>
              {item.name}
            </td>
            <td className="py-1 px-2 text-center text-gray-400">Item</td>
            <td className="py-1 px-2 text-right font-medium text-gray-800">
              {formatCurrency(item.amount)}
            </td>
            <td className="py-1 px-2 text-right text-gray-500">
              {item.verticalPercent > 0 ? `${item.verticalPercent}%` : "—"}
            </td>
            {showComparison && (
              <>
                <td className="py-1 px-2 text-right text-gray-400">
                  {item.previousAmount !== undefined ? formatCurrency(item.previousAmount) : "—"}
                </td>
                <td className="py-1 pl-2 pr-4 text-right">
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
  if (value === undefined) return <span className="text-gray-400">—</span>
  if (value === 0) return <span className="text-gray-400">0%</span>

  const isPositive = value > 0
  let isGood = isPositive
  if (type === "expense") {
    isGood = !isPositive
  }

  return (
    <span
      className={`font-semibold ${
        isGood ? "text-brand-green" : "text-[#cc4745]"
      }`}
    >
      {isPositive ? `+${value}%` : `${value}%`}
    </span>
  )
}
