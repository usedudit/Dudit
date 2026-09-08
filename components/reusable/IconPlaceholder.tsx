import type React from "react"
import { AlertCircleIcon } from "@/lib/icons"
import { Button } from "./Button"
import Link from "next/link"

interface IconPlaceholderProps {
  placeholderType?: "default" | "image"
  icon?: React.ElementType
  imageSrc?: string
  imageAlt?: string
  title?: React.ReactNode
  subtitle?: React.ReactNode
  containerSize?: string
  iconSize?: string
  imageClass?: string
  titleClass?: string
  subtitleClass?: string
  itemButton?: {
    text: string
    action?: string | (() => void)
    type?: "file" | "button"
    accept?: string
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
    disabled?: boolean
    variant?: "default" | "outline" | "outlinered" | "destructive" | "ghost" | "filled"
    className?: string
  }
  buttons?: Array<{
    text: string
    action?: string | (() => void)
    type?: "file" | "button"
    accept?: string
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
    disabled?: boolean
    variant?: "default" | "outline" | "outlinered" | "destructive" | "ghost" | "filled"
    className?: string
  }>
  className?: string
}

export default function IconPlaceholder({
  placeholderType = "default",
  icon,
  imageSrc,
  imageAlt = "",
  title,
  subtitle,
  containerSize = "w-16 h-16 mb-2",
  iconSize = "w-6 h-6",
  imageClass,
  titleClass = "text-xl font-bold text-brand-dark dark:text-dark-heading mb-2",
  subtitleClass = "text-brand-inactive-text dark:text-dark-body max-w-sm mb-2 text-md",
  itemButton,
  buttons,
  className,
}: IconPlaceholderProps) {
  const isImage = placeholderType === "image" || !!imageSrc

  // Default classes based on type
  const defaultImageClass = isImage
    ? "w-72 h-72 mb-4 flex items-center justify-center object-contain"
    : "w-12 h-12 object-contain"

  const defaultTitleClass = isImage
    ? "text-xl font-bold text-brand-dark dark:text-dark-heading mb-2"
    : "text-sm"

  const defaultSubtitleClass = isImage
    ? `text-brand-inactive-text dark:text-dark-body max-w-sm text-md ${(itemButton || (buttons && buttons.length > 0)) ? "mb-8" : ""}`
    : "text-xs"

  const Icon = icon || (!imageSrc && placeholderType === "default" ? AlertCircleIcon : null)

  const renderSingleButton = (btn: any, idx?: number) => {
    const { text, action, type, accept, onChange, disabled, variant = "default", className = "" } = btn
    const key = idx !== undefined ? idx : "single"

    if (type === "file") {
      return (
        <Button key={key} asChild variant={variant} className={`mt-4 ${className}`} disabled={disabled}>
          <label className="cursor-pointer">
            <input
              type="file"
              accept={accept}
              onChange={onChange}
              className="hidden"
              disabled={disabled}
              value=""
            />
            {text}
          </label>
        </Button>
      )
    }

    if (typeof action === "string") {
      return (
        <Button key={key} asChild variant={variant} className={`mt-4 ${className}`} disabled={disabled}>
          <Link href={action} prefetch={false}>
            {text}
          </Link>
        </Button>
      )
    }

    return (
      <Button
        key={key}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          if (typeof action === "function") {
            action()
          }
        }}
        variant={variant}
        className={`mt-4 ${className}`}
        disabled={disabled}
      >
        {text}
      </Button>
    )
  }

  const renderButtons = () => {
    if (buttons && buttons.length > 0) {
      return (
        <div className="flex flex-row flex-wrap items-center justify-center gap-3">
          {buttons.map((btn, idx) => renderSingleButton(btn, idx))}
        </div>
      )
    }
    if (itemButton) {
      return renderSingleButton(itemButton)
    }
    return null
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className || ""}`}>
      {/* Renderiza imagem OU ícone com fundo */}
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={imageAlt}
          loading="lazy"
          className={imageClass || defaultImageClass}
        />
      ) : Icon ? (
        <div
          className={`
            ${containerSize} 
            bg-brand-gray dark:bg-dark-border/30 
            border border-brand-border dark:border-dark-border 
            rounded-full flex items-center justify-center 
            transition-colors
          `}
        >
          <Icon className={`${iconSize} text-brand-dark dark:text-dark-heading`} />
        </div>
      ) : null}

      {/* Renderização Condicional dos Textos */}
      {title && (
        <span className={`text-brand-dark dark:text-dark-heading mt-3 ${titleClass || defaultTitleClass}`}>
          {title}
        </span>
      )}

      {subtitle && (
        <span className={`text-brand-inactive-text dark:text-dark-body mt-1 ${subtitleClass || defaultSubtitleClass}`}>
          {subtitle}
        </span>
      )}

      {renderButtons()}
    </div>
  )
}
