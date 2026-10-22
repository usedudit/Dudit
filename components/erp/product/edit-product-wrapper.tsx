"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import AddProductPage from "./AddProductPage"
import type { Product } from "@/lib/types/product"
import { updateProductAction, deleteProductAction, checkProductInOrdersAction } from "@/app/actions/erp/products"
import { UNITS } from "@/lib/constants/product-constants"
import { useNotification } from "@/hooks/use-notification"
import AlertModal from "@/components/reusable/AlertModal"
import { TrashIcon } from "@/lib/icons"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"

interface EditProductWrapperProps {
    product: Product & {
        costPrice: number
        description: string
        subcategory: string
        brand: string
        promotionTypeId: string | null
        condicao: string
        gtin: string
        unidade: string
        localizacao: string
        images: string[]
        productType: string
    }
    suppliers: Array<{ id: string; name: string; email: string | null; phone: string | null }>
    partnerId: string
    onDuplicate?: (product: any) => void
}

export function EditProductWrapper({ product, suppliers, partnerId, onDuplicate }: EditProductWrapperProps) {
    const router = useRouter()
    const [mode, setMode] = useState<"add" | "details" | "edit" | "duplicate">("details")
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [pendingOrdersCount, setPendingOrdersCount] = useState(0)
    const [unidadesMedida] = useState(() => UNITS.map((unit) => ({ codigo: unit, descricao: unit })))
    const { success: notifySuccess, error: notifyError } = useNotification()

    const handleBack = () => {
        router.push("/erp/produtos")
    }
    const handleSaveProduct = async (productData: any) => {
        console.log("Updating product with data:", productData)
        setIsSaving(true)

        try {
            // productData contains the full payload object from AddProductPage.tsx
            const { partnerId, pending_variants, ...restData } = productData

            const result = await updateProductAction({
                productId: product.id,
                ...restData,
                is_active: productData.isActive, // fallback in case AddProductPage doesn't have it mapped perfectly for old callers
            })

            if (result.success) {
                notifySuccess("Produto atualizado", "Produto atualizado com sucesso!")
                setMode("details")
                return { success: true }
            } else {
                notifyError("Erro", result.error || "Erro ao atualizar produto")
                return { success: false, error: result.error }
            }
        } catch (error: any) {
            console.error("Error updating product:", error)
            notifyError("Erro", "Erro ao atualizar produto")
            return { success: false, error: error.message }
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteClick = async () => {
        const result = await checkProductInOrdersAction(product.id)
        if (result.count > 0) {
            setPendingOrdersCount(result.count)
        }
        setShowDeleteModal(true)
    }

    const handleConfirmDelete = async () => {
        setIsDeleting(true)
        try {
            const result = await deleteProductAction(product.id)
            if (result.success) {
                notifySuccess("Sucesso", "Produto excluído com sucesso!")
                router.push("/erp/produtos")
            } else {
                notifyError("Erro", result.error || "Erro ao excluir produto")
            }
        } catch (error) {
            console.error("Error deleting product:", error)
            notifyError("Erro", "Erro ao excluir produto")
        } finally {
            setIsDeleting(false)
            setShowDeleteModal(false)
        }
    }

    const handleDuplicate = () => {
        console.log("EditProductWrapper handleDuplicate called")
        if (onDuplicate) {
            console.log("Calling onDuplicate callback from edit page")
            onDuplicate(product)
            // Navigate back to products page where duplication will be handled
            router.push("/erp/produtos")
        } else {
            console.log("ERROR: No onDuplicate callback provided")
        }
    }

    return (
        <>
            <AddProductPage
                onBack={handleBack}
                product={product}
                mode={mode}
                setMode={setMode}
                onSave={handleSaveProduct}
                onDelete={handleDeleteClick}
                onDuplicate={handleDuplicate}
                suppliers={suppliers}
                isSaving={isSaving}
                unidadesMedida={unidadesMedida}
                partnerId={partnerId}
            />

            {showDeleteModal && (
                <AlertModal
                    onClose={() => setShowDeleteModal(false)}
                    onConfirm={handleConfirmDelete}
                    title="Excluir produto?"
                    message="O item será excluído permanentemente."
                    confirmText={isDeleting ? "Excluindo..." : "Excluir"}
                    icon={<TrashIcon />}
                    isDestructive
                    disabled={isDeleting}
                />
            )}

            <SavingStatusModal isOpen={isDeleting} text="Excluindo produto..." />
        </>
    )
}

