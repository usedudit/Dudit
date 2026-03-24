"use client"

import type React from "react"
import { useEffect } from "react"
import { Input, FormDropdown, RichTextEditor, Checkbox, Accordion, Spinner } from "@/components/reusable"
import { SparklesIcon, LinkIcon } from "@/lib/icons"
import { ITEM_TYPES, ORIGIN_OPTIONS } from "@/lib/constants/product-constants"
import { detectMonophasicByNcm } from "@/lib/fiscal-utils"

interface ProductFiscalTabProps {
  productData: any
  handleInputChange: (e: any) => void
  handleSuggestNcm: () => void
  isLoadingNcmSuggestion: boolean
  isEditing: boolean
  fieldErrors?: Set<string>
  onFieldChange?: (field: string) => void
}

export const ProductFiscalTab: React.FC<ProductFiscalTabProps> = ({
  productData,
  handleInputChange,
  handleSuggestNcm,
  isLoadingNcmSuggestion,
  isEditing,
  fieldErrors,
  onFieldChange,
}) => {

  // Helper para notificar mudança de campo (limpar erro visual)
  const handleFieldChange = (e: any) => {
    if (onFieldChange && e.target.name) onFieldChange(e.target.name)
    handleInputChange(e)
  }

  // Auto-detecta monofásico pelo NCM ao digitar (UX: Preenchimento Mágico)
  useEffect(() => {
    if (!productData.ncm || !isEditing) return

    // Verifica se já tem flag definida para não sobrescrever decisão manual do usuário
    // Se undefined, roda a detecção.
    if (productData.is_monophasic === undefined) {
      const detected = detectMonophasicByNcm(productData.ncm)
      if (detected) {
        handleInputChange({ target: { name: "is_monophasic", value: true } })
      }
    }
  }, [productData.ncm, isEditing, productData.is_monophasic, handleInputChange])

  return (
    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">

      {/* COLUNA ESQUERDA (Dados Fiscais Principais) */}
      <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">

        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">
          Informações fiscais
        </h3>

        <div className="space-y-6">

          {/* --- LINHA 1: Origem e Tipo --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <FormDropdown
                label="Origem da Mercadoria"
                width="w-full"
                options={ORIGIN_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={String(productData.origin || 0)}
                setValue={(v) => {
                  if (onFieldChange) onFieldChange("origin")
                  handleInputChange({ target: { name: "origin", value: Number.parseInt(v) } })
                }}
                disabled={!isEditing}
                error={fieldErrors?.has("origin")}
              />
              {fieldErrors?.has("origin") && <span className="text-xs text-brand-red">Obrigatório</span>}
            </div>

            <FormDropdown
              label="Tipo do Item"
              width="w-full"
              options={ITEM_TYPES.map((t) => ({ value: t.code, label: t.description }))}
              value={productData.item_type || "00"}
              setValue={(v) => handleFieldChange({ target: { name: "item_type", value: v } })}
              disabled={!isEditing}
            />
          </div>

          {/* --- LINHA 2: NCM e CEST --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Input NCM com Botão IA Interno */}
            <div className="relative group">
              <Input
                label="NCM *"
                name="ncm"
                value={productData.ncm || ""}
                onChange={(e) => {
                  // Remove não-numeros e limita a 8 digitos
                  const value = e.target.value.replace(/\D/g, "").slice(0, 8)
                  if (onFieldChange) onFieldChange("ncm")
                  handleInputChange({ target: { name: "ncm", value } })
                }}
                disabled={!isEditing}
                placeholder="00000000"
                maxLength={8}
                // Padding right garante que o texto não fique atrás do botão
                className="mb-0 pr-[70px]"
                error={fieldErrors?.has("ncm")}
              />

              {/* Botão Sugerir IA posicionado dentro do input */}
              <div className="absolute right-[1px] bottom-[1px] h-[40px] flex items-center pr-2 bg-transparent rounded-br-md rounded-tr-md z-10">
                <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mr-2" />
                <button
                  type="button"
                  onClick={handleSuggestNcm}
                  disabled={!isEditing || isLoadingNcmSuggestion || !productData.name}
                  className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green/20"
                  title="Sugerir NCM com Inteligência Artificial"
                >
                  {isLoadingNcmSuggestion ? (
                    <Spinner className="text-brand-green" size={18} />
                  ) : (
                    <SparklesIcon size={18} className="text-brand-green" fill="currentColor" />
                  )}
                </button>
              </div>
            </div>

            {/* Input CEST com Link Externo */}
            <div className="relative">
              <a
                href="https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute right-0 top-0 text-xs font-bold text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading flex items-center gap-1 z-10 transition-colors"
                title="Consultar tabela oficial"
              >
                <LinkIcon size={12} /> Consultar
              </a>
              <Input
                label="CEST"
                name="cest"
                value={productData.cest || ""}
                onChange={(e) => {
                  if (onFieldChange) onFieldChange("cest")
                  handleInputChange(e)
                }}
                disabled={!isEditing}
                placeholder="0000000"
                maxLength={7}
                className="mb-0"
                error={fieldErrors?.has("cest")}
              />
            </div>
          </div>

          {/* --- LINHA 3: Flags Fiscais (ST e Monofásico) --- */}
          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            {productData.item_type !== "04" && (
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => isEditing && handleFieldChange({ target: { name: "has_st", value: !productData.has_st } })}
              >
                <Checkbox
                  checked={!!productData.has_st}
                  label="Sujeito a Subst. Tributária (ST)"
                  onChange={() => { }} // Controlado pelo onClick da div pai para aumentar área de clique
                  disabled={!isEditing}
                />
              </div>
            )}

            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => isEditing && handleFieldChange({ target: { name: "is_monophasic", value: !productData.is_monophasic } })}
            >
              <Checkbox
                checked={!!productData.is_monophasic}
                label="Produto Monofásico (PIS/COFINS)"
                onChange={() => { }}
                disabled={!isEditing}
              />
            </div>
          </div>

        </div>

        <div className="border-t border-brand-border dark:border-dark-border w-full my-8"></div>

        {/* --- DADOS AVANÇADOS (Collapsible) --- */}
        <Accordion
          title="Dados Fiscais Avançados"
          defaultOpen={false}
          triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 text-left hover:opacity-80 transition-opacity"
        >
          <div className="pb-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input
                label="GTIN Tributável (EAN Menor Unidade)"
                name="gtin_taxable"
                value={productData.gtin_taxable || ""}
                onChange={handleFieldChange}
                disabled={!isEditing}
                placeholder="Deixe vazio se for igual ao EAN"
                className="bg-brand-gray dark:bg-dark-surface/50"
              />

              <Input
                label="Código Benefício Fiscal (cBenef)"
                name="c_benef"
                value={productData.c_benef || ""}
                onChange={handleFieldChange}
                disabled={!isEditing}
                placeholder="Ex: PR800000"
                className="bg-brand-gray dark:bg-dark-surface/50"
              />

              {/* FCI só aparece se for importado */}
              {["1", "2", "3", "5", "8"].includes(String(productData.origin)) && (
                <Input
                  label="FCI (Ficha de Conteúdo de Importação)"
                  name="fci_code"
                  value={productData.fci_code || ""}
                  onChange={handleFieldChange}
                  disabled={!isEditing}
                  placeholder="Código UUID da FCI"
                  className="bg-brand-gray dark:bg-dark-surface/50"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              * Estes campos são opcionais para a maioria dos casos no Simples Nacional.
            </p>
          </div>
        </Accordion>
      </div>

      {/* COLUNA DIREITA (Info Adicional) */}
      <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden shadow-sm">
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border"></div>
          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">
            Outras informações
          </h3>

          <div className="space-y-6">
            <RichTextEditor
              label="Informações Adicionais (Rodapé da Nota)"
              value={productData.inf_ad_prod || ""}
              onChange={(value) => handleFieldChange({ target: { name: "inf_ad_prod", value } })}
              disabled={!isEditing}
            />
            <div className="text-xs text-muted-foreground">
              Este texto aparecerá no campo "Dados Adicionais" da DANFE.
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
