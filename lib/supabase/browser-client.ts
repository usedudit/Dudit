import { createClient } from "@/lib/supabase/client"

// A statically initialized singleton browser client.
// Only imports this where React context (useSupabase) is unavailable.
export const supabaseBrowser = createClient()
