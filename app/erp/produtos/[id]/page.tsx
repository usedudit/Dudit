import { redirect } from "next/navigation"
import { EditProductWrapper } from "@/components/erp/product/edit-product-wrapper"
import { getCachedProductById, getCachedSuppliers } from "@/app/actions/erp/products"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPermission } from "@/lib/permissions/access"
import { AccessDenied } from "@/components/erp/access-denied"

export const dynamic = "force-dynamic"

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    if (id === "new") {
        redirect("/erp/produtos/novo")
    }

    // Layout already guarantees auth + valid context
    const context = await getCurrentPartnerContext()
    if (!context) return <AccessDenied />

    const partnerId = context.partnerId

    const { allowed } = await checkPermission(partnerId, "products", "view")
    if (!allowed) return <AccessDenied />

    let product
    try {
        product = await getCachedProductById(id)
    } catch {
        // Ignora erro de produto não encontrado para redirecionar abaixo
    }

    if (!product || product.partner_id !== partnerId) {
        redirect("/erp/produtos")
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
        status: product.is_active ? ("ativo" as const) : ("inativo" as const),
        visibility: product.show_in_marketplace !== false ? ("Published" as const) : ("Unpublished" as const),
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
        productType: product.product_type?.toLowerCase() === "digital" ? "Digital" : (product.product_type?.toLowerCase() === "serviço" || product.product_type?.toLowerCase() === "service" ? "Serviço" : "Físico"),
        is_active: product.is_active,
        show_in_marketplace: product.show_in_marketplace !== false,
        minStock: product.min_stock || 0,
        stock_quantity: product.stock_quantity || 0,
        stock_reserved: Math.max(0, Number(product.stock_reserved) || 0),
        stock_available: Number(product.stock_available ?? ((Number(product.stock_quantity) || 0) - (Math.max(0, Number(product.stock_reserved) || 0)))),
        rating: product.rating || 0,
        created_at: product.created_at,
        partner_id: product.partner_id,
        store_id: product.store_id || "",
        updated_at: product.updated_at || undefined,
        purchase_count: product.purchase_count || 0,
        views: product.views || 0,
        favorites_count: product.favorites_count ?? 0,
        views_count: product.views_count ?? 0,
        views_last_30_days: product.views_last_30_days ?? 0,
        total_sales: product.total_sales ?? 0,
        sales_last_30_days: product.sales_last_30_days ?? 0,
        sales_last_7_days: product.sales_last_7_days ?? 0,
        marketplace_score: product.marketplace_score ?? 0,
        last_sale_at: product.last_sale_at || null,
        slug: product.slug || "",
        tags: product.tags || [],
        discount_price: product.discount_price || null,
        installments: product.installments || null,
        warranty_days: product.warranty_days || null,
        weight: product.weight || null,
        dimensions: product.dimensions || null,
        moderation_status: product.moderation_status || "approved",
        product_type: product.product_type || "Físico",
        condition: product.condition || "new",
        location: product.location || "",
        cost_price: Number(product.cost_price || 0),
        promotion_type_id: product.promotionTypeId || null,
        profit_margin: product.profit_margin || null,
        show_price_in_store: product.show_price_in_store !== false,
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
        ncm: product.ncm || "",
        cest: product.cest || null,
        origin: product.origin ?? 0,
        item_type: product.item_type || "00",
        cfop_internal: product.cfop_internal || "5102",
        cfop_external: product.cfop_external || "6102",
        csosn: product.csosn || "102",
        tax_percentage: Number(product.tax_percentage) || 0,
        pis_cst: product.pis_cst || "99",
        pis_rate: Number(product.pis_rate) || 0,
        cofins_cst: product.cofins_cst || "99",
        cofins_rate: Number(product.cofins_rate) || 0,
        ipi_cst: product.ipi_cst || "99",
        ipi_code: product.ipi_code || null,
        product_situation: product.product_situation || "revenda",
        c_benef: product.c_benef || null,
        inf_ad_prod: product.inf_ad_prod || null,
        weight_gross: Number(product.weight_gross) || 0,
        weight_net: Number(product.weight_net) || 0,
        width: Number(product.width) || 0,
        height: Number(product.height) || 0,
        length: Number(product.length) || 0,
        packaging_type: product.packaging_type || "package",
        preparation_days: Number(product.preparation_days) || 0,
        availability_value: Number(product.availability_value) || 0,
        availability_unit: product.availability_unit || "Dias",
        warranty: product.warranty || null,
        technical_specs: product.technical_specs ?? null,
        delivery_format: product.delivery_format || null,
        marketplace_category_id: product.marketplace_category_id || null,
        allow_sell_without_stock: product.allow_sell_without_stock || false,
        max_stock: product.max_stock || 0,
        video_type: product.video_type || null,
        video_url: product.video_url || "",
        video_thumbnail: product.video_thumbnail || null,
        video_duration: product.video_duration || null,
        video_provider_id: product.video_provider_id || null,
    }

    return <EditProductWrapper product={formattedProduct} suppliers={suppliers || []} partnerId={partnerId} />
}
