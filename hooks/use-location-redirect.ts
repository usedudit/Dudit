import { useState } from 'react';
import { isValidCitySlug } from '@/lib/validation/city';

const STATE_NAME_TO_UF: Record<string, string> = {
  acre: 'ac',
  alagoas: 'al',
  amapa: 'ap',
  amazonas: 'am',
  bahia: 'ba',
  ceara: 'ce',
  'distrito federal': 'df',
  'espirito santo': 'es',
  goias: 'go',
  maranhao: 'ma',
  'mato grosso': 'mt',
  'mato grosso do sul': 'ms',
  'minas gerais': 'mg',
  para: 'pa',
  paraiba: 'pb',
  parana: 'pr',
  pernambuco: 'pe',
  piaui: 'pi',
  'rio de janeiro': 'rj',
  'rio grande do norte': 'rn',
  'rio grande do sul': 'rs',
  rondonia: 'ro',
  roraima: 'rr',
  'santa catarina': 'sc',
  'sao paulo': 'sp',
  sergipe: 'se',
  tocantins: 'to',
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function buildCitySlug(cityStr: string, ufRaw: string): string {
  const uf = ufRaw.replace(/^BR-/i, '').trim().toLowerCase();
  const formattedCity = normalizeText(cityStr)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${formattedCity}-${uf}`;
}

function resolveUf(isoCode?: string | null, stateName?: string | null): string | null {
  if (isoCode) {
    const cleaned = isoCode.replace(/^BR-/i, '').trim().toLowerCase();
    if (cleaned.length === 2) return cleaned;
  }
  if (stateName) {
    const norm = normalizeText(stateName);
    if (norm.length === 2) return norm;
    if (STATE_NAME_TO_UF[norm]) return STATE_NAME_TO_UF[norm];
  }
  return null;
}

async function reverseGeocodeCoords(latitude: number, longitude: number): Promise<string | null> {
  // 1. Nominatim (simple CORS request without forbidden User-Agent header)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1&accept-language=pt-BR`
    );
    if (res.ok) {
      const data = await res.json();
      const address = data?.address;
      if (address) {
        const cityStr = address.city || address.town || address.village || address.municipality;
        const uf = resolveUf(address['ISO3166-2-lvl4'], address.state);
        if (cityStr && uf) {
          return buildCitySlug(cityStr, uf);
        }
      }
    }
  } catch {
    // Fall through to BigDataCloud
  }

  // 2. Fallback: BigDataCloud client-side reverse geocoding
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`
    );
    if (res.ok) {
      const data = await res.json();
      const cityStr = data?.city || data?.locality;
      const uf = resolveUf(data?.principalSubdivisionCode, data?.principalSubdivision);
      if (cityStr && uf) {
        return buildCitySlug(cityStr, uf);
      }
    }
  } catch {
    // Ignore and return null
  }

  return null;
}

async function fetchCityByIp(): Promise<string | null> {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return null;
    const data = await res.json();
    const cityStr = data?.city;
    const uf = resolveUf(data?.region_code, data?.region);
    if (cityStr && uf) {
      return buildCitySlug(cityStr, uf);
    }
  } catch {
    // Ignore
  }
  return null;
}

export function useLocationRedirect(redirectTo?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyCitySlug = (slug: string): boolean => {
    if (!isValidCitySlug(slug)) {
      return false;
    }

    document.cookie = `dudit_city=${slug}; path=/; max-age=${60 * 60 * 24 * 30}`;
    try {
      localStorage.setItem('dudit_city', slug);
    } catch {}

    if (redirectTo) {
      if (redirectTo === '/' && typeof window !== 'undefined' && window.location.pathname === '/') {
        window.location.reload();
      } else {
        window.location.href = redirectTo;
      }
    } else if (typeof window !== 'undefined' && window.location.pathname === '/') {
      window.location.reload();
    } else {
      window.location.href = `/explorar/${slug}`;
    }
    return true;
  };

  const fallbackToIpOrError = async (fallbackError: string) => {
    const ipSlug = await fetchCityByIp();
    if (ipSlug && applyCitySlug(ipSlug)) {
      return;
    }
    setError(fallbackError);
    setLoading(false);
  };

  const requestLocation = () => {
    setError(null);
    setLoading(true);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      void fallbackToIpOrError('Geolocalização não suportada no seu navegador');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const slug = await reverseGeocodeCoords(latitude, longitude);

          if (slug && applyCitySlug(slug)) {
            return;
          }

          if (slug && !isValidCitySlug(slug)) {
            setError('Ainda não encontramos sua cidade na nossa base');
            setLoading(false);
            return;
          }

          await fallbackToIpOrError('Não foi possível detectar sua cidade. Digite manualmente acima.');
        } catch {
          await fallbackToIpOrError('Erro ao identificar sua localização. Digite sua cidade acima.');
        }
      },
      async (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          await fallbackToIpOrError('Permissão de localização negada. Ative no navegador ou digite sua cidade acima.');
        } else {
          await fallbackToIpOrError('Não foi possível obter sua localização. Digite sua cidade acima.');
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  return { requestLocation, loading, error };
}
