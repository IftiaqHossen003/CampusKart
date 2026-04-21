import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('swiper')) {
            return 'vendor-swiper'
          }

          if (id.includes('@tanstack/react-query')) {
            return 'vendor-react-query'
          }

          if (id.includes('react-router-dom')) {
            return 'vendor-router'
          }

          return undefined
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
})
