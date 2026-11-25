import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relative : fonctionne sur GitHub Pages (https://<user>.github.io/<repo>/)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
})
