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
  BlockedIcon,
  MoneyIcon,
  MotorbikeIcon,
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
  onPaymentStatus?: () => void
  onDeliveryStatus?: () => void
  cancelLabel?: string
  cancelIcon?: React.ReactNode
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
  onPaymentStatus,
  onDeliveryStatus,
  cancelLabel = "Cancelar",
  cancelIcon,
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
    fullWidth={false}
  >
    {onView && (
      <DropdownItem onClick={onView}>
        <EyeIcon size={18} /> Ver Detalhes
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
    {onUndo && (
      <DropdownItem onClick={onUndo}>
        <ReloadIcon size={18} /> Desfazer
      </DropdownItem>
    )}
    {onShare && (
      <DropdownItem onClick={onShare}>
        <ShareIcon size={18} /> Compartilhar
      </DropdownItem>
    )}
    {onPrint && (
      <DropdownItem onClick={onPrint}>
        <PrinterIcon size={18} /> Imprimir
      </DropdownItem>
    )}
    {onEmail && (
      <DropdownItem onClick={onEmail}>
        <MailIcon size={18} /> Enviar por E-mail
      </DropdownItem>
    )}
    {onArchive && (
      <DropdownItem onClick={onArchive} className="text-brand-orange dark:text-brand-orange">
        <ArchiveIcon size={18} /> Arquivar
      </DropdownItem>
    )}
    {onDelete && (
      <DropdownItem onClick={onDelete} className="text-brand-red dark:text-brand-red">
        <TrashIcon size={18} /> Excluir
      </DropdownItem>
    )}
    {onCancel && (
      <DropdownItem onClick={onCancel} className={cancelLabel === "Cancelar" ? "text-brand-red" : ""}>
        {cancelIcon ? cancelIcon : (
          (cancelLabel.toLowerCase().includes("pago") ||
            cancelLabel.toLowerCase().includes("recebido") ||
            cancelLabel.toLowerCase().includes("quitar") ||
            cancelLabel.toLowerCase().includes("estornar"))
            ? <MoneyIcon size={18} />
            : <BlockedIcon size={18} />
        )} {cancelLabel}
      </DropdownItem>
    )}
    {onPaymentStatus && (
      <DropdownItem onClick={onPaymentStatus}>
        <MoneyIcon size={18} /> Alterar status de pagamento
      </DropdownItem>
    )}
    {onDeliveryStatus && (
      <DropdownItem onClick={onDeliveryStatus}>
        <MotorbikeIcon size={18} /> Alterar status de entrega
      </DropdownItem>
    )}
    {children}
  </Dropdown>
)
