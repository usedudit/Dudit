import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dudit | Descubra. Anuncie. Organize.',
    short_name: 'Dudit',
    description:
      'Tudo o que você precisa para encontrar, anunciar e organizar em um só lugar.',
    start_url: '/',
    display: 'standalone',
    background_color: '#003229',
    theme_color: '#003229',
    orientation: 'any',
    categories: ['business', 'shopping', 'productivity', 'local'],
    lang: 'pt-BR',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-72x72.png?v=2', sizes: '72x72', type: 'image/png' },
      { src: '/icons/icon-96x96.png?v=2', sizes: '96x96', type: 'image/png' },
      { src: '/icons/icon-128x128.png?v=2', sizes: '128x128', type: 'image/png' },
      { src: '/icons/icon-144x144.png?v=2', sizes: '144x144', type: 'image/png' },
      { src: '/icons/icon-152x152.png?v=2', sizes: '152x152', type: 'image/png' },
      { src: '/icons/icon-192x192.png?v=2', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-384x384.png?v=2', sizes: '384x384', type: 'image/png' },
      { src: '/icons/icon-512x512.png?v=2', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-192x192.png?v=2',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512x512.png?v=2',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
