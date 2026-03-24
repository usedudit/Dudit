import { UserProfilePage } from "@/components/profile/UserProfilePage"
import { requireUser } from "@/lib/auth/authorization"
import { getPasswordSecurityInfo } from "@/app/actions/password"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

export default async function ProfilePage() {
  // Use cached auth layer instead of raw supabase call
  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const [profileResponse, passwordInfo] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    getPasswordSecurityInfo(),
  ])

  const profile = profileResponse.data

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

  // Build profile with decrypted CPF for the client
  const profileForClient = profile ? {
    ...profile,
    cpf: decryptedCpf,
  } : profile

  return (
    <UserProfilePage
      userId={user.id}
      profile={profileForClient}
      initialFullName={profile?.full_name || user.user_metadata?.full_name}
      email={user.email!}
      hasPassword={passwordInfo.hasPassword}
      authProvider={passwordInfo.provider}
    />
  )
}

