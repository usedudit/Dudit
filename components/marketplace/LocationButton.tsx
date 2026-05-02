'use client';

import { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { isValidCitySlug } from '@/lib/validation/city';

export function LocationButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetLocation = () => {
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
          // Use OpenStreetMap Nominatim for free reverse geocoding
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`);
          if (!res.ok) throw new Error('Falha ao buscar cidade');
          const data = await res.json();
          
          const address = data.address;
          if (!address) throw new Error('Endereço não encontrado');

          const cityStr = address.city || address.town || address.village || address.municipality;
          const stateIso = address['ISO3166-2-lvl4']; // Formato: "BR-SP"

          if (!cityStr || !stateIso) {
             throw new Error('Cidade ou estado não detectados');
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
            // Salvar no cookie (expira em 30 dias)
            document.cookie = `dudit_city=${slug}; path=/; max-age=${60 * 60 * 24 * 30}`;
            // Redirecionar para a cidade
            window.location.href = `/${slug}`;
          } else {
             // Caso a cidade não seja suportada
             setError('Cidade não atendida ainda');
             setLoading(false);
          }
        } catch (err: any) {
          setError('Erro ao processar localização');
          setLoading(false);
        }
      },
      (err) => {
        setError('Permissão negada ou erro de GPS');
        setLoading(false);
      },
      { timeout: 10000 }
    );
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleGetLocation}
        disabled={loading}
        className="flex items-center gap-2 text-sm font-medium text-brand-primary hover:text-brand-green transition-colors px-3 py-2 rounded-lg hover:bg-brand-gray/50"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <MapPin className="w-4 h-4" />
        )}
        <span>Perto de mim</span>
      </button>
      {error && <span className="text-xs text-red-500 absolute top-full mt-1 right-0">{error}</span>}
    </div>
  );
}
