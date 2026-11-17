import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Everything in /projects is served as-is: /projects/BottleFlip/... -> /BottleFlip/...
  publicDir: 'projects',
})
