require("dotenv").config()
const keys = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "POSTGRES_URL"]
for (const k of keys) {
  const v = process.env[k]
  console.log(k, v ? "SET" : "UNSET")
}
