import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const shortId = () => crypto.randomBytes(4).toString("hex")

const DEFAULT_HOURS_WEEKDAY = {
  monday: { enabled: true, from: "08:00", to: "18:00" },
  tuesday: { enabled: true, from: "08:00", to: "18:00" },
  wednesday: { enabled: true, from: "08:00", to: "18:00" },
  thursday: { enabled: true, from: "08:00", to: "18:00" },
  friday: { enabled: true, from: "08:00", to: "18:00" },
  saturday: { enabled: true, from: "08:00", to: "13:00" },
  sunday: { enabled: false, from: "09:00", to: "13:00" },
}

const EXTENDED_HOURS = {
  monday: { enabled: true, from: "07:00", to: "20:00" },
  tuesday: { enabled: true, from: "07:00", to: "20:00" },
  wednesday: { enabled: true, from: "07:00", to: "20:00" },
  thursday: { enabled: true, from: "07:00", to: "20:00" },
  friday: { enabled: true, from: "07:00", to: "20:00" },
  saturday: { enabled: true, from: "08:00", to: "18:00" },
  sunday: { enabled: true, from: "08:00", to: "14:00" },
}

interface DemoStoreSeed {
  slug: string
  name: string
  description: string
  rating: number
  opening_hours: Record<string, any>
  address: {
    city: string
    state: string
    neighborhood: string
    street: string
    number: string
    zip_code: string
    latitude: number
    longitude: number
  }
  delivery_settings?: {
    is_delivery_enabled: boolean
    is_pickup_enabled: boolean
    base_fee: number
    included_km: number
    extra_km_price: number
    max_delivery_km: number
  }
  products?: Array<{
    name: string
    description: string
    price: number
    promotional_price?: number | null
    rating: number
    fulfillment_modes: ("delivery" | "pickup" | "shipping")[]
    brand?: string
    categoryText: string
  }>
  services?: Array<{
    name: string
    description: string
    price: number
    duration_minutes: number
    rating: number
    fulfillment_modes: ("on_site" | "customer_location")[]
    price_type?: string
    service_max_km?: number | null
    service_travel_fee_mode?: "free" | "flat" | "per_km"
    service_travel_flat_fee?: number | null
    categoryText: string
  }>
}

const DEMO_STORES: DemoStoreSeed[] = [
  // ─── 1. LOCAL: Lucélia - SP ─────────────────────────────────────────────
  {
    slug: "demo-smart-borracharia-lucelia",
    name: "Borracharia & Auto Center Lucélia",
    description: "Pneus aro 13 ao 20, borracharia completa, alinhamento, balanceamento e mecânica leve em Lucélia.",
    rating: 4.9,
    opening_hours: DEFAULT_HOURS_WEEKDAY,
    address: {
      city: "Lucélia",
      state: "SP",
      neighborhood: "Centro",
      street: "Av. Internacional",
      number: "1240",
      zip_code: "17780-000",
      latitude: -21.7204,
      longitude: -51.0191,
    },
    delivery_settings: {
      is_delivery_enabled: true,
      is_pickup_enabled: true,
      base_fee: 10,
      included_km: 5,
      extra_km_price: 2,
      max_delivery_km: 15,
    },
    products: [
      {
        name: "Pneu Aro 15 195/65 R15 Pirelli Cinturato P1",
        description: "Pneu novo aro 15 original Pirelli com montagem grátis na loja em Lucélia.",
        price: 389.9,
        promotional_price: 359.9,
        rating: 4.9,
        fulfillment_modes: ["pickup", "delivery"],
        brand: "Pirelli",
        categoryText: "Automotivo",
      },
      {
        name: "Pneu Aro 15 185/60 R15 Goodyear Assurance",
        description: "Excelente aderência em piso molhado e alta durabilidade. Pronta entrega.",
        price: 369.0,
        rating: 4.8,
        fulfillment_modes: ["pickup", "delivery"],
        brand: "Goodyear",
        categoryText: "Automotivo",
      },
      {
        name: "Bateria Automotiva 60Ah Moura Original",
        description: "Bateria 60Ah com 18 meses de garantia e instalação gratuita na borracharia.",
        price: 449.0,
        rating: 4.9,
        fulfillment_modes: ["pickup", "delivery"],
        brand: "Moura",
        categoryText: "Automotivo",
      },
    ],
    services: [
      {
        name: "Alinhamento 3D e Balanceamento Aro 15",
        description: "Serviço completo de alinhamento computadorizado e balanceamento das 4 rodas.",
        price: 110.0,
        duration_minutes: 60,
        rating: 4.9,
        fulfillment_modes: ["on_site"],
        categoryText: "Automotivo",
      },
      {
        name: "Troca de Óleo 5W30 Sintético + Filtro",
        description: "Troca completa de óleo sintético com revisão gratuita de 15 itens.",
        price: 199.9,
        duration_minutes: 45,
        rating: 4.8,
        fulfillment_modes: ["on_site"],
        categoryText: "Automotivo",
      },
    ],
  },
  {
    slug: "demo-smart-eletrica-lucelia",
    name: "Silva Elétrica 24h — Eletricista",
    description: "Eletricista residencial e comercial em Lucélia e região. Chuveiro, tomadas, disjuntores e manutenção elétrica.",
    rating: 4.9,
    opening_hours: EXTENDED_HOURS,
    address: {
      city: "Lucélia",
      state: "SP",
      neighborhood: "Lado Sul",
      street: "Rua Manoel Lopes",
      number: "412",
      zip_code: "17780-000",
      latitude: -21.7248,
      longitude: -51.0245,
    },
    services: [
      {
        name: "Eletricista Residencial — Reparo e Instalação",
        description: "Atendimento rápido a domicílio para curto-circuito, tomadas, disjuntores e iluminação.",
        price: 120.0,
        duration_minutes: 60,
        rating: 4.9,
        fulfillment_modes: ["customer_location"],
        price_type: "starting_at",
        service_max_km: 25,
        service_travel_fee_mode: "free",
        categoryText: "Reformas e Manutenção",
      },
      {
        name: "Troca de Chuveiro Elétrico e Disjuntor",
        description: "Instalação segura de chuveiro 220V/127V com troca de fiação e disjuntor se necessário.",
        price: 90.0,
        duration_minutes: 45,
        rating: 4.8,
        fulfillment_modes: ["customer_location"],
        service_max_km: 20,
        service_travel_fee_mode: "free",
        categoryText: "Reformas e Manutenção",
      },
    ],
  },
  {
    slug: "demo-smart-hidroja-lucelia",
    name: "HidroJá Encanador e Desentupidora",
    description: "Encanador profissional para vazamentos, torneiras, registros e desentupimento rápido.",
    rating: 4.8,
    opening_hours: EXTENDED_HOURS,
    address: {
      city: "Lucélia",
      state: "SP",
      neighborhood: "Vila Rancharia",
      street: "Rua Rio Branco",
      number: "208",
      zip_code: "17780-000",
      latitude: -21.7165,
      longitude: -51.0272,
    },
    services: [
      {
        name: "Encanador — Caça Vazamento e Troca de Torneira",
        description: "Reparo hidráulico residencial sem quebra-quebra desnecessário. Atendimento hoje.",
        price: 110.0,
        duration_minutes: 60,
        rating: 4.8,
        fulfillment_modes: ["customer_location"],
        price_type: "starting_at",
        service_max_km: 30,
        service_travel_fee_mode: "free",
        categoryText: "Reformas e Manutenção",
      },
    ],
  },
  {
    slug: "demo-smart-barbearia-lucelia",
    name: "Barbearia Dom Bigode",
    description: "Corte masculino, degradê, barba com toalha quente e agendamento online sem fila.",
    rating: 5.0,
    opening_hours: EXTENDED_HOURS,
    address: {
      city: "Lucélia",
      state: "SP",
      neighborhood: "Centro",
      street: "Av. Brasil",
      number: "880",
      zip_code: "17780-000",
      latitude: -21.7198,
      longitude: -51.0211,
    },
    services: [
      {
        name: "Corte Masculino Degradê + Barba",
        description: "Corte moderno com acabamento na navalha e hidratação de barba.",
        price: 55.0,
        duration_minutes: 45,
        rating: 5.0,
        fulfillment_modes: ["on_site"],
        categoryText: "Beleza e Estética",
      },
    ],
  },
  {
    slug: "demo-smart-climafrio-lucelia",
    name: "ClimaFrio Ar Condicionado",
    description: "Instalação, limpeza e recarga de gás para ar condicionado split residencial e comercial.",
    rating: 4.8,
    opening_hours: DEFAULT_HOURS_WEEKDAY,
    address: {
      city: "Lucélia",
      state: "SP",
      neighborhood: "Centro",
      street: "Rua Amélio Borges",
      number: "550",
      zip_code: "17780-000",
      latitude: -21.7222,
      longitude: -51.0168,
    },
    services: [
      {
        name: "Limpeza e Higienização de Ar Condicionado Split",
        description: "Higienização completa com bactericida, limpeza de filtros e verificação de gás.",
        price: 150.0,
        duration_minutes: 60,
        rating: 4.8,
        fulfillment_modes: ["customer_location"],
        service_max_km: 25,
        service_travel_fee_mode: "free",
        categoryText: "Reformas e Manutenção",
      },
    ],
  },

  // ─── 2. CIDADES VIZINHAS / REGIÃO (16–52 km de Lucélia) ────────────────
  {
    slug: "demo-smart-autocenter-osvaldo-cruz",
    name: "Auto Center Osvaldo Cruz",
    description: "Especialista em pneus aro 14, 15, 16 e 17, suspensão, freios e revisão completa.",
    rating: 4.8,
    opening_hours: DEFAULT_HOURS_WEEKDAY,
    address: {
      city: "Osvaldo Cruz",
      state: "SP",
      neighborhood: "Centro",
      street: "Av. Brasil",
      number: "1520",
      zip_code: "17700-000",
      latitude: -21.7972,
      longitude: -50.8789,
    },
    delivery_settings: {
      is_delivery_enabled: true,
      is_pickup_enabled: true,
      base_fee: 15,
      included_km: 10,
      extra_km_price: 2.5,
      max_delivery_km: 30,
    },
    products: [
      {
        name: "Pneu Aro 15 195/55 R15 Michelin Energy XM2+",
        description: "Máxima segurança e rendimento quilométrico. Retirada ou entrega na região.",
        price: 429.9,
        rating: 4.9,
        fulfillment_modes: ["pickup", "delivery"],
        brand: "Michelin",
        categoryText: "Automotivo",
      },
      {
        name: "Kit 4 Pneus Aro 15 195/65 R15 Continental",
        description: "Jogo completo com 4 pneus novos aro 15 Continental. Também enviamos para todo o Brasil.",
        price: 1490.0,
        promotional_price: 1399.0,
        rating: 4.9,
        fulfillment_modes: ["pickup", "delivery", "shipping"],
        brand: "Continental",
        categoryText: "Automotivo",
      },
    ],
  },
  {
    slug: "demo-smart-borracharia-inubia",
    name: "Borracharia Express Inúbia",
    description: "Borracharia e venda de pneus novos e seminovos em Inúbia Paulista.",
    rating: 4.7,
    opening_hours: DEFAULT_HOURS_WEEKDAY,
    address: {
      city: "Inúbia Paulista",
      state: "SP",
      neighborhood: "Centro",
      street: "Av. Campos Salles",
      number: "310",
      zip_code: "17760-000",
      latitude: -21.7689,
      longitude: -50.9614,
    },
    products: [
      {
        name: "Pneu Aro 15 185/65 R15 Bridgestone Ecopia",
        description: "Pneu econômico de baixa resistência ao rolamento. Pronta entrega em Inúbia Paulista.",
        price: 359.0,
        rating: 4.7,
        fulfillment_modes: ["pickup"],
        brand: "Bridgestone",
        categoryText: "Automotivo",
      },
    ],
  },
  {
    slug: "demo-smart-eletrotech-tupa",
    name: "EletroTech Tupã — Eletricista",
    description: "Eletricista residencial, comercial e industrial atendendo Tupã e cidades vizinhas.",
    rating: 4.9,
    opening_hours: EXTENDED_HOURS,
    address: {
      city: "Tupã",
      state: "SP",
      neighborhood: "Centro",
      street: "Rua Caingangs",
      number: "740",
      zip_code: "17600-000",
      latitude: -21.9347,
      longitude: -50.5136,
    },
    services: [
      {
        name: "Eletricista Residencial e Quadro de Energia",
        description: "Montagem de quadro de disjuntores, instalação de tomadas 220V e laudo elétrico.",
        price: 140.0,
        duration_minutes: 60,
        rating: 4.9,
        fulfillment_modes: ["customer_location"],
        price_type: "starting_at",
        service_max_km: 60,
        service_travel_fee_mode: "flat",
        service_travel_flat_fee: 35,
        categoryText: "Reformas e Manutenção",
      },
    ],
  },
  {
    slug: "demo-smart-mecanica-dracena",
    name: "Oficina Mecânica Dracena Center",
    description: "Oficina mecânica multimarcas, freios, suspensão e pneus na região de Dracena.",
    rating: 4.8,
    opening_hours: DEFAULT_HOURS_WEEKDAY,
    address: {
      city: "Dracena",
      state: "SP",
      neighborhood: "Centro",
      street: "Av. Presidente Vargas",
      number: "910",
      zip_code: "17900-000",
      latitude: -21.4828,
      longitude: -51.5333,
    },
    products: [
      {
        name: "Pneu Aro 15 195/65 R15 Dunlop Touring",
        description: "Pneu silencioso e confortável para carros hatch e sedan.",
        price: 349.9,
        rating: 4.8,
        fulfillment_modes: ["pickup"],
        brand: "Dunlop",
        categoryText: "Automotivo",
      },
      {
        name: "Jogo de Pastilhas de Freio Dianteira Cobreq",
        description: "Pastilhas cerâmicas com envio para todo o Brasil ou retirada na oficina.",
        price: 129.9,
        rating: 4.8,
        fulfillment_modes: ["pickup", "shipping"],
        brand: "Cobreq",
        categoryText: "Automotivo",
      },
    ],
  },

  // ─── 3. VENDEDORES NACIONAIS (enviam para o CEP via 'shipping') ────────
  {
    slug: "demo-smart-megapneus-sp",
    name: "MegaPneus Brasil Oficial",
    description: "Distribuidora nacional de pneus com envio rápido para todo o Brasil via transportadora.",
    rating: 4.9,
    opening_hours: DEFAULT_HOURS_WEEKDAY,
    address: {
      city: "São Paulo",
      state: "SP",
      neighborhood: "Mooca",
      street: "Av. Paes de Barros",
      number: "2100",
      zip_code: "03114-000",
      latitude: -23.5629,
      longitude: -46.5977,
    },
    products: [
      {
        name: "Pneu Aro 15 195/65 R15 Pirelli Cinturato P1 Envio Brasil",
        description: "Envio imediato para todo o Brasil com nota fiscal e 5 anos de garantia de fábrica.",
        price: 369.9,
        promotional_price: 339.9,
        rating: 4.9,
        fulfillment_modes: ["shipping"],
        brand: "Pirelli",
        categoryText: "Automotivo",
      },
      {
        name: "Kit 2 Pneus Aro 15 185/65 R15 Michelin Primacy 4",
        description: "Par de pneus Michelin aro 15 enviados para o seu CEP com rastreio completo.",
        price: 789.0,
        rating: 5.0,
        fulfillment_modes: ["shipping"],
        brand: "Michelin",
        categoryText: "Automotivo",
      },
    ],
  },
  {
    slug: "demo-smart-autopecas-cwb",
    name: "AutoPeças Sul Express",
    description: "Peças automotivas, pneus e lubrificantes enviados de Curitiba para todos os CEPs do Brasil.",
    rating: 4.8,
    opening_hours: DEFAULT_HOURS_WEEKDAY,
    address: {
      city: "Curitiba",
      state: "PR",
      neighborhood: "Batel",
      street: "Av. do Batel",
      number: "1100",
      zip_code: "80420-090",
      latitude: -25.4422,
      longitude: -49.2869,
    },
    products: [
      {
        name: "Pneu Aro 15 195/60 R15 Continental PowerContact 2",
        description: "Alta performance e envio nacional rápido por transportadora.",
        price: 389.0,
        rating: 4.8,
        fulfillment_modes: ["shipping"],
        brand: "Continental",
        categoryText: "Automotivo",
      },
      {
        name: "Kit Troca de Óleo 5W30 Sintético 4L + Filtro",
        description: "Kit completo para revisão automotiva com envio para todo o Brasil.",
        price: 189.9,
        rating: 4.8,
        fulfillment_modes: ["shipping"],
        brand: "Mobil",
        categoryText: "Automotivo",
      },
    ],
  },
  {
    slug: "demo-smart-eletrica-bh",
    name: "Casa & Elétrica Nacional",
    description: "Chuveiros, disjuntores, tomadas e materiais elétricos com envio para todo o Brasil.",
    rating: 4.9,
    opening_hours: DEFAULT_HOURS_WEEKDAY,
    address: {
      city: "Belo Horizonte",
      state: "MG",
      neighborhood: "Savassi",
      street: "Rua Pernambuco",
      number: "600",
      zip_code: "30130-150",
      latitude: -19.9365,
      longitude: -43.9345,
    },
    products: [
      {
        name: "Chuveiro Elétrico Lorenzetti Acqua Duo Ultra 220V",
        description: "Ducha e chuveiro 2 em 1 com envio nacional para o seu CEP.",
        price: 299.0,
        promotional_price: 269.9,
        rating: 4.9,
        fulfillment_modes: ["shipping"],
        brand: "Lorenzetti",
        categoryText: "Casa",
      },
    ],
  },
]

async function ensureExtraSynonyms() {
  const { data: group } = await supabase
    .from("marketplace_synonym_groups")
    .select("id")
    .eq("slug", "automotive_services")
    .maybeSingle()

  if (!group?.id) return

  const extras = [
    { group_id: group.id, term: "auto center", term_normalized: "auto center" },
    { group_id: group.id, term: "automotivo", term_normalized: "automotivo" },
  ]
  for (const row of extras) {
    await supabase.from("marketplace_synonym_terms").upsert(row, {
      onConflict: "group_id,term_normalized",
      ignoreDuplicates: true,
    })
  }
}

async function main() {
  console.log("🚀 Iniciando seed de demonstração para Busca Inteligente...")

  await ensureExtraSynonyms()

  // Usa um partner existente ativo como owner técnico das vitrines demo
  const { data: partners, error: partnerErr } = await supabase
    .from("partners")
    .select("id")
    .eq("is_active", true)
    .limit(1)

  if (partnerErr || !partners?.length) {
    throw new Error("Nenhum partner ativo encontrado no banco para vincular as lojas demo.")
  }

  const basePartnerId = partners[0].id as string
  let createdStores = 0
  let createdProducts = 0
  let createdServices = 0

  for (const seed of DEMO_STORES) {
    // Verifica se a loja demo já existe (idempotente)
    const { data: existingStore } = await supabase
      .from("stores")
      .select("id")
      .eq("slug", seed.slug)
      .maybeSingle()

    let storeId: string

    if (existingStore?.id) {
      storeId = existingStore.id
      await supabase
        .from("stores")
        .update({
          name: seed.name,
          description: seed.description,
          rating: seed.rating,
          opening_hours: seed.opening_hours,
          is_active: true,
          is_showcase_active: true,
        })
        .eq("id", storeId)
    } else {
      const { data: insertedStore, error: storeErr } = await supabase
        .from("stores")
        .insert({
          partner_id: basePartnerId,
          short_id: shortId(),
          name: seed.name,
          slug: seed.slug,
          description: seed.description,
          rating: seed.rating,
          opening_hours: seed.opening_hours,
          is_active: true,
          is_showcase_active: true,
          is_headquarters: false,
          marketplace_reputation: 0.92,
        })
        .select("id")
        .single()

      if (storeErr || !insertedStore?.id) {
        console.error(`Erro ao criar loja ${seed.slug}:`, storeErr?.message)
        continue
      }
      storeId = insertedStore.id
      createdStores++

      // Endereço da loja
      const { error: addrErr } = await supabase.from("addresses").insert({
        partner_id: basePartnerId,
        store_id: storeId,
        city: seed.address.city,
        state: seed.address.state,
        neighborhood: seed.address.neighborhood,
        street: seed.address.street,
        number: seed.address.number,
        zip_code: seed.address.zip_code,
        country: "Brasil",
        latitude: seed.address.latitude,
        longitude: seed.address.longitude,
        is_default: true,
      })
      if (addrErr) console.error(`Erro endereço ${seed.slug}:`, addrErr.message)

      // Delivery settings se houver
      if (seed.delivery_settings) {
        await supabase.from("delivery_settings").insert({
          partner_id: basePartnerId,
          store_id: storeId,
          ...seed.delivery_settings,
        })
      }
    }

    // Produtos da loja
    for (const prod of seed.products || []) {
      const { data: existingProd } = await supabase
        .from("products")
        .select("id")
        .eq("store_id", storeId)
        .eq("name", prod.name)
        .maybeSingle()

      if (!existingProd?.id) {
        const { error: pErr } = await supabase.from("products").insert({
          partner_id: basePartnerId,
          store_id: storeId,
          short_id: shortId(),
          name: prod.name,
          description: prod.description,
          price: prod.price,
          promotional_price: prod.promotional_price ?? null,
          is_on_promotion: Boolean(prod.promotional_price),
          stock_quantity: 12,
          stock_available: 12,
          rating: prod.rating,
          status: "ativo",
          show_in_marketplace: true,
          show_price_in_store: true,
          moderation_status: "approved",
          condition: "new",
          brand: prod.brand ?? null,
          fulfillment_modes: prod.fulfillment_modes,
          mp_search_category_text: prod.categoryText,
          marketplace_score: 0.85,
        })
        if (pErr) console.error(`Erro produto ${prod.name}:`, pErr.message)
        else createdProducts++
      }
    }

    // Serviços da loja
    for (const srv of seed.services || []) {
      const { data: existingSrv } = await supabase
        .from("services")
        .select("id")
        .eq("store_id", storeId)
        .eq("name", srv.name)
        .maybeSingle()

      if (!existingSrv?.id) {
        const { error: sErr } = await supabase.from("services").insert({
          partner_id: basePartnerId,
          store_id: storeId,
          short_id: shortId(),
          name: srv.name,
          description: srv.description,
          price: srv.price,
          duration_minutes: srv.duration_minutes,
          rating: srv.rating,
          status: "ativo",
          show_in_marketplace: true,
          show_price_in_store: true,
          moderation_status: "approved",
          price_type: srv.price_type ?? "fixed",
          fulfillment_modes: srv.fulfillment_modes,
          service_max_km: srv.service_max_km ?? null,
          service_travel_fee_mode: srv.service_travel_fee_mode ?? "free",
          service_travel_flat_fee: srv.service_travel_flat_fee ?? 0,
          service_enforce_area: true,
          mp_search_category_text: srv.categoryText,
          marketplace_score: 0.88,
        })
        if (sErr) console.error(`Erro serviço ${srv.name}:`, sErr.message)
        else createdServices++
      }
    }
  }

  console.log(
    `✅ Seed concluído! Novas lojas: ${createdStores} | Novos produtos: ${createdProducts} | Novos serviços: ${createdServices}`,
  )
}

main().catch((err) => {
  console.error("Erro fatal no seed:", err)
  process.exit(1)
})
