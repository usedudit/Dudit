"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import { BoldIcon, ItalicIcon, UnderlineIcon, LinkIcon, ListIcon } from "@/lib/icons"

interface RichTextEditorProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ label, value, onChange, disabled }) => {
  const editorRef = useRef<HTMLDivElement>(null)

  const handleFormat = (command: string) => {
    document.execCommand(command, false)
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  const buttons = [
    { name: "bold", icon: BoldIcon, command: "bold" },
    { name: "italic", icon: ItalicIcon, command: "italic" },
    { name: "underline", icon: UnderlineIcon, command: "underline" },
    { name: "link", icon: LinkIcon, command: "createLink" },
    { name: "list", icon: ListIcon, command: "insertUnorderedList" },
  ]

  return (
    <div>
      <label className="block text-sm font-medium text-brand-dark/80 dark:text-dark-body mb-1.5 truncate">
        {label}
      </label>
      <div className="border border-brand-border dark:border-dark-border rounded-lg">
        <div className="flex items-center gap-2 p-2 border-b border-brand-border dark:border-dark-border">
          {buttons.map((btn) => {
            const Icon = btn.icon
            return (
              <button
                type="button"
                key={btn.name}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleFormat(btn.command)
                }}
                disabled={disabled}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-dark-border focus:bg-gray-200 dark:focus:bg-dark-border disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon className="w-4 h-4 text-brand-dark dark:text-dark-heading" />
              </button>
            )
          })}
        </div>
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
          className="w-full h-32 overflow-y-auto bg-white dark:bg-dark-surface rounded-b-lg py-2 px-4 text-sm focus:outline-none text-brand-dark dark:text-dark-heading placeholder:text-brand-dark/70 dark:placeholder:text-dark-heading/70 disabled:bg-brand-gray dark:disabled:bg-dark-border/30"
        />
      </div>
    </div>
  )
}
