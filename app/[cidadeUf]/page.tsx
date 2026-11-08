import { Metadata } from 'next'
import { resolveCityAndStateFromSlug } from '@/app/actions/marketplace/products'
import { redirect, permanentRedirect, notFound } from 'next/navigation'
import { isValidCitySlug } from '@/lib/validation/city'
import { getCurrentUser } from '@/lib/auth/authorization'
import { getUserSessionData } from '@/lib/data/user'
import { cookies } from 'next/headers'

export const revalidate = 86400 // Cache 24h

type Props = {
    params: Promise<{ cidadeUf: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { cidadeUf } = await params

    if (!isValidCitySlug(cidadeUf)) {
        return {
            title: "Página não encontrada | Dudit",
            robots: { index: false, follow: false },
        }
    }

    const resolved = await resolveCityAndStateFromSlug(cidadeUf)
    const cityFormatted = resolved?.city || cidadeUf.split('-').slice(0, -1).join(' ').replace(/\b\w/g, l => l.toUpperCase())
    const stateFormatted = resolved?.state || cidadeUf.split('-').pop()?.toUpperCase() || ''

    return {
        title: `Dudit ${cityFormatted} - ${stateFormatted} | Serviços e Lojas Locais`,
        description: `Descubra as melhores lojas e profissionais em ${cityFormatted} (${stateFormatted}). Compare preços, agende serviços e compre direto sem taxas na Dudit.`,
        alternates: {
            canonical: `https://dudit.com.br/explorar/${cidadeUf.toLowerCase()}`,
        },
        openGraph: {
            title: `Dudit ${cityFormatted} | Lojas e Serviços Locais`,
            description: `Compre e agende serviços locais de forma rápida e segura na cidade de ${cityFormatted}.`,
            url: `https://dudit.com.br/explorar/${cidadeUf.toLowerCase()}`,
            type: 'website',
        }
    }
}

export default async function CityPage({ params }: Props) {
    const { cidadeUf } = await params

    // Evitar que rotas institucionais, de ajuda ou do sistema sejam capturadas pela rota dinâmica de cidade
    if (cidadeUf === "ajuda" || cidadeUf === "institucional" || cidadeUf === "banned") {
        redirect(`/${cidadeUf}`)
    }

    if (!isValidCitySlug(cidadeUf)) {
        if (cidadeUf.includes(".") || cidadeUf.length < 3 || cidadeUf === "banned") {
            notFound()
        }

        const cleanSearch = cidadeUf.replace(/-[a-z]{2}$/i, '')

        // Tenta obter localização do usuário
        const user = await getCurrentUser()
        const sessionData = user
            ? await getUserSessionData(user.id)
            : null

        const userProfile = sessionData?.profile
            ? {
                city: sessionData.profile.city || null,
                state: sessionData.profile.state || null,
            }
            : null

        let redirectUrl = ''

        if (userProfile?.city && userProfile?.state) {
            // Usuário logado: redireciona para cidade-estado
            const normalizedCity = userProfile.city
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/\s+/g, "-")
            const stateCode = userProfile.state.toLowerCase()
            redirectUrl = `/explorar/${normalizedCity}-${stateCode}?q=${cleanSearch}`
        } else {
            // Usuário não logado: tenta pegar estado dos cookies
            const cookieStore = await cookies()
            const savedState = cookieStore.get("dudit_state")?.value
            if (savedState) {
                const stateCode = savedState.toLowerCase()
                redirectUrl = `/explorar/estado-${stateCode}?q=${cleanSearch}`
            }
        }

        // Se conseguiu determinar localização, redireciona; senão, usa o slug original
        if (redirectUrl) {
            redirect(redirectUrl)
        } else {
            redirect(`/explorar/${cidadeUf}?q=${cleanSearch}`)
        }
    }

    if (cidadeUf !== cidadeUf.toLowerCase()) {
        permanentRedirect(`/${cidadeUf.toLowerCase()}`)
    }

    permanentRedirect(`/explorar/${cidadeUf.toLowerCase()}`)
}
