"use client"

import type React from "react"
import cn from "classnames"

import { useState, useRef } from "react" // Adicionado useRef
import { Button, IconPlaceholder } from "@/components/reusable"
import DefaultModal from "@/components/reusable/DefaultModal"
import AlertModal from "@/components/reusable/AlertModal"
import { UploadIcon, FileVerifiedIcon, AlertTriangleIcon } from "@/lib/icons"
import { importProductsFromXMLAction } from "@/app/actions/erp/import-xml"
import { useNotification } from "@/hooks/use-notification"

interface ImportXmlModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  storeId: string
  onImportSuccess: () => void
}

export function ImportXmlModal({ isOpen, onClose, partnerId, storeId, onImportSuccess }: ImportXmlModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [showValidationAlert, setShowValidationAlert] = useState(false)

  // Referência para controlar o input de arquivo manualmente
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [validationError, setValidationError] = useState<{
    message: string
    partnerDoc?: string
    xmlDoc?: string
  } | null>(null)
  const { success, error: notifyError } = useNotification()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.endsWith(".xml")) {
        notifyError("Arquivo inválido", "Por favor, selecione um arquivo XML válido.")
        return
      }
      setSelectedFile(file)
      setValidationError(null)
    }
  }

  // Função que dispara o clique no input oculto
  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleImport = async () => {
    if (!selectedFile) {
      return
    }

    setIsImporting(true)
    setValidationError(null)

    try {
      const fileContent = await selectedFile.text()
      const result = await importProductsFromXMLAction(fileContent, partnerId, storeId)

      if (!result.success && result.requiresConfirmation) {
        setValidationError({
          message: result.validationError || "CPF/CNPJ não corresponde",
          partnerDoc: result.partnerDoc,
          xmlDoc: result.xmlDoc,
        })
        setShowValidationAlert(true)
        setIsImporting(false)
        return
      }

      if (result.success) {
        success("Importação concluída!", `${result.importedCount} produto(s) importado(s) da nota fiscal.`)
        onImportSuccess()
        setTimeout(() => {
          handleClose()
        }, 2000)
      } else {
        notifyError("Erro na importação", result.error || "Não foi possível importar os produtos do XML.")
      }
    } catch (err) {
      console.error("Exception during import:", err)
      notifyError("Erro ao processar XML", "Verifique se o arquivo está no formato correto da NF-e.")
    } finally {
      setIsImporting(false)
    }
  }

  const handleClose = () => {
    setSelectedFile(null)
    setValidationError(null)
    setShowValidationAlert(false)
    onClose()
  }

  const handleCloseValidationAlert = () => {
    setShowValidationAlert(false)
    setSelectedFile(null)
    setValidationError(null)
  }

  return (
    <>
      <DefaultModal
        isOpen={isOpen && !showValidationAlert}
        onClose={handleClose}
        title="Importar XML"
        maxWidth="2xl"
        footer={
          <>
            <Button variant="outline" onClick={handleClose} disabled={isImporting}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={!selectedFile || isImporting}>
              {isImporting ? "Importando..." : "Importar"}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
              Faça o upload do arquivo XML da nota fiscal. O sistema extrairá automaticamente dados fiscais, tributários e comerciais.
            </p>
          </div>

          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center min-h-[250px]",
              selectedFile
                ? "border-brand-blue bg-brand-blue/5 dark:bg-brand-blue/10"
                : "border-brand-border dark:border-dark-border bg-brand-bg-light/50 dark:bg-dark-card/50",
            )}
          >
            {/* Input Oculto conectado ao REF */}
            <input
              ref={fileInputRef}
              id="xml-file-input"
              type="file"
              accept=".xml"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!selectedFile ? (
              // Estado Vazio
              <div className="flex flex-col items-center">
                <IconPlaceholder
                  icon={UploadIcon}
                  title="Clique para fazer upload"
                  subtitle="Ou arraste e solte o arquivo XML da NF-e (Máximo: 10 MB)"
                  itemButton={{
                    text: "Selecionar arquivo",
                    action: triggerFileSelect,
                    variant: "outline"
                  }}
                />
              </div>
            ) : (
              // Estado Arquivo Selecionado
              <div className="flex flex-col items-center">
                <IconPlaceholder
                  icon={FileVerifiedIcon}
                  title={selectedFile.name}
                  subtitle="Arquivo selecionado com sucesso"
                  titleClass="text-base font-semibold text-brand-blue dark:text-brand-blue mb-2 text-center"
                  subtitleClass="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-8"
                  itemButton={{
                    text: "Selecionar outro arquivo",
                    action: triggerFileSelect,
                    variant: "ghost",
                    className: "text-sm font-bold text-brand-blue dark:text-brand-blue underline decoration-brand-blue/30 underline-offset-4 hover:bg-transparent px-0"
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </DefaultModal>

      <AlertModal
        isOpen={showValidationAlert}
        onClose={handleCloseValidationAlert}
        title="Documento não corresponde"
        description={`CPF/CNPJ do XML (${validationError?.xmlDoc}) difere do cadastrado (${validationError?.partnerDoc})`}
        variant="warning"
        icon={<AlertTriangleIcon />}
        confirmText="Entendi"
      />
    </>
  )
}
