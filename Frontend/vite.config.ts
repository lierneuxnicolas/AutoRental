import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { configuredMediaOrigins, httpOrigin, LOCAL_BACKEND_URL, PROD_FALLBACK_BACKEND_URL } from './src/config/mediaOrigins.ts'

const header = 'Content-Security-Policy-Report-Only'
const stripeScripts = ['https://js.stripe.com', 'https://*.js.stripe.com']
const stripeFrames = [...stripeScripts, 'https://hooks.stripe.com']
const stripeConnections = ['https://api.stripe.com', 'https://r.stripe.com', 'https://m.stripe.com']

function reportPolicy(apiOrigin: string, mediaOrigins: string[], development: boolean) {
  const directives = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'script-src': ["'self'", ...stripeScripts],
    'style-src': ["'self'"],
    'connect-src': ["'self'", apiOrigin, ...stripeConnections,
      ...(development ? ['ws://localhost:*', 'ws://127.0.0.1:*'] : [])],
    'img-src': ["'self'", 'blob:', 'data:', apiOrigin, ...mediaOrigins],
    'frame-src': ['blob:', ...stripeFrames],
    'font-src': ["'self'"],
    'report-uri': [apiOrigin + '/api/csp-report/'],
  }

  return Object.entries(directives)
    .map(([name, sources]) => name + ' ' + [...new Set(sources)].join(' '))
    .join('; ')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  const mediaOrigins = configuredMediaOrigins(env.VITE_MEDIA_ORIGINS)
  const configuredApi = env.VITE_API_BASE_URL?.trim() || ''
  const devPolicy = reportPolicy(httpOrigin(configuredApi, true) ?? LOCAL_BACKEND_URL, mediaOrigins, true)
  const prodPolicy = reportPolicy(httpOrigin(configuredApi) ?? PROD_FALLBACK_BACKEND_URL, mediaOrigins, false)

  return {
    server: { headers: { [header]: devPolicy } },
    preview: { headers: { [header]: prodPolicy } },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'getacar-staticwebapp-headers',
        writeBundle(options) {
          const source = resolve(import.meta.dirname, 'public/staticwebapp.config.json')
          const outDir = resolve(import.meta.dirname, options.dir ?? 'dist')
          const config = JSON.parse(readFileSync(source, 'utf8'))
          config.globalHeaders = { ...config.globalHeaders, [header]: prodPolicy }
          mkdirSync(outDir, { recursive: true })
          writeFileSync(resolve(outDir, 'staticwebapp.config.json'), JSON.stringify(config, null, 2) + '\n')
        },
      },
    ],
  }
})
