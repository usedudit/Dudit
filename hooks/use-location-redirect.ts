import { useState } from 'react';
import { isValidCitySlug } from '@/lib/validation/city';

export function useLocationRedirect() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada');
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          // Reverse geocoding using Nominatim (free, open source)
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`, {
            headers: {
              'User-Agent': 'Dudit (contato@dudit.com.br)'
            }
          });

          if (!res.ok) throw new Error('Falha ao buscar cidade');
          const data = await res.json();

          const address = data.address;
          if (!address) throw new Error('Endereço não encontrado');

          const cityStr = address.city || address.town || address.village || address.municipality;
          const stateIso = address['ISO3166-2-lvl4'];

          if (!cityStr || !stateIso) {
            throw new Error('Cidade não detectada');
          }

          const uf = stateIso.replace('BR-', '').toLowerCase();

          const formattedCity = cityStr
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

          const slug = `${formattedCity}-${uf}`;

          if (isValidCitySlug(slug)) {
            document.cookie = `dudit_city=${slug}; path=/; max-age=${60 * 60 * 24 * 30}`;
            localStorage.setItem('dudit_city', slug);
            window.location.href = `/${slug}`;
          } else {
            setError('Ainda não estamos na sua cidade');
            setLoading(false);
          }
        } catch (err: any) {
          setError('Erro na localização');
          setLoading(false);
        }
      },
      (err) => {
        setError('Permissão negada');
        setLoading(false);
      },
      { timeout: 10000 }
    );
  };

  return { requestLocation, loading, error };
}
