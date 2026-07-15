"use client"

import type React from "react"
import { useRef, useEffect, useState, useCallback } from "react"
import {
  BoldIcon, ItalicIcon, UnderlineIcon,
  OrderedListIcon, ListIcon,
  AlignLeftIcon, AlignCenterIcon, AlignRightIcon, AlignJustifyIcon,
  TableIcon, ImageIcon,
  ColorIcon, ClearFormatIcon, FontSizeIcon,
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
  { label: "Azul", value: "#2563eb" },
  { label: "Verde", value: "#16a34a" },
  { label: "Amarelo", value: "#ca8a04" },
  { label: "Roxo", value: "#7c3aed" },
  { label: "Laranja", value: "#ea580c" },
  { label: "Rosa", value: "#db2777" },
  { label: "Cinza", value: "#6b7280" },
  { label: "Marrom", value: "#92400e" },
  { label: "Azul Claro", value: "#60a5fa" },
  { label: "Verde Claro", value: "#4ade80" },
  { label: "Branco", value: "#ffffff" },
  { label: "Cinza Escuro", value: "#374151" },
]

const FONT_SIZES = [
  { tag: "p", label: "Normal", preview: "Aa" },
  { tag: "h1", label: "Título 1", preview: "Aa" },
  { tag: "h2", label: "Título 2", preview: "Aa" },
  { tag: "h3", label: "Título 3", preview: "Aa" },
  { tag: "h4", label: "Título 4", preview: "Aa" },
  { tag: "h5", label: "Título 5", preview: "Aa" },
  { tag: "h6", label: "Título 6", preview: "Aa" },
]

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ label, value, onChange, disabled }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [showColorModal, setShowColorModal] = useState(false)
  const [showFontSizeModal, setShowFontSizeModal] = useState(false)
  const [showTableModal, setShowTableModal] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [showImageModal, setShowImageModal] = useState(false)

  const { planSlug } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()
  const imageUploadBlocked = !hasMinimumPlan(planSlug, "crescer")

  const exec = useCallback((command: string, value?: string) => {
    const selection = window.getSelection()
    const hasSelection = selection && selection.rangeCount > 0 && editorRef.current?.contains(selection.anchorNode ?? null)

    editorRef.current?.focus()

    if (!hasSelection && editorRef.current) {
      const range = document.createRange()
      range.setStart(editorRef.current, 0)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }

    document.execCommand(command, false, value ?? undefined)

    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
      updateActiveFormats()
    }
  }, [onChange])

  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>()
    const checks = ["bold", "italic", "underline", "insertOrderedList", "insertUnorderedList", "justifyLeft", "justifyCenter", "justifyRight", "justifyFull"]
    for (const cmd of checks) {
      try { if (document.queryCommandState(cmd)) formats.add(cmd) } catch { /* noop */ }
    }
    setActiveFormats(formats)
  }, [])

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  const handleInsertTable = () => {
    const tableHtml = `<table style="width:100%;border-collapse:collapse;"><thead><tr>${Array(tableCols).fill("").map(() => '<th style="border:1px solid #ccc;padding:8px;background:#f5f5f5;font-weight:bold;text-align:left;">Título</th>').join("")}</tr></thead><tbody>${Array(tableRows).fill("").map(() => `<tr>${Array(tableCols).fill("").map(() => '<td style="border:1px solid #ccc;padding:8px;">&nbsp;</td>').join("")}</tr>`).join("")}</tbody></table><br>`
    exec("insertHTML", tableHtml)
    setShowTableModal(false)
    setTableRows(3)
    setTableCols(3)
  }

  const handleImageInsert = (imgUrl: string, alt: string, width: string, height: string) => {
    editorRef.current?.focus()
    const imgHtml = `<img src="${imgUrl}" alt="${alt}" width="${width}"${height ? ` height="${height}"` : ""} style="max-width:100%;height:auto;" />`
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const fragment = range.createContextualFragment(imgHtml)
      range.insertNode(fragment)
      range.collapse(false)
    } else {
      exec("insertHTML", imgHtml)
    }
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  const countImages = () => {
    if (!editorRef.current) return 0
    return editorRef.current.querySelectorAll("img").length
  }

  const handleFontSize = (tag: string) => {
    editorRef.current?.focus()
    requestAnimationFrame(() => {
      document.execCommand("formatBlock", false, `<${tag}>`)
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML)
        updateActiveFormats()
      }
    })
    setShowFontSizeModal(false)
  }

  const isActive = (cmd: string) => activeFormats.has(cmd)

  const renderBtn = (icon: React.FC<{ className?: string }>, tooltip: string, command: string, value?: string) => {
    const Icon = icon
    return (
      <Tooltip key={command} text={tooltip}>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); exec(command, value) }}
          disabled={disabled}
          className={`p-1.5 rounded transition-colors ${isActive(command)
            ? "bg-brand-green/10 text-brand-green"
            : "hover:bg-gray-100 dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Icon className="w-4 h-4" />
        </button>
      </Tooltip>
    )
  }

  const renderIconBtn = (icon: React.FC<{ className?: string }>, tooltip: string, onClick: () => void) => {
    const Icon = icon
    return (
      <Tooltip text={tooltip}>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onClick() }}
          disabled={disabled}
          className="p-1.5 rounded transition-colors hover:bg-gray-100 dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="flex flex-wrap items-center gap-1 p-2 border-b border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/50">
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

          <div className="w-px h-5 bg-brand-border dark:bg-dark-border mx-1" />

          {renderIconBtn(ColorIcon, "Cor do texto", () => setShowColorModal(true))}
          {renderIconBtn(FontSizeIcon, "Tamanho do texto", () => setShowFontSizeModal(true))}

          <div className="w-px h-5 bg-brand-border dark:bg-dark-border mx-1" />

          {renderIconBtn(ClearFormatIcon, "Limpar formatação", () => exec("removeFormat"))}
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

      <DefaultModal isOpen={showColorModal} onClose={() => setShowColorModal(false)} title="Cor do texto" maxWidth="sm">
        <div className="grid grid-cols-5 sm:grid-cols-7 gap-3 p-2">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); exec("foreColor", c.value); setShowColorModal(false) }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-brand-border/40 hover:scale-110 transition-transform cursor-pointer shadow-sm"
              style={{ backgroundColor: c.value }}
              title={c.label}
            />
          ))}
        </div>
      </DefaultModal>

      <DefaultModal isOpen={showFontSizeModal} onClose={() => setShowFontSizeModal(false)} title="Tamanho do texto" maxWidth="sm">
        <div className="flex flex-col gap-2">
          {FONT_SIZES.map((f) => (
            <button
              key={f.tag}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleFontSize(f.tag) }}
              className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border transition-colors text-left cursor-pointer"
            >
              <span
                className={`font-bold text-brand-dark dark:text-dark-heading min-w-[60px] ${f.tag === "h1" ? "text-3xl" :
                  f.tag === "h2" ? "text-2xl" :
                    f.tag === "h3" ? "text-xl" :
                      f.tag === "h4" ? "text-lg" :
                        f.tag === "h5" ? "text-base" :
                          f.tag === "h6" ? "text-sm" : "text-base"
                  }`}
              >
                {f.preview}
              </span>
              <span className="text-sm text-brand-dark/70 dark:text-dark-body/70">{f.label}</span>
            </button>
          ))}
        </div>
      </DefaultModal>

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
