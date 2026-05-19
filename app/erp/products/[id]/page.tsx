import { redirect } from "next/navigation"
import { EditProductWrapper } from "@/components/erp/product/edit-product-wrapper"
import { getCachedProductById, getCachedSuppliers } from "@/app/actions/erp/products"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"

export const dynamic = "force-dynamic"

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    if (id === "new") {
        redirect("/erp/products/new")
    }

    // Layout already guarantees auth + valid context
    const context = await getCurrentPartnerContext()
    if (!context) redirect("/select-erp")

    const partnerId = context.partnerId

    let product
    try {
        product = await getCachedProductById(id)
    } catch {
        // Ignora erro de produto não encontrado para redirecionar abaixo
    }

    if (!product || product.partner_id !== partnerId) {
        redirect("/erp/products")
    }

    const suppliers = await getCachedSuppliers(partnerId)

    const productImages = Array.isArray(product.images) ? product.images : []

    const formattedProduct = {
        id: product.id,
        name: product.name,
        category: product.category || "",
        productId: product.sku || "",
        price: Number(product.price),
        costPrice: Number(product.cost_price || 0),
        stock: product.stock_quantity,
        dateAdded: new Date(product.created_at).toLocaleDateString("pt-BR"),
        status: product.is_active ? ("Active" as const) : ("Inactive" as const),
        visibility: product.visibility_status === "visible" ? ("Published" as const) : ("Unpublished" as const),
        sku: product.sku || "",
        description: product.description || "",
        subcategory: product.subcategory || "",
        brand: product.brand || "",
        promotionTypeId: null,
        condicao: product.condition === "new" ? "Novo" : product.condition === "used" ? "Usado" : "Novo",
        gtin: product.gtin || "",
        unidade: product.unit || "",
        localizacao: product.location || "",
        images: productImages,
        productType: product.product_type === "digital" ? "Digital" : "Fí­sico",
        is_active: product.is_active,
        show_in_marketplace: product.show_in_marketplace !== false,
        minStock: product.min_stock || 0,
        stock_quantity: product.stock_quantity || 0,
        rating: product.rating || 0,
        created_at: product.created_at,
        partner_id: product.partner_id,
        updated_at: product.updated_at || undefined,
        purchase_count: product.purchase_count || 0,
        views: product.views || 0,
        slug: product.slug || "",
        tags: product.tags || [],
        discount_price: product.discount_price || null,
        installments: product.installments || null,
        warranty_days: product.warranty_days || null,
        weight: product.weight || null,
        dimensions: product.dimensions || null,
        moderation_status: product.moderation_status || "approved",
        product_type: product.product_type || "physical",
        condition: product.condition || "new",
        location: product.location || "",
        cost_price: Number(product.cost_price || 0),
        promotion_type_id: product.promotionTypeId || null,
        profit_margin: product.profit_margin || null,
        show_price_in_store: product.show_price_in_store || true,
        is_on_promotion: product.is_on_promotion || false,
        is_highlighted: product.is_highlighted || false,
        supplier_id: product.supplier_id || null,
        search_vector: null,
        min_stock: product.min_stock || 0,
        promotion_value: product.promotion_value || null,
        promotional_price: product.promotional_price || null,
        unit: product.unit || "",
        fci_code: product.fci_code || null,
        category_id: product.category_id || null,
        subcategory_id: product.subcategory_id || null,
        brand_id: product.brand_id || null,
        location_id: product.location_id || null,
        video_type: product.video_type || null,
        video_url: product.video_url || "",
        video_thumbnail: product.video_thumbnail || null,
        video_duration: product.video_duration || null,
        video_provider_id: product.video_provider_id || null,
    }

    return <EditProductWrapper product={formattedProduct} suppliers={suppliers || []} partnerId={partnerId} />
}
