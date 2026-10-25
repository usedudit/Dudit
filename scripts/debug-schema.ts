require("dotenv").config()
const { createClient } = require("@supabase/supabase-js")

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Get appointments table columns
  const { data: columns, error: colErr } = await supabase.rpc("exec_sql", {
    query: `
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'appointments' 
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `
  })

  // Fallback if rpc doesn't exist
  if (colErr) {
    console.log("RPC error, trying direct query...")
    const { data: cols2, error: err2 } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
    
    // Use a different approach - get column names from a single row
    const { data: sample, error: sampleErr } = await supabase
      .from("appointments")
      .select("*")
      .limit(1)
      .maybeSingle()
    
    if (sampleErr) {
      console.error("Sample error:", sampleErr)
    } else {
      console.log("Columns from sample:", Object.keys(sample || {}))
    }
    return
  }

  console.log("Appointments columns:")
  for (const col of columns || []) {
    console.log(`  ${col.column_name} (${col.data_type}) nullable=${col.is_nullable} default=${col.column_default}`)
  }

  // Also check payment_status check constraint
  const { data: constraints, error: conErr } = await supabase.rpc("exec_sql", {
    query: `
      SELECT 
        conname as constraint_name,
        pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid = 'appointments'::regclass
      ORDER BY conname
    `
  })

  if (!conErr) {
    console.log("\nConstraints:")
    for (const c of constraints || []) {
      console.log(`  ${c.constraint_name}: ${c.definition}`)
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
