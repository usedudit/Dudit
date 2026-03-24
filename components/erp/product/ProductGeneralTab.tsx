"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { Input, FormDropdown, Checkbox, Accordion, MoneyInput } from "@/components/reusable"
import { PlusIcon, ShoppingBag } from "@/lib/icons"
import ProductImagesSection from "./ProductImagesSection"
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts"
import { Combobox } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

const FormCombobox = ({
  label,
  value,
  onChange,
  options,
  disabled,
  width = "w-full",
  actionItem
}: {
  label: string,
  value: any,
  onChange: (val: string) => void,
  options: { label: string, value: string }[],
  disabled?: boolean,
  width?: string,
  actionItem?: { label: string, icon?: React.ReactNode, onClick: () => void }
}) => (
  <div className={`flex flex-col gap-1.5 ${width}`}>
    <label className="text-sm font-medium text-brand-dark dark:text-dark-heading">
      {label}
    </label>
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      width="w-full"
      className={width}
      actionItem={actionItem}
    />
  </div>
)

const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
  <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
    {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
    {children}
  </div>
)

const chartData = [
  { name: 'Feb 01', value: 200 }, { name: 'Feb 05', value: 300 }, { name: 'Feb 10', value: 450 },
  { name: 'Feb 15', value: 250 }, { name: 'Feb 20', value: 380 }, { name: 'Feb 25', value: 500 }, { name: 'Feb 28', value: 780 },
]

interface ProductGeneralTabProps {
  productData: any
  handleInputChange: (e: any) => void
  generateRandomCode: () => void
  categories: string[]
  subCategories: string[]
  brands: string[]
  locations: string[]
  unidadesMedida: Array<{ codigo: string; descricao: string }>
  openAddItemModal: (type: any) => void
  isEditing: boolean
  images: (string | File)[]
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveImage: (index: number) => void
  onSetPrimaryImage: (index: number) => void
  fieldErrors?: Set<string>
  onFieldChange?: (field: string) => void
  uploadingImages?: Set<number>
  blockedImages?: Set<number>
  isSaving?: boolean
  mode?: "add" | "edit" | "details"
  sellsOnline?: boolean
}

export const ProductGeneralTab: React.FC<ProductGeneralTabProps> = ({
  productData, handleInputChange, generateRandomCode, categories, subCategories, brands, locations, unidadesMedida, openAddItemModal, isEditing, images, onImageUpload, onRemoveImage, onSetPrimaryImage, fieldErrors, onFieldChange, uploadingImages, blockedImages, isSaving, mode = "edit", sellsOnline = true
}) => {
  const handleFieldChange = (e: any) => { if (onFieldChange && e.target.name) onFieldChange(e.target.name); handleInputChange(e) }
  const [showPrice, setShowPrice] = useState(true)

  const { salesPrice, profit, margin } = useMemo(() => {
    const p = Number(productData.price || 0), c = Number(productData.costPrice || 0)
    return { salesPrice: p, profit: p - c, margin: p > 0 ? ((p - c) / p * 100).toFixed(1) : "0.0" }
  }, [productData.price, productData.costPrice])

  const showInMarketplaceValue = productData.show_in_marketplace === undefined ? "true" : String(productData.show_in_marketplace)

  return (
    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">

      {/* ESQUERDA (Principal) */}
      <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">

        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Informações básicas</h3>

        <div className="mb-10">
          <ProductImagesSection images={images} onImageUpload={onImageUpload} onRemoveImage={onRemoveImage} onSetPrimaryImage={onSetPrimaryImage} isEditing={isEditing} uploadingImages={uploadingImages} blockedImages={blockedImages} isSaving={isSaving} moderationStatus={productData.moderation_status} />
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12">
              <Input label="Nome do Produto" name="name" value={productData.name} onChange={handleFieldChange} disabled={!isEditing} required />
            </div>

            <div className={`col-span-12 sm:col-span-6`}>
              <FormDropdown
                label="Status"
                options={[{ value: "true", label: "Ativo" }, { value: "false", label: "Inativo" }]}
                value={String(productData.is_active)}
                setValue={(v) => handleFieldChange({ target: { name: "is_active", value: v === "true" } })}
                disabled={!isEditing}
                width="w-full"
              />
            </div>

            {sellsOnline && (
              <div className="col-span-12 sm:col-span-6">
                <FormDropdown
                  label="Exibir no Marketplace"
                  options={[{ value: "true", label: "Sim" }, { value: "false", label: "Não" }]}
                  value={showInMarketplaceValue}
                  setValue={(v) => handleFieldChange({ target: { name: "show_in_marketplace", value: v === "true" } })}
                  disabled={!isEditing}
                  width="w-full"
                />
              </div>
            )}
          </div>
        </div>

        {/* PREÇO */}
        <div className="mt-8">
          <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Preço</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
            <MoneyInput label="Preço de Custo" name="costPrice" value={productData.costPrice || ""} onChange={(val) => handleFieldChange({ target: { name: "costPrice", value: val } })} disabled={!isEditing || !showPrice} />
            <MoneyInput label="Preço de Venda" name="price" value={productData.price || ""} onChange={(val) => handleFieldChange({ target: { name: "price", value: val } })} disabled={!isEditing || !showPrice} required />
            <MoneyInput label="Preço Promocional" name="promotional_price" value={productData.promotional_price || ""} onChange={(val) => handleFieldChange({ target: { name: "promotional_price", value: val } })} disabled={!isEditing || !showPrice} />
          </div>

          {showPrice && (
            <div className="border border-brand-border dark:border-dark-border rounded-xl p-4 md:p-6 mb-6 bg-white dark:bg-dark-surface">
              <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-brand-border dark:divide-dark-border gap-6 sm:gap-0">
                <div className="flex-1 px-4 first:pl-0"><span className="block text-sm text-brand-inactive-text mb-1">Preço final</span><span className="text-xl font-bold text-brand-dark dark:text-dark-heading">R$ {salesPrice.toFixed(2)}</span></div>
                <div className="flex-1 px-4"><span className="block text-sm text-brand-inactive-text mb-1">Lucro estimado</span><span className="text-xl font-bold text-emerald-600">R$ {profit.toFixed(2)}</span></div>
                <div className="flex-1 px-4 last:pr-0"><span className="block text-sm text-brand-inactive-text mb-1">Margem bruta</span><span className="text-xl font-bold text-brand-dark dark:text-dark-heading">{margin}%</span></div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 cursor-pointer w-fit mt-2">
            <Checkbox checked={showPrice} label="Exibir o preço na loja" onChange={setShowPrice} name="showPrice" disabled={!isEditing} />
          </div>
        </div>

        {/* ESTOQUE */}
        <div className="mt-8">
          <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>
          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5">Estoque</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
            <Input label="Estoque Atual" name="stock" type="number" value={productData.stock || ""} onChange={handleFieldChange} disabled={!isEditing} />
            <Input label="Mínimo" name="minStock" type="number" value={productData.minStock || ""} onChange={handleFieldChange} disabled={!isEditing} />

            <FormCombobox
              label="Localização"
              options={locations.map((l) => ({ value: l, label: l }))}
              value={productData.localizacao}
              onChange={(v) => handleFieldChange({ target: { name: "localizacao", value: v } })}
              disabled={!isEditing}
              width="w-full"
              actionItem={{ label: "Add", icon: <PlusIcon className="w-3 h-3" />, onClick: () => openAddItemModal("location") }}
            />
          </div>

          <div className="flex items-center gap-2 cursor-pointer w-fit mt-2">
            <Checkbox
              checked={productData.allow_sell_without_stock}
              onChange={(c) =>
                handleFieldChange({
                  target: { name: "allow_sell_without_stock", value: c }
                })
              }
              name="allow_sell_without_stock"
              disabled={!isEditing}
              label="Permitir vender sem estoque"
            />
          </div>
        </div>

        {/* ENVIO - Agora com estilo corrigido */}
        <div className="mt-8">
          <div className="border-t border-brand-border dark:border-dark-border mb-8 w-full"></div>

          <Accordion title="Envio e Dimensões" defaultOpen={false} triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading mb-5 text-left">
            <div className="pb-4">
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                  <Input label="Peso Líquido (kg)" name="weight_net" value={productData.weight_net} onChange={handleFieldChange} disabled={!isEditing} />
                  {/* ... restante dos inputs ... */}
                  <Input label="Peso Bruto (kg)" name="weight_gross" value={productData.weight_gross} onChange={handleFieldChange} disabled={!isEditing} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label="Prazo de Preparação (dias)"
                            name="preparation_days"
                            type="number"
                            value={productData.preparation_days}
                            onChange={handleFieldChange}
                            disabled={!isEditing}
                            placeholder="0"
                        />
                        <FormDropdown
                            label="Tipo de Embalagem"
                            options={[
                                { value: "package", label: "Pacote/Caixa" },
                                { value: "cilinder", label: "Cilindro/Rolo" },
                                { value: "envelope", label: "Envelope" }
                            ]}
                            value={productData.packaging_type}
                            setValue={(v) => handleFieldChange({ target: { name: "packaging_type", value: v } })}
                            disabled={!isEditing}
                            width="w-full"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                  <Input label="Largura (cm)" name="width" value={productData.width} onChange={handleFieldChange} disabled={!isEditing} />
                  <Input label="Altura (cm)" name="height" value={productData.height} onChange={handleFieldChange} disabled={!isEditing} />
                  <Input label="Profund. (cm)" name="length" value={productData.length} onChange={handleFieldChange} disabled={!isEditing} />
                </div>
              </div>
            </div>
          </Accordion>
        </div>
      </div>

      {/* DIREITA (Widgets) */}
      <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
        <SidebarCard hasTopStrip>
          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Organização</h3>
          <div className="space-y-5">
            <Input
              label="Código do Produto"
              name="sku"
              value={productData.sku}
              onChange={handleFieldChange}
              disabled={!isEditing}
              suffix={
                <div
                  onClick={generateRandomCode}
                  className="cursor-pointer p-1"
                />
              }
            />

            <Input label="Código de Barras (EAN/GTIN)" name="gtin" value={productData.gtin} onChange={handleFieldChange} disabled={!isEditing} />

            <FormCombobox
              label="Categoria"
              options={categories.map(c => ({ value: c, label: c }))}
              value={productData.category}
              onChange={(v) => handleFieldChange({ target: { name: "category", value: v } })}
              disabled={!isEditing}
              width="w-full"
              actionItem={{ label: "Add", icon: <PlusIcon className="w-4 h-4" />, onClick: () => openAddItemModal("category") }}
            />

            <FormCombobox
              label="Subcategoria"
              options={subCategories.map(c => ({ value: c, label: c }))}
              value={productData.subcategory}
              onChange={(v) => handleFieldChange({ target: { name: "subcategory", value: v } })}
              disabled={!isEditing}
              width="w-full"
            />

            <FormCombobox
              label="Marca"
              options={brands.map(c => ({ value: c, label: c }))}
              value={productData.brand}
              onChange={(v) => handleFieldChange({ target: { name: "brand", value: v } })}
              disabled={!isEditing}
              width="w-full"
            />

            <FormCombobox
              label="Unidade"
              options={unidadesMedida.map(c => ({ value: c.codigo, label: c.codigo }))}
              value={productData.unidade}
              onChange={(v) => handleFieldChange({ target: { name: "unidade", value: v } })}
              disabled={!isEditing}
              width="w-full"
            />
          </div>
        </SidebarCard>

        {mode !== "add" && (
          <SidebarCard>
            <div className="flex items-center gap-2 mb-2"><ShoppingBag size={18} className="rotate-90 stroke-[2.5]" /><h3 className="text-[15px] font-bold">Total sales</h3></div>
            <div className="flex items-baseline gap-3 mb-8 pl-1"><span className="text-[32px] font-bold">$840.00</span></div>
            <div className="h-48 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.15} /><stop offset="95%" stopColor="#059669" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="name" axisLine={false} tickLine={false} interval={3} /><Tooltip /><Area type="monotone" dataKey="value" stroke="#059669" strokeWidth={2.5} fillOpacity={1} fill="url(#colorValue)" /></AreaChart></ResponsiveContainer></div>
          </SidebarCard>
        )}
      </div>
    </div>
  )
}
