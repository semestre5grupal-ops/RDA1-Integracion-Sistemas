import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: ['mermaid'],
    },
    rolldownOptions: {
      external: ['mermaid'],
    },
  },
  preview: {
    allowedHosts: ['rda1-api.onrender.com', '.onrender.com'],
  },
})
