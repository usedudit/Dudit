"use client"

import React, { useState } from "react"
import { Button } from "./Button"
import Dropdown, { DropdownItem } from "../reusable/Dropdown"
import {
  ChevronDownIcon,
  ThreeDotsIcon,
  EditIcon,
  TrashIcon,
  ShareIcon,
  StatusIcon,
  CopyIcon,
  EyeIcon,
  DuplicateIcon,
  PrinterIcon,
  ArchiveIcon,
  ReturnIcon,
  CancelIcon,
  TruckIcon,
} from "@/lib/icons"

interface AccordionProps {
  title: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  triggerClass?: string
  titleClass?: string
  onToggle?: (isOpen: boolean) => boolean | void
}

export const Accordion: React.FC<AccordionProps> = ({
  title,
  children,
  defaultOpen = false,
  triggerClass,
  titleClass,
  onToggle
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const buttonStyles = triggerClass
    ? `flex items-center justify-between w-full transition-colors ${triggerClass}`
    : "flex items-center justify-between w-full py-4 text-sm font-semibold text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border/30 px-2 rounded-lg transition-colors"

  return (
    <div className={`last:border-0 pb-2 ${!triggerClass ? "border-b border-brand-border dark:border-dark-border" : ""}`}>
      <button
        type="button"
        onClick={(e) => {
          if (onToggle) {
            const result = onToggle(!isOpen)
            if (result === false) return
          }
          setIsOpen(!isOpen)
        }}
        className={buttonStyles}
      >
        <span className={titleClass || ""}>{title}</span>
        <ChevronDownIcon
          // Adicionei duration-500 aqui também para a seta girar na mesma velocidade do conteúdo
          className={`w-4 h-4 text-brand-dark dark:text-dark-heading transition-transform duration-500 ease-in-out ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* TÉCNICA DO GRID PARA ANIMAÇÃO SUAVE */}
      <div
        className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
      >
        <div className="overflow-hidden">
          {/* O conteúdo interno precisa estar aqui dentro para o Grid funcionar */}
          <div
            className={`transition-opacity duration-500 ${isOpen ? "opacity-100" : "opacity-0"} ${!triggerClass ? "px-2 pt-2 pb-2 space-y-2" : "pt-0"}`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export interface ActionsDropdownProps {
  onView?: () => void
  onEdit?: (() => void) | undefined
  onStatus?: (() => void) | undefined
  onPaymentStatus?: (() => void) | undefined
  onDeliveryStatus?: (() => void) | undefined
  onShare?: (() => void) | undefined
  onCopy?: (() => void) | undefined
  onDuplicate?: (() => void) | undefined
  onArchive?: (() => void | Promise<void>) | undefined
  onUnarchive?: (() => void | Promise<void>) | undefined
  onCancel?: (() => void) | undefined
  cancelLabel?: string
  onPrint?: (() => void) | undefined
  onUndo?: (() => void) | undefined
  onDelete?: (() => void) | undefined
  trigger?: React.ReactElement
  className?: string
  children?: React.ReactNode
}

export const ActionsDropdown: React.FC<ActionsDropdownProps> = ({
  onView,
  onEdit,
  onDuplicate,
  onStatus,
  onPaymentStatus,
  onDeliveryStatus,
  onShare,
  onCopy,
  onPrint,
  onArchive,
  onUnarchive,
  onUndo,
  onCancel,
  cancelLabel,
  onDelete,
  trigger,
  className,
  children,
}) => (
  <Dropdown
    trigger={
      trigger || (
        <Button variant="outline" className={`w-[40px] h-[40px] p-0 flex items-center justify-center ${className || ""}`}>
          <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
        </Button>
      )
    }
    align="right"
    showChevron={false}
    fullWidth={false}
  >
    {children}
    {onView && (
      <DropdownItem onClick={onView}>
        <EyeIcon size={18} /> Visualizar
      </DropdownItem>
    )}
    {onEdit && (
      <DropdownItem onClick={onEdit}>
        <EditIcon size={18} /> Editar
      </DropdownItem>
    )}
    {onDuplicate && (
      <DropdownItem onClick={onDuplicate}>
        <DuplicateIcon size={18} /> Duplicar
      </DropdownItem>
    )}
    {onStatus && (
      <DropdownItem onClick={onStatus}>
        <StatusIcon size={18} /> Alterar Status
      </DropdownItem>
    )}
    {onPaymentStatus && (
      <DropdownItem onClick={onPaymentStatus}>
        <StatusIcon size={18} /> Status do Pagamento
      </DropdownItem>
    )}
    {onDeliveryStatus && (
      <DropdownItem onClick={onDeliveryStatus}>
        <TruckIcon size={18} /> Status da Entrega
      </DropdownItem>
    )}
    {onShare && (
      <DropdownItem onClick={onShare}>
        <ShareIcon size={18} /> Compartilhar
      </DropdownItem>
    )}
    {onCopy && (
      <DropdownItem onClick={onCopy}>
        <CopyIcon size={18} /> Copiar link
      </DropdownItem>
    )}
    {onPrint && (
      <DropdownItem onClick={onPrint}>
        <PrinterIcon size={18} /> Imprimir
      </DropdownItem>
    )}
    {onArchive && (
      <DropdownItem onClick={onArchive}>
        <ArchiveIcon size={18} /> Arquivar
      </DropdownItem>
    )}
    {onUnarchive && (
      <DropdownItem onClick={onUnarchive}>
        <ArchiveIcon size={18} /> Desarquivar
      </DropdownItem>
    )}
    {onUndo && (
      <DropdownItem onClick={onUndo}>
        <ReturnIcon size={18} /> Desfazer
      </DropdownItem>
    )}
    {onCancel && (
      <DropdownItem onClick={onCancel}>
        <CancelIcon size={18} /> {cancelLabel || "Cancelar"}
      </DropdownItem>
    )}
    {onDelete && (
      <DropdownItem onClick={onDelete} className="text-brand-red dark:text-brand-red">
        <TrashIcon size={18} /> Excluir
      </DropdownItem>
    )}
  </Dropdown>
)
