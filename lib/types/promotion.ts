export enum PromotionType {
    GIFT = "gift",
    BUY_X_PAY_Y = "buy_x_pay_y",
    DISCOUNT = "discount"
}

export enum CampaignCategory {
    PRICE = "price",
    BENEFIT = "benefit"
}

export function getCampaignCategory(type: PromotionType): CampaignCategory {
    switch (type) {
        case PromotionType.DISCOUNT:
        case PromotionType.BUY_X_PAY_Y:
            return CampaignCategory.PRICE;
        case PromotionType.GIFT:
            return CampaignCategory.BENEFIT;
        default:
            return CampaignCategory.BENEFIT;
    }
}


export enum DiscountType {
    PERCENTAGE = "percentage",
    FIXED = "fixed"
}

export enum ApplyScope {
    SPECIFIC_PRODUCTS = "specific_products",
    CATEGORY = "category",
    ENTIRE_CART = "entire_cart",
    SPECIFIC_SERVICES = "specific_services",
}

export interface PricingPromotion {
    id: string
    campaignId: string
    partnerId: string
    name: string
    promotionType: PromotionType
    discountType?: DiscountType | null
    discountValue?: number | null
    maxDiscountAmount?: number | null
    minSpendAmount?: number | null
    giftProductId?: string | null
    giftServiceId?: string | null
    buyQuantity?: number | null
    payQuantity?: number | null
    priority: number
    applyScope: ApplyScope
    allowCouponCombination: boolean
    applicableProductIds?: string[]
    applicableCategoryIds?: string[]
    applicableServiceIds?: string[]
    giftUnavailable?: boolean
}

