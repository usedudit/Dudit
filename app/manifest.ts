import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dudit | Descubra. Anuncie. Organize.',
    short_name: 'Dudit',
    description:
      'Sistema completo de gestão comercial e vendas com 0% de comissão: venda no balcão (PDV), online na sua cidade ou envie para todo o Brasil via transportadoras e Correios.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09211b',
    theme_color: '#09211b',
    orientation: 'any',
    categories: ['business', 'shopping', 'productivity', 'local'],
    lang: 'pt-BR',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-72x72.png?v=3', sizes: '72x72', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-96x96.png?v=3', sizes: '96x96', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-128x128.png?v=3', sizes: '128x128', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-144x144.png?v=3', sizes: '144x144', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-152x152.png?v=3', sizes: '152x152', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192x192.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-384x384.png?v=3', sizes: '384x384', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512x512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192x192.png?v=3',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512x512.png?v=3',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
