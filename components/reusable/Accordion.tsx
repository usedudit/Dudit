"use client"

import React, { useState } from "react"
import { Button } from "./Button"
import Dropdown, { DropdownItem } from "../reusable/Dropdown"
import {
  ChevronDownIcon,
  ThreeDotsIcon,
  EditIcon,
  DuplicateIcon,
  TrashIcon,
  EyeIcon,
  ReloadIcon,
  ShareIcon,
  PrinterIcon,
  MailIcon,
  ArchiveIcon,
  BlockedIcon
} from "@/lib/icons"

interface AccordionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  triggerClass?: string
  titleClass?: string
}

export const Accordion: React.FC<AccordionProps> = ({
  title,
  children,
  defaultOpen = false,
  triggerClass,
  titleClass
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const buttonStyles = triggerClass
    ? `flex items-center justify-between w-full transition-colors ${triggerClass}`
    : "flex items-center justify-between w-full py-4 text-sm font-semibold text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border/30 px-2 rounded-lg transition-colors"

  return (
    <div className={`last:border-0 ${!triggerClass ? "border-b border-brand-border dark:border-dark-border" : ""}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
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

// ... ActionsDropdown permanece igual ...
interface ActionsDropdownProps {
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onView?: () => void
  onUndo?: () => void
  onShare?: () => void
  onPrint?: () => void
  onEmail?: () => void
  onArchive?: () => void
  onCancel?: () => void
  trigger?: React.ReactElement
  className?: string
  children?: React.ReactNode
}

export const ActionsDropdown: React.FC<ActionsDropdownProps> = ({
  onEdit,
  onDuplicate,
  onDelete,
  onView,
  onUndo,
  onShare,
  onPrint,
  onEmail,
  onArchive,
  onCancel,
  trigger,
  className,
  children
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
  >
    {onView && (
      <DropdownItem onClick={onView}>
        <EyeIcon className="w-4 h-4" /> Ver Detalhes
      </DropdownItem>
    )}
    {onEdit && (
      <DropdownItem onClick={onEdit}>
        <EditIcon className="w-4 h-4" /> Editar
      </DropdownItem>
    )}
    {onDuplicate && (
      <DropdownItem onClick={onDuplicate}>
        <DuplicateIcon className="w-4 h-4" /> Duplicar
      </DropdownItem>
    )}
    {onUndo && (
      <DropdownItem onClick={onUndo}>
        <ReloadIcon className="w-4 h-4" /> Desfazer
      </DropdownItem>
    )}
    {onShare && (
      <DropdownItem onClick={onShare}>
        <ShareIcon className="w-4 h-4" /> Compartilhar
      </DropdownItem>
    )}
    {onPrint && (
      <DropdownItem onClick={onPrint}>
        <PrinterIcon className="w-4 h-4" /> Imprimir
      </DropdownItem>
    )}
    {onEmail && (
      <DropdownItem onClick={onEmail}>
        <MailIcon className="w-4 h-4" /> Enviar por E-mail
      </DropdownItem>
    )}
    {onArchive && (
      <DropdownItem onClick={onArchive} className="text-brand-orange dark:text-brand-orange">
        <ArchiveIcon className="w-4 h-4" /> Arquivar
      </DropdownItem>
    )}
    {onDelete && (
      <DropdownItem onClick={onDelete} className="text-brand-red dark:text-brand-red">
        <TrashIcon className="w-4 h-4" /> Excluir
      </DropdownItem>
    )}
    {onCancel && (
      <DropdownItem onClick={onCancel} className="text-brand-red dark:text-brand-red">
        <BlockedIcon className="w-4 h-4" /> Cancelar
      </DropdownItem>
    )}
    {children}
  </Dropdown>
)
