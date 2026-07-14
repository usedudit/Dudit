"use client"

import type React from "react"
import { useRef, useEffect, useState, useCallback } from "react"
import {
  BoldIcon, ItalicIcon, UnderlineIcon,
  OrderedListIcon, ListIcon,
  AlignLeftIcon, AlignCenterIcon, AlignRightIcon, AlignJustifyIcon,
  TableIcon, ImageIcon, LinkIcon,
  ColorIcon, ClearFormatIcon,
} from "@/lib/icons"
import { Tooltip } from "@/components/reusable/Tooltip"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button } from "@/components/reusable/Button"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import InsertImageModal from "./InsertImageModal"

interface RichTextEditorProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const COLORS = [
  { label: "Preto", value: "#000000" },
  { label: "Vermelho", value: "#e53e3e" },
  { label: "Azul", value: "#3182ce" },
  { label: "Verde", value: "#38a169" },
  { label: "Amarelo", value: "#d69e2e" },
  { label: "Roxo", value: "#805ad5" },
  { label: "Laranja", value: "#dd6b20" },
  { label: "Rosa", value: "#d53f8c" },
  { label: "Cinza", value: "#718096" },
  { label: "Marrom", value: "#8b5a2b" },
  { label: "Azul Claro", value: "#63b3ed" },
  { label: "Verde Claro", value: "#68d391" },
  { label: "Branco", value: "#ffffff" },
  { label: "Cinza Escuro", value: "#2d3748" },
]

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ label, value, onChange, disabled }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showTableModal, setShowTableModal] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [showImageModal, setShowImageModal] = useState(false)
  const colorRef = useRef<HTMLDivElement>(null)

  const { planSlug } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()
  const imageUploadBlocked = !hasMinimumPlan(planSlug, "crescer")

  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>()
    const checks = ["bold", "italic", "underline", "insertOrderedList", "insertUnorderedList", "justifyLeft", "justifyCenter", "justifyRight", "justifyFull"]
    for (const cmd of checks) {
      try { if (document.queryCommandState(cmd)) formats.add(cmd) } catch { /* noop */ }
    }
    setActiveFormats(formats)
  }, [])

  const handleFormat = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value ?? undefined)
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
      updateActiveFormats()
    }
  }, [onChange, updateActiveFormats])

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const handleLink = () => {
    const url = window.prompt("Digite a URL do link:")
    if (url) handleFormat("createLink", url)
  }

  const handleInsertTable = () => {
    const tableHtml = `<table style="width:100%;border-collapse:collapse;"><thead><tr>${Array(tableCols).fill("").map(() => '<th style="border:1px solid #ccc;padding:8px;background:#f5f5f5;font-weight:bold;text-align:left;">Título</th>').join("")}</tr></thead><tbody>${Array(tableRows).fill("").map(() => `<tr>${Array(tableCols).fill("").map(() => '<td style="border:1px solid #ccc;padding:8px;">&nbsp;</td>').join("")}</tr>`).join("")}</tbody></table><br>`
    document.execCommand("insertHTML", false, tableHtml)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
    setShowTableModal(false)
    setTableRows(3)
    setTableCols(3)
  }

  const handleImageInsert = (imgUrl: string, alt: string, width: string, height: string) => {
    const imgHtml = `<img src="${imgUrl}" alt="${alt}" width="${width}"${height ? ` height="${height}"` : ""} style="max-width:100%;height:auto;" />`
    document.execCommand("insertHTML", false, imgHtml)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  const countImages = () => {
    if (!editorRef.current) return 0
    return editorRef.current.querySelectorAll("img").length
  }

  const isActive = (cmd: string) => activeFormats.has(cmd)

  const renderBtn = (icon: React.FC<{ className?: string }>, tooltip: string, command: string, value?: string) => {
    const Icon = icon
    return (
      <Tooltip key={command} text={tooltip}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); handleFormat(command, value) }}
          disabled={disabled}
          className={`p-1.5 rounded transition-colors ${
            isActive(command)
              ? "bg-brand-green/20 dark:bg-brand-green/30 text-brand-green"
              : "hover:bg-gray-100 dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Icon className="w-4 h-4" />
        </button>
      </Tooltip>
    )
  }

  const renderIconBtn = (icon: React.FC<{ className?: string }>, tooltip: string, onClick: () => void, active?: boolean) => {
    const Icon = icon
    return (
      <Tooltip text={tooltip}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onClick() }}
          disabled={disabled}
          className={`p-1.5 rounded transition-colors ${
            active
              ? "bg-brand-green/20 dark:bg-brand-green/30 text-brand-green"
              : "hover:bg-gray-100 dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Icon className="w-4 h-4" />
        </button>
      </Tooltip>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1.5 truncate">
        {label}
      </label>
      <div className="border border-brand-border dark:border-dark-border rounded-lg">
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-brand-border dark:border-dark-border">
          {renderBtn(BoldIcon, "Negrito (Ctrl+B)", "bold")}
          {renderBtn(ItalicIcon, "Itálico (Ctrl+I)", "italic")}
          {renderBtn(UnderlineIcon, "Sublinhado (Ctrl+U)", "underline")}

          <div className="w-px h-5 bg-brand-border dark:bg-dark-border mx-1" />

          {renderBtn(OrderedListIcon, "Lista numerada", "insertOrderedList")}
          {renderBtn(ListIcon, "Lista com marcadores", "insertUnorderedList")}

          <div className="w-px h-5 bg-brand-border dark:bg-dark-border mx-1" />

          {renderBtn(AlignLeftIcon, "Alinhar à esquerda", "justifyLeft")}
          {renderBtn(AlignCenterIcon, "Centralizar", "justifyCenter")}
          {renderBtn(AlignRightIcon, "Alinhar à direita", "justifyRight")}
          {renderBtn(AlignJustifyIcon, "Justificar", "justifyFull")}

          <div className="w-px h-5 bg-brand-border dark:bg-dark-border mx-1" />

          {renderIconBtn(TableIcon, "Inserir tabela", () => setShowTableModal(true))}
          {renderIconBtn(ImageIcon, "Inserir imagem", () => setShowImageModal(true))}
          {renderIconBtn(LinkIcon, "Inserir link", handleLink)}

          <div className="w-px h-5 bg-brand-border dark:bg-dark-border mx-1" />

          <div className="relative" ref={colorRef}>
            {renderIconBtn(ColorIcon, "Cor do texto", () => setShowColorPicker((p) => !p))}
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg shadow-xl z-50 grid grid-cols-7 gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleFormat("foreColor", c.value); setShowColorPicker(false) }}
                    className="w-6 h-6 rounded-full border border-brand-border/50 hover:scale-110 transition-transform cursor-pointer"
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-brand-border dark:bg-dark-border mx-1" />

          {renderBtn(ClearFormatIcon, "Limpar formatação", "removeFormat")}
        </div>

        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
          onMouseUp={updateActiveFormats}
          onKeyUp={updateActiveFormats}
          className="w-full h-[200px] overflow-y-auto bg-white dark:bg-dark-surface rounded-b-lg py-2 px-4 text-sm focus:outline-none text-brand-dark dark:text-dark-heading disabled:bg-brand-gray dark:disabled:bg-dark-border/30 custom-scrollbar"
        />
      </div>

      <DefaultModal isOpen={showTableModal} onClose={() => setShowTableModal(false)} title="Inserir tabela" maxWidth="sm">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1">Linhas</label>
            <input
              type="number"
              min={1}
              max={10}
              value={tableRows}
              onChange={(e) => setTableRows(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="w-full px-3 py-2 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1">Colunas</label>
            <input
              type="number"
              min={1}
              max={10}
              value={tableCols}
              onChange={(e) => setTableCols(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="w-full px-3 py-2 border border-brand-border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading text-sm"
            />
          </div>
          <Button onClick={handleInsertTable}>Inserir</Button>
        </div>
      </DefaultModal>

      <InsertImageModal
        isOpen={showImageModal}
        onClose={() => setShowImageModal(false)}
        onInsert={handleImageInsert}
        imageCount={countImages()}
        imageUploadBlocked={imageUploadBlocked}
        onUpgradeClick={() => openPlanUpgrade("crescer")}
      />
    </div>
  )
}
