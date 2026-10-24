import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

function devCerts() {
  try {
    return {
      cert: fs.readFileSync('.cert/dev.pem'),
      key: fs.readFileSync('.cert/dev-key.pem'),
    }
  } catch {
    return undefined
  }
}

const https = devCerts()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        name: 'VoxRead 听书',
        short_name: 'VoxRead',
        description: '上传 PDF，本地解析，离线阅读与朗读',
        lang: 'zh-CN',
        display: 'standalone',
        start_url: '/',
        background_color: '#0f172a',
        theme_color: '#4f46e5',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: {
    host: true,
    ...(https ? { https } : {}),
  },
  preview: {
    host: true,
    ...(https ? { https } : {}),
  },
})
