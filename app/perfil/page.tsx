import { UserProfilePage } from "@/components/profile/UserProfilePage"
import { requireUser } from "@/lib/auth/authorization"
import { getPasswordSecurityInfo } from "@/app/actions/shared/password"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

export default async function ProfilePage() {
  // Use cached auth layer instead of raw supabase call
  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const [profileResponse, addressesResponse, passwordInfo] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).order("created_at", { ascending: false }).limit(5),
    getPasswordSecurityInfo(),
  ])

  const profile = profileResponse.data
  const addresses = addressesResponse.data || []
  const defaultAddress = addresses[0] || null

  // Decrypt CPF for display if it exists
  let decryptedCpf = ""
  if (profile?.cpf) {
    try {
      const { decryptCPF } = await import("@/lib/crypto")
      decryptedCpf = await decryptCPF(profile.cpf)
    } catch (err) {
      console.error("Error decrypting CPF:", err)
    }
  }

  // Build profile with decrypted CPF and address data for the client
  const profileForClient = profile ? {
    ...profile,
    cpf: decryptedCpf,
    ...defaultAddress,
  } : (defaultAddress ? { user_id: user.id, ...defaultAddress } : null)

  return (
    <UserProfilePage
      userId={user.id}
      profile={profileForClient}
      addresses={addresses}
      initialFullName={profile?.full_name || user.user_metadata?.full_name}
      email={user.email!}
      hasPassword={passwordInfo.hasPassword}
      authProvider={passwordInfo.provider}
    />
  )
}

