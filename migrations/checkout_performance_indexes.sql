-- Checkout Performance Optimization Indexes
-- Targets: sub-2-second checkout initialization

-- ==========================================
-- 1. PROMOTION / CAMPAIGN LOOKUP INDEXES
--    Speeds up listActivePromotionsInBatch / listActivePromotionsForMarketplaceAction
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_promotions_partner_active_campaign
ON promotions (partner_id, is_active, campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_partner_active
ON campaigns (partner_id, is_active);

CREATE INDEX IF NOT EXISTS idx_promotion_products_promotion_product
ON promotion_products (promotion_id, product_id);

CREATE INDEX IF NOT EXISTS idx_promotion_services_promotion_service
ON promotion_services (promotion_id, service_id);

CREATE INDEX IF NOT EXISTS idx_promotion_categories_promotion_category
ON promotion_categories (promotion_id, category_id);

CREATE INDEX IF NOT EXISTS idx_promotion_usages_customer
ON promotion_usages (customer_id, promotion_id);

-- ==========================================
-- 2. COUPON SYSTEM INDEXES
--    Speeds up listApplicableMarketplaceCouponsAction / validateCouponRow
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_coupons_partner_active_automatic
ON coupons (partner_id, is_active, is_automatic);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon
ON coupon_usages (coupon_id);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_customer
ON coupon_usages (coupon_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_coupon_products_coupon
ON coupon_products (coupon_id);

CREATE INDEX IF NOT EXISTS idx_coupon_services_coupon
ON coupon_services (coupon_id);

CREATE INDEX IF NOT EXISTS idx_coupon_categories_coupon
ON coupon_categories (coupon_id);

CREATE INDEX IF NOT EXISTS idx_coupon_subscriptions_coupon
ON coupon_subscriptions (coupon_id);

CREATE INDEX IF NOT EXISTS idx_orders_partner_buyer
ON orders (partner_id, buyer_id);

-- ==========================================
-- 3. CART / CHECKOUT QUERY INDEXES
--    Speeds up resolveCheckoutCartLines / context data queries
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_cart_items_user_selected
ON cart_items (user_id, id);

CREATE INDEX IF NOT EXISTS idx_payment_methods_partner_active
ON payment_methods (partner_id, is_active);


CREATE INDEX IF NOT EXISTS idx_delivery_settings_partner
ON delivery_settings (partner_id);
