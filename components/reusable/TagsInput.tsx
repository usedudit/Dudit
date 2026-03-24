"use client"

import * as React from "react"
import { X } from "@/lib/icons"
import { cn } from "@/lib/utils"

interface TagsInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
}

export function TagsInput({
  tags,
  onChange,
  placeholder = "Digite e pressione Enter",
  disabled = false,
  className,
  label,
}: TagsInputProps) {
  const [inputValue, setInputValue] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault()
      const newTag = inputValue.trim()
      if (!tags.includes(newTag)) {
        onChange([...tags, newTag])
      }
      setInputValue("")
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove))
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && <label className="block text-sm font-medium text-brand-dark dark:text-dark-body">{label}</label>}
      <div
        className={cn(
          "flex flex-wrap gap-2 h-[42px] px-3 py-2 rounded-lg border focus:border-brand-green dark:focus:border-brand-green focus:outline-none transition-all border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface",
          disabled && "opacity-50 cursor-not-allowed bg-brand-gray dark:bg-dark-border/20",
        )}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {tags.map((tag, index) => (
          <div
            key={index}
            className="flex items-center gap-1 bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading px-2 py-1 rounded-md text-sm font-medium animate-fadeIn"
          >
            <span>{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeTag(tag)
                }}
                className="hover:bg-gray-200 dark:hover:bg-dark-border/50 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={tags.length === 0 ? placeholder : ""}
          className={cn(
            "flex-1 min-w-[120px] outline-none bg-transparent text-sm",
            "placeholder:text-gray-400 dark:placeholder:text-dark-body/60",
            disabled && "cursor-not-allowed",
          )}
        />
      </div>
    </div>
  )
}
