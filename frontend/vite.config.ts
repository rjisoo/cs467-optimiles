import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      // Keep browser requests on the Vite origin without changing backend CORS.
      '^/api/chat$': 'http://127.0.0.1:5000',
      '^/api/search$': 'http://127.0.0.1:5000',
      '^/api/availability/[A-Za-z0-9_-]+/trips$': 'http://127.0.0.1:5000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    clearMocks: true,
  },
})
