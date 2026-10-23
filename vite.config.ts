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
    // Caps from EV-2 (docs/EVALS.md): long enough for a busy machine, short enough to expose real hangs.
    // Raising them past 15 s per test or 30 s per setup hides problems instead of fixing them.
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
})
