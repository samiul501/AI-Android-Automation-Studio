import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/screenshots': 'http://localhost:4000',
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
  build: {
    // Monaco Editor's own bundle is inherently large (a full code editor +
    // language services); raise the warning threshold so it doesn't mask
    // warnings about genuinely unexpected bloat elsewhere.
    chunkSizeWarningLimit: 5000,
  },
})
