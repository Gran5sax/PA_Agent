import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: Vite (5173) proxies /api and /ws to the FastAPI backend (8765).
// Prod: `npm run build` emits to pa_agent/web/static_dist, served by FastAPI.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8765',
      '/ws': { target: 'ws://127.0.0.1:8765', ws: true },
    },
  },
  build: {
    outDir: '../pa_agent/web/static_dist',
    emptyOutDir: true,
  },
})
