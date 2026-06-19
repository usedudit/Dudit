"use client"

import * as React from "react"
import { XIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"

interface TagsInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  label?: string
  error?: boolean
  errorMessage?: string
}

export function TagsInput({
  tags,
  onChange,
  placeholder = "Digite e pressione Enter",
  disabled = false,
  className,
  label,
  error: externalError = false,
  errorMessage: externalErrorMessage,
}: TagsInputProps) {
  const [inputValue, setInputValue] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const isInputTooLong = inputValue.length > 30
  const hasTooLongTag = tags.some(tag => tag.length > 30)

  const hasError = externalError || isInputTooLong || hasTooLongTag
  const displayErrorMessage = isInputTooLong
    ? "O valor digitado não pode ter mais de 30 caracteres."
    : hasTooLongTag
      ? "Um ou mais valores excedem o limite de 30 caracteres."
      : externalErrorMessage

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault()
      const newTag = inputValue.trim()
      if (newTag.length > 30) {
        // Block adding tags > 30 chars
        return
      }
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
    <div className={cn("space-y-1 flex-1 w-full", className)}>
      {label && <label className="block text-sm font-medium text-brand-dark dark:text-dark-heading mb-1.5 truncate">{label}</label>}
      <div
        className={cn(
          "flex flex-wrap gap-2 h-[42px] px-3 py-2 rounded-lg border focus-within:border-brand-dark dark:focus-within:border-dark-body focus-within:outline-none transition-all bg-white dark:bg-dark-surface",
          hasError ? "border-brand-red" : "border-brand-border dark:border-dark-border",
          disabled && "opacity-50 cursor-not-allowed bg-brand-gray dark:bg-dark-border/20",
        )}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {tags.map((tag, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium animate-fadeIn",
              tag.length > 30
                ? "bg-red-100 dark:bg-red-900/30 text-brand-red"
                : "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading"
            )}
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
                <XIcon className="w-3 h-3" />
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
      {hasError && displayErrorMessage && (
        <p className="text-xs text-brand-red mt-1">{displayErrorMessage}</p>
      )}
    </div>
  )
}
