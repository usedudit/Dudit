import { getCachedRelatedProducts } from "@/app/actions/marketplace/products"
import { ProductCarousel } from "./shared-components"
import { getProductDisplayImages } from "@/lib/utils/product-display-images"

interface RelatedProductsSectionProps {
    partnerId: string
    currentProductId: string
}

export async function RelatedProductsSection({ partnerId, currentProductId }: RelatedProductsSectionProps) {
    // Se não tiver partnerId, nem busca
    if (!partnerId) return null

    const partnerProducts = await getCachedRelatedProducts(partnerId, currentProductId)

    if (!partnerProducts || partnerProducts.length === 0) {
        return null
    }

    // Adapter para o formato esperado pelo ProductCarousel (se necessário)
    // O ProductCarousel espera um array de produtos. O getCachedRelatedProducts já retorna formatado?
    // Verificando actions/marketplace/products.ts:
    // Retorna "safeData" que tem partners normalizado.
    // O ProductCarousel usa prop "products".
    // Vamos verificar o ProductCarousel em shared-components.tsx se possível, mas assumindo compatibilidade básica
    // pois o marketplace-home-client usa o retorno de getCachedHomeProducts direto.

    // Mapeamento idêntico ao marketplace-home-client para garantir
    const displayProducts = partnerProducts.map((product: any) => {
        const images = getProductDisplayImages(product)
        const basePrice = Number(product.promotional_price || product.price)
        const price = (!product.promotional_price && product.fallback_variant_price) ? Number(product.fallback_variant_price) : basePrice

        return {
            id: product.id,
            name: product.name,
            price,
            originalPrice: product.promotional_price ? Number(product.price) : undefined,
            images,
            rating: product.rating,
            reviews: 0,
            partners: product.partners,
        }
    })

    return (
        <div className="mt-12 lg:mt-24 border-t border-gray-100 pt-12 dark:border-dark-border">
            <ProductCarousel
                title="Mais desta loja"
                products={displayProducts}
                seeMoreLink={`/partners/${partnerId}`}
            />
        </div>
    )
}
