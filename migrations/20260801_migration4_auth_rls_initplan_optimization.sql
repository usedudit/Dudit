-- ==============================================================================
-- MIGRATION 4: OTIMIZAÇÃO DE PERFORMANCE DE RLS (INITPLAN - AUTH.UID)
-- Data: 2026-08-01 | Projeto: Dudit
-- Descrição: 
--   Otimização de 295 políticas RLS substituindo a invocação direta
--   de auth.uid() / auth.jwt() por (SELECT auth.uid()) / (SELECT auth.jwt()).
--   Garante 0% de alteração em lógica, papéis (roles) ou permissões.
-- ==============================================================================

BEGIN;

DROP POLICY IF EXISTS "sales_goal_progress_insert_partner_users" ON public."sales_goal_progress";

CREATE POLICY "sales_goal_progress_insert_partner_users" ON public."sales_goal_progress" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM sales_goals sg
  WHERE ((sg.id = sales_goal_progress.goal_id) AND (sg.partner_id IN ( SELECT pu.partner_id
           FROM partner_users pu
          WHERE (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "sales_goal_progress_select_partner_users" ON public."sales_goal_progress";

CREATE POLICY "sales_goal_progress_select_partner_users" ON public."sales_goal_progress" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM sales_goals sg
  WHERE ((sg.id = sales_goal_progress.goal_id) AND (sg.partner_id IN ( SELECT pu.partner_id
           FROM partner_users pu
          WHERE (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "sales_goal_progress_update_partner_users" ON public."sales_goal_progress";

CREATE POLICY "sales_goal_progress_update_partner_users" ON public."sales_goal_progress" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM sales_goals sg
  WHERE ((sg.id = sales_goal_progress.goal_id) AND (sg.partner_id IN ( SELECT pu.partner_id
           FROM partner_users pu
          WHERE (pu.user_id = (SELECT auth.uid())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM sales_goals sg
  WHERE ((sg.id = sales_goal_progress.goal_id) AND (sg.partner_id IN ( SELECT pu.partner_id
           FROM partner_users pu
          WHERE (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "coupon_products_manage_partner_users" ON public."coupon_products";

CREATE POLICY "coupon_products_manage_partner_users" ON public."coupon_products" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_products.coupon_id) AND (pu.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_products.coupon_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Parceiros podem atualizar itens de kits" ON public."kit_items";

CREATE POLICY "Parceiros podem atualizar itens de kits" ON public."kit_items" FOR UPDATE TO public USING ((kit_id IN ( SELECT product_kits.id
   FROM product_kits
  WHERE (product_kits.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Parceiros podem deletar itens de kits" ON public."kit_items";

CREATE POLICY "Parceiros podem deletar itens de kits" ON public."kit_items" FOR DELETE TO public USING ((kit_id IN ( SELECT product_kits.id
   FROM product_kits
  WHERE (product_kits.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Parceiros podem gerenciar itens de kits" ON public."kit_items";

CREATE POLICY "Parceiros podem gerenciar itens de kits" ON public."kit_items" FOR INSERT TO public WITH CHECK ((kit_id IN ( SELECT product_kits.id
   FROM product_kits
  WHERE (product_kits.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Parceiros podem ver itens de seus kits" ON public."kit_items";

CREATE POLICY "Parceiros podem ver itens de seus kits" ON public."kit_items" FOR SELECT TO public USING ((kit_id IN ( SELECT product_kits.id
   FROM product_kits
  WHERE (product_kits.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Partner owners can insert logistics" ON public."product_logistics";

CREATE POLICY "Partner owners can insert logistics" ON public."product_logistics" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Partner owners can update logistics" ON public."product_logistics";

CREATE POLICY "Partner owners can update logistics" ON public."product_logistics" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_logistics.product_id) AND (p.partner_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Partner owners can view logistics" ON public."product_logistics";

CREATE POLICY "Partner owners can view logistics" ON public."product_logistics" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_logistics.product_id) AND (p.partner_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Partner owners can insert fiscal profiles" ON public."product_fiscal_profiles";

CREATE POLICY "Partner owners can insert fiscal profiles" ON public."product_fiscal_profiles" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Partner owners can update fiscal profiles" ON public."product_fiscal_profiles";

CREATE POLICY "Partner owners can update fiscal profiles" ON public."product_fiscal_profiles" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_fiscal_profiles.product_id) AND (p.partner_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Partner owners can view fiscal profiles" ON public."product_fiscal_profiles";

CREATE POLICY "Partner owners can view fiscal profiles" ON public."product_fiscal_profiles" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_fiscal_profiles.product_id) AND (p.partner_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "return_evidence_all_partner" ON public."return_evidence";

CREATE POLICY "return_evidence_all_partner" ON public."return_evidence" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (return_requests rr
     JOIN partner_users pu ON ((pu.partner_id = rr.partner_id)))
  WHERE ((rr.id = return_evidence.return_request_id) AND (pu.user_id = (SELECT auth.uid())) AND ((active_store_id() IS NULL) OR (rr.store_id = active_store_id())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (return_requests rr
     JOIN partner_users pu ON ((pu.partner_id = rr.partner_id)))
  WHERE ((rr.id = return_evidence.return_request_id) AND (pu.user_id = (SELECT auth.uid())) AND ((active_store_id() IS NULL) OR (rr.store_id = active_store_id()))))));

DROP POLICY IF EXISTS "return_evidence_select_customer" ON public."return_evidence";

CREATE POLICY "return_evidence_select_customer" ON public."return_evidence" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM return_requests rr
  WHERE ((rr.id = return_evidence.return_request_id) AND (rr.customer_user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "partner_risk_events_admin_select" ON public."partner_risk_events";

CREATE POLICY "partner_risk_events_admin_select" ON public."partner_risk_events" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE ((admin_roles.user_id = (SELECT auth.uid())) AND (admin_roles.role = ANY (ARRAY['moderator'::text, 'admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "stock_movement_items_insert" ON public."stock_movement_items";

CREATE POLICY "stock_movement_items_insert" ON public."stock_movement_items" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM stock_movements sm
  WHERE ((sm.id = stock_movement_items.movement_id) AND (sm.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))
        UNION
         SELECT partner_users.partner_id
           FROM partner_users
          WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGER'::text])))))))));

DROP POLICY IF EXISTS "stock_movement_items_select" ON public."stock_movement_items";

CREATE POLICY "stock_movement_items_select" ON public."stock_movement_items" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM stock_movements sm
  WHERE ((sm.id = stock_movement_items.movement_id) AND (sm.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))
        UNION
         SELECT partner_users.partner_id
           FROM partner_users
          WHERE (partner_users.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "checkout_fulfillments_partner" ON public."checkout_fulfillments";

CREATE POLICY "checkout_fulfillments_partner" ON public."checkout_fulfillments" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = checkout_fulfillments.partner_id) AND (pu.user_id = (SELECT auth.uid())) AND ((active_store_id() IS NULL) OR (checkout_fulfillments.store_id = active_store_id()))))));

DROP POLICY IF EXISTS "coupon_services_manage_partner_users" ON public."coupon_services";

CREATE POLICY "coupon_services_manage_partner_users" ON public."coupon_services" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_services.coupon_id) AND (pu.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_services.coupon_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "address_coordinates_cache_partner_rw" ON public."address_coordinates_cache";

CREATE POLICY "address_coordinates_cache_partner_rw" ON public."address_coordinates_cache" FOR ALL TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid()))))) WITH CHECK ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "coupon_subscriptions_manage_partner_users" ON public."coupon_subscriptions";

CREATE POLICY "coupon_subscriptions_manage_partner_users" ON public."coupon_subscriptions" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_subscriptions.coupon_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "recurring_plans_partner" ON public."recurring_plans";

CREATE POLICY "recurring_plans_partner" ON public."recurring_plans" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = recurring_plans.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "product_variants_delete_own" ON public."product_variants";

CREATE POLICY "product_variants_delete_own" ON public."product_variants" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))
        UNION
         SELECT partner_users.partner_id
           FROM partner_users
          WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text])))))))));

DROP POLICY IF EXISTS "product_variants_insert_own" ON public."product_variants";

CREATE POLICY "product_variants_insert_own" ON public."product_variants" FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))
        UNION
         SELECT partner_users.partner_id
           FROM partner_users
          WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])))))))));

DROP POLICY IF EXISTS "product_variants_select_own_all" ON public."product_variants";

CREATE POLICY "product_variants_select_own_all" ON public."product_variants" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))
        UNION
         SELECT partner_users.partner_id
           FROM partner_users
          WHERE (partner_users.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "product_variants_update_own" ON public."product_variants";

CREATE POLICY "product_variants_update_own" ON public."product_variants" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))
        UNION
         SELECT partner_users.partner_id
           FROM partner_users
          WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))
        UNION
         SELECT partner_users.partner_id
           FROM partner_users
          WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])))))))));

DROP POLICY IF EXISTS "Service role full access on favorites" ON public."favorites";

CREATE POLICY "Service role full access on favorites" ON public."favorites" FOR ALL TO public USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can delete own favorites" ON public."favorites";

CREATE POLICY "Users can delete own favorites" ON public."favorites" FOR DELETE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own favorites" ON public."favorites";

CREATE POLICY "Users can insert own favorites" ON public."favorites" FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own favorites" ON public."favorites";

CREATE POLICY "Users can read own favorites" ON public."favorites" FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "campaign_customers_partner_users" ON public."campaign_customers";

CREATE POLICY "campaign_customers_partner_users" ON public."campaign_customers" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (campaigns c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = campaign_customers.campaign_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "promotion_usages_partner_users" ON public."promotion_usages";

CREATE POLICY "promotion_usages_partner_users" ON public."promotion_usages" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (promotions p
     JOIN partner_users pu ON ((pu.partner_id = p.partner_id)))
  WHERE ((p.id = promotion_usages.promotion_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON public."push_subscriptions";

CREATE POLICY "push_subscriptions_delete_own" ON public."push_subscriptions" FOR DELETE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "push_subscriptions_insert_own" ON public."push_subscriptions";

CREATE POLICY "push_subscriptions_insert_own" ON public."push_subscriptions" FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "push_subscriptions_select_own" ON public."push_subscriptions";

CREATE POLICY "push_subscriptions_select_own" ON public."push_subscriptions" FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "push_subscriptions_update_own" ON public."push_subscriptions";

CREATE POLICY "push_subscriptions_update_own" ON public."push_subscriptions" FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "notification_delivery_log_select_own" ON public."notification_delivery_log";

CREATE POLICY "notification_delivery_log_select_own" ON public."notification_delivery_log" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM notifications n
  WHERE ((n.id = notification_delivery_log.notification_id) AND (n.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Buyer and seller can view orders" ON public."orders";

CREATE POLICY "Buyer and seller can view orders" ON public."orders" FOR SELECT TO public USING (((buyer_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = orders.partner_id) AND (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Seller can update order status" ON public."orders";

CREATE POLICY "Seller can update order status" ON public."orders" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = orders.partner_id) AND (partners.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = orders.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "orders_delete_buyer_pending" ON public."orders";

CREATE POLICY "orders_delete_buyer_pending" ON public."orders" FOR DELETE TO public USING ((((SELECT auth.uid()) = buyer_id) AND (situation = 'pending'::text)));

DROP POLICY IF EXISTS "orders_delete_policy" ON public."orders";

CREATE POLICY "orders_delete_policy" ON public."orders" FOR DELETE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text]))))));

DROP POLICY IF EXISTS "orders_insert_buyer" ON public."orders";

CREATE POLICY "orders_insert_buyer" ON public."orders" FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = buyer_id));

DROP POLICY IF EXISTS "orders_insert_policy" ON public."orders";

CREATE POLICY "orders_insert_policy" ON public."orders" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGER'::text]))))) OR (((SELECT auth.uid()) IS NOT NULL) AND (buyer_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "orders_select_buyer" ON public."orders";

CREATE POLICY "orders_select_buyer" ON public."orders" FOR SELECT TO public USING (((SELECT auth.uid()) = buyer_id));

DROP POLICY IF EXISTS "orders_select_partner" ON public."orders";

CREATE POLICY "orders_select_partner" ON public."orders" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = orders.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "orders_select_policy" ON public."orders";

CREATE POLICY "orders_select_policy" ON public."orders" FOR SELECT TO public USING ((((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))) OR (buyer_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "orders_update_partner" ON public."orders";

CREATE POLICY "orders_update_partner" ON public."orders" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = orders.partner_id) AND (partners.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = orders.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "orders_update_policy" ON public."orders";

CREATE POLICY "orders_update_policy" ON public."orders" FOR UPDATE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGER'::text]))))) OR (buyer_id = (SELECT auth.uid()))));

DROP POLICY IF EXISTS "notifications_select_own" ON public."notifications";

CREATE POLICY "notifications_select_own" ON public."notifications" FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "notifications_update_own" ON public."notifications";

CREATE POLICY "notifications_update_own" ON public."notifications" FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "quotes_delete_policy" ON public."quotes";

CREATE POLICY "quotes_delete_policy" ON public."quotes" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text]))))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "quotes_insert_policy" ON public."quotes";

CREATE POLICY "quotes_insert_policy" ON public."quotes" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGER'::text]))))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "quotes_select_policy" ON public."quotes";

CREATE POLICY "quotes_select_policy" ON public."quotes" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "quotes_update_policy" ON public."quotes";

CREATE POLICY "quotes_update_policy" ON public."quotes" FOR UPDATE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGER'::text])))))) WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGER'::text]))))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "partner_access" ON public."stock_movement_attachments";

CREATE POLICY "partner_access" ON public."stock_movement_attachments" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (stock_movements sm
     JOIN partner_users pu ON ((pu.partner_id = sm.partner_id)))
  WHERE ((sm.id = stock_movement_attachments.stock_movement_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "partner_access" ON public."transaction_attachments";

CREATE POLICY "partner_access" ON public."transaction_attachments" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (transactions t
     JOIN partner_users pu ON ((pu.partner_id = t.partner_id)))
  WHERE ((t.id = transaction_attachments.transaction_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "admin_update_partners" ON public."partners";

CREATE POLICY "admin_update_partners" ON public."partners" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE ((admin_roles.user_id = (SELECT auth.uid())) AND (admin_roles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "partners_delete_own" ON public."partners";

CREATE POLICY "partners_delete_own" ON public."partners" FOR DELETE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "partners_insert_own" ON public."partners";

CREATE POLICY "partners_insert_own" ON public."partners" FOR INSERT TO public WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND ((SELECT auth.uid()) = user_id)));

DROP POLICY IF EXISTS "partners_select_own" ON public."partners";

CREATE POLICY "partners_select_own" ON public."partners" FOR SELECT TO authenticated USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "partners_update_own" ON public."partners";

CREATE POLICY "partners_update_own" ON public."partners" FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "cart_items_delete_own" ON public."cart_items";

CREATE POLICY "cart_items_delete_own" ON public."cart_items" FOR DELETE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "cart_items_insert_own" ON public."cart_items";

CREATE POLICY "cart_items_insert_own" ON public."cart_items" FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "cart_items_select_own" ON public."cart_items";

CREATE POLICY "cart_items_select_own" ON public."cart_items" FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "cart_items_update_own" ON public."cart_items";

CREATE POLICY "cart_items_update_own" ON public."cart_items" FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete appointment items" ON public."appointment_items";

CREATE POLICY "Users can delete appointment items" ON public."appointment_items" FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM (appointments a
     JOIN partner_users pu ON ((pu.partner_id = a.partner_id)))
  WHERE ((a.id = appointment_items.appointment_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Users can insert appointment items" ON public."appointment_items";

CREATE POLICY "Users can insert appointment items" ON public."appointment_items" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM (appointments a
     JOIN partner_users pu ON ((pu.partner_id = a.partner_id)))
  WHERE ((a.id = appointment_items.appointment_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Users can update appointment items" ON public."appointment_items";

CREATE POLICY "Users can update appointment items" ON public."appointment_items" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM (appointments a
     JOIN partner_users pu ON ((pu.partner_id = a.partner_id)))
  WHERE ((a.id = appointment_items.appointment_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Users can view appointment items" ON public."appointment_items";

CREATE POLICY "Users can view appointment items" ON public."appointment_items" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (appointments a
     JOIN partner_users pu ON ((pu.partner_id = a.partner_id)))
  WHERE ((a.id = appointment_items.appointment_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "order_items_all_policy" ON public."order_items";

CREATE POLICY "order_items_all_policy" ON public."order_items" FOR ALL TO public USING ((order_id IN ( SELECT orders.id
   FROM orders
  WHERE ((orders.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))
        UNION
         SELECT partner_users.partner_id
           FROM partner_users
          WHERE (partner_users.user_id = (SELECT auth.uid())))) OR (orders.buyer_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "order_items_insert_buyer" ON public."order_items";

CREATE POLICY "order_items_insert_buyer" ON public."order_items" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = order_items.order_id) AND (orders.buyer_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "order_items_select_buyer" ON public."order_items";

CREATE POLICY "order_items_select_buyer" ON public."order_items" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = order_items.order_id) AND (orders.buyer_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "order_items_select_partner" ON public."order_items";

CREATE POLICY "order_items_select_partner" ON public."order_items" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (orders
     JOIN partners ON ((orders.partner_id = partners.id)))
  WHERE ((orders.id = order_items.order_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Partner owners can view customers" ON public."customers";

CREATE POLICY "Partner owners can view customers" ON public."customers" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = customers.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "customers_delete_own" ON public."customers";

CREATE POLICY "customers_delete_own" ON public."customers" FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = customers.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "customers_delete_policy" ON public."customers";

CREATE POLICY "customers_delete_policy" ON public."customers" FOR DELETE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "customers_insert_own" ON public."customers";

CREATE POLICY "customers_insert_own" ON public."customers" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = customers.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "customers_insert_policy" ON public."customers";

CREATE POLICY "customers_insert_policy" ON public."customers" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

DROP POLICY IF EXISTS "customers_select_own" ON public."customers";

CREATE POLICY "customers_select_own" ON public."customers" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = customers.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "customers_select_policy" ON public."customers";

CREATE POLICY "customers_select_policy" ON public."customers" FOR SELECT TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "customers_update_own" ON public."customers";

CREATE POLICY "customers_update_own" ON public."customers" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = customers.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "suppliers_delete_own" ON public."suppliers";

CREATE POLICY "suppliers_delete_own" ON public."suppliers" FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = suppliers.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "suppliers_insert_own" ON public."suppliers";

CREATE POLICY "suppliers_insert_own" ON public."suppliers" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = suppliers.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "suppliers_select_policy" ON public."suppliers";

CREATE POLICY "suppliers_select_policy" ON public."suppliers" FOR SELECT TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "suppliers_update_own" ON public."suppliers";

CREATE POLICY "suppliers_update_own" ON public."suppliers" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = suppliers.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "transactions_delete_own" ON public."transactions";

CREATE POLICY "transactions_delete_own" ON public."transactions" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "transactions_insert_own" ON public."transactions";

CREATE POLICY "transactions_insert_own" ON public."transactions" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "transactions_select_own" ON public."transactions";

CREATE POLICY "transactions_select_own" ON public."transactions" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "transactions_update_own" ON public."transactions";

CREATE POLICY "transactions_update_own" ON public."transactions" FOR UPDATE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

-- store_product_kits bridge table was dropped by 20260728_simplify_multi_store_architecture.sql.
-- product_kits now uses direct store_id. No policies needed here.

DROP POLICY IF EXISTS "whatsapp_templates_partner" ON public."whatsapp_templates";

CREATE POLICY "whatsapp_templates_partner" ON public."whatsapp_templates" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = whatsapp_templates.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "whatsapp_automation_logs_partner" ON public."whatsapp_automation_logs";

CREATE POLICY "whatsapp_automation_logs_partner" ON public."whatsapp_automation_logs" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = whatsapp_automation_logs.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "whatsapp_scheduled_jobs_partner" ON public."whatsapp_scheduled_jobs";

CREATE POLICY "whatsapp_scheduled_jobs_partner" ON public."whatsapp_scheduled_jobs" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = whatsapp_scheduled_jobs.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "marketplace_synonym_groups_service" ON public."marketplace_synonym_groups";

CREATE POLICY "marketplace_synonym_groups_service" ON public."marketplace_synonym_groups" FOR ALL TO public USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "marketplace_synonym_terms_service" ON public."marketplace_synonym_terms";

CREATE POLICY "marketplace_synonym_terms_service" ON public."marketplace_synonym_terms" FOR ALL TO public USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "return_items_write_partner" ON public."return_items";

CREATE POLICY "return_items_write_partner" ON public."return_items" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM return_requests rr
  WHERE ((rr.id = return_items.return_request_id) AND ((active_store_id() IS NULL) OR (rr.store_id = active_store_id())) AND ((EXISTS ( SELECT 1
           FROM partners p
          WHERE ((p.id = rr.partner_id) AND (p.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
           FROM partner_users pu
          WHERE ((pu.partner_id = rr.partner_id) AND (pu.user_id = (SELECT auth.uid())))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM return_requests rr
  WHERE ((rr.id = return_items.return_request_id) AND ((active_store_id() IS NULL) OR (rr.store_id = active_store_id())) AND ((EXISTS ( SELECT 1
           FROM partners p
          WHERE ((p.id = rr.partner_id) AND (p.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
           FROM partner_users pu
          WHERE ((pu.partner_id = rr.partner_id) AND (pu.user_id = (SELECT auth.uid()))))))))));

DROP POLICY IF EXISTS "pre_sales_delete_own" ON public."pre_sales";

CREATE POLICY "pre_sales_delete_own" ON public."pre_sales" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "pre_sales_insert_own" ON public."pre_sales";

CREATE POLICY "pre_sales_insert_own" ON public."pre_sales" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "pre_sales_select_own" ON public."pre_sales";

CREATE POLICY "pre_sales_select_own" ON public."pre_sales" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "pre_sales_update_own" ON public."pre_sales";

CREATE POLICY "pre_sales_update_own" ON public."pre_sales" FOR UPDATE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "notification_preferences_delete_own" ON public."notification_preferences";

CREATE POLICY "notification_preferences_delete_own" ON public."notification_preferences" FOR DELETE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "notification_preferences_insert_own" ON public."notification_preferences";

CREATE POLICY "notification_preferences_insert_own" ON public."notification_preferences" FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "notification_preferences_select_own" ON public."notification_preferences";

CREATE POLICY "notification_preferences_select_own" ON public."notification_preferences" FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "notification_preferences_update_own" ON public."notification_preferences";

CREATE POLICY "notification_preferences_update_own" ON public."notification_preferences" FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "xml_imports_insert_team" ON public."xml_imports";

CREATE POLICY "xml_imports_insert_team" ON public."xml_imports" FOR INSERT TO public WITH CHECK (((EXISTS ( SELECT 1
   FROM partner_users
  WHERE ((partner_users.partner_id = xml_imports.partner_id) AND (partner_users.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = xml_imports.partner_id) AND (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "xml_imports_select_team" ON public."xml_imports";

CREATE POLICY "xml_imports_select_team" ON public."xml_imports" FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM partner_users
  WHERE ((partner_users.partner_id = xml_imports.partner_id) AND (partner_users.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = xml_imports.partner_id) AND (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "xml_imports_update_team" ON public."xml_imports";

CREATE POLICY "xml_imports_update_team" ON public."xml_imports" FOR UPDATE TO public USING (((EXISTS ( SELECT 1
   FROM partner_users
  WHERE ((partner_users.partner_id = xml_imports.partner_id) AND (partner_users.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = xml_imports.partner_id) AND (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "xml_import_items_insert_team" ON public."xml_import_items";

CREATE POLICY "xml_import_items_insert_team" ON public."xml_import_items" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM xml_imports xi
  WHERE ((xi.id = xml_import_items.xml_import_id) AND ((EXISTS ( SELECT 1
           FROM partner_users
          WHERE ((partner_users.partner_id = xi.partner_id) AND (partner_users.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
           FROM partners
          WHERE ((partners.id = xi.partner_id) AND (partners.user_id = (SELECT auth.uid()))))))))));

DROP POLICY IF EXISTS "xml_import_items_select_team" ON public."xml_import_items";

CREATE POLICY "xml_import_items_select_team" ON public."xml_import_items" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM xml_imports xi
  WHERE ((xi.id = xml_import_items.xml_import_id) AND ((EXISTS ( SELECT 1
           FROM partner_users
          WHERE ((partner_users.partner_id = xi.partner_id) AND (partner_users.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
           FROM partners
          WHERE ((partners.id = xi.partner_id) AND (partners.user_id = (SELECT auth.uid()))))))))));

DROP POLICY IF EXISTS "xml_import_items_update_team" ON public."xml_import_items";

CREATE POLICY "xml_import_items_update_team" ON public."xml_import_items" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM xml_imports xi
  WHERE ((xi.id = xml_import_items.xml_import_id) AND ((EXISTS ( SELECT 1
           FROM partner_users
          WHERE ((partner_users.partner_id = xi.partner_id) AND (partner_users.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
           FROM partners
          WHERE ((partners.id = xi.partner_id) AND (partners.user_id = (SELECT auth.uid()))))))))));

DROP POLICY IF EXISTS "select_own_account_deletions" ON public."account_deletions";

CREATE POLICY "select_own_account_deletions" ON public."account_deletions" FOR SELECT TO authenticated USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "erp_imports_team_insert" ON public."erp_imports";

CREATE POLICY "erp_imports_team_insert" ON public."erp_imports" FOR INSERT TO public WITH CHECK (((EXISTS ( SELECT 1
   FROM partner_users
  WHERE ((partner_users.partner_id = erp_imports.partner_id) AND (partner_users.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = erp_imports.partner_id) AND (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "erp_imports_team_select" ON public."erp_imports";

CREATE POLICY "erp_imports_team_select" ON public."erp_imports" FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM partner_users
  WHERE ((partner_users.partner_id = erp_imports.partner_id) AND (partner_users.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = erp_imports.partner_id) AND (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "erp_imports_team_update" ON public."erp_imports";

CREATE POLICY "erp_imports_team_update" ON public."erp_imports" FOR UPDATE TO public USING (((EXISTS ( SELECT 1
   FROM partner_users
  WHERE ((partner_users.partner_id = erp_imports.partner_id) AND (partner_users.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = erp_imports.partner_id) AND (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "return_notifications_select_visible" ON public."return_notifications";

CREATE POLICY "return_notifications_select_visible" ON public."return_notifications" FOR SELECT TO public USING (((recipient_user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM partners p
  WHERE ((p.id = return_notifications.partner_id) AND (p.user_id = (SELECT auth.uid()))))) OR ((active_store_id() IS NOT NULL) AND (store_id = active_store_id()) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = return_notifications.partner_id) AND (pu.user_id = (SELECT auth.uid())))))) OR ((active_store_id() IS NULL) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = return_notifications.partner_id) AND (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "recurring_executions_customer_select" ON public."recurring_executions";

CREATE POLICY "recurring_executions_customer_select" ON public."recurring_executions" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (recurring_subscriptions rs
     JOIN customers c ON ((c.id = rs.customer_id)))
  WHERE ((rs.id = recurring_executions.subscription_id) AND (c.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "recurring_executions_partner" ON public."recurring_executions";

CREATE POLICY "recurring_executions_partner" ON public."recurring_executions" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = recurring_executions.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "store_credits_select_visible" ON public."store_credits";

CREATE POLICY "store_credits_select_visible" ON public."store_credits" FOR SELECT TO public USING (((customer_user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM partners p
  WHERE ((p.id = store_credits.partner_id) AND (p.user_id = (SELECT auth.uid()))))) OR ((active_store_id() IS NOT NULL) AND (store_id = active_store_id()) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = store_credits.partner_id) AND (pu.user_id = (SELECT auth.uid())))))) OR ((active_store_id() IS NULL) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = store_credits.partner_id) AND (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "transaction_payments_delete_own" ON public."transaction_payments";

CREATE POLICY "transaction_payments_delete_own" ON public."transaction_payments" FOR DELETE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "transaction_payments_insert_own" ON public."transaction_payments";

CREATE POLICY "transaction_payments_insert_own" ON public."transaction_payments" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "transaction_payments_select_own" ON public."transaction_payments";

CREATE POLICY "transaction_payments_select_own" ON public."transaction_payments" FOR SELECT TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "transaction_payments_update_own" ON public."transaction_payments";

CREATE POLICY "transaction_payments_update_own" ON public."transaction_payments" FOR UPDATE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Users can create their own addresses" ON public."addresses";

CREATE POLICY "Users can create their own addresses" ON public."addresses" FOR INSERT TO public WITH CHECK ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM partners p
  WHERE ((p.id = get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)) AND (p.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = get_address_partner_id(pu.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)) AND (pu.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Users can delete their own addresses" ON public."addresses";

CREATE POLICY "Users can delete their own addresses" ON public."addresses" FOR DELETE TO public USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM partners p
  WHERE ((p.id = get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)) AND (p.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = get_address_partner_id(pu.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)) AND (pu.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Users can update their own addresses" ON public."addresses";

CREATE POLICY "Users can update their own addresses" ON public."addresses" FOR UPDATE TO public USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM partners p
  WHERE ((p.id = get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)) AND (p.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = get_address_partner_id(pu.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)) AND (pu.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "Users can view their own addresses" ON public."addresses";

CREATE POLICY "Users can view their own addresses" ON public."addresses" FOR SELECT TO public USING ((((SELECT auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM partners p
  WHERE ((p.id = get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)) AND (p.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = get_address_partner_id(pu.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)) AND (pu.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "addresses_delete_own" ON public."addresses";

CREATE POLICY "addresses_delete_own" ON public."addresses" FOR DELETE TO authenticated USING (((user_id = (SELECT auth.uid())) OR (partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "addresses_insert_own" ON public."addresses";

CREATE POLICY "addresses_insert_own" ON public."addresses" FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) OR (partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "addresses_select_own" ON public."addresses";

CREATE POLICY "addresses_select_own" ON public."addresses" FOR SELECT TO authenticated USING (((user_id = (SELECT auth.uid())) OR (customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))) OR (supplier_id IN ( SELECT suppliers.id
   FROM suppliers
  WHERE (suppliers.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))) OR (partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "addresses_update_own" ON public."addresses";

CREATE POLICY "addresses_update_own" ON public."addresses" FOR UPDATE TO authenticated USING (((user_id = (SELECT auth.uid())) OR (partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "purchase_cost_history_insert_own" ON public."purchase_cost_history";

CREATE POLICY "purchase_cost_history_insert_own" ON public."purchase_cost_history" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = purchase_cost_history.product_id) AND (products.partner_id IN ( SELECT partner_users.partner_id
           FROM partner_users
          WHERE (partner_users.user_id = (SELECT auth.uid()))
        UNION
         SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "purchase_cost_history_select_own" ON public."purchase_cost_history";

CREATE POLICY "purchase_cost_history_select_own" ON public."purchase_cost_history" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = purchase_cost_history.product_id) AND (products.partner_id IN ( SELECT partner_users.partner_id
           FROM partner_users
          WHERE (partner_users.user_id = (SELECT auth.uid()))
        UNION
         SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "Partners can manage their own brands" ON public."brands";

CREATE POLICY "Partners can manage their own brands" ON public."brands" FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = brands.partner_id) AND (partners.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partner_users
  WHERE ((partner_users.partner_id = brands.partner_id) AND (partner_users.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "recurring_subscription_items_customer_select" ON public."recurring_subscription_items";

CREATE POLICY "recurring_subscription_items_customer_select" ON public."recurring_subscription_items" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (recurring_subscriptions rs
     JOIN customers c ON ((c.id = rs.customer_id)))
  WHERE ((rs.id = recurring_subscription_items.subscription_id) AND (c.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "recurring_subscription_items_partner" ON public."recurring_subscription_items";

CREATE POLICY "recurring_subscription_items_partner" ON public."recurring_subscription_items" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (recurring_subscriptions rs
     JOIN partner_users pu ON ((pu.partner_id = rs.partner_id)))
  WHERE ((rs.id = recurring_subscription_items.subscription_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "cash_movements_delete_own" ON public."cash_movements";

CREATE POLICY "cash_movements_delete_own" ON public."cash_movements" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "cash_movements_insert_own" ON public."cash_movements";

CREATE POLICY "cash_movements_insert_own" ON public."cash_movements" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "cash_movements_select_own" ON public."cash_movements";

CREATE POLICY "cash_movements_select_own" ON public."cash_movements" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "cash_movements_update_own" ON public."cash_movements";

CREATE POLICY "cash_movements_update_own" ON public."cash_movements" FOR UPDATE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "billing_events_select_own" ON public."billing_events";

CREATE POLICY "billing_events_select_own" ON public."billing_events" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = billing_events.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "admin_audit_logs_select" ON public."admin_audit_logs";

CREATE POLICY "admin_audit_logs_select" ON public."admin_audit_logs" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE (admin_roles.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "deliveries_insert_partner_users" ON public."deliveries";

CREATE POLICY "deliveries_insert_partner_users" ON public."deliveries" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "deliveries_select_partner_users" ON public."deliveries";

CREATE POLICY "deliveries_select_partner_users" ON public."deliveries" FOR SELECT TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "deliveries_update_partner_users" ON public."deliveries";

CREATE POLICY "deliveries_update_partner_users" ON public."deliveries" FOR UPDATE TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid()))))) WITH CHECK ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "delivery_fee_rules_partner_rw" ON public."delivery_fee_rules";

CREATE POLICY "delivery_fee_rules_partner_rw" ON public."delivery_fee_rules" FOR ALL TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid()))))) WITH CHECK ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "cash_sessions_delete_own" ON public."cash_sessions";

CREATE POLICY "cash_sessions_delete_own" ON public."cash_sessions" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "cash_sessions_insert_own" ON public."cash_sessions";

CREATE POLICY "cash_sessions_insert_own" ON public."cash_sessions" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "cash_sessions_select_own" ON public."cash_sessions";

CREATE POLICY "cash_sessions_select_own" ON public."cash_sessions" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "cash_sessions_update_own" ON public."cash_sessions";

CREATE POLICY "cash_sessions_update_own" ON public."cash_sessions" FOR UPDATE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "financial_categories_partner_store" ON public."financial_categories";

CREATE POLICY "financial_categories_partner_store" ON public."financial_categories" FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = financial_categories.partner_id) AND (partners.user_id = (SELECT auth.uid()))))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "finance_accounts_partner_store" ON public."finance_accounts";

CREATE POLICY "finance_accounts_partner_store" ON public."finance_accounts" FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = finance_accounts.partner_id) AND (partners.user_id = (SELECT auth.uid()))))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "employee_commissions_delete_partner_users" ON public."employee_commissions";

CREATE POLICY "employee_commissions_delete_partner_users" ON public."employee_commissions" FOR DELETE TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "employee_commissions_insert_partner_users" ON public."employee_commissions";

CREATE POLICY "employee_commissions_insert_partner_users" ON public."employee_commissions" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "employee_commissions_select_partner_users" ON public."employee_commissions";

CREATE POLICY "employee_commissions_select_partner_users" ON public."employee_commissions" FOR SELECT TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "employee_commissions_update_partner_users" ON public."employee_commissions";

CREATE POLICY "employee_commissions_update_partner_users" ON public."employee_commissions" FOR UPDATE TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid()))))) WITH CHECK ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "installment_groups_insert_own" ON public."installment_groups";

CREATE POLICY "installment_groups_insert_own" ON public."installment_groups" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "installment_groups_select_own" ON public."installment_groups";

CREATE POLICY "installment_groups_select_own" ON public."installment_groups" FOR SELECT TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "fraud_checks_insert_rate_limited" ON public."fraud_checks";

CREATE POLICY "fraud_checks_insert_rate_limited" ON public."fraud_checks" FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND check_fraud_check_rate_limit((SELECT auth.uid()))));

DROP POLICY IF EXISTS "fraud_checks_select_own" ON public."fraud_checks";

CREATE POLICY "fraud_checks_select_own" ON public."fraud_checks" FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "orders_history_insert_own" ON public."orders_history";

CREATE POLICY "orders_history_insert_own" ON public."orders_history" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = orders_history.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "orders_history_select_own" ON public."orders_history";

CREATE POLICY "orders_history_select_own" ON public."orders_history" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = orders_history.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "partner_invitations_select" ON public."partner_invitations";

CREATE POLICY "partner_invitations_select" ON public."partner_invitations" FOR SELECT TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "partner_users_select" ON public."partner_users";

CREATE POLICY "partner_users_select" ON public."partner_users" FOR SELECT TO public USING (((user_id = (SELECT auth.uid())) OR (partner_id IN ( SELECT get_user_partner_ids() AS get_user_partner_ids))));

DROP POLICY IF EXISTS "payment_methods_delete_own" ON public."partner_payment_methods";

CREATE POLICY "payment_methods_delete_own" ON public."partner_payment_methods" FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = partner_payment_methods.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "payment_methods_insert_own" ON public."partner_payment_methods";

CREATE POLICY "payment_methods_insert_own" ON public."partner_payment_methods" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = partner_payment_methods.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "payment_methods_select_own" ON public."partner_payment_methods";

CREATE POLICY "payment_methods_select_own" ON public."partner_payment_methods" FOR SELECT TO authenticated USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "subscription_item_credits_customer_select" ON public."subscription_item_credits";

CREATE POLICY "subscription_item_credits_customer_select" ON public."subscription_item_credits" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = subscription_item_credits.customer_id) AND (c.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "subscription_item_credits_partner" ON public."subscription_item_credits";

CREATE POLICY "subscription_item_credits_partner" ON public."subscription_item_credits" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = subscription_item_credits.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "recurring_plan_items_partner" ON public."recurring_plan_items";

CREATE POLICY "recurring_plan_items_partner" ON public."recurring_plan_items" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (recurring_plans rp
     JOIN partner_users pu ON ((pu.partner_id = rp.partner_id)))
  WHERE ((rp.id = recurring_plan_items.plan_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Partners can manage their own categories" ON public."product_categories";

CREATE POLICY "Partners can manage their own categories" ON public."product_categories" FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = product_categories.partner_id) AND (partners.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partner_users
  WHERE ((partner_users.partner_id = product_categories.partner_id) AND (partner_users.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "collections_delete_own" ON public."collections";

CREATE POLICY "collections_delete_own" ON public."collections" FOR DELETE TO public USING ((author_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "collections_insert_own" ON public."collections";

CREATE POLICY "collections_insert_own" ON public."collections" FOR INSERT TO public WITH CHECK ((author_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "collections_select_own_or_public" ON public."collections";

CREATE POLICY "collections_select_own_or_public" ON public."collections" FOR SELECT TO public USING (((author_id = (SELECT auth.uid())) OR true));

DROP POLICY IF EXISTS "collections_update_own" ON public."collections";

CREATE POLICY "collections_update_own" ON public."collections" FOR UPDATE TO public USING ((author_id = (SELECT auth.uid()))) WITH CHECK ((author_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "collection_items_delete" ON public."collection_items";

CREATE POLICY "collection_items_delete" ON public."collection_items" FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM collections c
  WHERE ((c.id = collection_items.collection_id) AND (c.author_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "collection_items_insert" ON public."collection_items";

CREATE POLICY "collection_items_insert" ON public."collection_items" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM collections c
  WHERE ((c.id = collection_items.collection_id) AND (c.author_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "collection_items_update" ON public."collection_items";

CREATE POLICY "collection_items_update" ON public."collection_items" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM collections c
  WHERE ((c.id = collection_items.collection_id) AND (c.author_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM collections c
  WHERE ((c.id = collection_items.collection_id) AND (c.author_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "subscription_item_credit_ledger_customer_select" ON public."subscription_item_credit_ledger";

CREATE POLICY "subscription_item_credit_ledger_customer_select" ON public."subscription_item_credit_ledger" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = subscription_item_credit_ledger.customer_id) AND (c.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "subscription_item_credit_ledger_partner" ON public."subscription_item_credit_ledger";

CREATE POLICY "subscription_item_credit_ledger_partner" ON public."subscription_item_credit_ledger" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = subscription_item_credit_ledger.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Parceiros podem atualizar seus kits" ON public."product_kits";

CREATE POLICY "Parceiros podem atualizar seus kits" ON public."product_kits" FOR UPDATE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Parceiros podem criar kits" ON public."product_kits";

CREATE POLICY "Parceiros podem criar kits" ON public."product_kits" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Parceiros podem deletar seus kits" ON public."product_kits";

CREATE POLICY "Parceiros podem deletar seus kits" ON public."product_kits" FOR DELETE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "product_kits_select_policy" ON public."product_kits";

CREATE POLICY "product_kits_select_policy" ON public."product_kits" FOR SELECT TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "recurring_subscriptions_customer_select" ON public."recurring_subscriptions";

CREATE POLICY "recurring_subscriptions_customer_select" ON public."recurring_subscriptions" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = recurring_subscriptions.customer_id) AND (c.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "recurring_subscriptions_partner" ON public."recurring_subscriptions";

CREATE POLICY "recurring_subscriptions_partner" ON public."recurring_subscriptions" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = recurring_subscriptions.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "recurring_transactions_delete_own" ON public."recurring_transactions";

CREATE POLICY "recurring_transactions_delete_own" ON public."recurring_transactions" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "recurring_transactions_insert_own" ON public."recurring_transactions";

CREATE POLICY "recurring_transactions_insert_own" ON public."recurring_transactions" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "recurring_transactions_select_own" ON public."recurring_transactions";

CREATE POLICY "recurring_transactions_select_own" ON public."recurring_transactions" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "recurring_transactions_update_own" ON public."recurring_transactions";

CREATE POLICY "recurring_transactions_update_own" ON public."recurring_transactions" FOR UPDATE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "qi_delete_policy" ON public."quote_items";

CREATE POLICY "qi_delete_policy" ON public."quote_items" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text]))))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "qi_insert_policy" ON public."quote_items";

CREATE POLICY "qi_insert_policy" ON public."quote_items" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGER'::text]))))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "qi_select_policy" ON public."quote_items";

CREATE POLICY "qi_select_policy" ON public."quote_items" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "qi_update_policy" ON public."quote_items";

CREATE POLICY "qi_update_policy" ON public."quote_items" FOR UPDATE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGER'::text])))))) WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'MANAGER'::text]))))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "Partners can manage their own locations" ON public."storage_locations";

CREATE POLICY "Partners can manage their own locations" ON public."storage_locations" FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = storage_locations.partner_id) AND (partners.user_id = (SELECT auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM partner_users
  WHERE ((partner_users.partner_id = storage_locations.partner_id) AND (partner_users.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "sales_goals_delete_partner_users" ON public."sales_goals";

CREATE POLICY "sales_goals_delete_partner_users" ON public."sales_goals" FOR DELETE TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "sales_goals_insert_partner_users" ON public."sales_goals";

CREATE POLICY "sales_goals_insert_partner_users" ON public."sales_goals" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "sales_goals_select_partner_users" ON public."sales_goals";

CREATE POLICY "sales_goals_select_partner_users" ON public."sales_goals" FOR SELECT TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "sales_goals_update_partner_users" ON public."sales_goals";

CREATE POLICY "sales_goals_update_partner_users" ON public."sales_goals" FOR UPDATE TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid()))))) WITH CHECK ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Partner service categories are manageable by invited users" ON public."service_categories";

CREATE POLICY "Partner service categories are manageable by invited users" ON public."service_categories" FOR ALL TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid()))))) WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Partner service categories are viewable by invited users" ON public."service_categories";

CREATE POLICY "Partner service categories are viewable by invited users" ON public."service_categories" FOR SELECT TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "reviews_delete_own" ON public."reviews";

CREATE POLICY "reviews_delete_own" ON public."reviews" FOR DELETE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "reviews_insert_own_rate_limited" ON public."reviews";

CREATE POLICY "reviews_insert_own_rate_limited" ON public."reviews" FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND check_review_rate_limit((SELECT auth.uid())) AND (rating >= 1) AND (rating <= 5)));

DROP POLICY IF EXISTS "reviews_update_own" ON public."reviews";

CREATE POLICY "reviews_update_own" ON public."reviews" FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "community_videos_delete_own" ON public."community_videos";

CREATE POLICY "community_videos_delete_own" ON public."community_videos" FOR DELETE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "community_videos_insert" ON public."community_videos";

CREATE POLICY "community_videos_insert" ON public."community_videos" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "community_videos_select_own" ON public."community_videos";

CREATE POLICY "community_videos_select_own" ON public."community_videos" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR (moderation_status = 'approved'::text)));

DROP POLICY IF EXISTS "community_videos_update_own" ON public."community_videos";

CREATE POLICY "community_videos_update_own" ON public."community_videos" FOR UPDATE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))))) WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "sale_items_delete_own" ON public."sale_items";

CREATE POLICY "sale_items_delete_own" ON public."sale_items" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "sale_items_insert_own" ON public."sale_items";

CREATE POLICY "sale_items_insert_own" ON public."sale_items" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "sale_items_select_own" ON public."sale_items";

CREATE POLICY "sale_items_select_own" ON public."sale_items" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "sale_items_update_own" ON public."sale_items";

CREATE POLICY "sale_items_update_own" ON public."sale_items" FOR UPDATE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "Parceiros podem atualizar fornecedores" ON public."product_suppliers";

CREATE POLICY "Parceiros podem atualizar fornecedores" ON public."product_suppliers" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_suppliers.product_id) AND (products.partner_id = ( SELECT products.partner_id
           FROM auth.users
          WHERE (users.id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "Parceiros podem deletar fornecedores de produtos" ON public."product_suppliers";

CREATE POLICY "Parceiros podem deletar fornecedores de produtos" ON public."product_suppliers" FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_suppliers.product_id) AND (products.partner_id = ( SELECT products.partner_id
           FROM auth.users
          WHERE (users.id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "Parceiros podem ver fornecedores de seus produtos" ON public."product_suppliers";

CREATE POLICY "Parceiros podem ver fornecedores de seus produtos" ON public."product_suppliers" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_suppliers.product_id) AND (products.partner_id = ( SELECT products.partner_id
           FROM auth.users
          WHERE (users.id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "Parceiros podem vincular fornecedores" ON public."product_suppliers";

CREATE POLICY "Parceiros podem vincular fornecedores" ON public."product_suppliers" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_suppliers.product_id) AND (products.partner_id = ( SELECT products.partner_id
           FROM auth.users
          WHERE (users.id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "partner_team_can_view_stock_movements" ON public."stock_movements";

CREATE POLICY "partner_team_can_view_stock_movements" ON public."stock_movements" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "stock_movements_delete_own" ON public."stock_movements";

CREATE POLICY "stock_movements_delete_own" ON public."stock_movements" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND (created_at > (now() - '24:00:00'::interval))));

DROP POLICY IF EXISTS "stock_movements_insert_own" ON public."stock_movements";

CREATE POLICY "stock_movements_insert_own" ON public."stock_movements" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "stock_movements_select_own" ON public."stock_movements";

CREATE POLICY "stock_movements_select_own" ON public."stock_movements" FOR SELECT TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "stock_movements_update_own" ON public."stock_movements";

CREATE POLICY "stock_movements_update_own" ON public."stock_movements" FOR UPDATE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))))) WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "sales_delete_own" ON public."sales";

CREATE POLICY "sales_delete_own" ON public."sales" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "sales_insert_own" ON public."sales";

CREATE POLICY "sales_insert_own" ON public."sales" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "sales_select_own" ON public."sales";

CREATE POLICY "sales_select_own" ON public."sales" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "sales_update_own" ON public."sales";

CREATE POLICY "sales_update_own" ON public."sales" FOR UPDATE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) OR ((store_id IS NOT NULL) AND user_has_store_access(store_id))));

DROP POLICY IF EXISTS "subscriptions_select_own" ON public."subscriptions";

CREATE POLICY "subscriptions_select_own" ON public."subscriptions" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = subscriptions.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "transaction_contacts_delete_own" ON public."transaction_contacts";

CREATE POLICY "transaction_contacts_delete_own" ON public."transaction_contacts" FOR DELETE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "transaction_contacts_insert_own" ON public."transaction_contacts";

CREATE POLICY "transaction_contacts_insert_own" ON public."transaction_contacts" FOR INSERT TO public WITH CHECK (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "transaction_contacts_select_own" ON public."transaction_contacts";

CREATE POLICY "transaction_contacts_select_own" ON public."transaction_contacts" FOR SELECT TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "transaction_contacts_update_own" ON public."transaction_contacts";

CREATE POLICY "transaction_contacts_update_own" ON public."transaction_contacts" FOR UPDATE TO public USING (((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid())))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "unavailable_types_modify" ON public."unavailable_types";

CREATE POLICY "unavailable_types_modify" ON public."unavailable_types" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = unavailable_types.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "unavailable_types_select" ON public."unavailable_types";

CREATE POLICY "unavailable_types_select" ON public."unavailable_types" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = unavailable_types.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Partner owners can delete products" ON public."products";

CREATE POLICY "Partner owners can delete products" ON public."products" FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = products.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Partner owners can update products" ON public."products";

CREATE POLICY "Partner owners can update products" ON public."products" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = products.partner_id) AND (partners.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = products.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "admin_select_products" ON public."products";

CREATE POLICY "admin_select_products" ON public."products" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE (admin_roles.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "admin_update_products" ON public."products";

CREATE POLICY "admin_update_products" ON public."products" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE ((admin_roles.user_id = (SELECT auth.uid())) AND (admin_roles.role = ANY (ARRAY['moderator'::text, 'admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "products_delete_own" ON public."products";

CREATE POLICY "products_delete_own" ON public."products" FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = products.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "products_delete_policy" ON public."products";

CREATE POLICY "products_delete_policy" ON public."products" FOR DELETE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "products_insert_policy" ON public."products";

CREATE POLICY "products_insert_policy" ON public."products" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

DROP POLICY IF EXISTS "products_select_own" ON public."products";

CREATE POLICY "products_select_own" ON public."products" FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = products.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "products_select_policy" ON public."products";

CREATE POLICY "products_select_policy" ON public."products" FOR SELECT TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "products_update_own" ON public."products";

CREATE POLICY "products_update_own" ON public."products" FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = products.partner_id) AND (partners.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = products.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "products_update_policy" ON public."products";

CREATE POLICY "products_update_policy" ON public."products" FOR UPDATE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])))))) WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

DROP POLICY IF EXISTS "coupon_categories_manage_partner_users" ON public."coupon_categories";

CREATE POLICY "coupon_categories_manage_partner_users" ON public."coupon_categories" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_categories.coupon_id) AND (pu.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_categories.coupon_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "appointments_delete_partner" ON public."appointments";

CREATE POLICY "appointments_delete_partner" ON public."appointments" FOR DELETE TO public USING (((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.user_id = (SELECT auth.uid())) AND (pu.partner_id = appointments.partner_id)))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "appointments_insert_partner" ON public."appointments";

CREATE POLICY "appointments_insert_partner" ON public."appointments" FOR INSERT TO public WITH CHECK (((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.user_id = (SELECT auth.uid())) AND (pu.partner_id = appointments.partner_id)))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "appointments_select_partner" ON public."appointments";

CREATE POLICY "appointments_select_partner" ON public."appointments" FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.user_id = (SELECT auth.uid())) AND (pu.partner_id = appointments.partner_id)))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "appointments_update_partner" ON public."appointments";

CREATE POLICY "appointments_update_partner" ON public."appointments" FOR UPDATE TO public USING (((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.user_id = (SELECT auth.uid())) AND (pu.partner_id = appointments.partner_id)))) AND ((store_id IS NULL) OR user_has_store_access(store_id))));

DROP POLICY IF EXISTS "usage_counters_select_own" ON public."usage_counters";

CREATE POLICY "usage_counters_select_own" ON public."usage_counters" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = usage_counters.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "coupon_customers_partner_access" ON public."coupon_customers";

CREATE POLICY "coupon_customers_partner_access" ON public."coupon_customers" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_customers.coupon_id) AND (pu.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_customers.coupon_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "admin_select_user_profiles" ON public."user_profiles";

CREATE POLICY "admin_select_user_profiles" ON public."user_profiles" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE (admin_roles.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "admin_update_user_profiles" ON public."user_profiles";

CREATE POLICY "admin_update_user_profiles" ON public."user_profiles" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE ((admin_roles.user_id = (SELECT auth.uid())) AND (admin_roles.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "user_profiles_select_same_partner_team" ON public."user_profiles";

CREATE POLICY "user_profiles_select_same_partner_team" ON public."user_profiles" FOR SELECT TO public USING ((user_id IN ( SELECT pu_colleague.user_id
   FROM (partner_users pu_viewer
     JOIN partner_users pu_colleague ON ((pu_colleague.partner_id = pu_viewer.partner_id)))
  WHERE (pu_viewer.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "users_insert_own_profile" ON public."user_profiles";

CREATE POLICY "users_insert_own_profile" ON public."user_profiles" FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "users_update_own_profile" ON public."user_profiles";

CREATE POLICY "users_update_own_profile" ON public."user_profiles" FOR UPDATE TO public USING (((SELECT auth.uid()) = user_id)) WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "users_view_own_profile" ON public."user_profiles";

CREATE POLICY "users_view_own_profile" ON public."user_profiles" FOR SELECT TO public USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "delivery_orders_insert_partner_users" ON public."delivery_orders";

CREATE POLICY "delivery_orders_insert_partner_users" ON public."delivery_orders" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_orders.delivery_id) AND (d.partner_id IN ( SELECT pu.partner_id
           FROM partner_users pu
          WHERE (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "delivery_orders_select_partner_users" ON public."delivery_orders";

CREATE POLICY "delivery_orders_select_partner_users" ON public."delivery_orders" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_orders.delivery_id) AND (d.partner_id IN ( SELECT pu.partner_id
           FROM partner_users pu
          WHERE (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "delivery_orders_update_partner_users" ON public."delivery_orders";

CREATE POLICY "delivery_orders_update_partner_users" ON public."delivery_orders" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_orders.delivery_id) AND (d.partner_id IN ( SELECT pu.partner_id
           FROM partner_users pu
          WHERE (pu.user_id = (SELECT auth.uid())))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_orders.delivery_id) AND (d.partner_id IN ( SELECT pu.partner_id
           FROM partner_users pu
          WHERE (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "coupon_usages_manage_partner_users" ON public."coupon_usages";

CREATE POLICY "coupon_usages_manage_partner_users" ON public."coupon_usages" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_usages.coupon_id) AND (pu.user_id = (SELECT auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (coupons c
     JOIN partner_users pu ON ((pu.partner_id = c.partner_id)))
  WHERE ((c.id = coupon_usages.coupon_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "payment_method_installment_fees_delete" ON public."payment_method_installment_fees";

CREATE POLICY "payment_method_installment_fees_delete" ON public."payment_method_installment_fees" FOR DELETE TO public USING ((payment_method_id IN ( SELECT payment_methods.id
   FROM payment_methods
  WHERE (payment_methods.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "payment_method_installment_fees_insert" ON public."payment_method_installment_fees";

CREATE POLICY "payment_method_installment_fees_insert" ON public."payment_method_installment_fees" FOR INSERT TO public WITH CHECK ((payment_method_id IN ( SELECT payment_methods.id
   FROM payment_methods
  WHERE (payment_methods.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "payment_method_installment_fees_select" ON public."payment_method_installment_fees";

CREATE POLICY "payment_method_installment_fees_select" ON public."payment_method_installment_fees" FOR SELECT TO public USING ((payment_method_id IN ( SELECT payment_methods.id
   FROM payment_methods
  WHERE (payment_methods.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "payment_method_installment_fees_update" ON public."payment_method_installment_fees";

CREATE POLICY "payment_method_installment_fees_update" ON public."payment_method_installment_fees" FOR UPDATE TO public USING ((payment_method_id IN ( SELECT payment_methods.id
   FROM payment_methods
  WHERE (payment_methods.partner_id IN ( SELECT partners.id
           FROM partners
          WHERE (partners.user_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "partner_isolation" ON public."service_order_services";

CREATE POLICY "partner_isolation" ON public."service_order_services" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (service_orders so
     JOIN partner_users pu ON ((pu.partner_id = so.partner_id)))
  WHERE ((so.id = service_order_services.service_order_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "partner_isolation" ON public."service_order_products";

CREATE POLICY "partner_isolation" ON public."service_order_products" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (service_orders so
     JOIN partner_users pu ON ((pu.partner_id = so.partner_id)))
  WHERE ((so.id = service_order_products.service_order_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "partner_isolation" ON public."service_order_attachments";

CREATE POLICY "partner_isolation" ON public."service_order_attachments" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (service_orders so
     JOIN partner_users pu ON ((pu.partner_id = so.partner_id)))
  WHERE ((so.id = service_order_attachments.service_order_id) AND (pu.user_id = (SELECT auth.uid()))))));

-- store_suppliers bridge table was dropped by 20260728_simplify_multi_store_architecture.sql.
-- suppliers now uses direct store_id. No policies needed here.

DROP POLICY IF EXISTS "return_requests_select_partner_or_customer" ON public."return_requests";

CREATE POLICY "return_requests_select_partner_or_customer" ON public."return_requests" FOR SELECT TO public USING (((customer_user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM partners p
  WHERE ((p.id = return_requests.partner_id) AND (p.user_id = (SELECT auth.uid()))))) OR ((active_store_id() IS NOT NULL) AND (store_id = active_store_id()) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = return_requests.partner_id) AND (pu.user_id = (SELECT auth.uid())))))) OR ((active_store_id() IS NULL) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = return_requests.partner_id) AND (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "return_requests_write_partner" ON public."return_requests";

CREATE POLICY "return_requests_write_partner" ON public."return_requests" FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM partners p
  WHERE ((p.id = return_requests.partner_id) AND (p.user_id = (SELECT auth.uid()))))) OR ((active_store_id() IS NOT NULL) AND (store_id = active_store_id()) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = return_requests.partner_id) AND (pu.user_id = (SELECT auth.uid())))))) OR ((active_store_id() IS NULL) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = return_requests.partner_id) AND (pu.user_id = (SELECT auth.uid())))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM partners p
  WHERE ((p.id = return_requests.partner_id) AND (p.user_id = (SELECT auth.uid()))))) OR ((active_store_id() IS NOT NULL) AND (store_id = active_store_id()) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = return_requests.partner_id) AND (pu.user_id = (SELECT auth.uid())))))) OR ((active_store_id() IS NULL) AND (EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = return_requests.partner_id) AND (pu.user_id = (SELECT auth.uid()))))))));

DROP POLICY IF EXISTS "Admins can manage all reports" ON public."reports";

CREATE POLICY "Admins can manage all reports" ON public."reports" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE ((admin_roles.user_id = (SELECT auth.uid())) AND (admin_roles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'moderator'::text]))))));

DROP POLICY IF EXISTS "Users can create own reports" ON public."reports";

CREATE POLICY "Users can create own reports" ON public."reports" FOR INSERT TO public WITH CHECK (((SELECT auth.uid()) = reporter_user_id));

DROP POLICY IF EXISTS "Users can view own reports" ON public."reports";

CREATE POLICY "Users can view own reports" ON public."reports" FOR SELECT TO public USING (((SELECT auth.uid()) = reporter_user_id));

DROP POLICY IF EXISTS "partner_return_policies_partner_rw" ON public."partner_return_policies";

CREATE POLICY "partner_return_policies_partner_rw" ON public."partner_return_policies" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = partner_return_policies.partner_id) AND (pu.user_id = (SELECT auth.uid())) AND (pu.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = partner_return_policies.partner_id) AND (pu.user_id = (SELECT auth.uid())) AND (pu.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

DROP POLICY IF EXISTS "return_messages_customer_select" ON public."return_messages";

CREATE POLICY "return_messages_customer_select" ON public."return_messages" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM return_requests rr
  WHERE ((rr.id = return_messages.return_request_id) AND ((rr.customer_user_id = (SELECT auth.uid())) OR (rr.customer_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "return_messages_insert" ON public."return_messages";

CREATE POLICY "return_messages_insert" ON public."return_messages" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM return_requests rr
  WHERE ((rr.id = return_messages.return_request_id) AND ((EXISTS ( SELECT 1
           FROM partner_users pu
          WHERE ((pu.partner_id = rr.partner_id) AND (pu.user_id = (SELECT auth.uid()))))) OR (rr.customer_user_id = (SELECT auth.uid())) OR (rr.customer_id = (SELECT auth.uid())))))));

DROP POLICY IF EXISTS "return_messages_partner_select" ON public."return_messages";

CREATE POLICY "return_messages_partner_select" ON public."return_messages" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM partner_users pu
  WHERE ((pu.partner_id = return_messages.partner_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "buyer_read" ON public."order_attachments";

CREATE POLICY "buyer_read" ON public."order_attachments" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_attachments.order_id) AND (o.buyer_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "partner_access" ON public."order_attachments";

CREATE POLICY "partner_access" ON public."order_attachments" FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (orders o
     JOIN partner_users pu ON ((pu.partner_id = o.partner_id)))
  WHERE ((o.id = order_attachments.order_id) AND (pu.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "store_members_select" ON public."store_members";

CREATE POLICY "store_members_select" ON public."store_members" FOR SELECT TO public USING (((partner_user_id IN ( SELECT partner_users.id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))) OR (store_id IN ( SELECT stores.id
   FROM stores
  WHERE (stores.partner_id IN ( SELECT get_user_partner_ids() AS get_user_partner_ids))))));

DROP POLICY IF EXISTS "audit_logs_select" ON public."audit_logs";

CREATE POLICY "audit_logs_select" ON public."audit_logs" FOR SELECT TO public USING ((partner_id IN ( SELECT pu.partner_id
   FROM partner_users pu
  WHERE (pu.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "admin_select_services" ON public."services";

CREATE POLICY "admin_select_services" ON public."services" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE (admin_roles.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "admin_update_services" ON public."services";

CREATE POLICY "admin_update_services" ON public."services" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM admin_roles
  WHERE ((admin_roles.user_id = (SELECT auth.uid())) AND (admin_roles.role = ANY (ARRAY['moderator'::text, 'admin'::text, 'super_admin'::text]))))));

DROP POLICY IF EXISTS "services_delete_own" ON public."services";

CREATE POLICY "services_delete_own" ON public."services" FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = services.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "services_delete_policy" ON public."services";

CREATE POLICY "services_delete_policy" ON public."services" FOR DELETE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text]))))));

DROP POLICY IF EXISTS "services_insert_own" ON public."services";

CREATE POLICY "services_insert_own" ON public."services" FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = services.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "services_insert_policy" ON public."services";

CREATE POLICY "services_insert_policy" ON public."services" FOR INSERT TO public WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

DROP POLICY IF EXISTS "services_select_policy" ON public."services";

CREATE POLICY "services_select_policy" ON public."services" FOR SELECT TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE (partner_users.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "services_update_own" ON public."services";

CREATE POLICY "services_update_own" ON public."services" FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM partners
  WHERE ((partners.id = services.partner_id) AND (partners.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "services_update_policy" ON public."services";

CREATE POLICY "services_update_policy" ON public."services" FOR UPDATE TO public USING ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])))))) WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM partners
  WHERE (partners.user_id = (SELECT auth.uid()))
UNION
 SELECT partner_users.partner_id
   FROM partner_users
  WHERE ((partner_users.user_id = (SELECT auth.uid())) AND (partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text]))))));

COMMIT;
