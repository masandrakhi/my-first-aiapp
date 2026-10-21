import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { HabitsProvider } from './state/HabitsProvider.tsx'
import { importFromUrl } from './lib/storage.ts'

// Must run before the provider loads data, so carried-over habits show up immediately.
importFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HabitsProvider>
      <App />
    </HabitsProvider>
  </StrictMode>,
)
