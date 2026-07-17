const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://qxuqjkpzargimmbyodnx.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dXFqa3B6YXJnaW1tYnlvZG54Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg0MjYzNiwiZXhwIjoyMDkzNDE4NjM2fQ.rKiPrGDiDozUh7OxR3XH-cpzAQfM1E_hZY-BLsMDxbc";

const admin = createClient(supabaseUrl, serviceRoleKey);

const PARTNER_ID = "fa491668-dce5-4c45-be97-e06cd2260a04";
const CAMPAIGN_ID = "85951f6d-ff5d-4622-b70c-96776fd10b72";
const STORES = [
  { id: "f4d7982f-0a94-4d71-9d6d-a55eedf4101f", name: "Loja Dudit" },
  { id: "37891072-f030-4184-9ad4-ebffcad211a8", name: "Dudit 2" },
  { id: "90bf849a-f858-4d06-a92f-dfea9c51abc7", name: "loja centro" },
];

async function setPromotionStores(promotionId, storeIds) {
  await admin.from("promotion_stores").delete().eq("promotion_id", promotionId);
  if (storeIds.length > 0) {
    const rows = storeIds.map((store_id) => ({ promotion_id: promotionId, store_id }));
    const { error } = await admin.from("promotion_stores").insert(rows);
    if (error) throw new Error(`setPromotionStores: ${error.message}`);
  }
}

async function setCouponStores(couponId, storeIds) {
  await admin.from("coupon_stores").delete().eq("coupon_id", couponId);
  if (storeIds.length > 0) {
    const rows = storeIds.map((store_id) => ({ coupon_id: couponId, store_id }));
    const { error } = await admin.from("coupon_stores").insert(rows);
    if (error) throw new Error(`setCouponStores: ${error.message}`);
  }
}

function check(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    return true;
  } else {
    console.log(`  ❌ ${label}`);
    return false;
  }
}

(async () => {
  console.log("=== SMOKE TEST F13 ===\n");
  let passed = 0, failed = 0;

  // ── Setup: create test promo & coupon ──────────────────────────────────
  console.log("─── Setup ───");
  const { data: promo } = await admin
    .from("promotions")
    .insert({
      partner_id: PARTNER_ID,
      campaign_id: CAMPAIGN_ID,
      name: "[F13 Smoke] Test Promo",
      description: "Smoke test - will be deleted",
      promotion_type: "discount",
      discount_type: "percentage",
      discount_value: 5,
      apply_scope: "specific_products",
      allow_coupon_combination: false,
      is_active: true,
    })
    .select("id")
    .single();
  if (!promo) { console.log("❌ Falha ao criar promoção"); return; }
  const PROMO_ID = promo.id;
  console.log(`  Promoção criada: ${PROMO_ID.substring(0,8)}...`);

  const { data: coupon, error: couponErr } = await admin
    .from("coupons")
    .insert({
      partner_id: PARTNER_ID,
      code: `SMOKE_${Date.now()}`,
      discount_type: "percentage",
      discount_value: 5,
      apply_scope: "all",
      allow_combination: true,
      min_cart_value: 0,
      first_purchase_only: false,
      is_active: true,
      customer_scope: "all",
      is_automatic: false,
    })
    .select("id")
    .single();
  if (!coupon) { console.log(`❌ Falha ao criar cupom: ${couponErr?.message}`); return; }
  const COUPON_ID = coupon.id;
  console.log(`  Cupom criado: ${COUPON_ID.substring(0,8)}...`);

  // Verify tables
  const { count: psInit } = await admin
    .from("promotion_stores").select("*", { count: "exact", head: true }).eq("promotion_id", PROMO_ID);
  const { count: csInit } = await admin
    .from("coupon_stores").select("*", { count: "exact", head: true }).eq("coupon_id", COUPON_ID);
  console.log(`  Bridge vazia: promo=${psInit} cupom=${csInit}\n`);

  // ── 1. Bridge vazia = todas as lojas ───────────────────────────────────
  console.log("─── 1. Bridge vazia → todas as lojas ───");
  failed += !check("promotion_stores = 0", psInit === 0) ? 1 : 0;
  passed += psInit === 0 ? 1 : 0;
  failed += !check("coupon_stores = 0", csInit === 0) ? 1 : 0;
  passed += csInit === 0 ? 1 : 0;

  // ── 2. Bridge com 2 lojas ──────────────────────────────────────────────
  console.log("\n─── 2. Bridge com 2 lojas específicas ───");
  await setPromotionStores(PROMO_ID, [STORES[0].id, STORES[1].id]);
  await setCouponStores(COUPON_ID, [STORES[0].id, STORES[1].id]);
  const { count: ps2 } = await admin
    .from("promotion_stores").select("*", { count: "exact", head: true }).eq("promotion_id", PROMO_ID);
  const { count: cs2 } = await admin
    .from("coupon_stores").select("*", { count: "exact", head: true }).eq("coupon_id", COUPON_ID);
  failed += !check("promotion_stores = 2", ps2 === 2) ? 1 : 0;
  passed += ps2 === 2 ? 1 : 0;
  failed += !check("coupon_stores = 2", cs2 === 2) ? 1 : 0;
  passed += cs2 === 2 ? 1 : 0;

  // Confirm correct stores
  const { data: psRows } = await admin
    .from("promotion_stores").select("store_id").eq("promotion_id", PROMO_ID);
  const psStoreIds = psRows?.map(r => r.store_id).sort() ?? [];
  const expectedIds = [STORES[0].id, STORES[1].id].sort();
  failed += !check("lojas corretas na promoção", JSON.stringify(psStoreIds) === JSON.stringify(expectedIds)) ? 1 : 0;
  passed += JSON.stringify(psStoreIds) === JSON.stringify(expectedIds) ? 1 : 0;

  // ── 3. Replace: mudar para 1 loja ──────────────────────────────────────
  console.log("\n─── 3. Replace: de 2 lojas para 1 ───");
  await setPromotionStores(PROMO_ID, [STORES[2].id]);
  await setCouponStores(COUPON_ID, [STORES[2].id]);
  const { count: ps3 } = await admin
    .from("promotion_stores").select("*", { count: "exact", head: true }).eq("promotion_id", PROMO_ID);
  const { count: cs3 } = await admin
    .from("coupon_stores").select("*", { count: "exact", head: true }).eq("coupon_id", COUPON_ID);
  failed += !check("promotion_stores = 1 (após replace)", ps3 === 1) ? 1 : 0;
  passed += ps3 === 1 ? 1 : 0;
  failed += !check("coupon_stores = 1 (após replace)", cs3 === 1) ? 1 : 0;
  passed += cs3 === 1 ? 1 : 0;

  // ── 4. Voltar para vazio ───────────────────────────────────────────────
  console.log("\n─── 4. Voltar para vazio (todas lojas) ───");
  await setPromotionStores(PROMO_ID, []);
  await setCouponStores(COUPON_ID, []);
  const { count: ps4 } = await admin
    .from("promotion_stores").select("*", { count: "exact", head: true }).eq("promotion_id", PROMO_ID);
  const { count: cs4 } = await admin
    .from("coupon_stores").select("*", { count: "exact", head: true }).eq("coupon_id", COUPON_ID);
  failed += !check("promotion_stores = 0 (todas lojas)", ps4 === 0) ? 1 : 0;
  passed += ps4 === 0 ? 1 : 0;
  failed += !check("coupon_stores = 0 (todas lojas)", cs4 === 0) ? 1 : 0;
  passed += cs4 === 0 ? 1 : 0;

  // ── 5. Cascade delete ──────────────────────────────────────────────────
  console.log("\n─── 5. Cascade delete ───");
  // Re-add stores
  await setPromotionStores(PROMO_ID, [STORES[0].id]);
  await setCouponStores(COUPON_ID, [STORES[0].id]);
  const { count: psBefore } = await admin
    .from("promotion_stores").select("*", { count: "exact", head: true }).eq("promotion_id", PROMO_ID);
  const { count: csBefore } = await admin
    .from("coupon_stores").select("*", { count: "exact", head: true }).eq("coupon_id", COUPON_ID);
  failed += !check("associações existem antes do delete", psBefore === 1 && csBefore === 1) ? 1 : 0;
  passed += psBefore === 1 && csBefore === 1 ? 1 : 0;

  // Delete parent records
  await admin.from("promotions").delete().eq("id", PROMO_ID);
  await admin.from("coupons").delete().eq("id", COUPON_ID);

  const { count: psAfter } = await admin
    .from("promotion_stores").select("*", { count: "exact", head: true }).eq("promotion_id", PROMO_ID);
  const { count: csAfter } = await admin
    .from("coupon_stores").select("*", { count: "exact", head: true }).eq("coupon_id", COUPON_ID);
  failed += !check("cascade: promotion_stores deletadas", (psAfter ?? 0) === 0) ? 1 : 0;
  passed += (psAfter ?? 0) === 0 ? 1 : 0;
  failed += !check("cascade: coupon_stores deletadas", (csAfter ?? 0) === 0) ? 1 : 0;
  passed += (csAfter ?? 0) === 0 ? 1 : 0;

  // ── Result ─────────────────────────────────────────────────────────────
  console.log(`\n📊 ${passed}✅ / ${failed}❌ / ${passed+failed} total`);
  console.log(failed === 0 ? "\n🎉 Smoke test F13 passou!" : "\n⚠️  Alguns testes falharam.");
  process.exit(failed > 0 ? 1 : 0);
})();
