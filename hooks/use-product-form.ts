"use client"

import { useState, useCallback } from "react"
import { useToast } from "@/components/ui/use-toast"
import { validateProductForSave, type ValidationError } from "@/lib/validation/product-validation"
import { calculateProductTaxes } from "@/lib/fiscal-utils"
import { createProductComprehensiveAction, updateProductAction } from "@/app/actions/erp/products"
import { useCSRFToken } from "@/hooks/use-csrf-token"
import { processImagesForModeration } from "@/lib/utils/image-processing"

interface UseProductFormProps {
  initialProduct?: any
  selectedStore?: any
  onSave?: () => Promise<void>
  onBack: () => void
}

export function useProductForm({ initialProduct, selectedStore, onSave, onBack }: UseProductFormProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showValidationModal, setShowValidationModal] = useState(false)
  const csrfToken = useCSRFToken()

  const handleSave = useCallback(
    async (productData: any, editingProductId?: string | null) => {
      console.log("handleSave called", { productData, editingProductId })

      const validation = validateProductForSave(productData)

      if (!validation.valid) {
        console.log("Validation errors:", validation.errors)
        setValidationErrors(validation.errors)
        setShowValidationModal(true)
        return { success: false, errors: validation.errors }
      }

      try {
        setIsLoading(true)

        console.log("Calculating taxes...")
        const taxData = await calculateProductTaxes(productData)
        console.log("Tax data:", taxData)

        // Get image keys for moderation (no client-side processing needed)
        console.log("Collecting images for moderation...")
        const imageKeysForModeration = (productData.images || []).slice(0, 2)

        // IDs may be empty for guest users - the server action resolves via getCurrentPartnerContext()
        let partnerId = selectedStore?.partner_id || ""
        let storeId = selectedStore?.id || ""

        const saveData = {
          partnerId,
          storeId,
          name: productData.name,
          description: productData.description,
          category: productData.category,
          subcategory: productData.subcategory,
          brand: productData.brand,
          sku: productData.sku,
          gtin: productData.gtin,
          unit: productData.unit,
          productType: productData.productType,
          condition: productData.condition,
          costPrice: productData.costPrice,
          price: productData.price,
          stockQuantity: productData.stock,
          minStock: productData.minStock,
          location: productData.localizacao,
          images: productData.images,
          imageKeysForModeration,
          isActive: productData.is_active,
          ncm: productData.ncm,
          cest: productData.cest,
          origin: productData.origin,
          item_type: productData.item_type,
          cfop_internal: productData.cfop_internal,
          cfop_external: productData.cfop_external,
          csosn: productData.csosn,
          tax_percentage: taxData.tax_percentage,
          pis_cst: taxData.pis_cst,
          pis_rate: taxData.pis_rate,
          cofins_cst: taxData.cofins_cst,
          cofins_rate: taxData.cofins_rate,
          ipi_cst: productData.ipi_cst,
          ipi_code: productData.ipi_code,
          product_situation: productData.product_situation,
          c_benef: productData.c_benef,
          inf_ad_prod: productData.inf_ad_prod,
          weight_gross: productData.weight_gross,
          weight_net: productData.weight_net,
          width: productData.width,
          height: productData.height,
          length: productData.length,
        }

        let result

        if (editingProductId || initialProduct?.id) {
          const productIdToUpdate = editingProductId || initialProduct?.id
          result = await updateProductAction({
            productId: productIdToUpdate,
            ...saveData,
            csrf_token: csrfToken || undefined,
          })

          if (result.success) {
            toast({ title: "Sucesso", description: "Produto atualizado com sucesso" })
          } else {
            toast({ title: "Erro", description: result.error || "Erro ao atualizar produto", variant: "destructive" })
          }
        } else {
          result = await createProductComprehensiveAction({
            ...saveData,
            csrf_token: csrfToken || undefined,
          })

          if (result.success) {
            toast({ title: "Sucesso", description: "Produto criado com sucesso" })
          } else {
            toast({ title: "Erro", description: result.error || "Erro ao criar produto", variant: "destructive" })
          }
        }

        if (result.success) {
          if (onSave) await onSave()
          setTimeout(() => onBack(), 300)
          return { success: true }
        }

        return { success: false, error: result.error }
      } catch (error) {
        console.error("Error saving product:", error)
        toast({ title: "Erro", description: "Ocorreu um erro inesperado.", variant: "destructive" })
        return { success: false }
      } finally {
        setIsLoading(false)
      }
    },
    [selectedStore, initialProduct, onSave, onBack, toast, csrfToken]
  )

  return {
    isLoading,
    validationErrors,
    showValidationModal,
    setShowValidationModal,
    handleSave,
  }
}
