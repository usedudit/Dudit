import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config({ path: ".env" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE credentials (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)")
  process.exit(1)
}

const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function upsertRole(id, name, permissions) {
  const { error } = await admin.from("roles").upsert({
    id, name, permissions
  })
  if (error) {
    console.error(`Error upserting role "${id}":`, error.message)
  } else {
    console.log(`OK: role "${id}" updated`)
  }
}

async function main() {
  // Base template
  await upsertRole("__base_template", "Base Template (system)", {
    orders: { view: false, create: false, edit: false, delete: false, cancel: false, can_apply_discount: false, can_add_delivery: false },
    appointments: { view: false, create: false, edit: false, delete: false },
    customers: { view: false, create: false, edit: false, delete: false },
    products: { view: false, create: false, edit: false, delete: false },
    stock_movements: { view: false, create: false, undo: false },
    pdv: { view: false, sell: false, open_pdv: false, close_pdv: false, sangria: false, reforco: false, can_apply_discount: false, can_add_delivery: false },
    services: { view: false, create: false, edit: false, delete: false },
    quotes: { view: false, create: false, edit: false, delete: false },
    financial: { view: false, create: false, edit: false, cancel: false },
    categories: { view: false, create: false, edit: false, delete: false },
    coupons: { view: false, create: false, edit: false, delete: false },
    goals: { view: false, create: false, edit: false, delete: false },
    reports: { view_basic: false, view_advanced: false },
    dashboard: { view: false },
    delivery: { view: false, create: false, edit: false, update_status: false },
    recurring_plans: { view: false, manage: false },
    recurring_subscriptions: { view: false, manage: false },
    productivity: { view: false, goals_view: false, goals_manage: false, commissions_view: false, commissions_manage: false },
    community_videos: { view: false, create: false, edit: false, delete: false },
    colecoes: { view: false, create: false, edit: false, delete: false },
    payment_methods: { view: false, create: false, edit: false, delete: false },
    commissions: { view: false, edit: false },
    settings: {
      view: false,
      settings_negocio: false,
      settings_team: false,
      settings_plan: false,
      settings_payments: false,
      settings_comissions: false,
      settings_returns: false,
      settings_vitrine: false,
      settings_os: false,
      settings_messages: false,
      settings_delivery: false,
      settings_integrations: false,
      settings_system: false,
      settings_resources: false,
      settings_logs: false,
    }
  })

  // Operator
  await upsertRole("operator", "Operador", {
    orders: { view: true, create: true, edit: true, delete: false, cancel: false, can_apply_discount: false, can_add_delivery: true },
    appointments: { view: true, create: true, edit: true, delete: false },
    customers: { view: true, create: true, edit: true, delete: false },
    products: { view: true, create: false, edit: false, delete: false },
    stock_movements: { view: true, create: false, undo: false },
    pdv: { view: true, sell: true, open_pdv: true, close_pdv: true, sangria: true, reforco: true, can_apply_discount: false, can_add_delivery: true },
    services: { view: true, create: false, edit: false, delete: false },
    quotes: { view: true, create: true, edit: true, delete: false },
    financial: { view: true, create: true, edit: true, cancel: false },
    categories: { view: true, create: false, edit: false, delete: false },
    coupons: { view: false, create: false, edit: false, delete: false },
    goals: { view: false, create: false, edit: false, delete: false },
    reports: { view_basic: true, view_advanced: true },
    dashboard: { view: true },
    delivery: { view: true, create: false, edit: false, update_status: true },
    recurring_plans: { view: false, manage: false },
    recurring_subscriptions: { view: false, manage: false },
    productivity: { view: false, goals_view: false, goals_manage: false, commissions_view: false, commissions_manage: false },
    community_videos: { view: false, create: false, edit: false, delete: false },
    colecoes: { view: false, create: false, edit: false, delete: false },
    payment_methods: { view: true, create: false, edit: false, delete: false },
    commissions: { view: false, edit: false },
    settings: {
      view: false,
      settings_negocio: false,
      settings_team: false,
      settings_plan: false,
      settings_payments: false,
      settings_comissions: false,
      settings_returns: false,
      settings_vitrine: false,
      settings_os: false,
      settings_messages: false,
      settings_delivery: false,
      settings_integrations: false,
      settings_system: false,
      settings_resources: false,
      settings_logs: false,
    }
  })

  // Delivery
  await upsertRole("delivery", "Entregador", {
    orders: { view: true, create: false, edit: false, delete: false, cancel: false, can_apply_discount: false, can_add_delivery: false },
    appointments: { view: false, create: false, edit: false, delete: false },
    customers: { view: true, create: false, edit: false, delete: false },
    products: { view: false, create: false, edit: false, delete: false },
    stock_movements: { view: false, create: false, undo: false },
    pdv: { view: false, sell: false, open_pdv: false, close_pdv: false, sangria: false, reforco: false, can_apply_discount: false, can_add_delivery: false },
    services: { view: false, create: false, edit: false, delete: false },
    quotes: { view: false, create: false, edit: false, delete: false },
    financial: { view: false, create: false, edit: false, cancel: false },
    categories: { view: false, create: false, edit: false, delete: false },
    coupons: { view: false, create: false, edit: false, delete: false },
    goals: { view: false, create: false, edit: false, delete: false },
    reports: { view_basic: false, view_advanced: false },
    dashboard: { view: false },
    delivery: { view: true, create: false, edit: false, update_status: true },
    recurring_plans: { view: false, manage: false },
    recurring_subscriptions: { view: false, manage: false },
    productivity: { view: false, goals_view: false, goals_manage: false, commissions_view: false, commissions_manage: false },
    community_videos: { view: false, create: false, edit: false, delete: false },
    colecoes: { view: false, create: false, edit: false, delete: false },
    payment_methods: { view: true, create: false, edit: false, delete: false },
    commissions: { view: false, edit: false },
    settings: {
      view: false,
      settings_negocio: false,
      settings_team: false,
      settings_plan: false,
      settings_payments: false,
      settings_comissions: false,
      settings_returns: false,
      settings_vitrine: false,
      settings_os: false,
      settings_messages: false,
      settings_delivery: false,
      settings_integrations: false,
      settings_system: false,
      settings_resources: false,
      settings_logs: false,
    }
  })

  // Manager
  await upsertRole("manager", "Gestor", {
    orders: { view: true, create: true, edit: true, delete: true, cancel: true, can_apply_discount: true, can_add_delivery: true },
    appointments: { view: true, create: true, edit: true, delete: true },
    customers: { view: true, create: true, edit: true, delete: true },
    products: { view: true, create: true, edit: true, delete: true },
    stock_movements: { view: true, create: true, undo: true },
    pdv: { view: true, sell: true, open_pdv: true, close_pdv: true, sangria: true, reforco: true, can_apply_discount: true, can_add_delivery: true },
    services: { view: true, create: true, edit: true, delete: true },
    quotes: { view: true, create: true, edit: true, delete: true },
    financial: { view: true, create: true, edit: true, cancel: true },
    categories: { view: true, create: true, edit: true, delete: true },
    coupons: { view: true, create: true, edit: true, delete: true },
    goals: { view: true, create: true, edit: true, delete: true },
    reports: { view_basic: true, view_advanced: false },
    dashboard: { view: true },
    delivery: { view: true, create: true, edit: true, update_status: true },
    recurring_plans: { view: true, manage: true },
    recurring_subscriptions: { view: true, manage: true },
    productivity: { view: true, goals_view: true, goals_manage: true, commissions_view: true, commissions_manage: true },
    community_videos: { view: true, create: true, edit: true, delete: true },
    colecoes: { view: true, create: true, edit: true, delete: true },
    payment_methods: { view: true, create: true, edit: true, delete: true },
    commissions: { view: true, edit: true },
    settings: {
      view: true,
      settings_negocio: true,
      settings_team: false,
      settings_plan: false,
      settings_payments: true,
      settings_comissions: true,
      settings_returns: true,
      settings_vitrine: true,
      settings_os: true,
      settings_messages: true,
      settings_delivery: true,
      settings_integrations: false,
      settings_system: false,
      settings_resources: false,
      settings_logs: false,
    }
  })

  // Admin
  await upsertRole("admin", "Admin", {
    orders: { view: true, create: true, edit: true, delete: true, cancel: true, can_apply_discount: true, can_add_delivery: true },
    appointments: { view: true, create: true, edit: true, delete: true },
    customers: { view: true, create: true, edit: true, delete: true },
    products: { view: true, create: true, edit: true, delete: true },
    stock_movements: { view: true, create: true, undo: true },
    pdv: { view: true, sell: true, open_pdv: true, close_pdv: true, sangria: true, reforco: true, can_apply_discount: true, can_add_delivery: true },
    services: { view: true, create: true, edit: true, delete: true },
    quotes: { view: true, create: true, edit: true, delete: true },
    financial: { view: true, create: true, edit: true, cancel: true },
    categories: { view: true, create: true, edit: true, delete: true },
    coupons: { view: true, create: true, edit: true, delete: true },
    goals: { view: true, create: true, edit: true, delete: true },
    reports: { view_basic: true, view_advanced: true },
    dashboard: { view: true },
    delivery: { view: true, create: true, edit: true, update_status: true },
    recurring_plans: { view: true, manage: true },
    recurring_subscriptions: { view: true, manage: true },
    productivity: { view: true, goals_view: true, goals_manage: true, commissions_view: true, commissions_manage: true },
    community_videos: { view: true, create: true, edit: true, delete: true },
    colecoes: { view: true, create: true, edit: true, delete: true },
    payment_methods: { view: true, create: true, edit: true, delete: true },
    commissions: { view: true, edit: true },
    settings: {
      view: true,
      settings_negocio: true,
      settings_team: true,
      settings_plan: false,
      settings_payments: true,
      settings_comissions: false,
      settings_returns: true,
      settings_vitrine: true,
      settings_os: true,
      settings_messages: true,
      settings_delivery: true,
      settings_integrations: false,
      settings_system: true,
      settings_resources: true,
      settings_logs: true,
    }
  })

  console.log("\nAll role permissions updated successfully!")
}

main().catch(console.error)
