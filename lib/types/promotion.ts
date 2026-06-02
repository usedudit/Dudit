export enum PromotionType {
    GIFT = "gift",
    BUY_X_PAY_Y = "buy_x_pay_y",
    DISCOUNT = "discount",
    FREE_SHIPPING = "free_shipping"
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
    SPECIFIC_SUBSCRIPTIONS = "specific_subscriptions",
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
    buyQuantity?: number | null
    payQuantity?: number | null
    priority: number
    applyScope: ApplyScope
    allowCouponCombination: boolean
    applicableProductIds?: string[]
    applicableCategoryIds?: string[]
    applicableServiceIds?: string[]
    applicableSubscriptionIds?: string[]
}
