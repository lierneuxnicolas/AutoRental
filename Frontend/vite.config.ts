import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-staticwebapp-config',
      closeBundle() {
        const source = resolve(import.meta.dirname, 'public/staticwebapp.config.json')
        const target = resolve(import.meta.dirname, 'dist/staticwebapp.config.json')

        if (existsSync(source)) {
          copyFileSync(source, target)
        }
      },
    },
  ],
})