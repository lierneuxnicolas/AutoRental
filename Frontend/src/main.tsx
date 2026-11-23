import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import './index.css'
import App from './App.tsx'

// Keep schema validation compatible with CSP without runtime code generation.
z.config({ jitless: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
