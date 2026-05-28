"use client"

import AlertModal from "@/components/reusable/AlertModal"

interface UnsavedChangesDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  description?: string
}

export function UnsavedChangesDialog({
  open,
  onConfirm,
  onCancel,
  description = "Você tem alterações que ainda não foram salvas.",
}: UnsavedChangesDialogProps) {
  return (
    <AlertModal
      isOpen={open}
      onClose={onCancel}
      onConfirm={onConfirm}
      title="Sair sem salvar?"
      description={description}
      confirmText="Sair sem salvar"
      cancelText="Continuar editando"
      variant="warning"
    />
  )
}

