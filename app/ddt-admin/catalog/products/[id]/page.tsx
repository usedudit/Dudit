import { notFound } from "next/navigation"
import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminCatalogProductDetail } from "@/app/actions/admin/catalog"
import AdminProductDetailClient from "@/components/admin/catalog/AdminProductDetailClient"

export const dynamic = "force-dynamic"

function formatProductForForm(product: any) {
    const productImages = Array.isArray(product.images) ? product.images : []

    return {
        id: product.id,
        name: product.name || "",
        category: product.category || "",
        productId: product.sku || "",
        price: Number(product.price) || 0,
        costPrice: Number(product.cost_price || 0),
        stock: product.stock_quantity ?? 0,
        dateAdded: product.created_at
            ? new Date(product.created_at).toLocaleDateString("pt-BR")
            : "N/A",
        // Mantém o status real do banco ("ativo"/"inativo"/"arquivado") para o
        // toggle de arquivamento do form saber o estado atual.
        status: product.status || (product.is_active ? "ativo" : "inativo"),
        visibility: product.show_in_marketplace !== false ? "Published" : "Unpublished",
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
        productType:
            product.product_type?.toLowerCase() === "digital"
                ? "Digital"
                : product.product_type?.toLowerCase() === "serviço" || product.product_type?.toLowerCase() === "service"
                    ? "Serviço"
                    : "Físico",
        is_active: product.is_active !== false,
        show_in_marketplace: product.show_in_marketplace !== false,
        show_price_in_store: product.show_price_in_store !== false,
        allow_sell_without_stock: !!product.allow_sell_without_stock,
        minStock: product.min_stock || 0,
        maxStock: product.max_stock || 0,
        stock_quantity: product.stock_quantity || 0,
        rating: product.rating || 0,
        created_at: product.created_at,
        partner_id: product.partner_id,
        store_id: product.store_id || "",
        updated_at: product.updated_at || undefined,
        moderation_status: product.moderation_status || "approved",
        product_type: product.product_type || "Físico",
        condition: product.condition || "new",
        location: product.location || "",
        cost_price: Number(product.cost_price || 0),
        min_stock: product.min_stock || 0,
        max_stock: product.max_stock || 0,
        is_on_promotion: product.is_on_promotion || false,
        promotional_price: product.promotional_price ?? null,
        unit: product.unit || "",
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
        fci_code: product.fci_code || null,
        weight_gross: Number(product.weight_gross) || 0,
        weight_net: Number(product.weight_net) || 0,
        width: Number(product.width) || 0,
        height: Number(product.height) || 0,
        length: Number(product.length) || 0,
        packaging_type: product.packaging_type || "package",
        preparation_days: Number(product.preparation_days) || 0,
        category_id: product.category_id || "",
        subcategory_id: product.subcategory_id || "",
        brand_id: product.brand_id || "",
        location_id: product.location_id || "",
        marketplace_category_id: product.marketplace_category_id || null,
        availability_value: Number(product.availability_value) || 0,
        availability_unit: product.availability_unit || "Dias",
        warranty: product.warranty || null,
        technical_specs: product.technical_specs ?? null,
        delivery_format: product.delivery_format || null,
        tags: product.tags || [],
        video_type: product.video_type || null,
        video_url: product.video_url || "",
        video_thumbnail: product.video_thumbnail || null,
        video_duration: product.video_duration || null,
        video_provider_id: product.video_provider_id || null,
        slug: product.slug || "",
    }
}

export default async function AdminCatalogProductDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const res = await getAdminCatalogProductDetail(id)
    if (!res.success || !res.data) notFound()

    const { product, suppliers, store, partner, auditEvents } = res.data
    const formattedProduct = formatProductForForm(product)

    return (
        <>
            <AdminHeader pageTitle={product.name || "Produto"} />
            <AdminProductDetailClient
                product={formattedProduct}
                suppliers={suppliers || []}
                partnerId={product.partner_id}
                businessInfo={partner?.business_info}
                store={store}
                partnerName={partner?.name}
                auditEvents={auditEvents}
            />
        </>
    )
}
