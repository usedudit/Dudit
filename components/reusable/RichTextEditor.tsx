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
import { deleteImageFromR2Action } from "@/app/actions/shared/r2"
import Input from "./Input"
import { sanitizeRichText } from "@/lib/security/rich-text-sanitizer"

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

const MIN_IMG_SIZE = 50
const MAX_IMG_SIZE = 900
const HANDLE_SIZE = 10

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ label, value, onChange, disabled }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedImgRef = useRef<HTMLImageElement | null>(null)
  const resizeRef = useRef<{
    startX: number; startY: number
    startW: number; startH: number
    aspect: number
    corner: string
  } | null>(null)
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())
  const [showColorModal, setShowColorModal] = useState(false)
  const [showFontSizeModal, setShowFontSizeModal] = useState(false)
  const [showTableModal, setShowTableModal] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [showImageModal, setShowImageModal] = useState(false)

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [overlayPos, setOverlayPos] = useState({ top: 0, left: 0, width: 0, height: 0 })
  const [showActions, setShowActions] = useState(false)
  const [editImageData, setEditImageData] = useState<{ url: string; alt: string; width: string; height: string } | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)

  const { planSlug } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()
  const imageUploadBlocked = !hasMinimumPlan(planSlug, "crescer")

  const updateOverlayPos = useCallback(() => {
    const img = selectedImgRef.current
    const cont = containerRef.current
    if (!img || !cont) { setOverlayPos({ top: 0, left: 0, width: 0, height: 0 }); return }
    const cr = cont.getBoundingClientRect()
    const ir = img.getBoundingClientRect()
    setOverlayPos({
      top: ir.top - cr.top,
      left: ir.left - cr.left,
      width: ir.width,
      height: ir.height,
    })
  }, [])

  const selectImage = useCallback((img: HTMLImageElement | null) => {
    if (selectedImgRef.current) {
      selectedImgRef.current.style.outline = ""
      selectedImgRef.current.style.outlineOffset = ""
    }
    selectedImgRef.current = img
    if (img) {
      img.style.outline = ""
      img.style.outlineOffset = ""
      if (!img.dataset.editorId) {
        img.dataset.editorId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      }
      setSelectedImageId(img.dataset.editorId)
      updateOverlayPos()
      setShowActions(true)
    } else {
      setSelectedImageId(null)
      setShowActions(false)
      setOverlayPos({ top: 0, left: 0, width: 0, height: 0 })
    }
  }, [updateOverlayPos])

  const deselectImage = useCallback(() => {
    selectImage(null)
  }, [selectImage])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const handleClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest("img")
      if (img && editor.contains(img)) {
        e.stopPropagation()
        selectImage(img)
        return
      }
      if (!(e.target as HTMLElement).closest(".rich-text-image-overlay")) {
        deselectImage()
      }
    }

    const handleScroll = () => {
      if (selectedImgRef.current) updateOverlayPos()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") deselectImage()
      if ((e.key === "Delete" || e.key === "Backspace") && selectedImgRef.current) {
        // Let native delete handle it, but deselect after
        requestAnimationFrame(() => {
          if (!editor.contains(selectedImgRef.current)) deselectImage()
        })
      }
    }

    editor.addEventListener("click", handleClick)
    editor.addEventListener("scroll", handleScroll)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      editor.removeEventListener("click", handleClick)
      editor.removeEventListener("scroll", handleScroll)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectImage, deselectImage, updateOverlayPos])

  // Resize handlers
  const onResizeStart = useCallback((e: React.PointerEvent, corner: string) => {
    e.preventDefault()
    e.stopPropagation()
    const img = selectedImgRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      aspect: rect.width / rect.height,
      corner,
    }
    img.style.willChange = "width, height"
    const onMove = (ev: PointerEvent) => {
      if (!resizeRef.current) return
      const r = resizeRef.current
      let dx: number, dy: number
      switch (r.corner) {
        case "se": dx = ev.clientX - r.startX; dy = ev.clientY - r.startY; break
        case "sw": dx = r.startX - ev.clientX; dy = ev.clientY - r.startY; break
        case "ne": dx = ev.clientX - r.startX; dy = r.startY - ev.clientY; break
        case "nw": dx = r.startX - ev.clientX; dy = r.startY - ev.clientY; break
        default: dx = 0; dy = 0
      }
      const propDx = dx / r.startW
      const propDy = dy / r.startH
      let newW: number, newH: number
      if (Math.abs(propDx) >= Math.abs(propDy)) {
        newW = Math.max(MIN_IMG_SIZE, Math.min(MAX_IMG_SIZE, r.startW + dx))
        newH = Math.round(newW / r.aspect)
      } else {
        newH = Math.max(MIN_IMG_SIZE, Math.min(MAX_IMG_SIZE, r.startH + dy))
        newW = Math.round(newH * r.aspect)
      }
      img.width = newW
      img.height = newH
      updateOverlayPos()
    }
    const onUp = () => {
      resizeRef.current = null
      if (img) img.style.willChange = ""
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      if (editorRef.current) onChange(editorRef.current.innerHTML)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }, [updateOverlayPos, onChange])

  // Re-run overlay position on window resize
  useEffect(() => {
    const handle = () => { if (selectedImgRef.current) updateOverlayPos() }
    window.addEventListener("resize", handle)
    return () => window.removeEventListener("resize", handle)
  }, [updateOverlayPos])

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

  const handleClearFormat = () => {
    const sel = window.getSelection()
    const hasSelection = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed && editorRef.current?.contains(sel.anchorNode ?? null)
    editorRef.current?.focus()
    if (hasSelection) {
      document.execCommand("removeFormat", false)
    } else if (editorRef.current) {
      const stripTags = (el: Element): string => {
        const blocks = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "ol", "ul", "li", "table", "thead", "tbody", "tr", "th", "td", "blockquote", "pre"]
        const inlineFormatting = ["b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "span", "font", "mark", "small", "del", "ins"]
        const result: string[] = []
        for (const node of Array.from(el.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            result.push(node.textContent ?? "")
          } else if (node instanceof HTMLElement) {
            const tag = node.tagName.toLowerCase()
            if (blocks.includes(tag)) {
              const inner = stripTags(node)
              if (tag === "li") {
                result.push(`<li>${inner}</li>`)
              } else if (["ol", "ul"].includes(tag)) {
                result.push(`<${tag}>${inner}</${tag}>`)
              } else if (["table", "thead", "tbody", "tr", "th", "td"].includes(tag)) {
                result.push(`<${tag}>${inner}</${tag}>`)
              } else {
                result.push(`<p>${inner}</p>`)
              }
            } else if (inlineFormatting.includes(tag)) {
              result.push(stripTags(node as Element))
            } else {
              result.push(node.outerHTML)
            }
          } else {
            result.push(node.textContent ?? "")
          }
        }
        return result.join("")
      }
      editorRef.current.innerHTML = stripTags(editorRef.current)
    }
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
      updateActiveFormats()
    }
  }

  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>()
    const checks = ["bold", "italic", "underline", "insertOrderedList", "insertUnorderedList", "justifyLeft", "justifyCenter", "justifyRight", "justifyFull"]
    for (const cmd of checks) {
      try { if (document.queryCommandState(cmd)) formats.add(cmd) } catch { /* noop */ }
    }
    setActiveFormats(formats)
  }, [])

  useEffect(() => {
    const safeValue = sanitizeRichText(value)
    if (editorRef.current && safeValue !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = safeValue
    }
  }, [value])

  const insertSanitizedClipboardContent = (event: {
    preventDefault: () => void
    clipboardData?: DataTransfer | null
    dataTransfer?: DataTransfer | null
  }) => {
    event.preventDefault()
    const transfer = event.clipboardData || event.dataTransfer
    const html = transfer?.getData("text/html") || ""
    const plainText = transfer?.getData("text/plain") || ""
    if (html) {
      document.execCommand("insertHTML", false, sanitizeRichText(html))
    } else if (plainText) {
      document.execCommand("insertText", false, plainText)
    }
    if (editorRef.current) onChange(sanitizeRichText(editorRef.current.innerHTML))
  }

  const handleInsertTable = () => {
    const tableHtml = `<table style="width:100%;border-collapse:collapse;"><thead><tr>${Array(tableCols).fill("").map(() => '<th style="border:1px solid #ccc;padding:8px;background:#f5f5f5;font-weight:bold;text-align:left;">Título</th>').join("")}</tr></thead><tbody>${Array(tableRows).fill("").map(() => `<tr>${Array(tableCols).fill("").map(() => '<td style="border:1px solid #ccc;padding:8px;">&nbsp;</td>').join("")}</tr>`).join("")}</tbody></table><br>`
    exec("insertHTML", tableHtml)
    setShowTableModal(false)
    setTableRows(3)
    setTableCols(3)
  }

  const handleImageInsert = (imgUrl: string, alt: string, width: string, height: string) => {
    editorRef.current?.focus()
    let safeImageUrl: string
    try {
      const parsedImageUrl = new URL(imgUrl, window.location.origin)
      if (
        (parsedImageUrl.protocol !== "https:" && parsedImageUrl.protocol !== "http:") ||
        parsedImageUrl.username ||
        parsedImageUrl.password
      ) return
      safeImageUrl = parsedImageUrl.href
    } catch {
      return
    }

    const image = document.createElement("img")
    image.src = safeImageUrl
    image.alt = alt
    image.style.maxWidth = "100%"
    image.style.height = "auto"
    const parsedWidth = Number(width)
    const parsedHeight = Number(height)
    if (Number.isFinite(parsedWidth) && parsedWidth > 0) image.width = Math.min(MAX_IMG_SIZE, Math.max(MIN_IMG_SIZE, parsedWidth))
    if (Number.isFinite(parsedHeight) && parsedHeight > 0) image.height = Math.min(MAX_IMG_SIZE, Math.max(MIN_IMG_SIZE, parsedHeight))

    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(image)
      range.collapse(false)
    } else {
      editorRef.current?.appendChild(image)
    }
    if (editorRef.current) onChange(sanitizeRichText(editorRef.current.innerHTML))
  }

  const handleEditImage = () => {
    const img = selectedImgRef.current
    if (!img) return
    setEditImageData({
      url: img.src,
      alt: img.alt,
      width: String(img.width),
      height: String(img.height),
    })
    setShowEditModal(true)
    setShowActions(false)
  }

  const handleEditConfirm = (newUrl: string, alt: string, width: string, height: string) => {
    const img = selectedImgRef.current
    if (!img) return
    let safeImageUrl: string
    try {
      const parsedImageUrl = new URL(newUrl, window.location.origin)
      if (
        (parsedImageUrl.protocol !== "https:" && parsedImageUrl.protocol !== "http:") ||
        parsedImageUrl.username ||
        parsedImageUrl.password
      ) return
      safeImageUrl = parsedImageUrl.href
    } catch {
      return
    }

    const oldSrc = img.src
    const isNewImage = safeImageUrl !== oldSrc && safeImageUrl !== editImageData?.url
    if (isNewImage) {
      deleteImageFromR2Action(oldSrc)
    }
    img.src = safeImageUrl
    img.alt = alt
    const parsedWidth = Number(width)
    const parsedHeight = Number(height)
    if (Number.isFinite(parsedWidth) && parsedWidth > 0) img.width = Math.min(MAX_IMG_SIZE, Math.max(MIN_IMG_SIZE, parsedWidth))
    if (Number.isFinite(parsedHeight) && parsedHeight > 0) img.height = Math.min(MAX_IMG_SIZE, Math.max(MIN_IMG_SIZE, parsedHeight))
    if (editorRef.current) onChange(sanitizeRichText(editorRef.current.innerHTML))
    requestAnimationFrame(() => {
      updateOverlayPos()
      selectImage(img)
    })
    setEditImageData(null)
  }

  const handleRemoveImage = async () => {
    const img = selectedImgRef.current
    if (!img || !editorRef.current) return
    const src = img.src
    const parent = img.parentElement
    img.remove()
    if (parent && !parent.textContent?.trim() && parent !== editorRef.current && parent.tagName !== "BODY") {
      if (parent.innerText.trim() === "" && parent.querySelectorAll("img").length === 0) {
        parent.remove()
      }
    }
    if (editorRef.current) onChange(editorRef.current.innerHTML)
    deselectImage()
    try { await deleteImageFromR2Action(src) } catch { /* noop */ }
  }

  const handleMoveImage = (direction: "up" | "down") => {
    const img = selectedImgRef.current
    if (!img || !editorRef.current) return
    const container = editorRef.current
    if (direction === "up" && img.previousSibling) {
      container.insertBefore(img, img.previousSibling)
    } else if (direction === "down" && img.nextSibling) {
      container.insertBefore(img.nextSibling, img)
    }
    if (editorRef.current) onChange(editorRef.current.innerHTML)
    requestAnimationFrame(() => updateOverlayPos())
  }

  const isImageGrouped = (img: HTMLImageElement): boolean => {
    const p = img.parentElement
    if (!p) return false
    const style = window.getComputedStyle(p)
    return style.display === "flex" || style.display === "inline-flex"
  }

  const handleGroupImage = () => {
    const img = selectedImgRef.current
    if (!img || !editorRef.current) return
    const editor = editorRef.current

    if (isImageGrouped(img)) {
      const container = img.parentElement!
      const isOnlyChild = container.querySelectorAll("img").length <= 1
      if (isOnlyChild) {
        const ref = container.nextSibling || container.previousSibling
        if (ref && container.parentElement) {
          while (container.firstChild) {
            container.parentElement.insertBefore(container.firstChild, container)
          }
          container.remove()
        } else {
          container.replaceWith(...Array.from(container.childNodes))
        }
      } else {
        const ref = container.nextSibling
        container.removeChild(img)
        if (ref && ref.parentElement) {
          ref.parentElement.insertBefore(img, ref)
        } else {
          editor.appendChild(img)
        }
      }
      if (editor) onChange(editor.innerHTML)
      requestAnimationFrame(() => updateOverlayPos())
      return
    }

    let prev = img.previousSibling
    while (prev && prev.nodeType === Node.TEXT_NODE && !prev.textContent?.trim()) {
      prev = prev.previousSibling
    }
    if (prev && (prev as HTMLElement).tagName === "IMG") {
      const prevImg = prev as HTMLImageElement
      if (isImageGrouped(prevImg)) {
        const container = prevImg.parentElement!
        container.appendChild(img)
      } else {
        const container = document.createElement("div")
        container.style.display = "flex"
        container.style.flexWrap = "wrap"
        container.style.gap = "8px"
        container.style.alignItems = "flex-start"
        editor.insertBefore(container, prev)
        container.appendChild(prevImg)
        container.appendChild(img)
      }
    }
    if (editor) onChange(editor.innerHTML)
    requestAnimationFrame(() => updateOverlayPos())
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
    <div ref={containerRef} className="relative">
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

          {renderIconBtn(ClearFormatIcon, "Limpar formatação", handleClearFormat)}
        </div>

        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
          onPaste={insertSanitizedClipboardContent}
          onDrop={insertSanitizedClipboardContent}
          onMouseUp={updateActiveFormats}
          onKeyUp={updateActiveFormats}
          className="rich-text-editor w-full h-[200px] overflow-y-auto bg-white dark:bg-dark-surface rounded-b-lg py-2 px-4 text-sm focus:outline-none text-brand-dark dark:text-dark-heading disabled:bg-brand-gray dark:disabled:bg-dark-border/30 custom-scrollbar"
        />

        {/* Image selection overlay */}
        {selectedImgRef.current && selectedImageId && (
          <div
            className="rich-text-image-overlay absolute pointer-events-none z-10 border-2 border-brand-green rounded-sm"
            style={{
              top: overlayPos.top,
              left: overlayPos.left,
              width: overlayPos.width,
              height: overlayPos.height,
            }}
          >
            {/* Resize handles */}
            <div
              className="absolute pointer-events-auto cursor-nw-resize z-20 bg-white border-2 border-brand-green rounded-sm"
              style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, top: -(HANDLE_SIZE / 2), left: -(HANDLE_SIZE / 2) }}
              onPointerDown={(e) => onResizeStart(e, "nw")}
            />
            <div
              className="absolute pointer-events-auto cursor-ne-resize z-20 bg-white border-2 border-brand-green rounded-sm"
              style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, top: -(HANDLE_SIZE / 2), right: -(HANDLE_SIZE / 2) }}
              onPointerDown={(e) => onResizeStart(e, "ne")}
            />
            <div
              className="absolute pointer-events-auto cursor-sw-resize z-20 bg-white border-2 border-brand-green rounded-sm"
              style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, bottom: -(HANDLE_SIZE / 2), left: -(HANDLE_SIZE / 2) }}
              onPointerDown={(e) => onResizeStart(e, "sw")}
            />
            <div
              className="absolute pointer-events-auto cursor-se-resize z-20 bg-white border-2 border-brand-green rounded-sm"
              style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, bottom: -(HANDLE_SIZE / 2), right: -(HANDLE_SIZE / 2) }}
              onPointerDown={(e) => onResizeStart(e, "se")}
            />

            {/* Actions button */}
            {showActions && (
              <div
                className="rich-text-image-overlay pointer-events-auto absolute z-20 flex items-center gap-1 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg shadow-lg px-1.5 py-1"
                style={{ top: -(HANDLE_SIZE / 2 + 32), right: 0 }}
              >
                <button
                  type="button"
                  onClick={handleEditImage}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading transition-colors"
                  title="Editar imagem"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                  title="Remover imagem"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
                {selectedImgRef.current && (
                  <button
                    type="button"
                    onClick={handleGroupImage}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading transition-colors"
                    title={isImageGrouped(selectedImgRef.current) ? "Desagrupar" : "Lado a lado"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                    </svg>
                  </button>
                )}
                <div className="w-px h-4 bg-brand-border dark:bg-dark-border" />
                <button
                  type="button"
                  onClick={() => handleMoveImage("up")}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading transition-colors"
                  title="Mover para cima"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveImage("down")}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-border text-brand-dark dark:text-dark-heading transition-colors"
                  title="Mover para baixo"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
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
            <Input
              label="Linhas"
              type="number"
              min={1}
              max={10}
              value={tableRows}
              onChange={(e) => setTableRows(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="w-full"
            />
          </div>
          <div>
            <Input
              label="Colunas"
              type="number"
              min={1}
              max={10}
              value={tableCols}
              onChange={(e) => setTableCols(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="w-full"
            />
          </div>
          <Button onClick={handleInsertTable}>Inserir</Button>
        </div>
      </DefaultModal>

      <InsertImageModal
        isOpen={showImageModal && !showEditModal}
        onClose={() => setShowImageModal(false)}
        onInsert={handleImageInsert}
        imageCount={countImages()}
        imageUploadBlocked={imageUploadBlocked}
        onUpgradeClick={() => openPlanUpgrade("crescer")}
      />

      <InsertImageModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditImageData(null) }}
        onInsert={handleImageInsert}
        imageCount={countImages()}
        imageUploadBlocked={imageUploadBlocked}
        onUpgradeClick={() => openPlanUpgrade("crescer")}
        editImageData={editImageData}
        onEdit={handleEditConfirm}
      />
    </div>
  )
}

export default RichTextEditor
