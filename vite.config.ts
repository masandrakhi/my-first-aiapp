/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Bind to IPv4 explicitly: Vite's default "localhost" can end up on [::1] only,
  // which makes http://127.0.0.1:5173 (and some browsers' "localhost") unreachable.
  // /api goes to the local API server (server/dev.ts), so the app and API share one origin, as on Vercel.
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8787' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
