import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SalesPredicter - Autonomous Kitchen Voice Bulletin & Ingestion OS',
    short_name: 'SalesPredicter',
    description:
      'Autonomous Multi-Language Spoken Kitchen Bulletin & Ingestion OS for Indian Cloud Kitchens & Outlets. Powered by TimesFM 3.0 & Cloud TTS.',
    start_url: '/',
    display: 'standalone',
    background_color: '#090d16',
    theme_color: '#090d16',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      }
    ],
    categories: ['productivity', 'business', 'food']
  };
}
