import { Metadata } from 'next'
import { resolveCityAndStateFromSlug } from '@/app/actions/marketplace/products'
import { redirect, permanentRedirect } from 'next/navigation'
import { isValidCitySlug } from '@/lib/validation/city'

export const revalidate = 86400 // Cache 24h

type Props = {
    params: Promise<{ cidadeUf: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { cidadeUf } = await params

    const resolved = await resolveCityAndStateFromSlug(cidadeUf)
    const cityFormatted = resolved?.city || cidadeUf.split('-').slice(0, -1).join(' ').replace(/\b\w/g, l => l.toUpperCase())
    const stateFormatted = resolved?.state || cidadeUf.split('-').pop()?.toUpperCase() || ''

    return {
        title: `Dudit ${cityFormatted} - ${stateFormatted} | Serviços e Lojas Locais`,
        description: `Descubra as melhores lojas e profissionais em ${cityFormatted} (${stateFormatted}). Compare preços, agende serviços e compre direto sem taxas na Dudit.`,
        alternates: {
            canonical: `https://dudit.com.br/${cidadeUf.toLowerCase()}`,
        },
        openGraph: {
            title: `Dudit ${cityFormatted} | Lojas e Serviços Locais`,
            description: `Compre e agende serviços locais de forma rápida e segura na cidade de ${cityFormatted}.`,
            url: `https://dudit.com.br/${cidadeUf}`,
            type: 'website',
        }
    }
}

export default async function CityPage({ params }: Props) {
    const { cidadeUf } = await params

    if (!isValidCitySlug(cidadeUf)) {
        const cleanSearch = cidadeUf.replace(/-[a-z]{2}$/i, '')
        redirect(`/explorar/${cidadeUf}?q=${cleanSearch}`)
    }

    if (cidadeUf !== cidadeUf.toLowerCase()) {
        permanentRedirect(`/${cidadeUf.toLowerCase()}`)
    }

    redirect(`/explorar/${cidadeUf}`)
}

