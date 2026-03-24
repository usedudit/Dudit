import "server-only"
import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { User } from "@supabase/supabase-js"

/**
 * Single request-scoped auth resolver.
 * Ensures `auth.getUser()` is called EXACTLY ONCE per server request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
})
