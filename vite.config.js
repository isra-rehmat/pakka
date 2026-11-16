import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const DEMO = process.env.VITE_DEMO === '1'
const BASE = process.env.VITE_BASE || '/pakka/'

export default defineConfig({
  base: BASE,
  // the fake demo data is only bundled for local screenshots
  resolve: { alias: DEMO ? [] : [{ find: './demo/mock', replacement: '/src/demo/empty.js' }] },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'badge-96.png'],
      manifest: {
        name: 'Pakka: Family Habits',
        short_name: 'Pakka',
        description: 'Habits jo pakki hon. Family ke saath.',
        theme_color: '#14121f',
        background_color: '#14121f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        id: BASE,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] }
    })
  ]
})
