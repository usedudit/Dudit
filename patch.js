const fs = require('fs');

function patchFile(path, oldText, newText) {
    let content = fs.readFileSync(path, 'utf8');
    // Normalize newlines to avoid mismatch
    const nOld = oldText.replace(/\r\n/g, '\n').trim();
    const nNew = newText.replace(/\r\n/g, '\n').trim();
    
    // Convert file content to \n for replacement
    content = content.replace(/\r\n/g, '\n');
    
    if (content.includes(nOld)) {
        content = content.replace(nOld, nNew);
        // Convert back to \r\n for Windows
        content = content.replace(/\n/g, '\r\n');
        fs.writeFileSync(path, content);
        console.log('Successfully patched ' + path);
    } else {
        console.log('Failed to find exact text in ' + path);
    }
}

// AddProductPage.tsx fixes
const p1Old = `    isLoadingDetails?: boolean\n    onSave?: (data: any, isDraft?: boolean) => Promise<void>\n    onDuplicate?: (product: Product) => void`;
const p1New = `    isLoadingDetails?: boolean\n    onSave?: (data: any, isDraft?: boolean) => Promise<{ success: boolean; error?: string } | void>\n    onDuplicate?: (product: Product) => void`;
patchFile('components/erp/product/AddProductPage.tsx', p1Old, p1New);

const p2Old = `            if (onSave) {\n                await onSave({\n                    ...payload,\n                    pending_variants: productData.pending_variants || [],\n                })\n                setPendingImages([])\n                isSubmittingRef.current = false\n                return\n            }`;
const p2New = `            if (onSave) {\n                const saveRes = await onSave({\n                    ...payload,\n                    pending_variants: productData.pending_variants || [],\n                })\n                \n                if (saveRes && saveRes.success === false) {\n                    setIsSavingProduct(false)\n                    isSubmittingRef.current = false\n                    return\n                }\n\n                setPendingImages([])\n                isSubmittingRef.current = false\n                return\n            }`;
patchFile('components/erp/product/AddProductPage.tsx', p2Old, p2New);

// ProductsPage.tsx fixes
let prodContent = fs.readFileSync('components/erp/product/ProductsPage.tsx', 'utf8');
prodContent = prodContent.replace(/\r\n/g, '\n');

// Update closeEntity return
prodContent = prodContent.replace(
    '                closeEntity()\n                return\n            } else {',
    '                closeEntity()\n                return { success: true }\n            } else {'
);

// Update error returns
prodContent = prodContent.replace(
    '                    if (target) openPlanUpgrade(target)\n                    return\n                }\n                toast({ title: "Erro", description: errorMsg, variant: "destructive" })\n            }\n        } catch {',
    '                    if (target) openPlanUpgrade(target)\n                    return { success: false, error: errorMsg }\n                }\n                toast({ title: "Erro", description: errorMsg, variant: "destructive" })\n                return { success: false, error: errorMsg }\n            }\n        } catch (e: any) {'
);

prodContent = prodContent.replace(
    '        } catch (e: any) {\n            toast({ title: "Erro", variant: "destructive" })\n        } finally {',
    '        } catch (e: any) {\n            toast({ title: "Erro", description: "Erro interno", variant: "destructive" })\n            return { success: false, error: "Erro interno" }\n        } finally {'
);

fs.writeFileSync('components/erp/product/ProductsPage.tsx', prodContent.replace(/\n/g, '\r\n'));
console.log('Successfully patched ProductsPage.tsx');

// edit-product-wrapper.tsx fixes
let editContent = fs.readFileSync('components/erp/product/edit-product-wrapper.tsx', 'utf8');
editContent = editContent.replace(/\r\n/g, '\n');

editContent = editContent.replace(
    '                toast.success("Produto atualizado com sucesso!")\n                setMode("details")\n            } else {\n                toast.error(result.error || "Erro ao atualizar produto")\n            }\n        } catch (error) {\n            console.error("Error updating product:", error)\n            toast.error("Erro ao atualizar produto")\n        } finally {',
    '                toast.success("Produto atualizado com sucesso!")\n                setMode("details")\n                return { success: true }\n            } else {\n                toast.error(result.error || "Erro ao atualizar produto")\n                return { success: false, error: result.error }\n            }\n        } catch (error: any) {\n            console.error("Error updating product:", error)\n            toast.error("Erro ao atualizar produto")\n            return { success: false, error: error.message }\n        } finally {'
);

fs.writeFileSync('components/erp/product/edit-product-wrapper.tsx', editContent.replace(/\n/g, '\r\n'));
console.log('Successfully patched edit-product-wrapper.tsx');
