"use client"

import React from "react"
import { Button, Badge, InfoCard, FormSection } from "@/components/reusable"
import { ChevronLeftIcon, EditIcon, FileTextIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"

interface SupplierDetailPageProps {
  supplier: any
  onBack: () => void
  onEdit: (supplier: any) => void
}

const SupplierDetailPage: React.FC<SupplierDetailPageProps> = ({ supplier, onBack, onEdit }) => {
  const isPJ = supplier.person_type === "pj" || !!supplier.cnpj

  return (
    <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
      <div className="sticky top-0 z-30 bg-white dark:bg-dark-surface border-b">
        <div className="max-w-[1300px] mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
              <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-bold text-xl text-brand-dark dark:text-dark-heading">{supplier.name}</h1>
                <Badge variant={supplier.status === "ativo" ? "green" : "gray"}>
                  {supplier.status === "ativo" ? "Ativo" : "Inativo"}
                </Badge>
                {supplier.supplier_code && (
                  <span className="text-xs text-brand-inactive-text bg-brand-gray dark:bg-dark-border/30 px-2 py-0.5 rounded">
                    {supplier.supplier_code}
                  </span>
                )}
              </div>
              <p className="text-sm text-brand-inactive-text">{isPJ ? "CNPJ" : "CPF"}: {supplier.cnpj || supplier.cpf || "—"}</p>
            </div>
          </div>
          <Button onClick={() => onEdit(supplier)} leftIcon={<EditIcon size={18} />}>Editar</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1300px] mx-auto px-4 md:px-8 py-6 space-y-6">

          <FormSection title="Informações">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-brand-inactive-text block">Nome</span>
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.name}</span>
              </div>
              {isPJ && supplier.nome_fantasia && (
                <div>
                  <span className="text-xs text-brand-inactive-text block">Nome Fantasia</span>
                  <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.nome_fantasia}</span>
                </div>
              )}
              {supplier.email && (
                <div>
                  <span className="text-xs text-brand-inactive-text block">E-mail</span>
                  <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.email}</span>
                </div>
              )}
              {supplier.phone && (
                <div>
                  <span className="text-xs text-brand-inactive-text block">Telefone</span>
                  <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.phone}</span>
                </div>
              )}
              {isPJ && supplier.inscricao_estadual && (
                <div>
                  <span className="text-xs text-brand-inactive-text block">Inscrição Estadual</span>
                  <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.inscricao_estadual}</span>
                </div>
              )}
              <div>
                <span className="text-xs text-brand-inactive-text block">Cadastrado em</span>
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.created_at ? formatDate(supplier.created_at) : "—"}</span>
              </div>
            </div>
            {supplier.notes && (
              <div className="mt-4">
                <span className="text-xs text-brand-inactive-text block">Observações</span>
                <p className="text-sm text-brand-dark dark:text-dark-heading mt-0.5">{supplier.notes}</p>
              </div>
            )}
          </FormSection>

          {(supplier.street || supplier.city) && (
            <FormSection title="Endereço">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {supplier.street && (
                  <div>
                    <span className="text-xs text-brand-inactive-text block">Logradouro</span>
                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                      {supplier.street}, {supplier.number || "S/N"}{supplier.complement ? ` - ${supplier.complement}` : ""}
                    </span>
                  </div>
                )}
                {supplier.neighborhood && (
                  <div>
                    <span className="text-xs text-brand-inactive-text block">Bairro</span>
                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.neighborhood}</span>
                  </div>
                )}
                {supplier.city && (
                  <div>
                    <span className="text-xs text-brand-inactive-text block">Cidade / Estado</span>
                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.city}{supplier.state ? ` / ${supplier.state}` : ""}</span>
                  </div>
                )}
                {supplier.zip_code && (
                  <div>
                    <span className="text-xs text-brand-inactive-text block">CEP</span>
                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{supplier.zip_code}</span>
                  </div>
                )}
              </div>
            </FormSection>
          )}

          <FormSection title="Importações XML">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-brand-gray dark:bg-dark-border/30 rounded-xl p-4">
                <span className="text-xs text-brand-inactive-text block">XMLs Importados</span>
                <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{supplier.xml_count || 0}</span>
              </div>
              <div className="bg-brand-gray dark:bg-dark-border/30 rounded-xl p-4">
                <span className="text-xs text-brand-inactive-text block">Valor Total</span>
                <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{supplier.total_imported_value ? formatCurrency(supplier.total_imported_value) : "R$ 0,00"}</span>
              </div>
              <div className="bg-brand-gray dark:bg-dark-border/30 rounded-xl p-4">
                <span className="text-xs text-brand-inactive-text block">Última Importação</span>
                <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{supplier.last_import_at ? formatDate(supplier.last_import_at) : "—"}</span>
              </div>
            </div>
          </FormSection>
        </div>
      </div>
    </FadeIn>
  )
}

export default SupplierDetailPage
