import type React from "react"
import { AlertCircleIcon } from "@/lib/icons"
import { Button } from "./Button"
import Link from "next/link"

interface IconPlaceholderProps {
  placeholderType?: "default" | "image"
  icon?: React.ElementType
  imageSrc?: string
  imageAlt?: string
  title?: string
  subtitle?: string
  containerSize?: string
  iconSize?: string
  imageClass?: string
  titleClass?: string
  subtitleClass?: string
  itemButton?: {
    text: string
    action: string | (() => void)
    variant?: "default" | "outline" | "outlinered" | "destructive" | "ghost" | "filled"
    className?: string
  }
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
    ? `text-brand-inactive-text dark:text-dark-body max-w-sm text-md ${itemButton ? "mb-8" : ""}`
    : "text-xs"

  const Icon = icon || (!imageSrc && placeholderType === "default" ? AlertCircleIcon : null)

  const renderButton = () => {
    if (!itemButton) return null
    const { text, action, variant = "default", className = "" } = itemButton

    if (typeof action === "string") {
      return (
        <Button asChild variant={variant} className={`mt-4 ${className}`}>
          <Link href={action} prefetch={false}>
            {text}
          </Link>
        </Button>
      )
    }

    return (
      <Button onClick={action} variant={variant} className={`mt-4 ${className}`}>
        {text}
      </Button>
    )
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className || ""}`}>
      {/* Renderiza imagem OU ícone com fundo */}
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={imageAlt}
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

      {renderButton()}
    </div>
  )
}