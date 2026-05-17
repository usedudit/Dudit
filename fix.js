const fs = require('fs');

// Fix AddProductPage.tsx
let content1 = fs.readFileSync('components/erp/product/AddProductPage.tsx', 'utf8');
content1 = content1.replace(
    /onSave\?: \(data: any, isDraft\?: boolean\) => Promise<void>/,
    'onSave?: (data: any, isDraft?: boolean) => Promise<{ success: boolean; error?: string } | void>'
);
content1 = content1.replace(
    /if \(onSave\) \{\s*await onSave\(\{[\s\S]*?pending_variants: productData\.pending_variants \|\| \[\],\s*\}\)\s*setPendingImages\(\[\]\)\s*isSubmittingRef\.current = false\s*return\s*\}/,
    `if (onSave) {
                const saveRes = await onSave({
                    ...payload,
                    pending_variants: productData.pending_variants || [],
                })
                
                if (saveRes && saveRes.success === false) {
                    setIsSavingProduct(false)
                    isSubmittingRef.current = false
                    return
                }

                setPendingImages([])
                isSubmittingRef.current = false
                return
            }`
);
fs.writeFileSync('components/erp/product/AddProductPage.tsx', content1);

// Fix ProductsPage.tsx
let content2 = fs.readFileSync('components/erp/product/ProductsPage.tsx', 'utf8');
content2 = content2.replace(
    /const handleSaveProduct = async \(formData: any\) => \{[\s\S]*?setIsSaving\(true\)\s*try \{[\s\S]*?const isNewProduct = formMode === 'add'[\s\S]*?const action = isNewProduct \? createProductComprehensiveAction : updateProductAction[\s\S]*?const payload = isNewProduct[\s\S]*?\? \{ \.\.\.formData, partnerId, storeId: selectedStore\?\.id \}[\s\S]*?: \{ productId: entityState\.entityId \|\| formProduct\?\.id, \.\.\.formData \}[\s\S]*?const res = await action\(payload\)[\s\S]*?if \(res\.success\) \{[\s\S]*?if \(isNewProduct && res\.data\?\.id && formData\.pending_variants\?\.length > 0\) \{[\s\S]*?const variantsResult = await createProductVariantsBatchAction\(\{[\s\S]*?productId: res\.data\.id,[\s\S]*?variants: formData\.pending_variants,[\s\S]*?csrf_token: formData\.csrf_token,[\s\S]*?deletedImages: \[\],[\s\S]*?\}\)[\s\S]*?if \(!variantsResult\.success\) \{[\s\S]*?toast\(\{ title: "Produto criado com ressalvas", description: "O produto foi salvo, mas houve erro ao salvar as variantes\.", variant: "destructive" \}\)[\s\S]*?\}[\s\S]*?\}[\s\S]*?toast\(\{ title: "Sucesso" \}\)[\s\S]*?if \(entityState\.entityId\) cache\.invalidateEntity\(entityState\.entityId\)[\s\S]*?afterMutation\(entityState\.entityId \|\| undefined\)[\s\S]*?if \(isNewProduct && res\.data\) \{[\s\S]*?const addedProduct = res\.data[\s\S]*?queryClient\.setQueryData\(productsQueryKey, \(oldData: any\) => \{[\s\S]*?if \(!oldData \|\| !oldData\.pages\) return oldData[\s\S]*?const newPages = \[\.\.\.oldData\.pages\][\s\S]*?if \(newPages\.length > 0\) \{[\s\S]*?newPages\[0\] = \{ \.\.\.newPages\[0\], items: \[addedProduct, \.\.\.newPages\[0\]\.items\] \}[\s\S]*?\}[\s\S]*?return \{ \.\.\.oldData, pages: newPages \}[\s\S]*?\}\)[\s\S]*?setProducts\(\(p\) => \[addedProduct, \.\.\.p\]\)[\s\S]*?\}[\s\S]*?closeEntity\(\)[\s\S]*?return[\s\S]*?\} else \{[\s\S]*?const errorMsg = res\.error \|\| "Erro ao salvar produto"[\s\S]*?if \(isPlanLimitReachedError\(errorMsg\)\) \{[\s\S]*?const target = getNextPlanTarget\(planSlug\)[\s\S]*?if \(target\) openPlanUpgrade\(target\)[\s\S]*?return[\s\S]*?\}[\s\S]*?toast\(\{ title: "Erro", description: errorMsg, variant: "destructive" \}\)[\s\S]*?return \{ success: false \} /* NEED TO INJECT RETURN */[\s\S]*?\}[\s\S]*?\} catch \{[\s\S]*?toast\(\{ title: "Erro", variant: "destructive" \}\)[\s\S]*?\} finally \{[\s\S]*?setIsSaving\(false\)[\s\S]*?\}[\s\S]*?\}/,
    `const handleSaveProduct = async (formData: any) => {
        setIsSaving(true)
        try {
            const isNewProduct = formMode === 'add'
            const action = isNewProduct ? createProductComprehensiveAction : updateProductAction
            const payload = isNewProduct
                ? { ...formData, partnerId, storeId: selectedStore?.id }
                : { productId: entityState.entityId || formProduct?.id, ...formData }
            const res = await action(payload)
            if (res.success) {
                if (isNewProduct && res.data?.id && formData.pending_variants?.length > 0) {
                    const variantsResult = await createProductVariantsBatchAction({
                        productId: res.data.id,
                        variants: formData.pending_variants,
                        csrf_token: formData.csrf_token,
                        deletedImages: [],
                    })
                    if (!variantsResult.success) {
                        toast({ title: "Produto criado com ressalvas", description: "O produto foi salvo, mas houve erro ao salvar as variantes.", variant: "destructive" })
                    }
                }

                toast({ title: "Sucesso" })

                // Invalidate caches
                if (entityState.entityId) cache.invalidateEntity(entityState.entityId)
                afterMutation(entityState.entityId || undefined)

                if (isNewProduct && res.data) {
                    const addedProduct = res.data
                    queryClient.setQueryData(productsQueryKey, (oldData: any) => {
                        if (!oldData || !oldData.pages) return oldData
                        const newPages = [...oldData.pages]
                        if (newPages.length > 0) {
                            newPages[0] = { ...newPages[0], items: [addedProduct, ...newPages[0].items] }
                        }
                        return { ...oldData, pages: newPages }
                    })
                    setProducts((p) => [addedProduct, ...p])
                }

                closeEntity()
                return { success: true }
            } else {
                const errorMsg = res.error || "Erro ao salvar produto"
                if (isPlanLimitReachedError(errorMsg)) {
                    const target = getNextPlanTarget(planSlug)
                    if (target) openPlanUpgrade(target)
                    return { success: false, error: errorMsg }
                }
                toast({ title: "Erro", description: errorMsg, variant: "destructive" })
                return { success: false, error: errorMsg }
            }
        } catch (e: any) {
            console.error(e)
            toast({ title: "Erro", description: "Ocorreu um erro interno ao salvar o produto", variant: "destructive" })
            return { success: false, error: e.message }
        } finally {
            setIsSaving(false)
        }
    }`
);
fs.writeFileSync('components/erp/product/ProductsPage.tsx', content2);

// Fix edit-product-wrapper.tsx
let content3 = fs.readFileSync('components/erp/product/edit-product-wrapper.tsx', 'utf8');
content3 = content3.replace(
    /const handleSaveProduct = async \(productData: any\) => \{[\s\S]*?console\.log\("Updating product with data:", productData\)[\s\S]*?setIsSaving\(true\)[\s\S]*?try \{[\s\S]*?const \{ partnerId, storeId, pending_variants, \.\.\.restData \} = productData[\s\S]*?const result = await updateProductAction\(\{[\s\S]*?productId: product\.id,[\s\S]*?\.\.\.restData,[\s\S]*?is_active: productData\.isActive,[\s\S]*?\}\)[\s\S]*?if \(result\.success\) \{[\s\S]*?toast\.success\("Produto atualizado com sucesso!"\)[\s\S]*?setMode\("details"\)[\s\S]*?\} else \{[\s\S]*?toast\.error\(result\.error \|\| "Erro ao atualizar produto"\)[\s\S]*?\}[\s\S]*?\} catch \(error\) \{[\s\S]*?console\.error\("Error updating product:", error\)[\s\S]*?toast\.error\("Erro ao atualizar produto"\)[\s\S]*?\} finally \{[\s\S]*?setIsSaving\(false\)[\s\S]*?\}[\s\S]*?\}/,
    `const handleSaveProduct = async (productData: any) => {
        console.log("Updating product with data:", productData)
        setIsSaving(true)

        try {
            // productData contains the full payload object from AddProductPage.tsx
            const { partnerId, storeId, pending_variants, ...restData } = productData

            const result = await updateProductAction({
                productId: product.id,
                ...restData,
                is_active: productData.isActive, // fallback in case AddProductPage doesn't have it mapped perfectly for old callers
            })

            if (result.success) {
                toast.success("Produto atualizado com sucesso!")
                setMode("details")
                return { success: true }
            } else {
                toast.error(result.error || "Erro ao atualizar produto")
                return { success: false, error: result.error }
            }
        } catch (error: any) {
            console.error("Error updating product:", error)
            toast.error("Erro ao atualizar produto")
            return { success: false, error: error.message }
        } finally {
            setIsSaving(false)
        }
    }`
);
fs.writeFileSync('components/erp/product/edit-product-wrapper.tsx', content3);

console.log('done');
