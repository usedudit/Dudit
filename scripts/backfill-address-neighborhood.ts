/**
 * Backfill script: populates addresses.neighborhood for store addresses
 * that have a zip_code but no neighborhood set.
 *
 * Uses ViaCEP to resolve the bairro from the zip_code.
 *
 * Usage: npx tsx scripts/backfill-address-neighborhood.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const BATCH_SIZE = 50

async function fetchBairroFromCep(cep: string): Promise<string | null> {
    const cleanCep = cep.replace(/\D/g, "")
    if (cleanCep.length !== 8) return null

    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4000)
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
            signal: controller.signal,
        })
        clearTimeout(timeout)
        if (!res.ok) return null
        const data = await res.json()
        if (data.erro) return null
        return data.bairro || null
    } catch {
        return null
    }
}

async function main() {
    console.log("Fetching addresses with zip_code but no neighborhood...")

    const { data: addresses, error } = await supabase
        .from("addresses")
        .select("id, zip_code, city, state")
        .is("neighborhood", null)
        .not("zip_code", "is", null)
        .neq("zip_code", "")
        .limit(500)

    if (error) {
        console.error("Error fetching addresses:", error)
        process.exit(1)
    }

    if (!addresses || addresses.length === 0) {
        console.log("No addresses need backfilling.")
        return
    }

    console.log(`Found ${addresses.length} addresses to process.`)

    let updated = 0
    let failed = 0

    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        const batch = addresses.slice(i, i + BATCH_SIZE)

        const results = await Promise.allSettled(
            batch.map(async (addr) => {
                const bairro = await fetchBairroFromCep(addr.zip_code)
                if (!bairro) return null

                const { error: updateError } = await supabase
                    .from("addresses")
                    .update({ neighborhood: bairro })
                    .eq("id", addr.id)

                if (updateError) {
                    console.error(`Failed to update address ${addr.id}:`, updateError.message)
                    return null
                }

                return { id: addr.id, city: addr.city, bairro }
            })
        )

        for (const result of results) {
            if (result.status === "fulfilled" && result.value) {
                updated++
                if (updated % 20 === 0) {
                    console.log(`  Updated ${updated}/${addresses.length}...`)
                }
            } else {
                failed++
            }
        }

        // Rate limit: ViaCEP allows ~3 req/s
        if (i + BATCH_SIZE < addresses.length) {
            await new Promise(r => setTimeout(r, 1000))
        }
    }

    console.log(`\nDone! Updated: ${updated}, Failed/skipped: ${failed}`)
}

main().catch(console.error)
